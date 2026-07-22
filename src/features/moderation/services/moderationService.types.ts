export type ReportReason = 'harassment' | 'spam' | 'unsafe' | 'inappropriate' | 'other';

export interface ModerationActor {
  uid: string;
}

/** Display data for a blocked user (from publicProfiles in firebase mode). */
export interface BlockedProfile {
  uid: string;
  displayName: string;
  initials: string;
  username?: string;
  avatarUrl?: string;
}

export interface ModerationService {
  subscribeBlockedUsers(actor: ModerationActor, cb: (uids: string[]) => void): () => void;
  blockUser(actor: ModerationActor, targetUid: string): Promise<void>;
  unblockUser(actor: ModerationActor, targetUid: string): Promise<void>;
  reportUser(actor: ModerationActor, targetUid: string, reason: ReportReason): Promise<void>;
  /** Resolves display profiles for blocked uids — one-off reads, no listener. */
  resolveProfiles(actor: ModerationActor, uids: string[]): Promise<BlockedProfile[]>;
}
