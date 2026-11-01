import { DemoScenarioId } from '../../../shared/domain/enums.ts';
import { lookupRequestSchema } from '../../../shared/schemas/api.ts';
import { DomainRejection } from '../../banking/errors.ts';
import {
  customerOf,
  jsonBody,
  parse,
  restoreScenario,
  takeScenario,
  type HttpApp,
  type HttpDeps,
} from '../context.ts';

export function recipientRoutes(app: HttpApp, deps: HttpDeps) {
  app.post('/api/recipients/lookup', async (c) => {
    const body = parse(lookupRequestSchema, await jsonBody(c));
    // `lookup_unavailable` is consumed by the next lookup.
    const scenario = takeScenario(deps, c, (id) => id === DemoScenarioId.LookupUnavailable);
    try {
      return c.json(
        await deps.banking.lookup.lookup(customerOf(c), body, {
          forceUnavailable: scenario !== null,
        }),
      );
    } catch (error) {
      if (error instanceof DomainRejection) restoreScenario(c, scenario); // no lookup completed
      throw error;
    }
  });
}
