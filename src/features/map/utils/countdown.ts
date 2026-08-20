/**
 * Ring maths for activity markers.
 *
 * The ring is a CLOCK, and that is the whole rule: no time, no ring. What the
 * ring measures differs per mode, because the two modes are asked different
 * questions — and both answers drain, so less ring always means less time.
 *
 * - `now` → PROPORTIONAL. "How far through is this?" Nearly empty means nearly
 *   over and not worth setting off for; nearly full means it just started. That
 *   reads the same at one hour and at six, which an absolute scale could not:
 *   a six-hour festival would sit on "full" for five hours and say nothing.
 * - `soon` → ABSOLUTE, over {@link SOON_RING_SCALE_MS}. "How long until it
 *   starts?" Here proportional is not even definable — there is no natural
 *   start for the wait — and an absolute scale is what makes two markers
 *   comparable at a glance: half a ring is half an hour on every one of them.
 *
 * Quantized either way, so cached marker images (see markerCapture.tsx) only
 * re-capture when the ring visibly changes rather than on every render.
 */

/** The window an amber ring spans. Beyond it the ring is simply full, which
 * honestly means "not soon yet" — the information appears exactly when it
 * starts to matter. Chosen to match `SOON_LEAD_MINUTES`, so a freshly created
 * plan starts at a full ring and drains to empty precisely at its start. */
export const SOON_RING_SCALE_MS = 60 * 60 * 1000;

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

/** Share of the amber window still to wait, clamped to 0–1. Full means the
 * start is at least {@link SOON_RING_SCALE_MS} away; empty means it is due. */
export function leadFraction(
  startsAt: string | undefined,
  now: number,
  scaleMs = SOON_RING_SCALE_MS,
): number | null {
  if (!startsAt) return null;
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.min(1, (start - now) / scaleMs));
}

/** Ceil to the next 1/steps so a freshly started activity shows a FULL ring
 * and the last sliver stays visible until the very end. */
export function quantizeFraction(fraction: number, steps = 8): number {
  return Math.min(1, Math.ceil(fraction * steps) / steps);
}

/** The quantized ring value for a marker, or undefined when no ring should
 * show — which now means exactly one thing: no fixed time. Shared by both map
 * canvases so native and web behave identically. */
export function countdownBucket(
  mode: string,
  startsAt: string | undefined,
  endsAt: string | undefined,
  now = Date.now(),
): number | undefined {
  if (mode === 'now') {
    const fraction = remainingFraction(startsAt, endsAt, now);
    return fraction == null ? undefined : quantizeFraction(fraction);
  }
  if (mode === 'soon') {
    const fraction = leadFraction(startsAt, now);
    return fraction == null ? undefined : quantizeFraction(fraction);
  }
  return undefined;
}
