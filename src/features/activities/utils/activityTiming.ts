import type { ActivityMode } from '@/features/map/types/map.types';

const MINUTE_MS = 60 * 1000;
const HOUR_MINUTES = 60;
const NEAR_TERM_MINUTES = 12 * HOUR_MINUTES;

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** A concise, human label for a scheduled activity's remaining wait time. */
export function upcomingStartLabel(startsAt: string | undefined, now = Date.now()) {
  const start = startsAt ? Date.parse(startsAt) : Number.NaN;
  if (!Number.isFinite(start)) return 'Geplant';

  const remainingMinutes = Math.ceil((start - now) / MINUTE_MS);
  if (remainingMinutes <= 1) return 'Startet gleich';
  if (remainingMinutes < HOUR_MINUTES) return `Startet in ${remainingMinutes} Min.`;

  if (remainingMinutes < NEAR_TERM_MINUTES) {
    const hours = Math.floor(remainingMinutes / HOUR_MINUTES);
    const minutes = remainingMinutes % HOUR_MINUTES;
    return minutes < 10 ? `Startet in ${hours} Std.` : `Startet in ${hours} Std. ${minutes} Min.`;
  }

  const today = startOfDay(now);
  const startDay = startOfDay(start);
  if (startDay === today) return 'Startet heute';
  if (startDay === today + 24 * HOUR_MINUTES * MINUTE_MS) return 'Startet morgen';
  return 'Geplant';
}

export function activityPhaseLabel(
  mode: ActivityMode,
  startsAt: string | undefined,
  now = Date.now(),
) {
  if (mode === 'soon') {
    const start = startsAt ? Date.parse(startsAt) : Number.NaN;
    return Number.isFinite(start) && start <= now ? 'Jetzt' : upcomingStartLabel(startsAt, now);
  }
  return mode === 'now' ? 'Jetzt' : 'Offen';
}
