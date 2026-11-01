import type { ErrorHandler } from 'hono';
import { ErrorCode, ERROR_STATUS } from '../../shared/errors.ts';
import { DomainRejection } from '../banking/errors.ts';
import { DatabaseBusyError } from '../persistence/sqlite.ts';
import { errorBody, redact, type Env, type HttpDeps } from './context.ts';

/** Every error leaves as the JSON envelope, which the client treats as definitive (spec §7). */
export function errorHandler(deps: HttpDeps): ErrorHandler<Env> {
  return (error, c) => {
    if (error instanceof DomainRejection) {
      for (const [k, v] of Object.entries(error.headers ?? {})) c.header(k, v);
      c.header('Cache-Control', 'no-store');
      return c.json(errorBody(error.code, error.message, error.fieldErrors), error.status as 400);
    }
    // Bounded SQLITE_BUSY → 503 before anything was committed; anything else is a generic 500.
    const busy = error instanceof DatabaseBusyError;
    if (!busy) deps.log?.({ level: 'error', path: redact(c.req.path), error: String(error) });
    const code = busy ? ErrorCode.SERVICE_UNAVAILABLE : ErrorCode.INTERNAL_ERROR;
    return c.json(errorBody(code, new DomainRejection(code).message), ERROR_STATUS[code]);
  };
}
