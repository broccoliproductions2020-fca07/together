import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoNotifications from 'expo-notifications';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/features/auth';
import { useFriends } from '@/features/friends';

import { notificationService } from './services/notificationService';
import type { NotificationDoc, NotificationKind } from './services/notificationService.types';

interface NotificationsContextValue {
  notifications: NotificationDoc[];
  isLoading: boolean;
  listError: string | null;
  unreadCount: number;
  isUnread: (notification: NotificationDoc) => boolean;
  pushEnabled: boolean;
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<void>;
  markAllSeen: () => void;
  retryList: () => void;
  setListActive: (active: boolean) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);
const PUSH_ENABLED_PREFIX = 'together.push.enabled.v2.';
const LEGACY_PUSH_ENABLED_KEY = 'together.push.enabled.v1';
const PERSISTED_PUSH_KINDS = new Set<NotificationKind>([
  'activity_joined',
  'activity_cancelled',
  'activity_updated',
  'spontaneous_round_invite',
  'circle_invite',
  'journey_reminder',
  'safety_request',
  'safety_confirmed',
  'safety_unavailable',
  'safety_unwell',
  'safety_emergency',
  'safety_alert_seen',
  'safety_resolved',
  'safety_timed_out',
  'system',
]);

function pushPreferenceKey(uid: string) {
  return `${PUSH_ENABLED_PREFIX}${uid}`;
}

function persistedPushKind(data: unknown): NotificationKind | null {
  if (!data || typeof data !== 'object') return null;
  const kind = (data as Record<string, unknown>).kind;
  return typeof kind === 'string' && PERSISTED_PUSH_KINDS.has(kind as NotificationKind)
    ? (kind as NotificationKind)
    : null;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { notificationsSeenAt } = useFriends();
  const actor = useMemo(() => ({ uid: user?.id ?? 'u_you' }), [user?.id]);
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const notificationsRef = useRef<NotificationDoc[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listActive, setListActive] = useState(false);
  const [retrySequence, setRetrySequence] = useState(0);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushHintCount, setPushHintCount] = useState(0);
  const [localSeenAt, setLocalSeenAt] = useState(0);
  const registeredActorRef = useRef<string | null>(null);
  const receivedIdentifiersRef = useRef(new Set<string>());
  const effectiveSeenAt = Math.max(notificationsSeenAt, localSeenAt);

  useEffect(() => {
    notificationsRef.current = [];
    setNotifications([]);
    setPushHintCount(0);
    setLocalSeenAt(0);
    setIsLoading(false);
    setListError(null);
    receivedIdentifiersRef.current.clear();
  }, [actor.uid]);

  useEffect(() => {
    let cancelled = false;
    const key = pushPreferenceKey(actor.uid);
    setPushEnabled(false);
    void Promise.all([AsyncStorage.getItem(key), AsyncStorage.getItem(LEGACY_PUSH_ENABLED_KEY)])
      .then(async ([scopedPreference, legacyPreference]) => {
        const stored = scopedPreference ?? legacyPreference;
        if (scopedPreference === null && legacyPreference !== null) {
          await AsyncStorage.setItem(key, legacyPreference);
          await AsyncStorage.removeItem(LEGACY_PUSH_ENABLED_KEY);
        }
        if (stored !== 'true') return;
        const enabled = await notificationService.registerDevice(actor);
        if (cancelled) {
          if (enabled) void notificationService.unregisterDevice(actor).catch(() => {});
          return;
        }
        registeredActorRef.current = enabled ? actor.uid : null;
        setPushEnabled(enabled);
        if (!enabled) await AsyncStorage.setItem(key, 'false');
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (registeredActorRef.current === actor.uid) {
        registeredActorRef.current = null;
        void notificationService.unregisterDevice(actor).catch(() => {});
      }
    };
  }, [actor]);

  useEffect(() => {
    if (!listActive) return;
    setIsLoading(notificationsRef.current.length === 0);
    setListError(null);
    return notificationService.subscribeNotifications(
      actor,
      (next) => {
        notificationsRef.current = next;
        setNotifications(next);
        setPushHintCount(0);
        setListError(null);
        setIsLoading(false);
      },
      () => {
        setListError('Mitteilungen konnten gerade nicht abgeglichen werden.');
        setIsLoading(false);
      },
    );
  }, [actor, listActive, retrySequence]);

  const registerPushHint = useCallback((notification: ExpoNotifications.Notification) => {
    if (!persistedPushKind(notification.request.content.data)) return;
    const identifier = notification.request.identifier;
    if (receivedIdentifiersRef.current.has(identifier)) return;
    receivedIdentifiersRef.current.add(identifier);
    setPushHintCount((current) => Math.min(99, current + 1));
  }, []);

  useEffect(() => {
    const received = ExpoNotifications.addNotificationReceivedListener(registerPushHint);
    const responded = ExpoNotifications.addNotificationResponseReceivedListener((response) =>
      registerPushHint(response.notification),
    );
    return () => {
      received.remove();
      responded.remove();
    };
  }, [registerPushHint]);

  const isUnread = useCallback(
    (notification: NotificationDoc) =>
      !notification.readAt && notification.createdAt > effectiveSeenAt,
    [effectiveSeenAt],
  );
  const exactUnreadCount = useMemo(
    () => notifications.filter(isUnread).length,
    [isUnread, notifications],
  );

  const markAllSeen = useCallback(() => {
    if (exactUnreadCount === 0 && pushHintCount === 0) return;
    const newestLoadedUnreadAt = notificationsRef.current.reduce(
      (latest, notification) =>
        isUnread(notification) ? Math.max(latest, notification.createdAt) : latest,
      0,
    );
    if (newestLoadedUnreadAt > 0) {
      setLocalSeenAt((current) => Math.max(current, newestLoadedUnreadAt));
    }
    setPushHintCount(0);
    void notificationService.markSeen(actor).catch((error) => {
      console.warn('[notifications] Seen-Cursor konnte nicht gespeichert werden:', error);
    });
  }, [actor, exactUnreadCount, isUnread, pushHintCount]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      isLoading,
      listError,
      unreadCount: exactUnreadCount + pushHintCount,
      isUnread,
      pushEnabled,
      enablePush: async () => {
        const enabled = await notificationService.registerDevice(actor);
        registeredActorRef.current = enabled ? actor.uid : null;
        setPushEnabled(enabled);
        await AsyncStorage.setItem(pushPreferenceKey(actor.uid), String(enabled)).catch(() => {});
        return enabled;
      },
      disablePush: async () => {
        await notificationService.unregisterDevice(actor);
        registeredActorRef.current = null;
        setPushEnabled(false);
        await AsyncStorage.setItem(pushPreferenceKey(actor.uid), 'false').catch(() => {});
      },
      markAllSeen,
      retryList: () => setRetrySequence((current) => current + 1),
      setListActive,
    }),
    [
      actor,
      exactUnreadCount,
      isLoading,
      isUnread,
      listError,
      markAllSeen,
      notifications,
      pushEnabled,
      pushHintCount,
    ],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used within NotificationsProvider');
  return context;
}
