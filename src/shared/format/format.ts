/** Display formatting: en-US, Asia/Tokyo (spec §5). */
const dateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dateTimeSec = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const shortDateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dateOnly = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const monthName = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});
const monthShort = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' });

export const formatDateTime = (iso: string) => `${dateTime.format(new Date(iso))} JST`;
export const formatDateTimeSeconds = (iso: string) => `${dateTimeSec.format(new Date(iso))} JST`;
export const formatShortDateTime = (iso: string) => shortDateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

/** 'YYYY-MM' → 'October 2026' */
export const formatMonth = (month: string) => monthName.format(new Date(`${month}-01T00:00:00Z`));
/** 'YYYY-MM' → 'Oct' */
export const formatMonthShort = (month: string) =>
  monthShort.format(new Date(`${month}-01T00:00:00Z`));
/** 'YYYY-MM' → '2026/10' (tab label) */
export const formatMonthTab = (month: string) => month.replace('-', '/');

/** Current JST month 'YYYY-MM'. */
export function currentJstMonth(now = Date.now()): string {
  const d = new Date(now + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
