import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
  type DocumentData,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseDb, getFirebaseFunctions } from '@/shared/services/firebase';

import type {
  FriendProfile,
  FriendRequestTarget,
  FriendService,
  FriendSettings,
  FriendshipDoc,
  SendFriendRequestResult,
} from './friendService.types';

function toMillis(value: unknown): number {
  return typeof (value as { toMillis?: unknown })?.toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : typeof value === 'number'
      ? value
      : Date.now();
}

function mapProfile(value: unknown): FriendProfile | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.uid !== 'string' || typeof item.displayName !== 'string') return null;
  return {
    uid: item.uid,
    displayName: item.displayName,
    initials: typeof item.initials === 'string' ? item.initials : item.displayName.slice(0, 2),
    ...(typeof item.username === 'string' ? { username: item.username } : {}),
    ...(typeof item.avatarUrl === 'string' ? { avatarUrl: item.avatarUrl } : {}),
  };
}

function mapFriendship(id: string, data: DocumentData): FriendshipDoc {
  const status = data.status === 'accepted' ? 'accepted' : 'pending';
  const profiles = Array.isArray(data.profiles)
    ? data.profiles
        .map(mapProfile)
        .filter((profile): profile is FriendProfile => profile !== null)
        .map((profile) =>
          status === 'accepted'
            ? profile
            : {
                uid: profile.uid,
                displayName: profile.displayName,
                initials: profile.initials,
              },
        )
    : [];
  return {
    id,
    participantUids: Array.isArray(data.participantUids) ? data.participantUids : [],
    requesterUid: typeof data.requesterUid === 'string' ? data.requesterUid : '',
    status,
    profiles,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

export const firebaseFriendService: FriendService = {
  async listFriendships(actor) {
    // Friendships change rarely. The provider couples this one-off query to a
    // revision on the already-subscribed user settings document, avoiding
    // repeated 200-document listener attaches after reconnects.
    const relationships = query(
      collection(getFirebaseDb(), 'friendships'),
      where('participantUids', 'array-contains', actor.uid),
      limit(200),
    );
    const snapshot = await getDocs(relationships);
    return snapshot.docs
      .map((item) => mapFriendship(item.id, item.data()))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  subscribeSettings(actor, cb) {
    return onSnapshot(
      doc(getFirebaseDb(), 'users', actor.uid),
      (snapshot) => {
        const data = snapshot.data();
        const closeFriendUids = data?.closeFriendUids;
        const heimwegGroupUids = data?.heimwegGroupUids;
        const policy = data?.friendRequestPolicy;
        cb({
          closeFriendUids: Array.isArray(closeFriendUids)
            ? closeFriendUids.filter((uid): uid is string => typeof uid === 'string')
            : [],
          heimwegGroupUids: Array.isArray(heimwegGroupUids)
            ? heimwegGroupUids.filter((uid): uid is string => typeof uid === 'string')
            : [],
          friendRequestPolicy:
            policy === 'shared_activity' || policy === 'nobody' ? policy : 'anyone',
          friendshipsVersion:
            typeof data?.friendshipsVersion === 'number' &&
            Number.isInteger(data.friendshipsVersion) &&
            data.friendshipsVersion >= 0
              ? data.friendshipsVersion
              : 0,
          journeyRemindersEnabled: data?.journeyRemindersEnabled !== false,
          notificationsSeenAt: toMillis(data?.notificationsSeenAt ?? 0),
        } satisfies FriendSettings);
      },
      () =>
        cb({
          closeFriendUids: [],
          heimwegGroupUids: [],
          friendRequestPolicy: 'anyone',
          friendshipsVersion: 0,
          journeyRemindersEnabled: true,
          notificationsSeenAt: 0,
        }),
    );
  },

  async sendFriendRequest(_actor, target) {
    const call = httpsCallable<
      FriendRequestTarget,
      { state: SendFriendRequestResult['state']; friend: FriendProfile }
    >(getFirebaseFunctions(), 'sendFriendRequest');
    const result = await call(
      target.kind === 'username' ? { ...target, username: target.username.trim() } : target,
    );
    return result.data;
  },

  async respondToFriendRequest(_actor, friendshipId, accept) {
    await httpsCallable<{ friendshipId: string; accept: boolean }, { ok: true }>(
      getFirebaseFunctions(),
      'respondToFriendRequest',
    )({ friendshipId, accept });
  },

  async removeFriend(_actor, uid) {
    await httpsCallable<{ uid: string }, { ok: true }>(
      getFirebaseFunctions(),
      'removeFriend',
    )({
      uid,
    });
  },

  async setCloseFriend(_actor, uid, isClose) {
    await httpsCallable<{ uid: string; isClose: boolean }, { ok: true }>(
      getFirebaseFunctions(),
      'setCloseFriend',
    )({ uid, isClose });
  },

  async setHeimwegGroup(actor, uids) {
    // merge:true — the rules validate the WHOLE future document, and this must
    // not disturb the server-owned fields (pushTokens, friendshipsVersion …).
    await setDoc(
      doc(getFirebaseDb(), 'users', actor.uid),
      { heimwegGroupUids: [...new Set(uids)].slice(0, 20) },
      { merge: true },
    );
  },

  async setFriendRequestPolicy(_actor, policy) {
    await httpsCallable<{ policy: FriendSettings['friendRequestPolicy'] }, { ok: true }>(
      getFirebaseFunctions(),
      'setFriendRequestPolicy',
    )({ policy });
  },

  async setJourneyRemindersEnabled(_actor, enabled) {
    await httpsCallable<{ enabled: boolean }, { ok: true }>(
      getFirebaseFunctions(),
      'setJourneyRemindersEnabled',
    )({ enabled });
  },
};
