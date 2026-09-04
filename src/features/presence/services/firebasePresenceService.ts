import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  Timestamp,
  where,
  type DocumentData,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseDb, getFirebaseFunctions } from '@/shared/services/firebase';

import type {
  PresenceDoc,
  PresenceService,
  PresenceWriteResult,
} from './presenceService.types';

/**
 * Firestore presence. ONE listener: `presence where audienceUids contains me`,
 * capped at 50. The query is renewed at the earliest expiry so its clock-bound
 * range and limit cannot retain an expired status or starve a newer one.
 *
 * Privacy: `setPresence` uses `setDoc` WITHOUT merge, so the whole doc is
 * replaced each write — when shareLocation is off, `coarseLocation` is simply
 * absent from the new doc (i.e. the field is removed, not just flagged). Going
 * private/offline calls `clearPresence` → `deleteDoc`, which friends' listeners
 * receive immediately.
 */

function presenceRef() {
  return collection(getFirebaseDb(), 'presence');
}

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return Date.now();
}

const MAX_TIMER_DELAY_MS = 2_147_000_000;

function mapDoc(id: string, data: DocumentData): PresenceDoc {
  const rawLocation = data.coarseLocation as Record<string, unknown> | undefined;
  const coarseLocation =
    rawLocation &&
    typeof rawLocation.lat === 'number' &&
    Number.isFinite(rawLocation.lat) &&
    rawLocation.lat >= -90 &&
    rawLocation.lat <= 90 &&
    typeof rawLocation.lng === 'number' &&
    Number.isFinite(rawLocation.lng) &&
    rawLocation.lng >= -180 &&
    rawLocation.lng <= 180
      ? { lat: rawLocation.lat, lng: rawLocation.lng }
      : undefined;
  const rawVibe = data.vibe as Record<string, unknown> | undefined;
  const vibe =
    rawVibe && typeof rawVibe.label === 'string' && rawVibe.label.trim()
      ? {
          label: rawVibe.label.trim().slice(0, 80),
          ...(typeof rawVibe.emoji === 'string' ? { emoji: rawVibe.emoji.slice(0, 8) } : {}),
        }
      : undefined;
  return {
    uid: id,
    displayName: typeof data.displayName === 'string' ? data.displayName.slice(0, 50) : 'Freund',
    initials: typeof data.initials === 'string' ? data.initials.slice(0, 8) : '??',
    avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined,
    vibe,
    expiresAt: toMillis(data.expireAt),
    shareLocation: data.shareLocation === true && coarseLocation != null,
    coarseLocation,
    audienceUids: Array.isArray(data.audienceUids)
      ? [...new Set(data.audienceUids.filter((uid): uid is string => typeof uid === 'string'))]
      : [],
    updatedAt: toMillis(data.updatedAt),
  };
}

export const firebasePresenceService: PresenceService = {
  subscribeOpenFriends(actor, cb) {
    let stopped = false;
    let stopSnapshot = () => {};
    let clockTimer: ReturnType<typeof setTimeout> | undefined;
    let visibleDocs: PresenceDoc[] = [];

    const clearClock = () => {
      if (clockTimer) clearTimeout(clockTimer);
      clockTimer = undefined;
    };
    const start = () => {
      if (stopped) return;
      clearClock();
      stopSnapshot();
      const q = query(
        presenceRef(),
        where('audienceUids', 'array-contains', actor.uid),
        where('expireAt', '>', Timestamp.fromMillis(Date.now())),
        limit(50),
      );
      stopSnapshot = onSnapshot(
        q,
        (snapshot) => {
          if (stopped) return;
          const now = Date.now();
          visibleDocs = snapshot.docs
            .map((d) => mapDoc(d.id, d.data()))
            .filter((d) => d.uid !== actor.uid && d.expiresAt > now);
          cb(visibleDocs);
          const nextExpiry = Math.min(...visibleDocs.map((doc) => doc.expiresAt));
          if (Number.isFinite(nextExpiry)) {
            clockTimer = setTimeout(() => {
              const tick = Date.now();
              visibleDocs = visibleDocs.filter((doc) => doc.expiresAt > tick);
              cb(visibleDocs);
              start();
            }, Math.min(MAX_TIMER_DELAY_MS, Math.max(0, nextExpiry - now) + 25));
          }
        },
        () => {
          if (stopped) return;
          visibleDocs = [];
          cb([]);
        },
      );
    };

    start();
    return () => {
      stopped = true;
      clearClock();
      stopSnapshot();
    };
  },

  setPresence(_actor, input) {
    const publish = httpsCallable(getFirebaseFunctions(), 'publishPresence');
    return publish({ presence: input }).then((result) => {
      const data = result.data as PresenceWriteResult | null;
      return {
        ...(Number.isFinite(data?.expiresAt) ? { expiresAt: data?.expiresAt } : {}),
        ...(data?.closed === true ? { closed: true } : {}),
      };
    });
  },

  async clearPresence(actor) {
    await deleteDoc(doc(presenceRef(), actor.uid));
  },
};
