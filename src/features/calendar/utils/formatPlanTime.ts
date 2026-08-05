// German labels are hardcoded to stay independent of Hermes Intl support.
export const MONTHS_FULL = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const WEEKDAYS_LONG = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];
const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS_SHORT = [
  'Jan.',
  'Feb.',
  'März',
  'Apr.',
  'Mai',
  'Juni',
  'Juli',
  'Aug.',
  'Sep.',
  'Okt.',
  'Nov.',
  'Dez.',
];

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateKeyFromIso(iso: string): string {
  return dateKey(new Date(iso));
}

/** Parses a `yyyy-mm-dd` day key back into a local start-of-day Date. */
export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

function dayDiff(target: Date, now: Date): number {
  return Math.round((startOfDay(target).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatTimeRange(startIso: string, endIso?: string): string {
  return endIso ? `${formatTime(startIso)}–${formatTime(endIso)}` : formatTime(startIso);
}

/** "Heute" / "Morgen" / weekday name / "Fr, 4. Juli" for far-off days. */
export function formatDayLabel(date: Date, now: Date = new Date()): string {
  const diff = dayDiff(date, now);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  if (diff > 1 && diff < 7) return WEEKDAYS_LONG[date.getDay()];
  return `${WEEKDAYS_SHORT[date.getDay()]}, ${date.getDate()}. ${MONTHS_SHORT[date.getMonth()]}`;
}

export function weekdayShort(date: Date): string {
  return WEEKDAYS_SHORT[date.getDay()];
}

/** Adds (or subtracts) whole days to a date without mutating the original. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Returns 0 for Monday … 6 for Sunday (ISO / Monday-first grid). */
export function mondayFirstIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Number of days in the given month (month is 0-indexed). */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** The next `count` days starting today, as start-of-day Date objects. */
export function getUpcomingDays(count: number, now: Date = new Date()): Date[] {
  const base = startOfDay(now);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(base);
    day.setDate(base.getDate() + index);
    return day;
  });
}
