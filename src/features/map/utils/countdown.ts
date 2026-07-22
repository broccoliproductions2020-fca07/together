/**
 * Countdown-ring math for `now` markers: how much of the activity's time
 * window (startsAt→endsAt) is still ahead, quantized into coarse steps so the
 * cached marker images (see markerCapture.tsx) only re-capture when the ring
 * visibly changes — not on every render.
 */

/** Remaining share of the activity window, clamped to 0–1. Returns null when
 * the window is unusable (missing/invalid/zero-length). */
export function remainingFraction(
  startsAt: string | undefined,
  endsAt: string | undefined,
  now: number,
): number | null {
  if (!startsAt || !endsAt) return null;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.max(0, Math.min(1, (end - now) / (end - start)));
}

/** Ceil to the next 1/steps so a freshly started activity shows a FULL ring
 * and the last sliver stays visible until the very end. */
export function quantizeFraction(fraction: number, steps = 8): number {
  return Math.min(1, Math.ceil(fraction * steps) / steps);
}

/** The quantized ring value for a marker, or undefined when no ring should
 * show (not a `now` activity, or no usable time window). Shared by both map
 * canvases so native and web behave identically. */
export function countdownBucket(
  mode: string,
  startsAt: string | undefined,
  endsAt: string | undefined,
  now = Date.now(),
): number | undefined {
  if (mode !== 'now') return undefined;
  const fraction = remainingFraction(startsAt, endsAt, now);
  return fraction == null ? undefined : quantizeFraction(fraction);
}
