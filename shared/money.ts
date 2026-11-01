import { Direction } from './domain/enums.ts';

/** Integer-yen arithmetic that refuses to leave the safe-integer range (spec §7 invariants). */
export function assertSafeMinor(value: number): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Amount is not a safe integer: ${value}`);
  return value;
}

export function addMinor(a: number, b: number): number {
  return assertSafeMinor(assertSafeMinor(a) + assertSafeMinor(b));
}

export function sumMinor(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total = addMinor(total, v);
  return total;
}

const yen = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

/** `¥1,234` — en-US grouping, no fractional digits. */
export function formatYen(minor: number): string {
  return yen.format(minor);
}

/** `+¥1,234` / `−¥1,234` (U+2212) for activity amounts. */
export function formatSignedYen(minor: number, direction: Direction): string {
  return `${direction === Direction.Credit ? '+' : '−'}${formatYen(minor)}`;
}

/** Last four digits only: `•••2481`. */
export function maskAccountNumber(accountNumber: string): string {
  return `•••${accountNumber.slice(-4)}`;
}
