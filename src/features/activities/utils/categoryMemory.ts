import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ActivityCategory } from '../types';
import { normalizeForUnderstanding } from './activityUnderstanding';

const STORAGE_KEY = 'together.activity.categoryMemory.v1';
const MAX_ENTRIES = 200;

interface MemoryEntry {
  category: ActivityCategory;
  /** How often this wording was confirmed — a repeated choice outranks a one-off. */
  count: number;
  /** Epoch ms of the last confirmation; drives LRU eviction. */
  at: number;
}

/**
 * Tier-0 of the classifier: what THIS person already told us.
 *
 * The bundled lexical knowledge base abstains on slang it has never seen
 * ("Zocken", "Bib", "Feierabendbier"), which is correct — but the same person
 * uses the same words every week. Recording the category they pick by hand
 * turns that one correction into a permanent, instant answer for every future
 * activity with the same wording.
 *
 * Deliberately ON-DEVICE ONLY: activity titles are user content. Keeping the
 * map local means it needs no consent, no processor entry in the
 * Datenschutzerklärung, works offline, costs nothing, and cannot leak. Never
 * move this to Firestore or send it to a server — if the shared knowledge base
 * should grow, curate `activityCategoryKnowledge.json` from real user language
 * deliberately (see AGENTS.md), don't harvest it silently.
 */
let entries = new Map<string, MemoryEntry>();
let hydrated = false;
let hydrating: Promise<void> | null = null;

function isCategoryEntry(value: unknown): value is MemoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.category === 'string' &&
    typeof entry.count === 'number' &&
    typeof entry.at === 'number'
  );
}

/** Hydrates once per app start; safe to call from every composer mount. */
export async function loadCategoryMemory(): Promise<void> {
  if (hydrated) return;
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          entries = new Map(
            Object.entries(parsed as Record<string, unknown>).filter(
              (pair): pair is [string, MemoryEntry] => isCategoryEntry(pair[1]),
            ),
          );
        }
      }
    })
    .catch(() => {
      // A corrupt or unavailable cache simply means "nothing learned yet".
    })
    .finally(() => {
      hydrated = true;
      hydrating = null;
    });
  return hydrating;
}

/**
 * Synchronous lookup — safe to call while typing. Exact wording wins; a
 * single-word title also matches a remembered single word inside a longer
 * phrase ("Zocken" ← "Zocken bei Max"), which is where slang actually repeats.
 */
export function recallCategory(title: string): ActivityCategory | null {
  if (!hydrated || entries.size === 0) return null;
  const normalized = normalizeForUnderstanding(title);
  if (normalized.length < 2) return null;

  const exact = entries.get(normalized);
  if (exact) return exact.category;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Score every remembered wording that shares a whole word with this title,
  // preferring the one confirmed most often (ties → most recent).
  let best: (MemoryEntry & { key: string }) | null = null;
  for (const [key, entry] of entries) {
    const keyTokens = key.split(/\s+/).filter(Boolean);
    const shares = keyTokens.some((keyToken) => tokens.includes(keyToken));
    if (!shares) continue;
    if (!best || entry.count > best.count || (entry.count === best.count && entry.at > best.at)) {
      best = { ...entry, key };
    }
  }
  return best?.category ?? null;
}

/**
 * Records a category the user chose BY HAND for this wording. Only ever called
 * from an explicit pick — an auto-applied suggestion must never train the
 * memory on itself, or one wrong guess would harden into a permanent answer.
 */
export function rememberCategory(title: string, category: ActivityCategory): void {
  const normalized = normalizeForUnderstanding(title);
  if (normalized.length < 2) return;

  const previous = entries.get(normalized);
  entries.set(normalized, {
    category,
    count: previous?.category === category ? previous.count + 1 : 1,
    at: Date.now(),
  });

  if (entries.size > MAX_ENTRIES) {
    const oldest = [...entries.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) entries.delete(oldest[0]);
  }

  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries))).catch(() => {});
}

/** Drops a wording the user no longer wants remembered (category cleared). */
export function forgetCategory(title: string): void {
  const normalized = normalizeForUnderstanding(title);
  if (!entries.delete(normalized)) return;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries))).catch(() => {});
}
