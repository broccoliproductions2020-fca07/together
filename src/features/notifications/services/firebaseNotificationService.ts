import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  where,
  doc,
  type DocumentData,
} from '@react-native-firebase/firestore';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseDb, getFirebaseFunctions } from '@/shared/services/firebase';

import type { NotificationDoc, NotificationService } from './notificationService.types';

const NOTIFICATION_LIMIT = 50;
let registeredToken: string | null = null;
const JOURNEY_CHANNEL_ID = 'journey-status';
const SAFETY_CHANNEL_ID = 'safety';
const SAFETY_ALERT_CHANNEL_ID = 'safety-alerts';

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
    title: data.title ?? 'Together',
    body: data.body ?? '',
    activityId: data.activityId,
    roomId: data.roomId,
    safetyOwnerUid: data.safetyOwnerUid,
    safetyAlertAt: typeof data.safetyAlertAt === 'number' ? data.safetyAlertAt : undefined,
    createdAt: toMillis(data.createdAt),
    readAt: data.readAt ? toMillis(data.readAt) : undefined,
  };
}

export const firebaseNotificationService: NotificationService = {
  subscribeNotifications(actor, cb) {
    const notificationsRef = collection(getFirebaseDb(), 'notifications');
    const notificationQuery = query(
      notificationsRef,
      where('recipientUid', '==', actor.uid),
      where('expireAt', '>', Timestamp.fromMillis(Date.now())),
      // The range field must be the first Firestore ordering.
      orderBy('expireAt', 'asc'),
      orderBy('createdAt', 'desc'),
      limit(NOTIFICATION_LIMIT),
    );
    return onSnapshot(
      notificationQuery,
      (snapshot) => {
        cb(
          snapshot.docs
            .map((item) => mapNotification(item.id, item.data()))
            .sort((first, second) => second.createdAt - first.createdAt),
        );
      },
      () => cb([]),
    );
  },

  async markRead(_actor, notificationId) {
    await updateDoc(doc(getFirebaseDb(), 'notifications', notificationId), {
      readAt: serverTimestamp(),
    });
  },

  async markAllRead(_actor, notificationIds) {
    if (!notificationIds.length) return;
    const batch = writeBatch(getFirebaseDb());
    notificationIds.forEach((id) => {
      batch.update(doc(getFirebaseDb(), 'notifications', id), { readAt: serverTimestamp() });
    });
    await batch.commit();
  },

  async registerDevice(_actor) {
    if (!Device.isDevice) return false;
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return false;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    if (!projectId) return false;
    if (Device.osName === 'Android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Together',
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
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await httpsCallable<{ token: string }, { ok: true }>(
      getFirebaseFunctions(),
      'registerPushToken',
    )({ token });
    registeredToken = token;
    return true;
  },

  async unregisterDevice() {
    if (!registeredToken) return;
    await httpsCallable<{ token: string }, { ok: true }>(
      getFirebaseFunctions(),
      'unregisterPushToken',
    )({ token: registeredToken });
    registeredToken = null;
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
          : `Die Anreise zu „${input.title}“ wurde beendet.`,
        data: { activityId: input.activityId, kind: 'journey_status', state: input.state },
        sound: started ? 'default' : false,
        ...(Device.osName === 'Android' ? { channelId: JOURNEY_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  },
};
