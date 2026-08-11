/** A concrete suggestion inside a group chat: what / when / where + who's in. */
export interface ProposalData {
  what?: string;
  /** Free-text time, e.g. "Heute 20:00". */
  when?: string;
  where?: string;
  /** User ids who tapped "Bin dabei". */
  confirmedBy: string[];
  /** Set once the proposal is locked in as the group's plan. */
  planned?: boolean;
}

/**
 * A single message inside a chat room. Rooms are scoped to one activity or one
 * open group — there is no general messenger inbox.
 */
export interface ChatMessage {
  id: string;
  /** Room id: an activity/marker id OR a group id. */
  activityId: string;
  authorId: string;
  authorName: string;
  initials: string;
  text: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** True when the current signed-in user is the author. */
  isMe: boolean;
  /** Message kind. Defaults to 'text'; 'proposal' renders as a card. */
  kind?: 'text' | 'proposal';
  /** Present when `kind === 'proposal'`. */
  proposal?: ProposalData;
  /** Local optimistic echo — shown immediately, replaced by the server copy. */
  pending?: boolean;
  /** Persisted locally and waiting for the next usable internet connection. */
  queuedForSync?: boolean;
  /** Delivery failed — the bubble stays visible instead of vanishing. */
  failed?: boolean;
  /**
   * Why delivery failed, classified from the callable's error code. Only
   * `network` is worth retrying; the others explain themselves and must NOT
   * offer a retry that can only fail again.
   */
  failureReason?: SendFailureReason;
  /** A confirmed/plan write is in flight; only proposal cards use this. */
  proposalPending?: 'confirm' | 'plan';
  /** A proposal mutation was rejected and has been rolled back locally. */
  proposalError?: string;
}

/**
 * The send failures a user can actually do something about. Anything the
 * server rejects permanently (too long, expired room, not a member) is a
 * different situation from a flaky connection, and saying "tap to retry" to
 * all of them is what made a 2001-character message retry forever.
 */
export type SendFailureReason =
  'network' | 'too_long' | 'rate_limited' | 'room_expired' | 'not_member' | 'unknown';

export const SEND_FAILURE_TEXT: Record<SendFailureReason, string> = {
  network: 'Nicht gesendet · Tippen zum Wiederholen',
  too_long: 'Nachricht zu lang',
  rate_limited: 'Zu schnell gesendet — kurz warten',
  room_expired: 'Dieser Chat ist abgelaufen',
  not_member: 'Du bist kein Mitglied dieses Chats',
  unknown: 'Nicht gesendet',
};

/** Only a transient failure may offer a retry. */
export function isRetryableFailure(reason: SendFailureReason | undefined): boolean {
  return reason === 'network' || reason === undefined;
}

/** Server-enforced message length (functions/index.js → createChatMessage). */
export const MESSAGE_MAX_LENGTH = 2000;

/**
 * A temporary open group: a set of friends with a shared chat where a loose
 * "let's do something" turns into a concrete plan.
 */
export interface ChatGroup {
  id: string;
  title: string;
  memberIds: string[];
  /** Free-text vibe the group started from, e.g. "Bar oder Essen". */
  vibe?: string;
  createdAt: number;
}

/**
 * Public teaser of a planning group that opted into "Offen für Dazustoßer".
 * Deliberately message-free: title/vibe + who's roughly in — enough to decide
 * to join, nothing of the private conversation.
 */
export interface GroupOpening {
  id: string;
  title: string;
  vibe?: string;
  memberCount: number;
  memberPreview: { displayName: string; initials: string }[];
}

/** The smallest identity disclosure needed to make an opt-in round intelligible. */
export interface SpontaneousRoundMemberPreview {
  uid: string;
  displayName: string;
  initials: string;
  avatarUrl?: string;
}

/** One-off preview shown before a recipient decides whether to return a wink. */
export interface SpontaneousRoundInvitePreview {
  roundId: string;
  host: SpontaneousRoundMemberPreview;
  /** At most four people; the total stays separate to avoid unnecessary disclosure. */
  memberPreview: SpontaneousRoundMemberPreview[];
  memberCount: number;
  expiresAt: number;
}

/** A short-lived, location-free group formed only after a wink is accepted. */
export interface SpontaneousRound {
  id: string;
  hostUid: string;
  memberIds: string[];
  memberPreview: SpontaneousRoundMemberPreview[];
  expiresAt: number;
}

/**
 * Denormalized room summary — one document per room. The room list listener
 * reads ONLY these (never the message subcollection), which is the core
 * cost-control trick: previews + unread badges cost 1 read per room.
 */
export interface ChatRoom {
  id: string;
  type: 'activity' | 'group';
  /** Display title (activity name / group title). */
  title?: string;
  vibe?: string;
  memberIds: string[];
  /** Room admins (manage membership). Absent on legacy rooms → the first
   * member (creator) counts as admin. */
  adminUids?: string[];
  /** A short, invite-only round that has not yet become a real activity. */
  roundStatus?: 'forming';
  /** Group opted into "Offen für Dazustoßer" (teaser doc exists). */
  joinable?: boolean;
  lastMessage?: { text: string; authorId: string; authorName: string; at: number };
  /** Total messages ever sent — unread = messageCount - readCount[uid]. */
  messageCount: number;
  /** Per-uid messageCount at the moment of the user's last markRead. */
  readCount: Record<string, number>;
  createdAt: number;
  /** Epoch ms; Firestore TTL deletes the room after this. */
  expireAt?: number;
}
