import { useEffect, useSyncExternalStore } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'together.postfach.newSeenAt.v1';

/**
 * When this device last looked at "Neu für dich".
 *
 * Its OWN cursor, deliberately, and local.
 *
 * It cannot ride on `users/{uid}.notificationsSeenAt`: nothing in the app ever
 * writes that field — notifications track their read state per document
 * (`markSeen`) — so a section built on it would never empty. That is not a
 * cosmetic problem: an unmoving cursor turns "what did I miss" into a permanent
 * list of the newest activities, which is the feed this app does not have.
 *
 * Local (AsyncStorage) rather than a Firestore field, for three reasons: it
 * costs no write per visit, "what have I already seen" is genuinely a property
 * of this device rather than of the account, and it keeps the vestigial server
 * field alone instead of quietly giving it a second meaning.
 */
let cursor = 0;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function hydrate(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      const stored = Number(raw);
      if (Number.isFinite(stored) && stored > 0) {
        cursor = stored;
      } else {
        /**
         * A fresh install has nothing to catch up on. Starting at 0 would greet
         * a new account with eight activities presented as news, which is both
         * untrue and the worst possible first impression of a section whose
         * whole point is "here is what you missed".
         */
        cursor = Date.now();
        void AsyncStorage.setItem(STORAGE_KEY, String(cursor)).catch(() => {});
      }
    })
    .catch(() => {
      // Storage can fail. A cursor of "now" is the safe direction: it shows
      // nothing rather than showing everything as new.
      cursor = Date.now();
    })
    .finally(() => {
      hydrated = true;
      hydrating = null;
      emit();
    });
  return hydrating;
}

/** Advance the cursor — called when the Postfach is left, never when it opens,
 * so the section stays readable for the whole visit. */
export function markNewForYouSeen() {
  cursor = Date.now();
  emit();
  void AsyncStorage.setItem(STORAGE_KEY, String(cursor)).catch(() => {});
}

export function useNewForYouCursor(): number {
  const value = useSyncExternalStore(
    subscribe,
    () => cursor,
    () => cursor,
  );
  useEffect(() => {
    void hydrate();
  }, []);
  return value;
}

/** Test seam: forget everything this module remembers. */
export function resetNewForYouCursorForTests() {
  cursor = 0;
  hydrated = false;
  hydrating = null;
}
