import type { TimePlanWindow } from '../types';

/**
 * One time-of-day axis shared by every proposed day.
 *
 * A stack of rows is only comparable while one hour is the same width in all
 * of them. Letting each day fill the row instead makes a two-hour block on a
 * six-hour day look exactly like a one-hour-forty block on a five-hour day —
 * a comparison the reader will make and the picture cannot support.
 *
 * The axis is minutes FROM EACH DAY'S OWN MIDNIGHT, not an absolute timeline:
 * three separate evenings must line up under one clock, not sit 24 hours apart.
 * Values beyond 1,440 are legitimate and mean a window running past midnight.
 */

const MINUTE_MS = 60_000;

export interface DayAxis {
  startMinutes: number;
  endMinutes: number;
  spanMinutes: number;
}

/** Local midnight of the day a window starts on. */
export function dayStartMs(window: TimePlanWindow): number {
  const start = new Date(window.startsAt);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
}

export function minutesOfDay(ms: number, dayStart: number): number {
  return (ms - dayStart) / MINUTE_MS;
}

/**
 * The tightest axis containing every window, rounded out to whole hours so the
 * first and last hour mark are real marks rather than half-cut edges.
 */
export function sharedDayAxis(windows: TimePlanWindow[]): DayAxis {
  const fallback: DayAxis = { startMinutes: 0, endMinutes: 24 * 60, spanMinutes: 24 * 60 };
  if (windows.length === 0) return fallback;

  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  windows.forEach((window) => {
    const dayStart = dayStartMs(window);
    const start = Date.parse(window.startsAt);
    const end = Date.parse(window.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    earliest = Math.min(earliest, minutesOfDay(start, dayStart));
    latest = Math.max(latest, minutesOfDay(end, dayStart));
  });
  if (!Number.isFinite(earliest) || !Number.isFinite(latest) || latest <= earliest) return fallback;

  const startMinutes = Math.floor(earliest / 60) * 60;
  const endMinutes = Math.ceil(latest / 60) * 60;
  return { startMinutes, endMinutes, spanMinutes: Math.max(60, endMinutes - startMinutes) };
}

/** Where an absolute instant sits on the shared axis, as a 0–1 fraction.
 * Deliberately unclamped: a caller drawing a segment needs to know that it
 * runs off the end rather than silently receiving a value pinned to the edge. */
export function axisFraction(ms: number, dayStart: number, axis: DayAxis): number {
  return (minutesOfDay(ms, dayStart) - axis.startMinutes) / axis.spanMinutes;
}

/** Whole-hour marks along the axis, thinned so labels never collide. One mark
 * per hour needs roughly 34 dp; below that the step doubles, and so on. */
export function axisHourMarks(axis: DayAxis, widthPx: number): number[] {
  const hours = axis.spanMinutes / 60;
  if (hours <= 0 || widthPx <= 0) return [];
  const perHour = widthPx / hours;
  const step = perHour >= 34 ? 1 : perHour >= 17 ? 2 : perHour >= 11 ? 3 : 6;
  const marks: number[] = [];
  const firstHour = Math.ceil(axis.startMinutes / 60);
  const lastHour = Math.floor(axis.endMinutes / 60);
  for (let hour = firstHour; hour <= lastHour; hour += 1) {
    if ((hour - firstHour) % step === 0) marks.push(hour * 60);
  }

  const endpoint = lastHour * 60;
  const previous = marks[marks.length - 1];
  if (previous !== endpoint && previous != null) {
    const distancePx = ((endpoint - previous) / 60) * perHour;
    if (distancePx >= 34) {
      marks.push(endpoint);
    } else if (marks.length > 1) {
      // The final label is the actual end of the scale. Prefer it over a
      // neighbouring regular tick that would otherwise leave a blank tail.
      marks[marks.length - 1] = endpoint;
    }
  }
  return marks;
}

/** "23:00", and "01:00" rather than "25:00" for a window past midnight. */
export function formatAxisMinutes(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}
