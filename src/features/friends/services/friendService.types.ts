export interface FriendActor {
  uid: string;
  displayName: string;
  initials: string;
  username?: string;
}

/** A small, denormalised profile snapshot stored on the friendship document.
 * It renders the network without a read per friend. */
export interface FriendProfile {
  uid: string;
  displayName: string;
  initials: string;
  username?: string;
  avatarUrl?: string;
}

export type FriendshipStatus = 'pending' | 'accepted';

/** Who may send a friend request. Profile details themselves stay friends-only. */
export type FriendRequestPolicy = 'anyone' | 'shared_activity' | 'nobody';

/**
 * The shared `users/{uid}` settings snapshot. It is read through the single
 * user-doc listener (`subscribeSettings`) that this seam already owns, so
 * app-wide preferences ride along here rather than opening a second listener.
 */
export interface FriendSettings {
  closeFriendUids: string[];
  /**
   * Preselected audience for Heimweg — deliberately separate from close
   * friends. Who you trust with a live location at 2 a.m. is a different,
   * usually smaller set than who you are closest to: it is the people who are
   * reliable and likely to actually react. Empty until the first Heimweg.
   */
  heimwegGroupUids: string[];
  friendRequestPolicy: FriendRequestPolicy;
  /** Server-owned revision of the friendship graph. It travels on the
   * existing settings listener, so cached relationships refresh only after a
   * real server-side change. */
  friendshipsVersion: number;
  /** Whether Together may send the 1 h-before "Anreise teilen?" reminder.
   * The reminder only ever OFFERS; each activity's sharing is still confirmed
   * individually (docs/safety-mode.md → Anreise). Absent = on. */
  journeyRemindersEnabled: boolean;
  /** Monotonic inbox cursor. It rides on the existing user-document listener,
   * so notification badges need no second always-on subscription. */
  notificationsSeenAt: number;
}

export type FriendRequestTarget =
  | { kind: 'username'; username: string }
  | { kind: 'shared_activity'; targetUid: string; activityId: string };

export interface FriendshipDoc {
  id: string;
  participantUids: string[];
  requesterUid: string;
  status: FriendshipStatus;
  profiles: FriendProfile[];
  createdAt: number;
  updatedAt: number;
}

export interface FriendRequest {
  id: string;
  friend: FriendProfile;
  direction: 'incoming' | 'outgoing';
  createdAt: number;
}

export type SendFriendRequestResult =
  | { state: 'sent'; friend: FriendProfile }
  | { state: 'already_friends'; friend: FriendProfile }
  | { state: 'incoming_request'; friend: FriendProfile };

export type Unsubscribe = () => void;

/**
 * Friendship backend seam. A friendship is a mutual, explicitly accepted
 * relation. Private Circles are deliberately not part of this contract.
 */
export interface FriendService {
  /** One-off refresh. The provider keeps a per-account local snapshot and
   * refreshes it when the existing user-settings document changes revision. */
  listFriendships(actor: FriendActor): Promise<FriendshipDoc[]>;
  /** Reuses the existing single `users/{uid}` listener — no extra listener cost. */
  subscribeSettings(actor: FriendActor, cb: (settings: FriendSettings) => void): Unsubscribe;
  sendFriendRequest(
    actor: FriendActor,
    target: FriendRequestTarget,
  ): Promise<SendFriendRequestResult>;
  respondToFriendRequest(actor: FriendActor, friendshipId: string, accept: boolean): Promise<void>;
  removeFriend(actor: FriendActor, uid: string): Promise<void>;
  setCloseFriend(actor: FriendActor, uid: string, isClose: boolean): Promise<void>;
  /**
   * Replaces the whole Heimweg group. Unlike `setCloseFriend` this is a direct
   * client write rather than a callable: the group is only a *preselection*,
   * every start still passes the real audience through `startHeimweg`, and
   * readers filter it against the confirmed friend list — so a stale or forged
   * uid can never widen an actual share. That saves a function invocation on
   * every edit for no loss of safety.
   */
  setHeimwegGroup(actor: FriendActor, uids: string[]): Promise<void>;
  setFriendRequestPolicy(actor: FriendActor, policy: FriendRequestPolicy): Promise<void>;
  /** Toggles the 1 h-before Anreise reminder. Stored on `users/{uid}` so the
   * server-side `sendJourneyReminders` can honour it when picking recipients. */
  setJourneyRemindersEnabled(actor: FriendActor, enabled: boolean): Promise<void>;
}
