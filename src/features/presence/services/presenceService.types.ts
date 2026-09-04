export type Unsubscribe = () => void;

export interface OpenVibe {
  label: string;
  /** Preset chips carry an emoji; a free-text vibe has none. */
  emoji?: string;
}

export interface PresenceActor {
  uid: string;
  displayName: string;
  initials: string;
  avatarUrl?: string;
}

export interface CoarseLocation {
  lat: number;
  lng: number;
}

/**
 * A friend's live "I'm open" presence. Denormalized (name/initials/avatar) so a
 * friend's nearby list needs zero extra reads. Stored one-per-user at
 * `presence/{uid}`; closing/going private deletes or rewrites the doc.
 */
export interface PresenceDoc {
  uid: string;
  displayName: string;
  initials: string;
  avatarUrl?: string;
  vibe?: OpenVibe;
  /** Epoch ms. Client filters out expired; Firestore TTL deletes them server-side. */
  expiresAt: number;
  shareLocation: boolean;
  /** Present ONLY while sharing — removed from the doc when private (see firebase impl). */
  coarseLocation?: CoarseLocation;
  /** Who may see this presence (the user's friends). Max 50. */
  audienceUids: string[];
  updatedAt: number;
}

export interface PresenceInput {
  vibe?: OpenVibe | null;
  expiresAt: number;
  shareLocation: boolean;
  /** Only written when shareLocation is true; otherwise the field is dropped. */
  coarseLocation?: CoarseLocation | null;
}

export interface PresenceWriteResult {
  /** The server may cap the requested window at a confirmed Activity start. */
  expiresAt?: number;
  /** A running Activity makes Open invalid and removes the remote presence. */
  closed?: boolean;
}

/**
 * Presence backend seam. ONE always-on listener (friends who are open).
 * setPresence upserts the caller's own doc; clearPresence deletes it (so going
 * private/offline propagates to friends' listeners immediately, not on TTL).
 */
export interface PresenceService {
  subscribeOpenFriends(actor: PresenceActor, cb: (docs: PresenceDoc[]) => void): Unsubscribe;
  setPresence(actor: PresenceActor, input: PresenceInput): Promise<PresenceWriteResult>;
  clearPresence(actor: PresenceActor): Promise<void>;
}
