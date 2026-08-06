import type { NotificationDoc } from '@/features/notifications';

export interface NotificationGroup {
  id: string;
  primary: NotificationDoc;
  notifications: NotificationDoc[];
  count: number;
  unreadCount: number;
  createdAt: number;
  unread: boolean;
  /**
   * Every notification id in this group. The Mitteilungen view snapshots the
   * ids that were unread when it opened, so entries stay marked "neu" while
   * being read — the seen cursor only moves on the way out.
   */
  ids: string[];
}

export function isCurrentSafetyNotification(notification: NotificationDoc) {
  return (
    notification.kind === 'safety_request' ||
    notification.kind === 'safety_unwell' ||
    notification.kind === 'safety_emergency' ||
    notification.kind === 'safety_timed_out'
  );
}

export function groupMailboxNotifications(
  notifications: NotificationDoc[],
  isUnread: (notification: NotificationDoc) => boolean,
  activeSafetyOwnerUids: Set<string>,
) {
  const groups = new Map<string, NotificationDoc[]>();
  const cancelledActivityIds = new Set(
    notifications
      .filter(
        (notification) =>
          notification.kind === 'activity_cancelled' && Boolean(notification.activityId),
      )
      .map((notification) => notification.activityId!),
  );

  notifications.forEach((notification) => {
    if (notification.kind === 'chat_message') return;
    if (
      notification.activityId &&
      cancelledActivityIds.has(notification.activityId) &&
      notification.kind !== 'activity_cancelled'
    ) {
      return;
    }
    if (
      notification.safetyOwnerUid &&
      activeSafetyOwnerUids.has(notification.safetyOwnerUid) &&
      isCurrentSafetyNotification(notification)
    ) {
      return;
    }
    // Comings and goings on the same Activity collapse into one row; a host
    // handover does not — it is one event that changes who holds the controls.
    const key =
      notification.activityId &&
      (notification.kind === 'activity_joined' ||
        notification.kind === 'activity_left' ||
        notification.kind === 'activity_updated')
        ? `${notification.kind}:${notification.activityId}`
        : notification.id;
    groups.set(key, [...(groups.get(key) ?? []), notification]);
  });

  return [...groups.entries()]
    .map(([id, items]): NotificationGroup => {
      const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
      const unreadCount = sorted.filter(isUnread).length;
      return {
        id,
        primary: sorted[0],
        notifications: sorted,
        count: sorted.length,
        unreadCount,
        createdAt: sorted[0].createdAt,
        unread: unreadCount > 0,
        ids: sorted.map((notification) => notification.id),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function relativeMailboxTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${days} Tg.`;
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' }).format(timestamp);
}
