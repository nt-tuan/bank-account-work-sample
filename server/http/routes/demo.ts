import { ErrorCode } from '../../../shared/errors.ts';
import { DemoScenarioId } from '../../../shared/domain/enums.ts';
import { demoResetRequestSchema, demoScenarioRequestSchema } from '../../../shared/schemas/api.ts';
import { DomainRejection } from '../../banking/errors.ts';
import { demoCatalog } from '../../demo/catalog.ts';
import {
  customerOf,
  jsonBody,
  parse,
  type HttpApp,
  type HttpDeps,
  type SessionCookie,
} from '../context.ts';

/** Demo controls; every endpoint answers 403 DEMO_DISABLED when they are off. */
export function demoRoutes(app: HttpApp, deps: HttpDeps, cookie: SessionCookie) {
  const demoOnly = () => {
    if (!deps.demo) throw new DomainRejection(ErrorCode.DEMO_DISABLED);
    return deps.demo;
  };

  app.get('/api/demo/catalog', (c) => {
    demoOnly();
    return c.json(demoCatalog(c.get('session')?.pendingScenario ?? null));
  });

  app.post('/api/demo/scenario', async (c) => {
    const demo = demoOnly();
    const { scenario } = parse(demoScenarioRequestSchema, await jsonBody(c));
    const s = c.get('session')!;
    if (scenario === DemoScenarioId.LookupLimit) {
      // Applied immediately: the counter is filled rather than left pending.
      demo.effects.fillLookupCounter(customerOf(c));
      s.pendingScenario = null;
    } else {
      s.pendingScenario = scenario;
    }
    return c.json(demoCatalog(s.pendingScenario));
  });

  app.post('/api/demo/expire-session', (c) => {
    demoOnly();
    deps.sessions.destroy(c.get('session')!.id);
    cookie.clear(c);
    return c.body(null, 204);
  });

  app.post('/api/demo/reset', async (c) => {
    const demo = demoOnly();
    parse(demoResetRequestSchema, await jsonBody(c));
    await demo.reset();
    cookie.clear(c);
    return c.body(null, 204);
  });
}
