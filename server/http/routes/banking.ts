import { ErrorCode } from '../../../shared/errors.ts';
import { DemoScenarioId } from '../../../shared/domain/enums.ts';
import {
  activityQuerySchema,
  insightsQuerySchema,
  transferQuerySchema,
} from '../../../shared/schemas/api.ts';
import { DomainRejection } from '../../banking/errors.ts';
import {
  customerOf,
  parse,
  queryObject,
  takeScenario,
  type HttpApp,
  type HttpContext,
  type HttpDeps,
} from '../context.ts';

/** Read endpoints for accounts, activity, transfers and insights. */
export function bankingRoutes(app: HttpApp, deps: HttpDeps) {
  const { banking } = deps;

  /** `read_failure` demo scenario: the next data read returns 503 (spec §12). */
  const readFailure = (c: HttpContext) => {
    if (takeScenario(deps, c, (id) => id === DemoScenarioId.ReadFailure)) {
      throw new DomainRejection(
        ErrorCode.SERVICE_UNAVAILABLE,
        undefined,
        "We couldn't load this right now. (Demo read failure.)",
      );
    }
  };

  app.get('/api/accounts', (c) => {
    readFailure(c);
    return c.json({ items: banking.accounts.list(customerOf(c)) });
  });
  app.get('/api/accounts/:id', (c) => {
    readFailure(c);
    return c.json(banking.accounts.get(customerOf(c), c.req.param('id')));
  });
  app.get('/api/banks', (c) => c.json({ items: banking.accounts.banks() }));
  app.get('/api/activity', (c) => {
    readFailure(c);
    return c.json(banking.activity.list(customerOf(c), parse(activityQuerySchema, queryObject(c))));
  });
  app.get('/api/activity/:id', (c) => {
    readFailure(c);
    return c.json(banking.activity.get(customerOf(c), c.req.param('id')));
  });
  app.get('/api/transfers', (c) => {
    readFailure(c);
    return c.json(
      banking.transfers.list(customerOf(c), parse(transferQuerySchema, queryObject(c))),
    );
  });
  // Used to resolve legacy transfer URLs; not subject to the demo read failure.
  app.get('/api/transfers/:id', (c) =>
    c.json(banking.transfers.get(customerOf(c), c.req.param('id'))),
  );
  app.get('/api/insights', (c) => {
    readFailure(c);
    const q = parse(insightsQuerySchema, queryObject(c));
    return c.json(banking.insights.get(customerOf(c), q.month, q.accountId));
  });
}
