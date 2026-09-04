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
  /** The raw Firestore error code behind `listError` (e.g. `permission-denied`,
   * `unavailable`). Rendered only under diagnostics — but it must survive the
   * callback boundary, because the German message alone makes three completely
   * different failures look identical and un-diagnosable from a device. */
  listErrorCode: string | null;
  unreadCount: number;
  isUnread: (notification: NotificationDoc) => boolean;
  pushEnabled: boolean;
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<void>;
  markSeen: (notificationIds: string[]) => void;
  retryList: () => void;
  setListActive: (active: boolean) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);
const PUSH_ENABLED_PREFIX = 'together.push.enabled.v2.';
const LEGACY_PUSH_ENABLED_KEY = 'together.push.enabled.v1';
const PERSISTED_PUSH_KINDS = new Set<NotificationKind>([
  'activity_joined',
  'activity_left',
  'activity_cancelled',
  'activity_host_changed',
  'activity_updated',
  'spontaneous_round_invite',
  'group_chat_invite',
  'time_plan_invite',
  'time_plan_locked',
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

/** Capped, backing off, and never refilled by another failure — the whole point
 * is that a permanently broken listener costs a bounded number of reads and then
 * stops, handing the decision back to the user via "Erneut versuchen". */
const MAX_AUTO_RETRIES = 3;
const AUTO_RETRY_DELAYS_MS = [2_000, 6_000, 18_000];

/** Firestore errors carry a `code` (`permission-denied`, `unavailable`,
 * `failed-precondition`, …). That code is the entire diagnosis, so keep it. */
function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code ? code : null;
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
  const [listErrorCode, setListErrorCode] = useState<string | null>(null);
  const [listActive, setListActive] = useState(false);
  const [retrySequence, setRetrySequence] = useState(0);
  // Auto-retry budget. A snapshot listener that fails transiently (offline, a
  // dropped connection) heals on a fresh subscribe, and making the user find the
  // retry button for that is poor. But an unbounded retry loop is a cost and
  // battery leak, so the budget is small, backs off, and refills only on success
  // or on a deliberate press of "Erneut versuchen".
  const autoRetriesRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushHintCount, setPushHintCount] = useState(0);
  const registeredActorRef = useRef<string | null>(null);
  const receivedIdentifiersRef = useRef(new Set<string>());

  useEffect(() => {
    notificationsRef.current = [];
    setNotifications([]);
    setPushHintCount(0);
    setIsLoading(false);
    setListError(null);
    setListErrorCode(null);
    autoRetriesRef.current = 0;
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
        /**
         * Default ON wherever the OS already allows it.
         *
         * The old test was `stored !== 'true'`, so a reinstall or a new device
         * — which wipes this preference while the iOS grant survives — left
         * someone who had explicitly said yes silently without notifications,
         * with a toggle that showed "off" for no reason they could see.
         *
         * An explicit 'false' still wins: turning it off means off. And an
         * account that was never asked is still never prompted here —
         * `registerDeviceIfPermitted` opens no dialog, so the product's rule
         * against a cold ask at launch holds.
         */
        if (stored === 'false') return;
        const enabled =
          stored === 'true'
            ? await notificationService.registerDevice(actor)
            : await notificationService.registerDeviceIfPermitted(actor);
        if (cancelled) {
          if (enabled) void notificationService.unregisterDevice(actor).catch(() => {});
          return;
        }
        registeredActorRef.current = enabled ? actor.uid : null;
        setPushEnabled(enabled);
        if (enabled) await AsyncStorage.setItem(key, 'true');
        else if (stored === 'true') await AsyncStorage.setItem(key, 'false');
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
    setListErrorCode(null);
    const unsubscribe = notificationService.subscribeNotifications(
      actor,
      (next) => {
        notificationsRef.current = next;
        setNotifications(next);
        setPushHintCount(0);
        setListError(null);
        setListErrorCode(null);
        setIsLoading(false);
        autoRetriesRef.current = 0;
      },
      (error) => {
        setListError('Mitteilungen konnten gerade nicht abgeglichen werden.');
        setListErrorCode(errorCode(error));
        setIsLoading(false);
        if (autoRetriesRef.current >= MAX_AUTO_RETRIES) return;
        const attempt = autoRetriesRef.current;
        autoRetriesRef.current = attempt + 1;
        if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current);
        autoRetryTimerRef.current = setTimeout(
          () => setRetrySequence((current) => current + 1),
          AUTO_RETRY_DELAYS_MS[attempt],
        );
      },
    );
    return () => {
      if (autoRetryTimerRef.current) {
        clearTimeout(autoRetryTimerRef.current);
        autoRetryTimerRef.current = null;
      }
      unsubscribe();
    };
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
      notification.seenAt === undefined && notification.createdAt > notificationsSeenAt,
    [notificationsSeenAt],
  );
  const exactUnreadCount = useMemo(
    () => notifications.filter(isUnread).length,
    [isUnread, notifications],
  );

  const markSeen = useCallback(
    (notificationIds: string[]) => {
      const requestedIds = new Set(notificationIds);
      const unreadIds = notificationsRef.current
        .filter((notification) => requestedIds.has(notification.id) && isUnread(notification))
        .map((notification) => notification.id);
      if (unreadIds.length === 0) return;
      const unreadIdSet = new Set(unreadIds);
      const markedAt = Date.now();
      const optimistic = notificationsRef.current.map((notification) =>
        unreadIdSet.has(notification.id) ? { ...notification, seenAt: markedAt } : notification,
      );
      notificationsRef.current = optimistic;
      setNotifications(optimistic);
      void notificationService.markSeen(actor, unreadIds).catch((error) => {
        const rolledBack = notificationsRef.current.map((notification) =>
          unreadIdSet.has(notification.id) && notification.seenAt === markedAt
            ? { ...notification, seenAt: undefined }
            : notification,
        );
        notificationsRef.current = rolledBack;
        setNotifications(rolledBack);
        console.warn(
          '[notifications] Sichtbare Mitteilungen konnten nicht gespeichert werden:',
          error,
        );
      });
    },
    [actor, isUnread],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      isLoading,
      listError,
      listErrorCode,
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
      markSeen,
      // A deliberate press refills the auto-retry budget: the user has told us
      // conditions may have changed (back on wifi, clock corrected).
      retryList: () => {
        autoRetriesRef.current = 0;
        setRetrySequence((current) => current + 1);
      },
      setListActive,
    }),
    [
      actor,
      exactUnreadCount,
      isLoading,
      isUnread,
      listError,
      listErrorCode,
      markSeen,
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
