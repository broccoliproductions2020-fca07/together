export type NotificationKind =
  | 'activity_joined'
  | 'activity_left'
  | 'activity_cancelled'
  | 'activity_host_changed'
  | 'activity_updated'
  | 'activity_invite'
  | 'spontaneous_round_invite'
  | 'group_chat_invite'
  | 'chat_message'
  | 'journey_reminder'
  | 'safety_request'
  | 'safety_confirmed'
  | 'safety_unavailable'
  | 'safety_unwell'
  | 'safety_emergency'
  | 'safety_alert_seen'
  | 'safety_resolved'
  | 'safety_timed_out'
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
  expireAt: number;
  /** Legacy per-item cursor; new clients use users/{uid}.notificationsSeenAt. */
  readAt?: number;
}

export type Unsubscribe = () => void;

export interface NotificationService {
  subscribeNotifications(
    actor: NotificationActor,
    cb: (notifications: NotificationDoc[]) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe;
  markSeen(actor: NotificationActor): Promise<void>;
  registerDevice(actor: NotificationActor): Promise<boolean>;
  unregisterDevice(actor: NotificationActor): Promise<void>;
  showJourneyStatus(input: {
    activityId: string;
    title: string;
    state: 'started' | 'arrived';
  }): Promise<void>;
}
