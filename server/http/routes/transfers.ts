import { ErrorCode } from '../../../shared/errors.ts';
import { DemoScenarioId } from '../../../shared/domain/enums.ts';
import { transferCommandSchema } from '../../../shared/schemas/api.ts';
import { normalizeTransferCommand } from '../../../shared/rules/command.ts';
import { DomainRejection } from '../../banking/errors.ts';
import { OrderResultKind, type OrderOptions, type OrderResult } from '../../banking/transfers.ts';
import { consumesOnOrder } from '../../demo/scenarios.ts';
import {
  customerOf,
  jsonBody,
  parse,
  restoreScenario,
  takeScenario,
  type HttpApp,
  type HttpDeps,
} from '../context.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `POST /api/transfers`: order creation (spec §7). Reads of transfers live in banking routes. */
export function transferRoutes(app: HttpApp, deps: HttpDeps) {
  app.post('/api/transfers', async (c) => {
    const customerId = customerOf(c);
    const key = c.req.header('idempotency-key');
    if (!key) throw new DomainRejection(ErrorCode.IDEMPOTENCY_KEY_MISSING);
    if (!UUID_RE.test(key)) throw new DomainRejection(ErrorCode.IDEMPOTENCY_KEY_INVALID);
    const normalized = normalizeTransferCommand(parse(transferCommandSchema, await jsonBody(c)));
    if (!normalized.ok)
      throw new DomainRejection(ErrorCode.VALIDATION_ERROR, normalized.fieldErrors);

    const scenario = takeScenario(deps, c, (id) => consumesOnOrder(id));
    const opts: OrderOptions = {
      demoScenarioFor: (kind) => (consumesOnOrder(scenario, kind) ? scenario : null),
    };
    const delay = deps.demo?.effects.executionDelayFor(scenario);
    if (delay !== undefined) opts.executionDelayMs = delay;
    let result: OrderResult;
    try {
      result = await deps.banking.transfers.createOrder(customerId, key, normalized.value, opts);
    } catch (error) {
      if (error instanceof DomainRejection) restoreScenario(c, scenario); // nothing was created
      throw error;
    }

    // A replay, or a scenario for another destination kind, leaves the scenario pending.
    const applied =
      result.kind === OrderResultKind.Created &&
      consumesOnOrder(scenario, result.body.destinationKind);
    if (!applied) restoreScenario(c, scenario);

    if (applied && scenario === DemoScenarioId.CreateResponseLost) {
      // The order is committed; drop the connection before any response.
      c.env?.incoming?.socket?.destroy();
      return new Response(null, { status: 500 });
    }
    if (applied && scenario === DemoScenarioId.CreateResponseSlow && deps.demo)
      await sleep(deps.demo.effects.slowResponseMs);
    c.header('Location', `/api/transfers/${result.body.id}`);
    if (result.kind === OrderResultKind.Replayed) c.header('Idempotent-Replayed', 'true');
    return c.json(result.body, result.status as 202);
  });
}
