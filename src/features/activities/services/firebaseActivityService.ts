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
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return Date.now();
}

const ACTIVITY_CATEGORIES = new Set([
  'essen',
  'drinks',
  'kaffee',
  'sport',
  'outdoor',
  'feiern',
  'kultur',
  'spiele',
  'lernen',
  'chillen',
  'shopping',
  'sonstiges',
]);
const MAX_TIMER_DELAY_MS = 2_147_000_000;

/**
 * How many already-expired entries the live query may hold before it is worth
 * re-anchoring.
 *
 * The feed is anchored with `visibleUntil > <subscription time>`. That bound is
 * part of the query, so moving it means tearing the listener down and asking
 * the server again — and a brand-new query is answered with every matching
 * document, i.e. a billed read for each one. The old code re-anchored on EVERY
 * expiry, which turned each activity running out into a full re-read of the
 * feed.
 *
 * Leaving the anchor where it is costs nothing on its own: the client-side
 * filter below is what decides visibility, and the index scan is bounded by
 * `limit`, not by how far back the bound reaches. The one real cost is that
 * expired entries sort FIRST (Firestore requires the range field to lead the
 * ordering) and so occupy slots in that `limit`. Counting them is therefore the
 * honest trigger — not a clock.
 */
const STALE_REANCHOR_THRESHOLD = 5;

function optionalIsoString(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function activityPlace(value: unknown): ActivityDoc['place'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const place = value as Record<string, unknown>;
  if (typeof place.label !== 'string') return undefined;
  const label = place.label.trim().slice(0, 200);
  if (!label) return undefined;
  if (place.visibility === 'none') return { label, visibility: 'none' };
  if (
    place.visibility !== 'pin' ||
    typeof place.latitude !== 'number' ||
    !Number.isFinite(place.latitude) ||
    place.latitude < -90 ||
    place.latitude > 90 ||
    typeof place.longitude !== 'number' ||
    !Number.isFinite(place.longitude) ||
    place.longitude < -180 ||
    place.longitude > 180
  ) {
    return undefined;
  }
  return {
    label,
    visibility: 'pin',
    latitude: place.latitude,
    longitude: place.longitude,
  };
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
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const participant = item as Record<string, unknown>;
    if (
      typeof participant.uid !== 'string' ||
      typeof participant.displayName !== 'string' ||
      seen.has(participant.uid)
    )
      return [];
    seen.add(participant.uid);
    const displayName = participant.displayName.trim().slice(0, 50) || 'Teilnehmer';
    return [
      {
        uid: participant.uid,
        displayName,
        initials:
          typeof participant.initials === 'string'
            ? participant.initials.slice(0, 8)
            : displayName.slice(0, 2).toUpperCase(),
        ...(typeof participant.avatarUrl === 'string' ? { avatarUrl: participant.avatarUrl } : {}),
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

function mapDoc(id: string, data: DocumentData): ActivityDoc | null {
  const participants = activityParticipants(data.participants);
  const hostId = typeof data.hostId === 'string' ? data.hostId : participants[0]?.uid;
  if (!hostId || (data.mode !== 'open' && data.mode !== 'soon' && data.mode !== 'now')) return null;
  const participantUids = [...new Set(stringArray(data.participantUids))];
  const startsAt = optionalIsoString(data.startsAt);
  const endsAt = optionalIsoString(data.endsAt);
  const place = activityPlace(data.place);
  const maxParticipants =
    Number.isInteger(data.maxParticipants) && data.maxParticipants >= 2 && data.maxParticipants <= 50
      ? data.maxParticipants
      : undefined;
  const category =
    typeof data.category === 'string' && ACTIVITY_CATEGORIES.has(data.category)
      ? (data.category as ActivityDoc['category'])
      : undefined;
  return {
    id,
    hostId,
    mode: data.mode,
    title:
      typeof data.title === 'string' && data.title.trim()
        ? data.title.trim().slice(0, 60)
        : 'Activity',
    note: typeof data.note === 'string' ? data.note.slice(0, 500) : undefined,
    audienceUids: stringArray(data.audienceUids),
    participantUids:
      participantUids.length > 0
        ? participantUids
        : participants.map((participant) => participant.uid),
    startsAt,
    endsAt,
    place,
    maxParticipants,
    category,
    participants,
    ...(data.guestInvitesEnabled === true ? { guestInvitesEnabled: true } : {}),
    status: data.status === 'expired' || data.status === 'cancelled' ? data.status : 'active',
    createdAt: toMillis(data.createdAt),
    visibleUntil: data.visibleUntil ? toMillis(data.visibleUntil) : undefined,
    expireAt: data.expireAt ? toMillis(data.expireAt) : undefined,
    journeyUnderwayCount:
      Number.isInteger(data.journeyUnderwayCount) &&
      data.journeyUnderwayCount > 0 &&
      data.journeyUnderwayCount <= 50
        ? data.journeyUnderwayCount
        : undefined,
  };
}

export const firebaseActivityService: ActivityService = {
  subscribeActivities(actor, cb) {
    let stopped = false;
    let stopSnapshot = () => {};
    let clockTimer: ReturnType<typeof setTimeout> | undefined;
    /** Everything the live query matched — expired entries included. */
    let knownDocs: ActivityDoc[] = [];

    function clearClock() {
      if (clockTimer) clearTimeout(clockTimer);
      clockTimer = undefined;
    }

    /**
     * Reports what is visible at `now` and arms the next expiry. Returns how
     * many of the query's entries have already run out — see
     * `STALE_REANCHOR_THRESHOLD`.
     */
    function publish(now: number): number {
      const visible = knownDocs.filter(
        (item) => item.visibleUntil == null || item.visibleUntil > now,
      );
      cb(visible);
      // Only a still-visible entry has a boundary left to wait for.
      const nextBoundary = Math.min(
        ...visible.flatMap((item) => (item.visibleUntil != null ? [item.visibleUntil] : [])),
      );
      if (Number.isFinite(nextBoundary)) {
        clockTimer = setTimeout(
          onBoundary,
          Math.min(MAX_TIMER_DELAY_MS, Math.max(0, nextBoundary - now) + 25),
        );
      }
      return knownDocs.length - visible.length;
    }

    function onBoundary() {
      if (stopped) return;
      clockTimer = undefined;
      // An expiry is a purely local fact: the document did not change, the
      // clock did. So it is answered from what is already in hand, and only a
      // window that has silted up enough to threaten the `limit` is re-read.
      if (publish(Date.now()) >= STALE_REANCHOR_THRESHOLD) start();
    }

    function start() {
      if (stopped) return;
      clearClock();
      stopSnapshot();
      const q = query(
        activitiesRef(),
        where('audienceUids', 'array-contains', actor.uid),
        where('status', '==', 'active'),
        where('visibleUntil', '>', Timestamp.fromMillis(Date.now())),
        orderBy('visibleUntil', 'asc'),
        limit(50),
      );
      stopSnapshot = onSnapshot(
        q,
        (snapshot) => {
          if (stopped) return;
          clearClock();
          knownDocs = snapshot.docs.flatMap((item) => {
            const mapped = mapDoc(item.id, item.data());
            return mapped ? [mapped] : [];
          });
          // A window whose entries have ALL run out arms no boundary, so it
          // would never reach `onBoundary` and could stay silted up — at which
          // point expired entries fill the `limit` and a newly created activity
          // sorts past the cut. Re-anchor from here instead, deferred by a tick
          // so the listener is not torn down inside its own callback.
          if (publish(Date.now()) >= STALE_REANCHOR_THRESHOLD && clockTimer === undefined) {
            clockTimer = setTimeout(start, 0);
          }
        },
        () => {
          if (stopped) return;
          clearClock();
          knownDocs = [];
          cb([]);
        },
      );
    }

    start();
    return () => {
      stopped = true;
      clearClock();
      stopSnapshot();
    };
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
        audienceContext: update.audienceContext,
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
