import { HOUR_MS } from './core';

/**
 * The hour scale: which marks exist, and which of them get to speak.
 *
 * Kept out of `core/` on purpose. Label density is a reading decision that
 * depends on font size and taste; the gesture engine must be able to change the
 * scale without knowing that anything downstream is counting hours.
 */

export function floorToHour(ms: number): number {
  'worklet';
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/**
 * Which hours still get a label, with deliberate hysteresis.
 *
 * The thresholds overlap — 1 gives way to 2 below 40 dp/h but only comes back
 * above 52 — so a scale drifting across a boundary during an edge expand cannot
 * flicker the labels on and off. A single threshold would strobe exactly when
 * the picker is moving fastest.
 */
export function labelIntervalFor(current: number, pxPerHour: number): number {
  'worklet';
  if (current === 1) return pxPerHour < 40 ? 2 : 1;
  if (current === 2) {
    if (pxPerHour > 52) return 1;
    return pxPerHour < 19 ? 3 : 2;
  }
  if (current === 3) {
    if (pxPerHour > 27) return 2;
    return pxPerHour < 13 ? 4 : 3;
  }
  return pxPerHour > 18 ? 3 : 4;
}

/** A rendered tick set is a plain list of hour timestamps; the renderer places
 * each one from the live viewport, so the list only has to be re-cut when the
 * camera leaves what it covers. */
export function hourTicks(fromMs: number, toMs: number, maxCount: number): number[] {
  // Floored in LOCAL time, not by dividing epoch milliseconds: a few zones sit
  // at :30 or :45, where the two disagree and every mark would land on a local
  // half hour. Runs on the JS thread only, so a Date here costs nothing.
  const anchor = new Date(fromMs);
  anchor.setMinutes(0, 0, 0);
  const first = anchor.getTime();
  const span = Math.max(0, toMs - first);
  const wanted = Math.floor(span / HOUR_MS) + 1;
  // A pathological zoom-out must not produce thousands of nodes; thinning the
  // set is invisible at that scale, where most hours carry no label anyway.
  const stride = Math.max(1, Math.ceil(wanted / maxCount));
  const ticks: number[] = [];
  for (let i = 0; i < wanted; i += stride) ticks.push(first + i * HOUR_MS);
  return ticks;
}

export function hoursSinceEpoch(ms: number): number {
  'worklet';
  return Math.round(ms / HOUR_MS);
}
