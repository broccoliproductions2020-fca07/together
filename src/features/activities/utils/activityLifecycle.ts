import type { ActivityDoc } from '../services/activityService.types';

/**
 * Activities remain stored for the short activity-chat retention window, but
 * stop being a live plan at their end time. Keeping that distinction local
 * avoids a background write/listener merely to hide a finished activity.
 */
export function activityEndMs(activity: Pick<ActivityDoc, 'startsAt' | 'endsAt'>): number | null {
  const endMs = activity.endsAt ? Date.parse(activity.endsAt) : NaN;
  if (Number.isFinite(endMs)) return endMs;

  const startMs = activity.startsAt ? Date.parse(activity.startsAt) : NaN;
  return Number.isFinite(startMs) ? startMs : null;
}

export function isActivityFinished(
  activity: Pick<ActivityDoc, 'startsAt' | 'endsAt'>,
  now = Date.now(),
): boolean {
  const endMs = activityEndMs(activity);
  return endMs !== null && endMs <= now;
}

export function isActivityLive(
  activity: Pick<ActivityDoc, 'status' | 'startsAt' | 'endsAt'>,
  now = Date.now(),
): boolean {
  return activity.status === 'active' && !isActivityFinished(activity, now);
}
