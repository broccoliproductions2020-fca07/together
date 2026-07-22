import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FriendProfile, FriendshipDoc, FriendshipStatus } from './friendService.types';

const CACHE_PREFIX = 'together.friendships.cache.v1:';

type CachedFriendships = {
  relationships: FriendshipDoc[];
  version: number;
  savedAt: number;
};

export type FriendshipCache = Pick<CachedFriendships, 'relationships' | 'version'>;

function cacheKey(uid: string) {
  return `${CACHE_PREFIX}${uid}`;
}

function isProfile(value: unknown): value is FriendProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<FriendProfile>;
  return (
    typeof profile.uid === 'string' &&
    typeof profile.displayName === 'string' &&
    typeof profile.initials === 'string' &&
    (profile.username === undefined || typeof profile.username === 'string') &&
    (profile.avatarUrl === undefined || typeof profile.avatarUrl === 'string')
  );
}

function isFriendship(value: unknown): value is FriendshipDoc {
  if (!value || typeof value !== 'object') return false;
  const relationship = value as Partial<FriendshipDoc>;
  const validStatus: FriendshipStatus[] = ['pending', 'accepted'];
  return (
    typeof relationship.id === 'string' &&
    Array.isArray(relationship.participantUids) &&
    relationship.participantUids.every((uid) => typeof uid === 'string') &&
    typeof relationship.requesterUid === 'string' &&
    validStatus.includes(relationship.status as FriendshipStatus) &&
    Array.isArray(relationship.profiles) &&
    relationship.profiles.every(isProfile) &&
    typeof relationship.createdAt === 'number' &&
    typeof relationship.updatedAt === 'number'
  );
}

function sortRelationships(relationships: FriendshipDoc[]) {
  return [...relationships].sort((first, second) => second.updatedAt - first.updatedAt);
}

/**
 * A per-account snapshot gives an immediate, offline-capable first paint. Its
 * revision is compared with the existing user-settings listener before a
 * relationship query is issued.
 */
export async function loadCachedFriendships(uid: string): Promise<FriendshipCache | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedFriendships>;
    if (
      !Array.isArray(cached.relationships) ||
      !cached.relationships.every(isFriendship) ||
      typeof cached.version !== 'number' ||
      !Number.isInteger(cached.version) ||
      cached.version < 0
    ) {
      return null;
    }
    return { relationships: sortRelationships(cached.relationships), version: cached.version };
  } catch {
    return null;
  }
}

export async function saveCachedFriendships(
  uid: string,
  version: number,
  relationships: FriendshipDoc[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      cacheKey(uid),
      JSON.stringify({
        relationships: sortRelationships(relationships),
        version,
        savedAt: Date.now(),
      } satisfies CachedFriendships),
    );
  } catch {
    // Cache failure must never block social UI or leave it blank.
  }
}
