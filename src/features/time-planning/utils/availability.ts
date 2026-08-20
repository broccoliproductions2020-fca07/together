import type { TimePlanInterval, TimePlanMember, TimePlanWindow } from '../types';
import { normalizeIntervals } from './intervals';

/**
 * Turning a set of per-person intervals into one readable answer.
 *
 * The density a card draws is not an illustration of the individual rows — it
 * IS those rows stacked, which is why the fan-out animation can claim to show
 * where it came from. Everything here therefore works on exact boundaries and
 * produces HARD edges: the number of available people jumps at the minute a
 * window opens or closes, so a smooth ramp would assert continuity the data
 * does not have.
 */

/** A stretch of time over which the same people are available. */
export interface AvailabilitySegment {
  startMs: number;
  endMs: number;
  /** How many members cover this stretch. */
  count: number;
  /** Members covering it, in the order they were passed in. */
  uids: string[];
}

export interface BestSlot {
  startMs: number;
  endMs: number;
  count: number;
  uids: string[];
  /** True when every counted member can. Marked by FORM in the UI, not colour. */
  everyone: boolean;
}

export interface WindowAvailability {
  windowId: string;
  startMs: number;
  endMs: number;
  segments: AvailabilitySegment[];
  /** Highest count reached anywhere in the window. */
  peakCount: number;
  /** Members counted, i.e. those who have answered. */
  totalCount: number;
  best: BestSlot | null;
  /** Answered members who cannot make this window at all. */
  unavailableUids: string[];
}

/** Availability is drawn in a handful of steps, never one per member: beyond
 * four or five levels the eye cannot tell them apart, and a plan may hold 50
 * people. The exact number is always written out next to the strip. */
export const AVAILABILITY_LEVELS = 5;

const MINUTE_MS = 60_000;

/** Below this a peak is a spike, not an answer — mirrors the picker's own
 * minimum selectable duration. */
export const MIN_SLOT_MINUTES = 15;

function windowBounds(window: TimePlanWindow): { startMs: number; endMs: number } | null {
  const startMs = Date.parse(window.startsAt);
  const endMs = Date.parse(window.endsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startMs, endMs };
}

/** The intervals a member offers for one window, already clipped and merged.
 * A member who has not answered contributes nothing and is not counted. */
export function memberIntervals(
  member: TimePlanMember,
  window: TimePlanWindow,
): TimePlanInterval[] | null {
  if (member.responseStatus !== 'responded') return null;
  return normalizeIntervals(member.responsesByWindow[window.id] ?? [], window);
}

/**
 * Splits the window at every boundary any member introduces and counts cover
 * per piece. Pieces where nothing changes are merged again, so the result is
 * the shortest description of the same fact.
 */
export function aggregateWindow(
  window: TimePlanWindow,
  members: TimePlanMember[],
): WindowAvailability | null {
  const bounds = windowBounds(window);
  if (!bounds) return null;

  const answered: Array<{ uid: string; intervals: Array<{ start: number; end: number }> }> = [];
  const unavailableUids: string[] = [];
  members.forEach((member) => {
    const intervals = memberIntervals(member, window);
    if (!intervals) return;
    const parsed = intervals.map((interval) => ({
      start: Date.parse(interval.startsAt),
      end: Date.parse(interval.endsAt),
    }));
    answered.push({ uid: member.uid, intervals: parsed });
    if (parsed.length === 0) unavailableUids.push(member.uid);
  });

  const edges = new Set<number>([bounds.startMs, bounds.endMs]);
  answered.forEach(({ intervals }) =>
    intervals.forEach(({ start, end }) => {
      if (start > bounds.startMs && start < bounds.endMs) edges.add(start);
      if (end > bounds.startMs && end < bounds.endMs) edges.add(end);
    }),
  );
  const sorted = [...edges].sort((left, right) => left - right);

  const raw: AvailabilitySegment[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const startMs = sorted[index];
    const endMs = sorted[index + 1];
    if (endMs <= startMs) continue;
    const uids = answered
      .filter(({ intervals }) =>
        intervals.some((interval) => interval.start <= startMs && interval.end >= endMs),
      )
      .map(({ uid }) => uid);
    raw.push({ startMs, endMs, count: uids.length, uids });
  }

  const segments: AvailabilitySegment[] = [];
  raw.forEach((segment) => {
    const previous = segments[segments.length - 1];
    if (previous && previous.endMs === segment.startMs && sameUids(previous.uids, segment.uids)) {
      previous.endMs = segment.endMs;
      return;
    }
    segments.push({ ...segment, uids: [...segment.uids] });
  });

  const peakCount = segments.reduce((max, segment) => Math.max(max, segment.count), 0);
  return {
    windowId: window.id,
    startMs: bounds.startMs,
    endMs: bounds.endMs,
    segments,
    peakCount,
    totalCount: answered.length,
    best: bestSlot(segments, answered.length),
    unavailableUids,
  };
}

function sameUids(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((uid, index) => uid === right[index]);
}

/**
 * The strongest windows the overview can name.
 *
 * Only adjacent segments covered by the same people are joined. A change in
 * people must stay visible: otherwise the suggested window could not be
 * accepted by every person it names. The best run has the highest count; a tie
 * goes to the longer one. Exact ties are all returned in chronological order.
 * A run shorter than {@link MIN_SLOT_MINUTES} is only offered when
 * nothing longer exists at all — a five-minute peak is not an appointment.
 */
export function bestSlots(segments: AvailabilitySegment[], totalCount: number): BestSlot[] {
  const runs: AvailabilitySegment[] = [];
  segments.forEach((segment) => {
    if (segment.count === 0) return;
    const previous = runs[runs.length - 1];
    if (
      previous &&
      previous.endMs === segment.startMs &&
      sameUids(previous.uids, segment.uids)
    ) {
      previous.endMs = segment.endMs;
      return;
    }
    runs.push({ ...segment, uids: [...segment.uids] });
  });
  if (runs.length === 0) return [];

  const minMs = MIN_SLOT_MINUTES * MINUTE_MS;
  const longEnough = runs.filter((run) => run.endMs - run.startMs >= minMs);
  const pool = longEnough.length > 0 ? longEnough : runs;

  const highestCount = Math.max(...pool.map((run) => run.count));
  const countWinners = pool.filter((run) => run.count === highestCount);
  const longestDuration = Math.max(...countWinners.map((run) => run.endMs - run.startMs));

  return countWinners
    .filter((run) => run.endMs - run.startMs === longestDuration)
    .sort((left, right) => left.startMs - right.startMs)
    .map((winner) => ({
      startMs: winner.startMs,
      endMs: winner.endMs,
      count: winner.count,
      uids: [...winner.uids],
      everyone: totalCount > 0 && winner.count === totalCount,
    }));
}

/** The deterministic first of {@link bestSlots}, used where a single action
 * still needs an unambiguous fallback. */
export function bestSlot(segments: AvailabilitySegment[], totalCount: number): BestSlot | null {
  return bestSlots(segments, totalCount)[0] ?? null;
}

/**
 * Maps a head count onto a drawing step. Zero stays zero so an empty stretch
 * is genuinely empty rather than the faintest shade of occupied.
 */
export function availabilityLevel(
  count: number,
  totalCount: number,
  levels = AVAILABILITY_LEVELS,
): number {
  if (count <= 0 || totalCount <= 0) return 0;
  if (count >= totalCount) return levels;
  return Math.max(1, Math.min(levels - 1, Math.ceil((count / totalCount) * (levels - 1))));
}

/** Ranks windows for the host's decision list: most people first, then the
 * longer slot, then the earlier one. Reading stays chronological — only
 * deciding is sorted. */
export function rankWindows(availabilities: WindowAvailability[]): WindowAvailability[] {
  return [...availabilities].sort((left, right) => {
    const leftBest = left.best;
    const rightBest = right.best;
    if (!leftBest || !rightBest) return leftBest ? -1 : rightBest ? 1 : 0;
    if (leftBest.count !== rightBest.count) return rightBest.count - leftBest.count;
    const leftLength = leftBest.endMs - leftBest.startMs;
    const rightLength = rightBest.endMs - rightBest.startMs;
    if (leftLength !== rightLength) return rightLength - leftLength;
    return leftBest.startMs - rightBest.startMs;
  });
}
