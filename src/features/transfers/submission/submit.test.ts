import { TransferStatus } from '@domain/domain/enums.ts';
import { ApiFailureKind, UnknownFailureCause, ApiError } from '@/shared/api/http.ts';
import { ErrorCode } from '@domain/errors.ts';
import { describe, expect, it, vi } from 'vitest';
import { submitTransfer, withJitter } from './submit.ts';
import type { Transfer } from '@domain/schemas/api.ts';

const transfer = { id: 'TRF-1', status: TransferStatus.Processing } as Transfer;
const unknown = () =>
  new ApiError({ kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Timeout });
const rejected = () =>
  new ApiError({
    kind: ApiFailureKind.Rejected,
    status: 422,
    code: ErrorCode.INSUFFICIENT_FUNDS,
    message: 'no',
  });

function run(send: () => Promise<Transfer>) {
  const sleeps: number[] = [];
  const attempts: number[] = [];
  const result = submitTransfer(send, {
    signal: new AbortController().signal,
    random: () => 0.5,
    sleep: async (ms) => void sleeps.push(ms),
    onAttempt: (n) => attempts.push(n),
  });
  return { result, sleeps, attempts };
}

describe('submitTransfer', () => {
  it('returns created on the first success', async () => {
    const { result, attempts } = run(async () => transfer);
    expect(await result).toEqual({ kind: 'created', transfer });
    expect(attempts).toEqual([1]);
  });

  it('retries unknown outcomes after 1 s and 3 s, then reports unknown — never failed', async () => {
    const send = vi.fn(async () => {
      throw unknown();
    });
    const { result, sleeps, attempts } = run(send);
    expect(await result).toEqual({ kind: 'unknown' });
    expect(sleeps).toEqual([1_000, 3_000]);
    expect(attempts).toEqual([1, 2, 3]);
  });

  it('stops immediately on a definitive rejection', async () => {
    const send = vi.fn(async () => {
      throw rejected();
    });
    const { result } = run(send);
    const r = await result;
    expect(r.kind).toBe('rejected');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a replayed success after a lost response is a plain success', async () => {
    let n = 0;
    const { result } = run(async () => {
      if (n++ === 0) throw unknown();
      return transfer;
    });
    expect(await result).toEqual({ kind: 'created', transfer });
  });

  it('applies ±20% jitter', () => {
    expect(withJitter(1_000, 0.2, () => 0)).toBe(800);
    expect(withJitter(1_000, 0.2, () => 1)).toBe(1_200);
  });
});
