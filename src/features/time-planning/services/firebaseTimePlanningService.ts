import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  Timestamp,
  where,
  type DocumentData,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import * as Crypto from 'expo-crypto';

import {
  discardSyncOperation,
  registerSyncOperationHandler,
  runOrEnqueueSyncOperation,
  type TimePlanCreateSyncPayload,
  type TimePlanResponseSyncPayload,
} from '@/features/sync';
import { getFirebaseDb, getFirebaseFunctions } from '@/shared/services/firebase';

import type { TimePlan, TimePlanInterval, TimePlanMember, TimePlanWindow } from '../types';
import type { TimePlanningService } from './timePlanningService.types';

const MAX_TIMER_DELAY_MS = 2_147_000_000;
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
const VALID_WINDOW_ID = /^[A-Za-z0-9_-]{1,100}$/;

async function submitTimePlanCreate(payload: TimePlanCreateSyncPayload) {
  await httpsCallable<TimePlanCreateSyncPayload, { ok: true; id: string }>(
    getFirebaseFunctions(),
    'createTimePlan',
  )(payload);
}

async function submitTimePlanResponse(payload: TimePlanResponseSyncPayload) {
  await httpsCallable(getFirebaseFunctions(), 'respondToTimePlan')(payload);
}

registerSyncOperationHandler('timePlan.create', async (operation) => {
  if (operation.kind !== 'timePlan.create') return;
  await submitTimePlanCreate(operation.payload);
});

registerSyncOperationHandler('timePlan.response', async (operation) => {
  if (operation.kind !== 'timePlan.response') return;
  await submitTimePlanResponse(operation.payload);
});

function millis(value: unknown, fallback = Date.now()): number {
  if (value instanceof Timestamp) return value.toMillis();
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 128,
          ),
        ),
      ].slice(0, 201)
    : [];
}

function isoString(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function planWindows(value: unknown): TimePlanWindow[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 50).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const window = item as Record<string, unknown>;
    const startsAt = isoString(window.startsAt);
    const endsAt = isoString(window.endsAt);
    if (
      typeof window.id !== 'string' ||
      typeof window.groupId !== 'string' ||
      !VALID_WINDOW_ID.test(window.id) ||
      !VALID_WINDOW_ID.test(window.groupId) ||
      seen.has(window.id) ||
      !startsAt ||
      !endsAt ||
      Date.parse(endsAt) <= Date.parse(startsAt)
    ) {
      return [];
    }
    seen.add(window.id);
    return [{ id: window.id, groupId: window.groupId, startsAt, endsAt }];
  });
}

function responseIntervals(value: unknown): TimePlanInterval[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const interval = item as Record<string, unknown>;
    const startsAt = isoString(interval.startsAt);
    const endsAt = isoString(interval.endsAt);
    return startsAt && endsAt && Date.parse(endsAt) > Date.parse(startsAt)
      ? [{ startsAt, endsAt }]
      : [];
  });
}

function memberResponses(value: unknown): TimePlanMember['responsesByWindow'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([windowId]) => VALID_WINDOW_ID.test(windowId))
      .slice(0, 50)
      .map(([windowId, intervals]) => [windowId, responseIntervals(intervals)]),
  );
}

function activityPlace(value: unknown): TimePlan['place'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const place = value as Record<string, unknown>;
  if (typeof place.label !== 'string' || !place.label.trim()) return undefined;
  const label = place.label.trim().slice(0, 200);
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

function planFromDoc(id: string, data: DocumentData, actorUid: string): TimePlan | null {
  const hostId = typeof data.hostId === 'string' && data.hostId ? data.hostId : undefined;
  const sourceWindows = planWindows(data.sourceWindows);
  const expireAt = millis(data.expireAt, 0);
  if (!hostId || sourceWindows.length === 0 || expireAt <= 0) return null;
  const maxParticipants =
    Number.isInteger(data.maxParticipants) && data.maxParticipants >= 2 && data.maxParticipants <= 50
      ? data.maxParticipants
      : undefined;
  const category =
    typeof data.category === 'string' && ACTIVITY_CATEGORIES.has(data.category)
      ? (data.category as TimePlan['category'])
      : undefined;
  const memberUids = stringArray(data.memberUids);
  const legacyAudienceUids = stringArray(data.audienceUids);
  const memberCount =
    Number.isInteger(data.memberCount) && data.memberCount >= 1 && data.memberCount <= 50
      ? data.memberCount
      : Math.max(1, memberUids.length);
  const audienceCount =
    Number.isInteger(data.audienceCount) && data.audienceCount >= 1 && data.audienceCount <= 50
      ? data.audienceCount
      : Math.max(memberCount, legacyAudienceUids.length);
  return {
    id,
    hostId,
    hostName:
      typeof data.hostName === 'string' && data.hostName.trim()
        ? data.hostName.trim().slice(0, 50)
        : 'Jemand',
    hostInitials: typeof data.hostInitials === 'string' ? data.hostInitials.slice(0, 8) : '',
    title:
      typeof data.title === 'string' && data.title.trim()
        ? data.title.trim().slice(0, 60)
        : 'Terminfindung',
    place: activityPlace(data.place),
    category,
    maxParticipants,
    guestInvitesEnabled: data.guestInvitesEnabled === true ? true : undefined,
    sourceWindows,
    revision: Number.isInteger(data.revision) && data.revision >= 1 ? data.revision : 1,
    status: data.status === 'locked' || data.status === 'cancelled' ? data.status : 'collecting',
    activityId: typeof data.activityId === 'string' ? data.activityId : undefined,
    lockedWindowId:
      typeof data.lockedWindowId === 'string' && VALID_WINDOW_ID.test(data.lockedWindowId)
        ? data.lockedWindowId
        : undefined,
    lockedStartsAt: isoString(data.lockedStartsAt),
    lockedEndsAt: isoString(data.lockedEndsAt),
    memberCount,
    audienceCount,
    joined: data.joined === true || memberUids.includes(actorUid),
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
    expireAt,
  };
}

function memberFromDoc(data: DocumentData): TimePlanMember | null {
  if (typeof data.uid !== 'string' || typeof data.displayName !== 'string') return null;
  const displayName = data.displayName.trim().slice(0, 50);
  if (!displayName) return null;
  return {
    uid: data.uid,
    displayName,
    initials: typeof data.initials === 'string' ? data.initials.slice(0, 8) : displayName.slice(0, 2),
    role: data.role === 'host' ? 'host' : 'member',
    responseStatus: data.responseStatus === 'responded' ? 'responded' : 'pending',
    responsesByWindow: memberResponses(data.responsesByWindow),
    updatedAt: millis(data.updatedAt),
  };
}

export const firebaseTimePlanningService: TimePlanningService = {
  createTimePlan(actor, input) {
    const planId = `timePlan_${Crypto.randomUUID()}`;
    const payload: TimePlanCreateSyncPayload = { planId, plan: input };
    return {
      id: planId,
      ready: runOrEnqueueSyncOperation(
        {
          id: `timePlan.create:${planId}`,
          accountId: actor.uid,
          kind: 'timePlan.create',
          payload,
          createdAt: Date.now(),
          attempts: 0,
          status: 'queued',
        },
        () => submitTimePlanCreate(payload),
      ),
    };
  },

  async joinTimePlan(_actor, planId, responsesByWindow) {
    await httpsCallable(getFirebaseFunctions(), 'joinTimePlan')({ planId, responsesByWindow });
  },

  async lockTimePlan(_actor, planId, windowId, slot) {
    // Client-generated id, like createActivity: it is the idempotency key, so a
    // lost response may be retried without producing a second Activity.
    const activityId = `activity_${Crypto.randomUUID()}`;
    await httpsCallable(getFirebaseFunctions(), 'lockTimePlan')({
      planId,
      windowId,
      activityId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    });
    return activityId;
  },

  async respondToTimePlan(actor, planId, revision, responsesByWindow) {
    const payload: TimePlanResponseSyncPayload = {
      planId,
      revision,
      responsesByWindow,
    };
    const result = await runOrEnqueueSyncOperation(
      {
        id: `timePlan.response:${planId}`,
        accountId: actor.uid,
        kind: 'timePlan.response',
        payload,
        createdAt: Date.now(),
        attempts: 0,
        status: 'queued',
      },
      () => submitTimePlanResponse(payload),
    );
    if (result === 'sent') {
      await discardSyncOperation(actor.uid, `timePlan.response:${planId}`);
    }
    return result;
  },

  subscribeInvitedTimePlans(actor, cb) {
    let stopped = false;
    let stopSnapshot = () => {};
    let clockTimer: ReturnType<typeof setTimeout> | undefined;
    let visiblePlans: TimePlan[] = [];

    const clearClock = () => {
      if (clockTimer) clearTimeout(clockTimer);
      clockTimer = undefined;
    };
    const start = () => {
      if (stopped) return;
      clearClock();
      stopSnapshot();
      const plans = query(
        collection(getFirebaseDb(), 'timePlanAudience'),
        where('audienceUid', '==', actor.uid),
        where('status', '==', 'collecting'),
        where('expireAt', '>', Timestamp.fromMillis(Date.now())),
        limit(20),
      );
      stopSnapshot = onSnapshot(
        plans,
        (snapshot) => {
          if (stopped) return;
          const now = Date.now();
          visiblePlans = snapshot.docs
            .flatMap((item) => {
              const data = item.data();
              const id = typeof data.planId === 'string' ? data.planId : '';
              const plan = id ? planFromDoc(id, data, actor.uid) : null;
              return plan ? [plan] : [];
            })
            .filter((plan) => plan.expireAt > now);
          cb(visiblePlans);
          const nextExpiry = Math.min(...visiblePlans.map((plan) => plan.expireAt));
          if (Number.isFinite(nextExpiry)) {
            clockTimer = setTimeout(() => {
              const tick = Date.now();
              visiblePlans = visiblePlans.filter((plan) => plan.expireAt > tick);
              cb(visiblePlans);
              start();
            }, Math.min(MAX_TIMER_DELAY_MS, Math.max(0, nextExpiry - now) + 25));
          }
        },
        () => {
          if (stopped) return;
          visiblePlans = [];
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

  subscribeTimePlan(actor, planId, cb) {
    let stopped = false;
    let listeningToMemberPlan = false;
    let stopAudience = () => {};
    let stopPlan = () => {};

    const listenToMemberPlan = () => {
      if (stopped || listeningToMemberPlan) return;
      listeningToMemberPlan = true;
      stopAudience();
      stopPlan = onSnapshot(
        doc(getFirebaseDb(), 'timePlans', planId),
        (snapshot) =>
          cb(
            snapshot.exists()
              ? planFromDoc(snapshot.id, snapshot.data(), actor.uid)
              : null,
          ),
        () => cb(null),
      );
    };

    stopAudience = onSnapshot(
      doc(getFirebaseDb(), 'timePlanAudience', `${planId}_${actor.uid}`),
      (snapshot) => {
        if (stopped || !snapshot.exists()) {
          if (!stopped) cb(null);
          return;
        }
        const projection = planFromDoc(planId, snapshot.data(), actor.uid);
        if (projection?.joined) {
          listenToMemberPlan();
          return;
        }
        cb(projection);
      },
      () => cb(null),
    );

    return () => {
      stopped = true;
      stopAudience();
      stopPlan();
    };
  },

  subscribeMembers(_actor, planId, cb) {
    const members = query(
      collection(getFirebaseDb(), 'timePlans', planId, 'timePlanMembers'),
      limit(50),
    );
    return onSnapshot(
      members,
      (snapshot) =>
        cb(
          snapshot.docs
            .flatMap((item) => {
              const member = memberFromDoc(item.data());
              return member ? [member] : [];
            })
            .sort((left, right) => {
              if (left.role !== right.role) return left.role === 'host' ? -1 : 1;
              return left.updatedAt - right.updatedAt;
            }),
        ),
      () => cb([]),
    );
  },
};
