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

/** Any running or upcoming real Activity with a map destination supports Anreise. */
export function activitySupportsJourney(
  plannedMode: ActivityMode | undefined,
  targetCoordinate?: { latitude: number; longitude: number },
): boolean {
  return (
    (plannedMode === 'now' || plannedMode === 'soon') &&
    Number.isFinite(targetCoordinate?.latitude) &&
    Number.isFinite(targetCoordinate?.longitude)
  );
}
