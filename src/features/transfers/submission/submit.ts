import { ApiFailureKind, ApiError, type RejectedFailure } from '@/shared/api/http.ts';
import type { Transfer } from '@domain/schemas/api.ts';

/** Bounded submission attempts: initial request and at most two retries. */
export enum SubmissionAttempt {
  Initial = 1,
  FirstRetry = 2,
  FinalRetry = 3,
}

/** Submission outcomes; unknown means the server may have created the order. */
export enum SubmitResultKind {
  Created = 'created',
  Rejected = 'rejected',
  Unknown = 'unknown',
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;
export const realSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });

/** There is deliberately no "failed" variant: an unknown outcome can never be shown as a failure. */
export type SubmitResult =
  | { kind: SubmitResultKind.Created; transfer: Transfer }
  | { kind: SubmitResultKind.Rejected; failure: RejectedFailure }
  | { kind: SubmitResultKind.Unknown };

export function withJitter(ms: number, jitter: number, random: () => number): number {
  return Math.round(ms * (1 - jitter + 2 * jitter * random()));
}

/**
 * Sends one transfer order, retrying only on unknown outcomes — up to two more attempts after 1 s and 3 s (±20%),
 * always with the same idempotency key and body (spec §7, Client submission). Independent of React.
 */
export async function submitTransfer(
  send: (signal: AbortSignal) => Promise<Transfer>,
  opts: {
    delaysMs?: [number, number];
    jitter?: number;
    random?: () => number;
    sleep?: Sleep;
    signal: AbortSignal;
    onAttempt?: (n: SubmissionAttempt) => void;
  },
): Promise<SubmitResult> {
  const delays = opts.delaysMs ?? [1_000, 3_000];
  const jitter = opts.jitter ?? 0.2;
  const random = opts.random ?? Math.random;
  const sleep = opts.sleep ?? realSleep;
  for (
    let attempt = SubmissionAttempt.Initial as SubmissionAttempt;
    ;
    attempt = (attempt + 1) as SubmissionAttempt
  ) {
    opts.onAttempt?.(attempt);
    try {
      return { kind: SubmitResultKind.Created, transfer: await send(opts.signal) };
    } catch (error) {
      if (opts.signal.aborted) throw error;
      if (error instanceof ApiError && error.failure.kind === ApiFailureKind.Rejected)
        return { kind: SubmitResultKind.Rejected, failure: error.failure };
      if (!(error instanceof ApiError)) throw error;
      if (attempt === SubmissionAttempt.FinalRetry) return { kind: SubmitResultKind.Unknown };
      await sleep(withJitter(delays[attempt - 1]!, jitter, random), opts.signal);
    }
  }
}
