import { clamp, snapToStep } from './units';

/**
 * The ONE place a range is allowed to be limited.
 *
 * Handle drag, range drag, edge expand, edge pan, snapping and external values
 * all end here, which is what stops the same rule being written four times and
 * drifting apart. Every entry point has the same shape: state a DESIRED time,
 * get back the range the limits actually allow. Nothing else clamps.
 */

export interface TimeRange {
  startMs: number;
  endMs: number;
}

/** Which end of the range a gesture is moving. `range` moves both, rigidly. */
export type RangeEdge = 'start' | 'end' | 'range';

export interface RangeLimits {
  minTimeMs: number;
  /** `Number.POSITIVE_INFINITY` when the caller passes no `max`. */
  maxTimeMs: number;
  minDurationMs: number;
  maxDurationMs: number;
}

export function durationOf(range: TimeRange): number {
  'worklet';
  return range.endMs - range.startMs;
}

/**
 * Narrows the configured duration window with a bound the GEOMETRY imposes.
 *
 * Edge expand pins both handles, so the scale is forced to
 * `handleDistancePx / duration` — grow the duration far enough and that scale
 * falls under the legibility floor, shrink it far enough and it passes the
 * ceiling. Expressing both as duration limits is what keeps the pinned-handle
 * invariant true by construction instead of by a special case: the scale can
 * never clamp, because the duration stops first.
 */
export function withGeometricDurationBounds(
  limits: RangeLimits,
  handleDistancePx: number,
  minPxPerMs: number,
  maxPxPerMs: number,
): RangeLimits {
  'worklet';
  if (handleDistancePx <= 0 || minPxPerMs <= 0 || maxPxPerMs <= 0) return limits;
  const geometricMax = handleDistancePx / minPxPerMs;
  const geometricMin = handleDistancePx / maxPxPerMs;
  const minDurationMs = Math.max(limits.minDurationMs, geometricMin);
  return {
    minTimeMs: limits.minTimeMs,
    maxTimeMs: limits.maxTimeMs,
    // A floor that overshot the ceiling would invert the window; the floor is
    // the one that carries a hard product meaning, so it wins.
    minDurationMs,
    maxDurationMs: Math.max(minDurationMs, Math.min(limits.maxDurationMs, geometricMax)),
  };
}

/**
 * The desired time of ONE edge in, the whole allowed range out.
 *
 * `desiredMs` addresses the moving edge: the start for `start` and `range`, the
 * end for `end`. Callers never pre-clamp — that is the entire point.
 */
export function resolveRange(
  base: TimeRange,
  edge: RangeEdge,
  desiredMs: number,
  limits: RangeLimits,
): TimeRange {
  'worklet';
  if (edge === 'range') {
    const duration = durationOf(base);
    const latestStart = limits.maxTimeMs - duration;
    // An impossible window (the range cannot fit between the two time bounds)
    // resolves to the earliest legal position rather than to an inverted one.
    const startMs =
      latestStart < limits.minTimeMs ? limits.minTimeMs : clamp(desiredMs, limits.minTimeMs, latestStart);
    return { startMs, endMs: startMs + duration };
  }

  if (edge === 'start') {
    const earliest = Math.max(limits.minTimeMs, base.endMs - limits.maxDurationMs);
    const latest = base.endMs - limits.minDurationMs;
    const startMs = latest < earliest ? earliest : clamp(desiredMs, earliest, latest);
    return { startMs, endMs: base.endMs };
  }

  const earliest = base.startMs + limits.minDurationMs;
  const latest = Math.min(limits.maxTimeMs, base.startMs + limits.maxDurationMs);
  const endMs = latest < earliest ? earliest : clamp(desiredMs, earliest, latest);
  return { startMs: base.startMs, endMs };
}

/**
 * What the range ACTUALLY moved, for the edge that was asked to move.
 *
 * The viewport reacts to this and never to the requested delta — the difference
 * between the two is exactly the bounce that appears when a control moves first
 * and corrects afterwards.
 */
export function acceptedDeltaMs(before: TimeRange, after: TimeRange, edge: RangeEdge): number {
  'worklet';
  if (edge === 'end') return after.endMs - before.endMs;
  return after.startMs - before.startMs;
}

/** The pedal's entry point: ask for a delta, learn what it bought. */
export function requestDelta(
  base: TimeRange,
  edge: RangeEdge,
  deltaMs: number,
  limits: RangeLimits,
): { range: TimeRange; acceptedMs: number } {
  'worklet';
  const current = edge === 'end' ? base.endMs : base.startMs;
  const range = resolveRange(base, edge, current + deltaMs, limits);
  return { range, acceptedMs: acceptedDeltaMs(base, range, edge) };
}

/**
 * Brings an arbitrary range inside the limits — external values and the initial
 * mount, never a gesture. Duration is preserved where the bounds allow it.
 */
export function clampRangeIntoLimits(range: TimeRange, limits: RangeLimits): TimeRange {
  'worklet';
  const duration = clamp(durationOf(range), limits.minDurationMs, limits.maxDurationMs);
  const latestStart = limits.maxTimeMs - duration;
  const startMs =
    latestStart < limits.minTimeMs ? limits.minTimeMs : clamp(range.startMs, limits.minTimeMs, latestStart);
  return { startMs, endMs: startMs + duration };
}

/**
 * The reported value. Snapping the moving edge only, then re-resolving, so a
 * rounded edge can never push the range outside its own limits.
 */
export function snapRange(
  range: TimeRange,
  edge: RangeEdge,
  stepMs: number,
  originMs: number,
  limits: RangeLimits,
): TimeRange {
  'worklet';
  if (stepMs <= 0) return range;
  if (edge === 'range') {
    const startMs = snapToStep(range.startMs, stepMs, originMs);
    return resolveRange(range, 'range', startMs, limits);
  }
  const target = edge === 'end' ? range.endMs : range.startMs;
  return resolveRange(range, edge, snapToStep(target, stepMs, originMs), limits);
}

export function rangesEqual(a: TimeRange, b: TimeRange): boolean {
  'worklet';
  return a.startMs === b.startMs && a.endMs === b.endMs;
}
