// German labels hardcoded to stay independent of Hermes Intl support.
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

export function toISO(date: Date): string {
  return date.toISOString();
}

export function parseISO(iso: string): Date {
  return new Date(iso);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Round a date up to the next `stepMinutes` boundary for nice defaults. */
export function roundUpToStep(date: Date, stepMinutes = 15): Date {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const remainder = rounded.getMinutes() % stepMinutes;
  if (remainder !== 0) {
    rounded.setMinutes(rounded.getMinutes() + (stepMinutes - remainder));
  }
  return rounded;
}

export function durationMinutes(startISO?: string, endISO?: string): number {
  if (!startISO || !endISO) return 0;
  return Math.max(
    0,
    Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60_000),
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "Heute, 18:30" / "Morgen, 09:00" / "Fr, 4. Juli, 21:00". */
export function formatDateTimeLabel(date: Date, now: Date = new Date()): string {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const tomorrow = addMinutes(now, 24 * 60);

  let day: string;
  if (isSameDay(date, now)) day = 'Heute';
  else if (isSameDay(date, tomorrow)) day = 'Morgen';
  else
    day = `${WEEKDAYS_SHORT[date.getDay()]}, ${date.getDate()}. ${MONTHS_SHORT[date.getMonth()]}`;

  return `${day}, ${time}`;
}

export function formatDurationLabel(minutes: number): string {
  if (minutes <= 0) return '0 min';
  if (minutes < 60) return `${minutes} min`;

  const totalHours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;

  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const remHours = totalHours % 24;
    const dayLabel = `${days} ${days === 1 ? 'Tag' : 'Tage'}`;
    return remHours ? `${dayLabel} ${remHours} h` : dayLabel;
  }

  if (remMinutes === 0) return `${totalHours} h`;
  return `${totalHours} h ${remMinutes} min`;
}
