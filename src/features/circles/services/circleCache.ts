import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CircleDoc } from './circleService.types';

const CACHE_PREFIX = 'together.groups.cache.v1:';

type CachedCircles = {
  circles: CircleDoc[];
  savedAt: number;
};

function cacheKey(uid: string) {
  return `${CACHE_PREFIX}${uid}`;
}

function isCircle(value: unknown): value is CircleDoc {
  if (!value || typeof value !== 'object') return false;
  const circle = value as Partial<CircleDoc>;
  return (
    typeof circle.id === 'string' &&
    typeof circle.name === 'string' &&
    Array.isArray(circle.friendUids) &&
    circle.friendUids.every((uid) => typeof uid === 'string') &&
    typeof circle.createdAt === 'number' &&
    typeof circle.updatedAt === 'number'
  );
}

function sortCircles(circles: CircleDoc[]) {
  return [...circles].sort((first, second) => second.updatedAt - first.updatedAt);
}

/**
 * Private groups change rarely. Keeping the last known owner-only list on the
 * device makes the picker instant while avoiding a permanent Firestore
 * listener (and its reconnect reads). The key is scoped per signed-in user so
 * no group's contents can appear after an account switch.
 */
export async function loadCachedCircles(uid: string): Promise<CircleDoc[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedCircles>;
    if (!Array.isArray(cached.circles) || !cached.circles.every(isCircle)) return null;
    return sortCircles(cached.circles);
  } catch {
    return null;
  }
}

export async function saveCachedCircles(uid: string, circles: CircleDoc[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      cacheKey(uid),
      JSON.stringify({
        circles: sortCircles(circles),
        savedAt: Date.now(),
      } satisfies CachedCircles),
    );
  } catch {
    // A missing cache is never allowed to block the private-group UI.
  }
}
