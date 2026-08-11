import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  doc,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from '@react-native-firebase/firestore';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseDb, getFirebaseFunctions } from '@/shared/services/firebase';

import type { NotificationDoc, NotificationService } from './notificationService.types';

const NOTIFICATION_LIMIT = 50;
/**
 * The query bound is deliberately STRICTER than the security rule.
 *
 * `firestore.rules` allows a notification read only while
 * `expireAt > request.time` — SERVER time, re-evaluated on every delivery. The
 * query can only filter on a constant this device computed once, when the
 * listener was created. Those two clocks drift apart in three ways: the phone's
 * clock can simply run behind the server's, the listener stays open while time
 * passes, and Firestore's TTL sweep is best-effort (up to 24 h late), so already
 * expired documents linger in the collection. Any document caught in that gap
 * satisfies the query but violates the rule — and one such document fails the
 * WHOLE query with permission-denied, which is what surfaces as "Abgleich nicht
 * möglich" in the Postfach.
 *
 * Asking for `expireAt > now + margin` closes the gap for anything inside the
 * margin. It costs nothing: notifications are retained for 30 days
 * (`NOTIFICATION_RETENTION_MS` in functions/index.js), so this only ever hides a
 * notification during the last ten minutes of its second month.
 */
const EXPIRY_SAFETY_MARGIN_MS = 10 * 60 * 1000;
let registeredToken: string | null = null;
let lastUnregisteredToken: string | null = null;

const JOURNEY_CHANNEL_ID = 'journey-status';
const SAFETY_CHANNEL_ID = 'safety';
const SAFETY_ALERT_CHANNEL_ID = 'safety-alerts';

function expoProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
}

async function currentExpoToken(requestPermission: boolean) {
  if (!Device.isDevice) return null;
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted' && requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== 'granted') return null;
  const projectId = expoProjectId();
  if (!projectId) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number') return value;
  return Date.now();
}

function mapNotification(id: string, data: DocumentData): NotificationDoc {
  return {
    id,
    recipientUid: data.recipientUid,
    kind: data.kind,
    title: data.title ?? 'Como',
    body: data.body ?? '',
    activityId: data.activityId,
    roomId: data.roomId,
    safetyOwnerUid: data.safetyOwnerUid,
    safetyAlertAt: typeof data.safetyAlertAt === 'number' ? data.safetyAlertAt : undefined,
    createdAt: toMillis(data.createdAt),
    expireAt: toMillis(data.expireAt),
  };
}

export const firebaseNotificationService: NotificationService = {
  subscribeNotifications(actor, cb, onError) {
    const notificationsRef = collection(getFirebaseDb(), 'notifications');
    const notificationQuery = query(
      notificationsRef,
      where('recipientUid', '==', actor.uid),
      where('expireAt', '>', Timestamp.fromMillis(Date.now() + EXPIRY_SAFETY_MARGIN_MS)),
      /**
       * DESCENDING, and this is the whole ballgame.
       *
       * Firestore requires the range field to lead the ordering, so `expireAt`
       * has to come first. But every notification is written with
       * `expireAt = createdAt + 30 days` — a constant offset — which makes
       * ordering by `expireAt` exactly ordering by `createdAt`. Ascending plus
       * `limit(50)` therefore returned the fifty OLDEST surviving notifications
       * and silently dropped every newer one: past fifty unexpired entries, a
       * new notification could never reach the client at all.
       *
       * Descending takes the fifty newest. The deployed composite index
       * (recipientUid ASC, expireAt ASC, createdAt DESC) still serves this — a
       * query may use an index prefix, and an ascending index is scanned in
       * reverse for a descending order. The `createdAt` ordering is dropped on
       * purpose: it can never break a tie that `expireAt` has not already
       * broken, and asking for a mixed direction is what would demand a new
       * index. Display order is the client sort below.
       */
      orderBy('expireAt', 'desc'),
      limit(NOTIFICATION_LIMIT),
    );
    return onSnapshot(
      notificationQuery,
      (snapshot) => {
        cb(
          snapshot.docs
            .map((item) => mapNotification(item.id, item.data()))
            .filter((item) => item.expireAt > Date.now())
            .sort((first, second) => second.createdAt - first.createdAt),
        );
      },
      (error) => onError?.(error instanceof Error ? error : new Error(String(error))),
    );
  },

  async markSeen(actor) {
    await updateDoc(doc(getFirebaseDb(), 'users', actor.uid), {
      notificationsSeenAt: serverTimestamp(),
    });
  },

  async registerDevice(_actor) {
    if (Device.osName === 'Android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Como',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      await Notifications.setNotificationChannelAsync(JOURNEY_CHANNEL_ID, {
        name: 'Anreise',
        description: 'Live-Status einer geteilten Anreise',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      await Notifications.setNotificationChannelAsync(SAFETY_CHANNEL_ID, {
        name: 'Safety',
        description: 'Heimweg-Anfragen und Bestätigungen',
        importance: Notifications.AndroidImportance.HIGH,
      });
      await Notifications.setNotificationChannelAsync(SAFETY_ALERT_CHANNEL_ID, {
        name: 'Safety-Hinweise',
        description: 'Hinweise bei Unsicherheit und Hilferufen',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 180, 300],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    const token = await currentExpoToken(true);
    if (!token) return false;
    await httpsCallable<{ token: string }, { ok: true }>(
      getFirebaseFunctions(),
      'registerPushToken',
    )({ token });
    registeredToken = token;
    lastUnregisteredToken = null;
    return true;
  },

  async unregisterDevice() {
    const token = registeredToken ?? (await currentExpoToken(false));
    if (!token || token === lastUnregisteredToken) return;
    await httpsCallable<{ token: string }, { ok: true }>(
      getFirebaseFunctions(),
      'unregisterPushToken',
    )({ token });
    registeredToken = null;
    lastUnregisteredToken = token;
  },

  async showJourneyStatus(input) {
    let permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (permission.status !== 'granted') return;

    const started = input.state === 'started';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: started ? 'Du bist unterwegs' : 'Du bist angekommen',
        body: started
          ? `Dein Standort wird jetzt mit den Teilnehmern von „${input.title}“ geteilt.`
          : 'Dein Live-Standort ist nicht mehr sichtbar.',
        data: { activityId: input.activityId, kind: 'journey_status', state: input.state },
        sound: started ? 'default' : false,
        ...(Device.osName === 'Android' ? { channelId: JOURNEY_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  },
};
