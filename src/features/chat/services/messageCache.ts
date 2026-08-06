import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ChatMessage } from '../types';

/**
 * Device-local message store for chat's instant first paint. The live listener
 * still reconciles the newest bounded server window on every room open: a
 * cache must never become an ordering anchor that can hide missed messages.
 *
 * Retention mirrors the product rule (rooms die via TTL after ≤ 30 days):
 * entries untouched for 31 days are pruned lazily on first access.
 */

const KEY_PREFIX = 'together.chat.messages.v1:';
const MAX_AGE_MS = 31 * 24 * 60 * 60 * 1000;

/** Cap per room — bounds AsyncStorage growth; older messages fall off. */
export const MAX_CACHED_MESSAGES = 200;

interface CacheEntry {
  savedAt: number;
  messages: ChatMessage[];
}

let prunedThisSession = false;

async function pruneOldEntries() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(KEY_PREFIX));
    const now = Date.now();
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const entry = JSON.parse(raw) as CacheEntry;
      if (!entry.savedAt || now - entry.savedAt > MAX_AGE_MS) {
        await AsyncStorage.removeItem(key);
      }
    }
  } catch {
    // best-effort hygiene
  }
}

export async function loadCachedMessages(roomId: string): Promise<ChatMessage[]> {
  if (!prunedThisSession) {
    prunedThisSession = true;
    void pruneOldEntries();
  }
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + roomId);
    if (!raw) return [];
    const entry = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(entry.messages)) return [];
    if (Date.now() - entry.savedAt > MAX_AGE_MS) {
      void AsyncStorage.removeItem(KEY_PREFIX + roomId);
      return [];
    }
    return entry.messages;
  } catch {
    return [];
  }
}

export function saveCachedMessages(roomId: string, messages: ChatMessage[]) {
  const entry: CacheEntry = {
    savedAt: Date.now(),
    messages: messages.slice(-MAX_CACHED_MESSAGES),
  };
  AsyncStorage.setItem(KEY_PREFIX + roomId, JSON.stringify(entry)).catch(() => {});
}
