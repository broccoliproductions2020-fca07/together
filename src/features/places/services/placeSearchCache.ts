import type { PlaceSuggestion } from './placeService.types';

/**
 * Short-lived IN-MEMORY cache for autocomplete results. A repeated query
 * paints instantly (no debounce wait) and burns neither the per-user daily
 * quota nor a Places request.
 *
 * Deliberately NOT persisted: the Google Maps Platform ToS only permits
 * storing place IDs long-term — Places content may be cached transiently for
 * performance, so this cache lives in memory with a short TTL and dies with
 * the process. Never move it to AsyncStorage.
 */
const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 50;

const entries = new Map<string, { suggestions: PlaceSuggestion[]; at: number }>();

export function readPlaceSearchCache(key: string): PlaceSuggestion[] | null {
  const entry = entries.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    entries.delete(key);
    return null;
  }
  return entry.suggestions;
}

export function storePlaceSearchCache(key: string, suggestions: PlaceSuggestion[]) {
  // Map iteration order is insertion order → deleting the first key evicts
  // the oldest entry once the cap is reached.
  if (!entries.has(key) && entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (typeof oldest === 'string') entries.delete(oldest);
  }
  entries.set(key, { suggestions, at: Date.now() });
}
