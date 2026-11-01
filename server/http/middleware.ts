import { getCookie } from 'hono/cookie';
import type { MiddlewareHandler } from 'hono';
import { ErrorCode } from '../../shared/errors.ts';
import { csrfMatches } from '../auth/sessions.ts';
import { DomainRejection } from '../banking/errors.ts';
import { redact, type Env, type HttpDeps, type SessionCookie } from './context.ts';

/** Security headers on every response; `no-store` and one redacted log line per API request. */
export function responseHeaders(deps: HttpDeps): MiddlewareHandler<Env> {
  return async (c, next) => {
    const started = Date.now();
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'same-origin');
    c.header('X-Frame-Options', 'DENY');
    if (c.req.path.startsWith('/api/')) {
      c.header('Cache-Control', 'no-store');
      deps.log?.({
        method: c.req.method,
        path: redact(c.req.path),
        status: c.res.status,
        ms: Date.now() - started,
      });
    }
  };
}

const isOpen = (method: string, path: string) =>
  (path === '/api/session' && method === 'GET') || path === '/api/session/login';

/**
 * Origin → authentication → session-bound CSRF token (spec §9). Authentication runs before the token check so an
 * ended session is reported as 401 SESSION_EXPIRED and the client returns to login; 403 CSRF_INVALID then means only
 * "this live session's request could not be verified".
 */
export function sessionGuard(deps: HttpDeps, cookie: SessionCookie): MiddlewareHandler<Env> {
  return async (c, next) => {
    const session = deps.sessions.get(getCookie(c, cookie.name));
    c.set('session', session);
    const mutation = c.req.method !== 'GET' && c.req.method !== 'HEAD';
    if (mutation && !deps.appOrigins.includes(c.req.header('origin') ?? ''))
      throw new DomainRejection(ErrorCode.CSRF_INVALID);
    if (!isOpen(c.req.method, c.req.path) && !session?.customerId)
      throw new DomainRejection(ErrorCode.SESSION_EXPIRED);
    if (mutation && (!session || !csrfMatches(session, c.req.header('x-csrf-token'))))
      throw new DomainRejection(ErrorCode.CSRF_INVALID);
    await next();
  };
}
