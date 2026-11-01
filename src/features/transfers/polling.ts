import { TransferStatus } from '@domain/domain/enums.ts';
import { withJitter } from './submission/submit.ts';

export const FAST_PHASE_MS = 10_000;
export const SLOW_PHASE_MS = 120_000;

/**
 * Status polling interval (spec §7): every 1 s for the first 10 s, then 2, 4, 8 s… capped at 15 s, ±20% jitter;
 * every 30 s after 2 minutes; false only once terminal. Unknown outcomes remain tracked.
 */
export function nextPollInterval(input: {
  status: TransferStatus | undefined;
  elapsedMs: number;
  pollsAfterFastPhase: number;
  random?: () => number;
}): number | false {
  if (input.status !== TransferStatus.Processing) return false;
  const random = input.random ?? Math.random;
  if (input.elapsedMs >= SLOW_PHASE_MS) return withJitter(30_000, 0.2, random);
  if (input.elapsedMs < FAST_PHASE_MS) return withJitter(1_000, 0.2, random);
  return withJitter(Math.min(15_000, 2_000 * 2 ** input.pollsAfterFastPhase), 0.2, random);
}
