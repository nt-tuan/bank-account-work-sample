/** JST (UTC+09:00, no DST) calendar helpers. The server is the only place that turns filters into instants (spec §4). */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Month = `${number}-${number}`; // 'YYYY-MM'

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isMonth(value: string): boolean {
  return MONTH_RE.test(value);
}

export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Half-open UTC interval [fromMs, toMs) covering a JST calendar month. */
export function jstMonthRange(month: string): { fromMs: number; toMs: number } {
  const m = MONTH_RE.exec(month);
  if (!m) throw new RangeError(`Invalid month: ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  return {
    fromMs: Date.UTC(y, mo, 1) - JST_OFFSET_MS,
    toMs: Date.UTC(y, mo + 1, 1) - JST_OFFSET_MS,
  };
}

/** Half-open UTC interval for an inclusive JST date range `from`..`to` (YYYY-MM-DD). */
export function jstDateRange(from: string, to: string): { fromMs: number; toMs: number } {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new RangeError('Invalid date');
  const start = Date.parse(`${from}T00:00:00Z`) - JST_OFFSET_MS;
  const end = Date.parse(`${to}T00:00:00Z`) - JST_OFFSET_MS + DAY_MS;
  if (end <= start) throw new RangeError('Range end before start');
  return { fromMs: start, toMs: end };
}

/** JST calendar month ('YYYY-MM') containing an instant. */
export function jstMonthOf(ms: number): string {
  const d = new Date(ms + JST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(month: string, delta: number): string {
  const m = MONTH_RE.exec(month);
  if (!m) throw new RangeError(`Invalid month: ${month}`);
  const index = Number(m[1]) * 12 + Number(m[2]) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Months from `month - (count-1)` through `month`, oldest first. */
export function monthsEndingAt(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(month, i - (count - 1)));
}
