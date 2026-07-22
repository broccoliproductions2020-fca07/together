import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/features/auth';

import { notificationService } from './services/notificationService';
import type { NotificationDoc } from './services/notificationService.types';

interface NotificationsContextValue {
  notifications: NotificationDoc[];
  isLoading: boolean;
  unreadCount: number;
  pushEnabled: boolean;
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** The list listener runs ONLY while a consumer needs it (NotificationsSheet). */
  setListActive: (active: boolean) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Device push registration survives restarts — the toggle must reflect it. */
const PUSH_ENABLED_KEY = 'together.push.enabled.v1';

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const actor = useMemo(() => ({ uid: user?.id ?? 'u_you' }), [user?.id]);

  useEffect(() => {
    AsyncStorage.getItem(PUSH_ENABLED_KEY)
      .then((stored) => {
        if (stored === 'true') setPushEnabled(true);
      })
      .catch(() => {});
  }, []);

  // On-demand listener (mirrors the group-openings pattern): the notifications
  // UI currently has no entry point, so an always-on subscription would stream
  // documents nobody can see. Push controls below work without it.
  const [listActive, setListActive] = useState(false);
  useEffect(() => {
    setNotifications([]);
    setIsLoading(true);
    if (!listActive) return;
    return notificationService.subscribeNotifications(actor, (next) => {
      setNotifications(next);
      setIsLoading(false);
    });
  }, [actor, listActive]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      isLoading,
      unreadCount: notifications.filter((item) => !item.readAt).length,
      pushEnabled,
      enablePush: async () => {
        const enabled = await notificationService.registerDevice(actor);
        setPushEnabled(enabled);
        AsyncStorage.setItem(PUSH_ENABLED_KEY, String(enabled)).catch(() => {});
        return enabled;
      },
      disablePush: async () => {
        await notificationService.unregisterDevice(actor);
        setPushEnabled(false);
        AsyncStorage.setItem(PUSH_ENABLED_KEY, 'false').catch(() => {});
      },
      markRead: (id) => {
        setNotifications((current) =>
          current.map((item) => (item.id === id ? { ...item, readAt: Date.now() } : item)),
        );
        void notificationService.markRead(actor, id).catch((error) => {
          console.warn('[notifications] markRead failed', error);
        });
      },
      markAllRead: () => {
        const ids = notifications.filter((item) => !item.readAt).map((item) => item.id);
        if (!ids.length) return;
        const now = Date.now();
        setNotifications((current) =>
          current.map((item) => (ids.includes(item.id) ? { ...item, readAt: now } : item)),
        );
        void notificationService.markAllRead(actor, ids).catch((error) => {
          console.warn('[notifications] markAllRead failed', error);
        });
      },
      setListActive,
    }),
    [actor, isLoading, notifications, pushEnabled],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used within NotificationsProvider');
  return context;
}
