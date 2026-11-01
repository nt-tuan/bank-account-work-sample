import { randomBytes } from 'node:crypto';

export interface Clock {
  now(): number;
}

export const systemClock = (): Clock => ({ now: () => Date.now() });

/** Test clock: time only moves when told to. */
export class FakeClock implements Clock {
  constructor(private ms: number) {}
  now(): number {
    return this.ms;
  }
  advance(ms: number): void {
    this.ms += ms;
  }
  set(ms: number): void {
    this.ms = ms;
  }
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Opaque random ID such as `TRF-8K2Q-4M7D`, or a prefixed lowercase ID. */
export function randomId(prefix: string, groups = 2): string {
  const bytes = randomBytes(groups * 4);
  const chars = Array.from(bytes, (b) => CROCKFORD[b % 32]).join('');
  const parts = chars.match(/.{4}/g) ?? [chars];
  return `${prefix}-${parts.join('-')}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
