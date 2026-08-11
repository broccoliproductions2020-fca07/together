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
  // No per-item read flag, on purpose. `firestore.rules` denies every client
  // write to notifications (create/update/delete: if false) and no Cloud
  // Function writes one, so such a field could never be set — it only promised
  // a capability the app does not have, and `isUnread` was gating on a value
  // that is always undefined. Read state is the single monotonic
  // users/{uid}.notificationsSeenAt cursor.
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
