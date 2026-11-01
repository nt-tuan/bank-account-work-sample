import { ErrorCode } from '../../../shared/errors.ts';
import { loginRequestSchema } from '../../../shared/schemas/api.ts';
import { transferLimit } from '../../../shared/rules/policy.ts';
import type { Session } from '../../auth/sessions.ts';
import { DomainRejection } from '../../banking/errors.ts';
import { jsonBody, parse, type HttpApp, type HttpDeps, type SessionCookie } from '../context.ts';

export function sessionRoutes(app: HttpApp, deps: HttpDeps, cookie: SessionCookie) {
  const sessionState = (s: Session) => ({
    authenticated: s.customerId !== null,
    customer: s.customerId
      ? { id: s.customerId, displayName: deps.auth.displayName(s.customerId) ?? '' }
      : null,
    csrfToken: s.csrfToken,
    expiresAt: s.customerId ? new Date(s.expiresAt).toISOString() : null,
    transferLimit: transferLimit({ customerId: s.customerId ?? '' }),
    demoControls: deps.demo !== null,
  });

  /** Session discovery: creates the pre-login session that bootstraps the CSRF token. */
  app.get('/api/session', (c) => {
    let s = c.get('session');
    if (!s) {
      s = deps.sessions.createAnonymous();
      cookie.set(c, s);
    }
    return c.json(sessionState(s));
  });

  app.post('/api/session/login', async (c) => {
    const body = parse(loginRequestSchema, await jsonBody(c));
    const customerId = deps.auth.verify(body.username, body.password);
    if (!customerId) throw new DomainRejection(ErrorCode.INVALID_CREDENTIALS);
    const s = deps.sessions.login(c.get('session'), customerId);
    cookie.set(c, s);
    return c.json(sessionState(s));
  });

  app.post('/api/session/logout', (c) => {
    const s = c.get('session');
    if (s) deps.sessions.destroy(s.id);
    cookie.clear(c);
    return c.body(null, 204);
  });
}
