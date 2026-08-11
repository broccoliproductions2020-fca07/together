import type { ActivityMode } from '../types';

/**
 * Single source of truth for the "soon" → "now" auto-transition: once an
 * activity's start time has passed, it displays as "now" everywhere (map pin
 * color, detail sheet, calendar card) without anyone having to edit it.
 * "open" and already-"now" activities are untouched.
 */
export function resolveActivityMode(
  mode: ActivityMode,
  startsAt: string | undefined,
  now: number = Date.now(),
): ActivityMode {
  if (mode !== 'soon' || !startsAt) return mode;
  const startTime = new Date(startsAt).getTime();
  if (Number.isNaN(startTime)) return mode;
  return startTime <= now ? 'now' : mode;
}

/**
 * Anreise exists for PLANNED activities only. A `now` activity means "ich bin
 * gerade hier" — it has no lead time to travel in, so its whole journey
 * apparatus (sheet row, join/create prompt, reminder push, background task)
 * is removed rather than merely hidden.
 *
 * The decision is made on the STORED mode and can never be made on the
 * resolved one: `resolveActivityMode` displays every started `soon` activity
 * as `now`, so the resolved value cannot tell "created spontaneously" from
 * "planned, and now running" — and the second one still needs its Anreise,
 * because being late is exactly when people want to see you coming.
 *
 * An unknown stored mode means no journey. Background location is the
 * expensive, privacy-heavy path, so this fails closed.
 */
export function activitySupportsJourney(plannedMode: ActivityMode | undefined): boolean {
  return plannedMode != null && plannedMode !== 'now';
}
