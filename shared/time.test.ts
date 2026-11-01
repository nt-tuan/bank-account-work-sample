import { Direction } from './domain/enums.ts';
import { describe, expect, it } from 'vitest';
import { jstDateRange, jstMonthOf, jstMonthRange, monthsEndingAt } from './time.ts';
import { addMinor, formatSignedYen, formatYen, maskAccountNumber } from './money.ts';

describe('JST boundaries', () => {
  it('maps a JST month to a half-open UTC interval', () => {
    const { fromMs, toMs } = jstMonthRange('2026-10');
    expect(new Date(fromMs).toISOString()).toBe('2026-09-30T15:00:00.000Z');
    expect(new Date(toMs).toISOString()).toBe('2026-10-31T15:00:00.000Z');
  });
  it('treats a date range as inclusive JST days', () => {
    const { fromMs, toMs } = jstDateRange('2026-10-01', '2026-10-01');
    expect(toMs - fromMs).toBe(86_400_000);
    expect(new Date(fromMs).toISOString()).toBe('2026-09-30T15:00:00.000Z');
  });
  it('rejects a reversed range', () => {
    expect(() => jstDateRange('2026-10-02', '2026-10-01')).toThrow();
  });
  it('buckets late-UTC instants into the next JST month', () => {
    expect(jstMonthOf(Date.parse('2026-10-31T15:30:00Z'))).toBe('2026-11');
    expect(jstMonthOf(Date.parse('2026-10-31T14:59:59Z'))).toBe('2026-10');
  });
  it('lists months across a year boundary', () => {
    expect(monthsEndingAt('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('money', () => {
  it('formats en-US yen without decimals', () => {
    expect(formatYen(1_000)).toBe('¥1,000');
    expect(formatSignedYen(3_480, Direction.Debit)).toBe('−¥3,480');
    expect(formatSignedYen(5, Direction.Credit)).toBe('+¥5');
    expect(maskAccountNumber('1032481')).toBe('•••2481');
  });
  it('refuses unsafe integers', () => {
    expect(() => addMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });
});
