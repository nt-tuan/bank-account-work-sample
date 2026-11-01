import { TransferStatus } from '@domain/domain/enums.ts';
import { describe, expect, it } from 'vitest';
import { nextPollInterval } from './polling.ts';

const mid = () => 0.5;

describe('nextPollInterval', () => {
  it('polls every second for the first 10 s', () => {
    expect(
      nextPollInterval({
        status: TransferStatus.Processing,
        elapsedMs: 0,
        pollsAfterFastPhase: 0,
        random: mid,
      }),
    ).toBe(1_000);
    expect(
      nextPollInterval({
        status: TransferStatus.Processing,
        elapsedMs: 9_999,
        pollsAfterFastPhase: 0,
        random: mid,
      }),
    ).toBe(1_000);
  });
  it('then doubles to a 15 s cap', () => {
    const seq = [0, 1, 2, 3, 4].map((n) =>
      nextPollInterval({
        status: TransferStatus.Processing,
        elapsedMs: 20_000,
        pollsAfterFastPhase: n,
        random: mid,
      }),
    );
    expect(seq).toEqual([2_000, 4_000, 8_000, 15_000, 15_000]);
  });
  it('stops only at a terminal status and slows down after two minutes', () => {
    expect(
      nextPollInterval({ status: TransferStatus.Completed, elapsedMs: 0, pollsAfterFastPhase: 0 }),
    ).toBe(false);
    expect(
      nextPollInterval({ status: TransferStatus.Failed, elapsedMs: 0, pollsAfterFastPhase: 0 }),
    ).toBe(false);
    expect(
      nextPollInterval({
        status: TransferStatus.Processing,
        elapsedMs: 120_000,
        pollsAfterFastPhase: 9,
        random: mid,
      }),
    ).toBe(30_000);
  });
});
