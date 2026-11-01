import type { DemoScenarioId } from '../../shared/domain/enums.ts';
import { timingSafeEqual } from 'node:crypto';
import { type Clock, randomToken } from '../clock.ts';

export type Session = {
  id: string;
  csrfToken: string;
  customerId: string | null;
  createdAt: number;
  /** Absolute expiry, fixed at login; reads never extend it (spec §9). */
  expiresAt: number;
  pendingScenario: DemoScenarioId | null;
};

const PRE_LOGIN_TTL_MS = 60 * 60 * 1000;

/** In-memory sessions: a server restart signs everyone out (ADR 0003). */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly opts: { clock: Clock; absoluteTtlMs: number }) {}

  createAnonymous(): Session {
    const now = this.opts.clock.now();
    const session: Session = {
      id: randomToken(32),
      csrfToken: randomToken(32),
      customerId: null,
      createdAt: now,
      expiresAt: now + PRE_LOGIN_TTL_MS,
      pendingScenario: null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string | undefined): Session | null {
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    // No last-activity time is kept: there is no idle timeout (spec §6, Session).
    if (this.opts.clock.now() >= session.expiresAt) {
      this.sessions.delete(id);
      return null;
    }
    return session;
  }

  /** Rotates the session ID and CSRF token on login (session fixation defense). */
  login(previous: Session | null, customerId: string): Session {
    if (previous) this.sessions.delete(previous.id);
    const now = this.opts.clock.now();
    const session: Session = {
      id: randomToken(32),
      csrfToken: randomToken(32),
      customerId,
      createdAt: now,
      expiresAt: now + this.opts.absoluteTtlMs,
      pendingScenario: null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  destroy(id: string): void {
    this.sessions.delete(id);
  }

  revokeAll(): void {
    this.sessions.clear();
  }
}

export function csrfMatches(session: Session, provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(session.csrfToken);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
