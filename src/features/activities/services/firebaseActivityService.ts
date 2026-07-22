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

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function mapDoc(id: string, data: DocumentData): ActivityDoc {
  return {
    id,
    hostId: data.hostId,
    mode: data.mode,
    title: data.title ?? 'Activity',
    note: data.note,
    audienceUids: data.audienceUids ?? [],
    participantUids:
      data.participantUids ??
      (data.participants ?? []).map((participant: { uid: string }) => participant.uid),
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    place: data.place,
    maxParticipants: typeof data.maxParticipants === 'number' ? data.maxParticipants : undefined,
    category: data.category,
    participants: data.participants ?? [],
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

  createActivity(_actor, data, preferredId) {
    const ref = preferredId ? doc(activitiesRef(), preferredId) : doc(activitiesRef());
    const create = httpsCallable(getFirebaseFunctions(), 'createActivity');
    const ready = create({
      activityId: ref.id,
      activity: stripUndefined({
        mode: data.mode,
        title: data.title,
        note: data.note,
        audienceContext: data.audienceContext,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        place: data.place ? stripUndefined(data.place) : undefined,
        maxParticipants: data.maxParticipants,
        category: data.category,
      }),
    }).then(() => undefined);
    return { id: ref.id, ready };
  },

  updateActivity(_actor, id, update: ActivityDocUpdate) {
    void httpsCallable(
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
        place: update.place ? stripUndefined(update.place) : undefined,
        maxParticipants: update.maxParticipants,
        category: update.category,
      }),
    }).catch((error) => {
      console.warn('[activity] update failed', error);
    });
  },

  cancelActivity(_actor, id) {
    void httpsCallable(
      getFirebaseFunctions(),
      'cancelActivity',
    )({ activityId: id }).catch((error) => {
      console.warn('[activity] cancel failed', error);
    });
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
};
