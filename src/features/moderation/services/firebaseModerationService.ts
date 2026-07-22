import { collection, limit, onSnapshot, query, where } from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseDb, getFirebaseFunctions } from '@/shared/services/firebase';

import type { BlockedProfile, ModerationService, ReportReason } from './moderationService.types';

export const firebaseModerationService: ModerationService = {
  subscribeBlockedUsers(actor, cb) {
    const blockedQuery = query(
      collection(getFirebaseDb(), 'blocks'),
      where('blockerUid', '==', actor.uid),
      limit(100),
    );
    return onSnapshot(
      blockedQuery,
      (snapshot) => cb(snapshot.docs.map((item) => item.data().blockedUid).filter(Boolean)),
      () => cb([]),
    );
  },

  async blockUser(_actor, targetUid) {
    const call = httpsCallable<{ targetUid: string }, { ok: true }>(
      getFirebaseFunctions(),
      'blockUser',
    );
    await call({ targetUid });
  },

  async unblockUser(_actor, targetUid) {
    const call = httpsCallable<{ targetUid: string }, { ok: true }>(
      getFirebaseFunctions(),
      'unblockUser',
    );
    await call({ targetUid });
  },

  async reportUser(_actor, targetUid, reason: ReportReason) {
    const call = httpsCallable<{ targetUid: string; reason: ReportReason }, { ok: true }>(
      getFirebaseFunctions(),
      'reportUser',
    );
    await call({ targetUid, reason });
  },

  async resolveProfiles(_actor, _uids) {
    // publicProfiles are not client-readable (rules) — the callable resolves
    // the caller's own block list server-side.
    const call = httpsCallable<undefined, { contacts: BlockedProfile[] }>(
      getFirebaseFunctions(),
      'getBlockedContacts',
    );
    const result = await call();
    return result.data.contacts ?? [];
  },
};
