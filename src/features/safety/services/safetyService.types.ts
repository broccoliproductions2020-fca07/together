import type { SafetyCheckIn, SafetyLocation, SafetySession, SafetyStatus } from '../types';

export type Unsubscribe = () => void;

export interface SafetyActor {
  uid: string;
  displayName: string;
  initials: string;
}

export interface SafetySessionPatch {
  location?: SafetyLocation;
  /** null clears a pending check-in (de-escalation). */
  checkIn?: SafetyCheckIn | null;
}

/**
 * Service contract for the Heimweg safety mode. RTDB stores live sessions under
 * `heimwege/{uid}` with a fan-out index
 * `heimwegeIndex/{companionUid}/{ownerUid}` so companions never need one
 * listener per friend. Deliberately NO onDisconnect cleanup: a dying app must
 * look like a data gap, not like a safely ended session.
 */
export interface SafetyService {
  startSession(actor: SafetyActor, audienceUids: string[]): Promise<number>;
  /** Explicit owner-managed audience change. The backend returns the complete
   * authoritative audience after validating friendship, limits and session. */
  updateAudience(actor: SafetyActor, addUids: string[], removeUids: string[]): Promise<string[]>;
  /** Explicit +1 h extension before the active sharing deadline. */
  extendSession(actor: SafetyActor): Promise<number>;
  /** Server-owned so Orange/Rot atomically alert the current explicit audience. */
  setStatus(actor: SafetyActor, status: SafetyStatus): Promise<void>;
  updateSession(actor: SafetyActor, patch: SafetySessionPatch): Promise<void>;
  /** Explicit "Sicher angekommen" — deletes the session + index entries. */
  endSession(actor: SafetyActor, audienceUids: string[]): Promise<void>;
  /** Companion's voluntary "Ich bin erreichbar". */
  confirmReachable(actor: SafetyActor, ownerUid: string): Promise<void>;
  /** Withdraws only the active reachability promise, never location access. */
  withdrawReachability(actor: SafetyActor, ownerUid: string): Promise<void>;
  /** Fresh acknowledgement for one exact Orange/Red escalation. */
  confirmAlert(actor: SafetyActor, ownerUid: string, alertAt: number): Promise<void>;
  subscribeMySession(actor: SafetyActor, cb: (session: SafetySession | null) => void): Unsubscribe;
  subscribeFriendSessions(actor: SafetyActor, cb: (sessions: SafetySession[]) => void): Unsubscribe;
}
