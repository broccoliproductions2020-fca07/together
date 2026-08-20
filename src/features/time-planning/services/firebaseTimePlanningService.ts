import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  Timestamp,
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

import type { TimePlan, TimePlanMember } from '../types';
import type { TimePlanningService } from './timePlanningService.types';

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

function millis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  return typeof value === 'number' ? value : Date.now();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function planFromDoc(id: string, data: DocumentData): TimePlan {
  return {
    id,
    hostId: typeof data.hostId === 'string' ? data.hostId : '',
    hostName: typeof data.hostName === 'string' ? data.hostName : 'Jemand',
    hostInitials: typeof data.hostInitials === 'string' ? data.hostInitials : '',
    title: typeof data.title === 'string' ? data.title : 'Terminfindung',
    place: data.place,
    category: data.category,
    maxParticipants: typeof data.maxParticipants === 'number' ? data.maxParticipants : undefined,
    guestInvitesEnabled: data.guestInvitesEnabled === true ? true : undefined,
    sourceWindows: Array.isArray(data.sourceWindows) ? data.sourceWindows : [],
    revision: Number.isInteger(data.revision) ? data.revision : 1,
    status: data.status === 'locked' || data.status === 'cancelled' ? data.status : 'collecting',
    memberUids: stringArray(data.memberUids),
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
    expireAt: millis(data.expireAt),
  };
}

function memberFromDoc(data: DocumentData): TimePlanMember | null {
  if (typeof data.uid !== 'string' || typeof data.displayName !== 'string') return null;
  const responsesByWindow =
    data.responsesByWindow && typeof data.responsesByWindow === 'object'
      ? (data.responsesByWindow as TimePlanMember['responsesByWindow'])
      : {};
  return {
    uid: data.uid,
    displayName: data.displayName,
    initials: typeof data.initials === 'string' ? data.initials : data.displayName.slice(0, 2),
    role: data.role === 'host' ? 'host' : 'member',
    responseStatus: data.responseStatus === 'responded' ? 'responded' : 'pending',
    responsesByWindow,
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

  async joinTimePlan(_actor, planId) {
    await httpsCallable(getFirebaseFunctions(), 'joinTimePlan')({ planId });
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

  subscribeTimePlan(_actor, planId, cb) {
    return onSnapshot(
      doc(getFirebaseDb(), 'timePlans', planId),
      (snapshot) => cb(snapshot.exists() ? planFromDoc(snapshot.id, snapshot.data()) : null),
      () => cb(null),
    );
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
