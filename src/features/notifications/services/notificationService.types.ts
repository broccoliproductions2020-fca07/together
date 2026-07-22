export type NotificationKind =
  | 'activity_joined'
  | 'activity_cancelled'
  | 'chat_message'
  | 'circle_invite'
  | 'journey_reminder'
  | 'safety_request'
  | 'safety_confirmed'
  | 'safety_unavailable'
  | 'safety_unwell'
  | 'safety_emergency'
  | 'safety_alert_seen'
  | 'safety_resolved'
  | 'system';

export interface NotificationActor {
  uid: string;
}

export interface NotificationDoc {
  id: string;
  recipientUid: string;
  kind: NotificationKind;
  title: string;
  body: string;
  activityId?: string;
  roomId?: string;
  safetyOwnerUid?: string;
  safetyAlertAt?: number;
  createdAt: number;
  readAt?: number;
}

export type Unsubscribe = () => void;

export interface NotificationService {
  subscribeNotifications(
    actor: NotificationActor,
    cb: (notifications: NotificationDoc[]) => void,
  ): Unsubscribe;
  markRead(actor: NotificationActor, notificationId: string): Promise<void>;
  markAllRead(actor: NotificationActor, notificationIds: string[]): Promise<void>;
  registerDevice(actor: NotificationActor): Promise<boolean>;
  unregisterDevice(actor: NotificationActor): Promise<void>;
  showJourneyStatus(input: {
    activityId: string;
    title: string;
    state: 'started' | 'arrived';
  }): Promise<void>;
}
