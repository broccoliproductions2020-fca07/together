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

import type { PresenceDoc, PresenceService } from './presenceService.types';

/**
 * Firestore presence. ONE listener: `presence where audienceUids contains me`,
 * capped at 50, expired docs filtered client-side (TTL deletes them for real via
 * the `expireAt` policy — no composite index needed for a range query).
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
  if (typeof value === 'number') return value;
  return Date.now();
}

function mapDoc(id: string, data: DocumentData): PresenceDoc {
  return {
    uid: id,
    displayName: data.displayName ?? 'Freund',
    initials: data.initials ?? '??',
    avatarUrl: data.avatarUrl,
    vibe: data.vibe,
    expiresAt: toMillis(data.expireAt),
    shareLocation: data.shareLocation === true,
    coarseLocation: data.coarseLocation,
    audienceUids: data.audienceUids ?? [],
    updatedAt: toMillis(data.updatedAt),
  };
}

export const firebasePresenceService: PresenceService = {
  subscribeOpenFriends(actor, cb) {
    const q = query(
      presenceRef(),
      where('audienceUids', 'array-contains', actor.uid),
      where('expireAt', '>', Timestamp.fromMillis(Date.now())),
      limit(50),
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const now = Date.now();
        const docs = snapshot.docs
          .map((d) => mapDoc(d.id, d.data()))
          .filter((d) => d.uid !== actor.uid && d.expiresAt > now);
        cb(docs);
      },
      () => cb([]),
    );
  },

  setPresence(_actor, input) {
    const publish = httpsCallable(getFirebaseFunctions(), 'publishPresence');
    void publish({ presence: input });
  },

  clearPresence(actor) {
    void deleteDoc(doc(presenceRef(), actor.uid));
  },
};
