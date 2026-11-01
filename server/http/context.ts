import type { Context, Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { HttpBindings } from '@hono/node-server';
import type { z } from 'zod';
import { CookieMode } from '../config.ts';
import { ErrorCode, type FieldErrors } from '../../shared/errors.ts';
import type { Session, SessionStore } from '../auth/sessions.ts';
import type { AuthService } from '../auth/service.ts';
import type { BankingServices } from '../banking/index.ts';
import { DomainRejection } from '../banking/errors.ts';
import type { ScenarioEffects } from '../demo/scenarios.ts';

export type DemoControls = { effects: ScenarioEffects; reset(): Promise<void> };

export type HttpDeps = {
  appOrigins: string[];
  cookieMode: CookieMode;
  sessions: SessionStore;
  auth: AuthService;
  banking: BankingServices;
  demo: DemoControls | null;
  log?: (line: Record<string, unknown>) => void;
};

export type Env = { Bindings: HttpBindings; Variables: { session: Session | null } };
export type HttpApp = Hono<Env>;
export type HttpContext = Context<Env>;

/** Masks 7-digit account numbers in log lines (spec §9: logs redact full account numbers). */
export const redact = (s: string) => s.replace(/\b\d{3}(\d{4})\b/g, '•••$1');

export function errorBody(code: ErrorCode, message: string, fieldErrors?: FieldErrors) {
  return { error: fieldErrors ? { code, message, fieldErrors } : { code, message } };
}

function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??=
      issue.code === 'invalid_type' && issue.input === undefined
        ? 'This field is required.'
        : 'This value is not valid.';
  }
  return out;
}

/** Validates request input; failures become `400 VALIDATION_ERROR` with field errors keyed by path. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new DomainRejection(ErrorCode.VALIDATION_ERROR, zodFieldErrors(r.error));
  return r.data;
}

export async function jsonBody(c: HttpContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new DomainRejection(ErrorCode.VALIDATION_ERROR, { _: 'The request body must be JSON.' });
  }
}

export const queryObject = (c: HttpContext) => Object.fromEntries(new URL(c.req.url).searchParams);

/** The signed-in customer; the session guard has already rejected anonymous requests. */
export function customerOf(c: HttpContext): string {
  const s = c.get('session');
  if (!s?.customerId) throw new DomainRejection(ErrorCode.SESSION_EXPIRED);
  return s.customerId;
}

/** Cookie handling shared by the session guard and the routes that issue or end sessions. */
export function sessionCookie(mode: CookieMode) {
  const name = mode === CookieMode.Secure ? '__Host-session' : 'demo-session';
  const options = {
    httpOnly: true,
    secure: mode === CookieMode.Secure,
    sameSite: 'Lax' as const,
    path: '/',
  };
  return {
    name,
    set: (c: HttpContext, s: Session) => setCookie(c, name, s.id, options),
    clear: (c: HttpContext) => deleteCookie(c, name, options),
  };
}
export type SessionCookie = ReturnType<typeof sessionCookie>;

/**
 * Consumes the session's pending demo scenario when this request is the applicable one. Callers put it back with
 * `restoreScenario` when the request was rejected before anything was created (spec §12).
 */
export function takeScenario(
  deps: HttpDeps,
  c: HttpContext,
  applies: (id: NonNullable<Session['pendingScenario']>) => boolean,
) {
  const s = c.get('session');
  if (!deps.demo || !s?.pendingScenario || !applies(s.pendingScenario)) return null;
  const id = s.pendingScenario;
  s.pendingScenario = null;
  return id;
}

export function restoreScenario(c: HttpContext, scenario: Session['pendingScenario']) {
  const s = c.get('session');
  if (s && scenario) s.pendingScenario = scenario;
}
