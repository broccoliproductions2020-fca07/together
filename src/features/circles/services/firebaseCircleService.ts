import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  type DocumentData,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseDb, getFirebaseFunctions } from '@/shared/services/firebase';

import type { CircleDoc, CircleService } from './circleService.types';

function privateCirclesRef(uid: string) {
  return collection(getFirebaseDb(), 'users', uid, 'privateCircles');
}

function toMillis(value: unknown): number {
  return typeof (value as { toMillis?: unknown })?.toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : typeof value === 'number'
      ? value
      : Date.now();
}

function mapCircle(id: string, data: DocumentData): CircleDoc {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Circle',
    ...(typeof data.emoji === 'string' ? { emoji: data.emoji } : {}),
    friendUids: Array.isArray(data.friendUids)
      ? data.friendUids.filter((uid): uid is string => typeof uid === 'string')
      : [],
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

export const firebaseCircleService: CircleService = {
  async listCircles(actor) {
    const circles = query(privateCirclesRef(actor.uid), orderBy('updatedAt', 'desc'), limit(30));
    const snapshot = await getDocs(circles);
    return snapshot.docs.map((item) => mapCircle(item.id, item.data()));
  },

  async createCircle(_actor, name, emoji) {
    const result = await httpsCallable<{ name: string; emoji?: string }, { id: string }>(
      getFirebaseFunctions(),
      'createPrivateCircle',
    )({
      name: name.trim(),
      ...(emoji?.trim() ? { emoji: emoji.trim() } : {}),
    });
    return result.data.id;
  },

  async setCircleFriends(actor, circleId, friendUids) {
    await httpsCallable<{ circleId: string; friendUids: string[] }, { ok: true }>(
      getFirebaseFunctions(),
      'setPrivateCircleFriends',
    )({ circleId, friendUids: [...new Set(friendUids)].slice(0, 50) });
  },

  async deleteCircle(_actor, circleId) {
    await httpsCallable<{ circleId: string }, { ok: true }>(
      getFirebaseFunctions(),
      'deletePrivateCircle',
    )({ circleId });
  },
};
