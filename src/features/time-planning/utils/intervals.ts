import type { TimePlanInterval, TimePlanWindow } from '../types';

export const PLANNING_SNAP_MINUTES = 5;
const MINUTE_MS = 60_000;

function snap(ms: number): number {
  const step = PLANNING_SNAP_MINUTES * MINUTE_MS;
  return Math.round(ms / step) * step;
}

function validInterval(interval: TimePlanInterval): boolean {
  const start = Date.parse(interval.startsAt);
  const end = Date.parse(interval.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

/** Sorts, clips and joins touching pieces. The returned intervals always fit the host offer. */
export function normalizeIntervals(
  intervals: TimePlanInterval[],
  window: TimePlanWindow,
): TimePlanInterval[] {
  const windowStart = Date.parse(window.startsAt);
  const windowEnd = Date.parse(window.endsAt);
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) return [];

  const clipped = intervals
    .filter(validInterval)
    .map((interval) => ({
      start: Math.max(windowStart, snap(Date.parse(interval.startsAt))),
      end: Math.min(windowEnd, snap(Date.parse(interval.endsAt))),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);

  const merged: Array<{ start: number; end: number }> = [];
  clipped.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push(interval);
  });

  return merged.map((interval) => ({
    startsAt: new Date(interval.start).toISOString(),
    endsAt: new Date(interval.end).toISOString(),
  }));
}
