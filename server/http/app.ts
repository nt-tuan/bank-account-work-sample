import { Hono } from 'hono';
import { ErrorCode } from '../../shared/errors.ts';
import { DomainRejection } from '../banking/errors.ts';
import { sessionCookie, type Env, type HttpDeps } from './context.ts';
import { errorHandler } from './errors.ts';
import { responseHeaders, sessionGuard } from './middleware.ts';
import { bankingRoutes } from './routes/banking.ts';
import { demoRoutes } from './routes/demo.ts';
import { recipientRoutes } from './routes/recipients.ts';
import { sessionRoutes } from './routes/session.ts';
import { transferRoutes } from './routes/transfers.ts';

export type { DemoControls, HttpDeps } from './context.ts';

/** The `/api` HTTP pipeline: headers and logging → session guards → routes → error envelope. */
export function createHttpApp(deps: HttpDeps) {
  const app = new Hono<Env>();
  const cookie = sessionCookie(deps.cookieMode);

  app.use('*', responseHeaders(deps));
  app.use('/api/*', sessionGuard(deps, cookie));

  sessionRoutes(app, deps, cookie);
  bankingRoutes(app, deps);
  recipientRoutes(app, deps);
  transferRoutes(app, deps);
  demoRoutes(app, deps, cookie);

  app.all('/api/*', () => {
    throw new DomainRejection(ErrorCode.NOT_FOUND);
  });
  app.onError(errorHandler(deps));
  return app;
}
