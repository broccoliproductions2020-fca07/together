import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseDb, getFirebaseFunctions } from '@/shared/services/firebase';
import {
  registerSyncOperationHandler,
  runOrEnqueueSyncOperation,
  type ActivityCreateSyncPayload,
} from '@/features/sync';

import type { ActivityDoc, ActivityDocUpdate, ActivityService } from './activityService.types';

/**
 * Firestore implementation of {@link ActivityService}.
 * Feed = ONE listener: audienceUids contains me AND status active, capped at 50
 * (composite index in firestore.indexes.json). `visibleUntil` controls feed
 * visibility while `expireAt` preserves the short activity-chat retention.
 */

function activitiesRef() {
  return collection(getFirebaseDb(), 'activities');
}

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number') return value;
  return Date.now();
}

/** Firestore can retain documents created by an older app version. Treat every
 * field received from it as untrusted so one legacy document can never take the
 * whole authenticated map down. Rules still validate every newly written doc;
 * this is deliberately a read-side compatibility guard. */
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function activityParticipants(value: unknown): ActivityDoc['participants'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const participant = item as Record<string, unknown>;
    if (typeof participant.uid !== 'string' || typeof participant.displayName !== 'string')
      return [];
    return [
      {
        uid: participant.uid,
        displayName: participant.displayName,
        initials:
          typeof participant.initials === 'string'
            ? participant.initials
            : participant.displayName.slice(0, 2).toUpperCase(),
      },
    ];
  });
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

async function submitActivityCreate(payload: ActivityCreateSyncPayload) {
  const create = httpsCallable(getFirebaseFunctions(), 'createActivity');
  await create({
    activityId: payload.activityId,
    activity: stripUndefined({
      mode: payload.activity.mode,
      title: payload.activity.title,
      note: payload.activity.note,
      audienceContext: payload.activity.audienceContext,
      startsAt: payload.activity.startsAt,
      endsAt: payload.activity.endsAt,
      place: payload.activity.place ? stripUndefined(payload.activity.place) : undefined,
      maxParticipants: payload.activity.maxParticipants,
      category: payload.activity.category,
      guestInvitesEnabled: payload.activity.guestInvitesEnabled,
    }),
  });
}

registerSyncOperationHandler('activity.create', async (operation) => {
  if (operation.kind !== 'activity.create') return;
  await submitActivityCreate(operation.payload);
});

function mapDoc(id: string, data: DocumentData): ActivityDoc {
  const participants = activityParticipants(data.participants);
  const participantUids = stringArray(data.participantUids);
  return {
    id,
    hostId: data.hostId,
    mode: data.mode,
    title: data.title ?? 'Activity',
    note: data.note,
    audienceUids: stringArray(data.audienceUids),
    participantUids:
      participantUids.length > 0
        ? participantUids
        : participants.map((participant) => participant.uid),
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    place: data.place,
    maxParticipants: typeof data.maxParticipants === 'number' ? data.maxParticipants : undefined,
    category: data.category,
    participants,
    ...(data.guestInvitesEnabled === true ? { guestInvitesEnabled: true } : {}),
    status: data.status === 'expired' || data.status === 'cancelled' ? data.status : 'active',
    createdAt: toMillis(data.createdAt),
    visibleUntil: data.visibleUntil ? toMillis(data.visibleUntil) : undefined,
    expireAt: data.expireAt ? toMillis(data.expireAt) : undefined,
    journeyUnderwayCount:
      Number.isInteger(data.journeyUnderwayCount) && data.journeyUnderwayCount > 0
        ? data.journeyUnderwayCount
        : undefined,
  };
}

export const firebaseActivityService: ActivityService = {
  subscribeActivities(actor, cb) {
    const q = query(
      activitiesRef(),
      where('audienceUids', 'array-contains', actor.uid),
      where('status', '==', 'active'),
      where('visibleUntil', '>', Timestamp.fromMillis(Date.now())),
      // Cloud Firestore requires the range field to be ordered first.
      orderBy('visibleUntil', 'asc'),
      limit(50),
    );
    return onSnapshot(
      q,
      (snapshot) => {
        cb(snapshot.docs.map((d) => mapDoc(d.id, d.data())));
      },
      () => cb([]),
    );
  },

  createActivity(actor, data, preferredId) {
    const ref = preferredId ? doc(activitiesRef(), preferredId) : doc(activitiesRef());
    const payload: ActivityCreateSyncPayload = { activityId: ref.id, activity: data };
    const ready = runOrEnqueueSyncOperation(
      {
        id: `activity.create:${ref.id}`,
        accountId: actor.uid,
        kind: 'activity.create',
        payload,
        createdAt: Date.now(),
        attempts: 0,
        status: 'queued',
      },
      () => submitActivityCreate(payload),
    );
    return { id: ref.id, ready };
  },

  updateActivity(_actor, id, update: ActivityDocUpdate) {
    return httpsCallable(
      getFirebaseFunctions(),
      'updateActivity',
    )({
      activityId: id,
      activity: stripUndefined({
        title: update.title,
        mode: update.mode,
        startsAt: update.startsAt,
        endsAt: update.endsAt,
        note: update.note,
        place:
          update.place === null ? null : update.place ? stripUndefined(update.place) : undefined,
        maxParticipants: update.maxParticipants,
        category: update.category,
        guestInvitesEnabled: update.guestInvitesEnabled,
      }),
    }).then(() => undefined);
  },

  cancelActivity(_actor, id) {
    return httpsCallable(
      getFirebaseFunctions(),
      'cancelActivity',
    )({ activityId: id }).then(() => undefined);
  },

  async joinActivity(_actor, id) {
    // Participant data is resolved from the authenticated profile in a
    // callable function. The client must never append arbitrary profile data.
    await httpsCallable(getFirebaseFunctions(), 'joinActivity')({ activityId: id });
    return true;
  },

  async leaveActivity(_actor, id) {
    await httpsCallable(getFirebaseFunctions(), 'leaveActivity')({ activityId: id });
    return true;
  },

  async inviteFriend(_actor, id, targetUid) {
    const result = await httpsCallable<
      { activityId: string; targetUid: string },
      { ok: true; state: 'invited' | 'already_invited' }
    >(
      getFirebaseFunctions(),
      'inviteFriendToActivity',
    )({ activityId: id, targetUid });
    return result.data.state;
  },
};
