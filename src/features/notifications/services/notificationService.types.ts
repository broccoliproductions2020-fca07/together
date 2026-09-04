export type NotificationKind =
  | 'activity_joined'
  | 'activity_left'
  | 'activity_cancelled'
  | 'activity_host_changed'
  | 'activity_updated'
  | 'activity_invite'
  | 'spontaneous_round_invite'
  | 'group_chat_invite'
  | 'time_plan_invite'
  | 'time_plan_locked'
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
  timePlanId?: string;
  safetyOwnerUid?: string;
  safetyAlertAt?: number;
  createdAt: number;
  expireAt: number;
  /** Set only after this card was actually visible in the Postfach. */
  seenAt?: number;
}

export type Unsubscribe = () => void;

export interface NotificationService {
  subscribeNotifications(
    actor: NotificationActor,
    cb: (notifications: NotificationDoc[]) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe;
  markSeen(actor: NotificationActor, notificationIds: string[]): Promise<void>;
  resolveJourneyReminder(
    actor: NotificationActor,
    input: { activityId: string; notificationId?: string },
  ): Promise<void>;
  /** Asks for permission if it is not granted yet. Only for a deliberate opt-in. */
  registerDevice(actor: NotificationActor): Promise<boolean>;
  /**
   * Registers only if the OS already allows notifications, and never prompts.
   * For boot, where a prompt would be the cold ask the product forbids.
   */
  registerDeviceIfPermitted(actor: NotificationActor): Promise<boolean>;
  unregisterDevice(actor: NotificationActor): Promise<void>;
  showJourneyStatus(input: {
    activityId: string;
    title: string;
    state: 'started' | 'arrived';
  }): Promise<void>;
}
