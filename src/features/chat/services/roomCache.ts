import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ChatRoom } from '../types';

/**
 * Room summaries are small but power the activity list and unread badge. Keep
 * a per-account device cache so those surfaces paint immediately without a
 * permanent Firestore listener. The server remains authoritative whenever the
 * list is opened or the app returns to the foreground.
 */
const KEY_PREFIX = 'together.chat.rooms.v2:';
const MAX_AGE_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_ROOMS = 30;

interface CacheEntry {
  savedAt: number;
  rooms: ChatRoom[];
}

function normalize(rooms: ChatRoom[]) {
  const now = Date.now();
  return rooms
    .filter((room) => room && typeof room.id === 'string' && (!room.expireAt || room.expireAt > now))
    .sort((first, second) => second.createdAt - first.createdAt)
    .slice(0, MAX_ROOMS);
}

export async function loadCachedRooms(uid: string): Promise<ChatRoom[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + uid);
    if (!raw) return [];
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry.savedAt || Date.now() - entry.savedAt > MAX_AGE_MS || !Array.isArray(entry.rooms)) {
      void AsyncStorage.removeItem(KEY_PREFIX + uid);
      return [];
    }
    return normalize(entry.rooms);
  } catch {
    return [];
  }
}

export function saveCachedRooms(uid: string, rooms: ChatRoom[]) {
  const entry: CacheEntry = {
    savedAt: Date.now(),
    rooms: normalize(rooms),
  };
  AsyncStorage.setItem(KEY_PREFIX + uid, JSON.stringify(entry)).catch(() => {});
}
