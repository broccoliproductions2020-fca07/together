import type { TimeRange } from './constraints';
import { durationOf } from './constraints';
import { clamp } from './units';

/**
 * The camera, and the ONE conversion between time and screen position.
 *
 * Every part of the picker — handles, range, ticks, labels, past overlay, the
 * pointer, the edge pedal — reads its geometry from `timeToX`/`xToTime`. There
 * is deliberately no rail origin and no scroll offset: a viewport is fully
 * described by the time at screen x = 0 and a scale, so there is nothing for a
 * second, slightly different calculation to disagree with.
 */

export interface Viewport {
  /** Time at screen x = 0. */
  startMs: number;
  pxPerMs: number;
}

export interface ViewportBounds {
  width: number;
  /** Both handles stay this far inside the viewport. A hard invariant. */
  safeInsetPx: number;
}

export interface ScaleLimits {
  minPxPerMs: number;
  maxPxPerMs: number;
}

export function timeToX(viewport: Viewport, ms: number): number {
  'worklet';
  return (ms - viewport.startMs) * viewport.pxPerMs;
}

export function xToTime(viewport: Viewport, x: number): number {
  'worklet';
  return viewport.startMs + x / viewport.pxPerMs;
}

export function safeLeft(bounds: ViewportBounds): number {
  'worklet';
  return bounds.safeInsetPx;
}

export function safeRight(bounds: ViewportBounds): number {
  'worklet';
  return bounds.width - bounds.safeInsetPx;
}

/** The pixels a range may occupy while both handles stay inside the safe area. */
export function usableWidth(bounds: ViewportBounds): number {
  'worklet';
  return Math.max(0, bounds.width - bounds.safeInsetPx * 2);
}

/**
 * The scale at which a duration exactly fills the usable width.
 *
 * This single number is why the safe-bounds invariant is satisfiable at all:
 * above it the range is wider than the space it must fit into, and no viewport
 * position can rescue that.
 */
export function maxPxPerMsForDuration(durationMs: number, bounds: ViewportBounds): number {
  'worklet';
  if (durationMs <= 0) return Number.POSITIVE_INFINITY;
  return usableWidth(bounds) / durationMs;
}

/**
 * Moves the scale while holding ONE time still at ONE screen position.
 *
 * Exact by construction — the anchor is substituted into the transform rather
 * than corrected afterwards, so `timeToX(result, anchorMs) === anchorX` up to
 * floating point. Edge expand, resize and the initial fit all zoom through here.
 */
export function zoomAround(anchorMs: number, anchorX: number, pxPerMs: number): Viewport {
  'worklet';
  return { startMs: anchorMs - anchorX / pxPerMs, pxPerMs };
}

/**
 * The viewport window in which both handles sit inside the safe area.
 *
 * Returns `lo > hi` when the range is too wide for the current scale — the
 * caller has to fix the scale first, which is the only honest answer.
 */
export function viewportStartWindow(
  range: TimeRange,
  pxPerMs: number,
  bounds: ViewportBounds,
): { lo: number; hi: number } {
  'worklet';
  return {
    lo: range.endMs - safeRight(bounds) / pxPerMs,
    hi: range.startMs - safeLeft(bounds) / pxPerMs,
  };
}

export function isRangeInSafeBounds(
  viewport: Viewport,
  range: TimeRange,
  bounds: ViewportBounds,
): boolean {
  'worklet';
  const startX = timeToX(viewport, range.startMs);
  const endX = timeToX(viewport, range.endMs);
  // A hair of tolerance: the check runs against values that just came out of a
  // division, and a half-ulp miss is not a broken frame.
  return startX >= safeLeft(bounds) - 0.001 && endX <= safeRight(bounds) + 0.001;
}

/** Centres the range in the viewport at the given scale. Used only where an
 * automatic reposition is already justified — never after a gesture. */
export function centreRange(range: TimeRange, pxPerMs: number, bounds: ViewportBounds): Viewport {
  'worklet';
  const midMs = (range.startMs + range.endMs) / 2;
  return zoomAround(midMs, bounds.width / 2, pxPerMs);
}

/**
 * The minimum repair that makes a viewport valid — and NOTHING if it already is.
 *
 * This is the only automatic camera move in the picker. It runs on mount, on a
 * resize and on an external value, never at the end of a gesture: a viewport
 * the user left behind is a viewport they chose, and tidying it up is motion
 * they did not ask for. Scale is reduced only as far as the safe bounds demand,
 * and around the range's own centre, so a shrinking picker gives up context
 * evenly on both sides.
 */
export function ensureRangeVisible(
  viewport: Viewport,
  range: TimeRange,
  bounds: ViewportBounds,
  scale: ScaleLimits,
): Viewport {
  'worklet';
  if (bounds.width <= 0) return viewport;

  const ceiling = Math.min(scale.maxPxPerMs, maxPxPerMsForDuration(durationOf(range), bounds));
  // The floor yields to the ceiling: both handles visible outranks a legibility
  // preference, and a picker too narrow for its own maximum duration is a
  // configuration problem the caller is warned about separately.
  const pxPerMs = clamp(viewport.pxPerMs, Math.min(scale.minPxPerMs, ceiling), ceiling);

  // A scale change has no position the user chose to preserve, so it re-anchors
  // on the range's own centre; an unchanged scale keeps as much of the current
  // position as the safe bounds allow.
  if (pxPerMs !== viewport.pxPerMs) return centreRange(range, pxPerMs, bounds);
  if (isRangeInSafeBounds(viewport, range, bounds)) return viewport;

  const window = viewportStartWindow(range, pxPerMs, bounds);
  if (window.lo > window.hi) return centreRange(range, pxPerMs, bounds);
  return { startMs: clamp(viewport.startMs, window.lo, window.hi), pxPerMs };
}

/**
 * The opening camera: the range visible with context on both sides.
 *
 * `targetFill` is a ceiling on how much of the width the range may claim, not a
 * target to hit — a short range at a comfortable scale is left at that scale
 * rather than zoomed in until it fills the picker.
 */
export function fitRange(
  range: TimeRange,
  bounds: ViewportBounds,
  scale: ScaleLimits,
  preferredPxPerMs: number,
  targetFill: number,
): Viewport {
  'worklet';
  if (bounds.width <= 0) return centreRange(range, preferredPxPerMs, bounds);
  const duration = Math.max(1, durationOf(range));
  const fitting = (usableWidth(bounds) * targetFill) / duration;
  const pxPerMs = clamp(
    Math.min(preferredPxPerMs, fitting),
    Math.min(scale.minPxPerMs, fitting),
    scale.maxPxPerMs,
  );
  return centreRange(range, pxPerMs, bounds);
}

/**
 * Whether the configuration can hold its own maximum duration.
 *
 * `minPxPerMs × maxDuration` has to fit the usable width or the three settings
 * are asking for something geometrically impossible. The picker resolves it by
 * letting the scale floor go (safe bounds are the hard invariant) and says so
 * in development rather than breaking the geometry quietly.
 */
export function validateScaleConfiguration(
  bounds: ViewportBounds,
  scale: ScaleLimits,
  maxDurationMs: number,
): { ok: boolean; requiredWidth: number; effectiveMinPxPerMs: number } {
  'worklet';
  const requiredWidth = scale.minPxPerMs * maxDurationMs + bounds.safeInsetPx * 2;
  const ceiling = maxPxPerMsForDuration(maxDurationMs, bounds);
  return {
    ok: bounds.width <= 0 || scale.minPxPerMs <= ceiling,
    requiredWidth,
    effectiveMinPxPerMs: Math.min(scale.minPxPerMs, ceiling),
  };
}
