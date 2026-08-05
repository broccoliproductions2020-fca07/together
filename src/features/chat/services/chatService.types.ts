import type {
  ChatMessage,
  ChatRoom,
  GroupOpening,
  ProposalData,
  SpontaneousRound,
} from '../types';

/** The authenticated person performing a chat action. */
export interface ChatActor {
  uid: string;
  displayName: string;
  initials: string;
}

export interface GroupMember {
  id: string;
  displayName: string;
}

/** Safe contact data for one room member; full details only reach direct friends. */
export interface RoomMemberProfile {
  uid: string;
  displayName: string;
  initials: string;
  username?: string;
  avatarUrl?: string;
}

export type Unsubscribe = () => void;

/**
 * The chat backend seam. Its Firebase implementation uses Firestore and
 * callable Functions against either the emulator or the cloud project.
 *
 * Listener budget: room summaries are fetched on demand and listened to only
 * while their visible list is open. subscribeMessages may only be active for
 * the currently open room.
 */
export interface ChatService {
  /** One-off summary sync for app foreground / cache reconciliation. */
  getRooms(actor: ChatActor): Promise<ChatRoom[]>;
  /** All rooms the actor is a member of, newest first. */
  subscribeRooms(actor: ChatActor, cb: (rooms: ChatRoom[]) => void): Unsubscribe;
  /** One-off room reconciliation when a chat is opened from a stale cache. */
  getRoom(actor: ChatActor, roomId: string): Promise<ChatRoom | undefined>;
  /** Messages of one room, oldest→newest, capped (last ~50). */
  subscribeMessages(
    actor: ChatActor,
    roomId: string,
    cb: (messages: ChatMessage[]) => void,
  ): Unsubscribe;
  /** Join an activity room (creates it on first join). Its end, or at least its
   * start, drives the 12-hour activity-chat retention. */
  joinActivity(
    actor: ChatActor,
    activity: { id: string; title: string; startsAt?: string; endsAt?: string },
  ): Promise<void>;
  /** Removes the current user from a room; the last/host member stays. */
  leaveRoom(actor: ChatActor, roomId: string): Promise<void>;
  /** Create an open group room; returns its id. */
  createGroup(actor: ChatActor, members: GroupMember[], vibe?: string): Promise<string>;
  sendMessage(actor: ChatActor, roomId: string, text: string): Promise<void>;
  sendProposal(
    actor: ChatActor,
    roomId: string,
    data: Omit<ProposalData, 'confirmedBy' | 'planned'>,
  ): Promise<void>;
  /**
   * alreadyConfirmed is supplied by the caller (already held in the open
   * room's message list) so this never needs its own read to decide the
   * toggle direction.
   */
  toggleProposalConfirm(
    actor: ChatActor,
    roomId: string,
    messageId: string,
    alreadyConfirmed: boolean,
  ): Promise<void>;
  markProposalPlanned(actor: ChatActor, roomId: string, messageId: string): Promise<void>;
  /** seenCount = room.messageCount the caller has just displayed. */
  markRead(actor: ChatActor, roomId: string, seenCount: number): Promise<void>;
  /** Resolves display profiles for a room's members (on demand — no listener). */
  getRoomMembers(actor: ChatActor, roomId: string): Promise<RoomMemberProfile[]>;
  /** Admin-only, group rooms only: remove a non-admin member. */
  removeMember(actor: ChatActor, roomId: string, memberUid: string): Promise<void>;
  /** Admin-only, group rooms only: promote a member to admin. */
  promoteAdmin(actor: ChatActor, roomId: string, memberUid: string): Promise<void>;
  /** Admin-only, group rooms only: set a custom room name. */
  renameRoom(actor: ChatActor, roomId: string, title: string): Promise<void>;
  /** Joinable-group teasers visible to the actor. Attach ONLY while the
   * NearbySheet is open (listener budget). */
  subscribeGroupOpenings(actor: ChatActor, cb: (openings: GroupOpening[]) => void): Unsubscribe;
  /** Admin-only: opt a group in/out of "Offen für Dazustoßer". */
  setGroupOpen(actor: ChatActor, roomId: string, open: boolean): Promise<void>;
  /** Join a group via its opening (server re-checks audience + capacity). */
  joinOpenGroup(actor: ChatActor, roomId: string): Promise<void>;
  /** Starts private, pending winks. Invitees are not room members yet. */
  startSpontaneousRound(actor: ChatActor, members: GroupMember[]): Promise<string>;
  /** Accepts one private wink; the server prevents concurrent double-booking. */
  acceptSpontaneousRound(actor: ChatActor, roundId: string): Promise<void>;
  /** Leaves a forming round; the host's leave cancels it for everyone. */
  leaveSpontaneousRound(actor: ChatActor, roundId: string): Promise<void>;
  /** Exactly one active round, listened to only while the map is visible. */
  subscribeSpontaneousRound(
    actor: ChatActor,
    cb: (round: SpontaneousRound | null) => void,
  ): Unsubscribe;
}
