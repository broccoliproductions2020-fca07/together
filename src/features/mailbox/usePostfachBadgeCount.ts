import { useMemo } from 'react';

import { useAuth } from '@/features/auth';
import { useActivityChatActivity } from '@/features/chat';
import { useFriends } from '@/features/friends';
import { useNotifications } from '@/features/notifications';
import {
  deriveCompanionSignal,
  isCompanionConfirmationActive,
  isCompanionWatchingAlert,
  signalStatus,
  useSafety,
} from '@/features/safety';

import { groupMailboxNotifications } from './mailboxModel';
import { useMailboxNow } from './useMailboxNow';

export type PostfachBadgeSeverity = 'normal' | 'attention' | 'critical';

export interface PostfachBadge {
  /**
   * The number on the map's Postfach button — everything the Postfach can show,
   * chats included, because that button is the entry to the whole surface.
   */
  count: number;
  /**
   * The number on the "Mitteilungen" row INSIDE the Postfach. Deliberately
   * excludes chats: they are already counted on their own rows one screen
   * below, and counting them twice made the same event appear as two.
   */
  mitteilungenCount: number;
  severity: PostfachBadgeSeverity;
}

export function usePostfachBadge(): PostfachBadge {
  const { user } = useAuth();
  const currentUid = user?.id ?? 'u_you';
  const { joinedIds, getUnreadCount } = useActivityChatActivity();
  const { incomingRequests } = useFriends();
  const { notifications, unreadCount, isUnread } = useNotifications();
  const { friendSessions } = useSafety();
  const now = useMailboxNow(friendSessions.length > 0);

  return useMemo(() => {
    const chatUnread = joinedIds.reduce((sum, id) => sum + getUnreadCount(id), 0);
    const activeSafetyOwners = new Set(friendSessions.map((session) => session.uid));
    let actionableSafetyCount = 0;
    let severity: PostfachBadgeSeverity = 'normal';

    friendSessions.forEach((session) => {
      const confirmation = session.companions?.[currentUid];
      const needsAttention = session.alert
        ? !isCompanionWatchingAlert(confirmation, session.alert, now)
        : !isCompanionConfirmationActive(confirmation, now);
      if (!needsAttention) return;

      actionableSafetyCount += 1;
      const safetyStatus = signalStatus(deriveCompanionSignal(session, now));
      if (safetyStatus === 'red') {
        severity = 'critical';
      } else if (severity !== 'critical') {
        severity = 'attention';
      }
    });
    const notificationGroups = groupMailboxNotifications(
      notifications,
      isUnread,
      activeSafetyOwners,
    );
    const unreadNotificationGroups = notificationGroups.filter((group) => group.unread).length;
    const loadedUnreadBeforeDeduplication = notifications.filter(isUnread).length;
    const pushOnlyHint = Math.max(0, unreadCount - loadedUnreadBeforeDeduplication);
    // One definition, used by both surfaces. The Postfach button adds chats on
    // top; the Mitteilungen row never does.
    const mitteilungenCount =
      incomingRequests.length + actionableSafetyCount + unreadNotificationGroups + pushOnlyHint;
    return {
      count: chatUnread + mitteilungenCount,
      mitteilungenCount,
      severity,
    };
  }, [
    currentUid,
    friendSessions,
    getUnreadCount,
    incomingRequests.length,
    isUnread,
    joinedIds,
    notifications,
    now,
    unreadCount,
  ]);
}

/** Compatibility helper for callers that need only the number. */
export function usePostfachBadgeCount() {
  return usePostfachBadge().count;
}
