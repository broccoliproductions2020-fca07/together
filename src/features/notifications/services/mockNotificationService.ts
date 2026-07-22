import type {
  NotificationActor,
  NotificationDoc,
  NotificationService,
  Unsubscribe,
} from './notificationService.types';

const notifications = new Map<string, NotificationDoc>();
const subscribers = new Set<(items: NotificationDoc[]) => void>();

function emit() {
  const list = [...notifications.values()].sort((a, b) => b.createdAt - a.createdAt);
  subscribers.forEach((subscriber) => subscriber(list));
}

export const mockNotificationService: NotificationService = {
  subscribeNotifications(_actor: NotificationActor, cb): Unsubscribe {
    subscribers.add(cb);
    emit();
    return () => subscribers.delete(cb);
  },

  async markRead(_actor, notificationId) {
    const notification = notifications.get(notificationId);
    if (!notification || notification.readAt) return;
    notifications.set(notificationId, { ...notification, readAt: Date.now() });
    emit();
  },

  async markAllRead(_actor, notificationIds) {
    const now = Date.now();
    notificationIds.forEach((id) => {
      const notification = notifications.get(id);
      if (notification && !notification.readAt) {
        notifications.set(id, { ...notification, readAt: now });
      }
    });
    emit();
  },

  async registerDevice() {
    return true;
  },

  async unregisterDevice() {},

  async showJourneyStatus(input) {
    const id = `journey-${input.state}-${input.activityId}-${Date.now()}`;
    notifications.set(id, {
      id,
      recipientUid: 'local',
      kind: 'system',
      title: input.state === 'started' ? 'Du bist unterwegs' : 'Du bist angekommen',
      body:
        input.state === 'started'
          ? `Dein Standort wird jetzt mit den Teilnehmern von „${input.title}“ geteilt.`
          : `Die Anreise zu „${input.title}“ wurde beendet.`,
      activityId: input.activityId,
      createdAt: Date.now(),
    });
    emit();
  },
};
