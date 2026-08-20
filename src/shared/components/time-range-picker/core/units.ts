/**
 * Scalar helpers shared by every core module.
 *
 * Everything in `core/` is plain TypeScript with no imports outside this folder:
 * that is what lets the engines run inside a Reanimated worklet AND be
 * transpiled straight into a node test (`scripts/test-time-range-picker.mjs`).
 * The `'worklet'` directives are a no-op string literal off the UI thread.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/** Rounds to the grid ANCHORED on `originMs`, so a non-midnight origin cannot
 * shift every reported time by a fraction of a step. */
export function snapToStep(ms: number, stepMs: number, originMs: number): number {
  'worklet';
  if (stepMs <= 0) return ms;
  return originMs + Math.round((ms - originMs) / stepMs) * stepMs;
}

export function pxPerMsFromPxPerHour(pxPerHour: number): number {
  'worklet';
  return pxPerHour / HOUR_MS;
}

export function pxPerHourFromPxPerMs(pxPerMs: number): number {
  'worklet';
  return pxPerMs * HOUR_MS;
}
