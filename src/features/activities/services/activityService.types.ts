import type { ActivityCategory, ActivityMode } from '@/domain/activity';

import type { ActivityVisibility } from '../types';

export interface ActivityActor {
  uid: string;
  displayName: string;
  initials: string;
}

export interface ActivityParticipant {
  uid: string;
  displayName: string;
  initials: string;
}

export type ActivityPlace =
  | {
      label: string;
      latitude: number;
      longitude: number;
      visibility: 'pin';
    }
  | {
      label: string;
      visibility: 'none';
    };

/** Persisted activity document (mirrors firestore.rules `validActivity`). */
export interface ActivityDoc {
  id: string;
  hostId: string;
  mode: ActivityMode;
  title: string;
  note?: string;
  /** Who may see it (server-resolved snapshot of one visibility context, max 201 incl. host). */
  audienceUids: string[];
  /** Authoritative participant membership used by Firestore Rules. */
  participantUids: string[];
  /** ISO 8601. */
  startsAt?: string;
  endsAt?: string;
  place?: ActivityPlace;
  /** Max participants incl. host (2–50); absent = unbegrenzt. */
  maxParticipants?: number;
  /** Creator-chosen category (validated enum in firestore.rules); absent = keine. */
  category?: ActivityCategory;
  participants: ActivityParticipant[];
  /** Host opt-in: participants may invite their OWN confirmed friends (guest
   * invites widen the read audience; joining still runs all join checks). */
  guestInvitesEnabled?: boolean;
  status: 'active' | 'expired' | 'cancelled';
  createdAt: number;
  /** Controls map/calendar visibility; `expireAt` retains the Activity chat. */
  visibleUntil?: number;
  /** Epoch ms — Firestore TTL removes the doc after this. */
  expireAt?: number;
  journeyUnderwayCount?: number;
}

export interface ActivityDocUpdate {
  title?: string;
  mode?: ActivityMode;
  startsAt?: string;
  endsAt?: string;
  /** null removes an existing description; undefined leaves it unchanged. */
  note?: string | null;
  /** null removes an existing place and its coordinates. */
  place?: ActivityPlace | null;
  /** null removes the limit (back to unbegrenzt); undefined leaves it unchanged. */
  maxParticipants?: number | null;
  /** null removes the category; undefined leaves it unchanged. */
  category?: ActivityCategory | null;
  /** Host toggle for participant guest invites; undefined leaves it unchanged. */
  guestInvitesEnabled?: boolean;
}

/**
 * Creation carries the chosen visibility context separately from the resolved
 * uid snapshot. Firebase resolves it again on the server so a client can never
 * smuggle in a person-by-person audience.
 */
export type ActivityCreateInput = Omit<ActivityDoc, 'id' | 'createdAt' | 'hostId' | 'status'> & {
  audienceContext: ActivityVisibility;
};

export type Unsubscribe = () => void;

/** A pre-generated id plus the write that makes it visible to the app. */
export interface ActivityCreation {
  id: string;
  ready: Promise<void>;
}

/**
 * Activity backend seam. ONE always-on listener (the activity feed).
 * createActivity pre-generates an id and exposes the server write through
 * `ready`. Callers can render immediately but must await `ready` before they
 * perform dependent work such as opening the activity chat.
 */
export interface ActivityService {
  subscribeActivities(actor: ActivityActor, cb: (docs: ActivityDoc[]) => void): Unsubscribe;
  createActivity(
    actor: ActivityActor,
    doc: ActivityCreateInput,
    preferredId?: string,
  ): ActivityCreation;
  updateActivity(actor: ActivityActor, id: string, update: ActivityDocUpdate): Promise<void>;
  /** Host-only cancellation. The document remains for retention/audit and is
   * excluded from the active feed. */
  cancelActivity(actor: ActivityActor, id: string): Promise<void>;
  /** Adds the actor to the activity's participants. Participant limits are
   * enforced atomically by the server callable. */
  joinActivity(actor: ActivityActor, id: string): Promise<boolean>;
  /** Removes only the current user. A leaving HOST hands the Activity to the
   * longest-standing remaining participant (server-side succession); a host who
   * is alone in it cannot leave and has to cancel. */
  leaveActivity(actor: ActivityActor, id: string): Promise<boolean>;
  /** Participant-vouched guest invite: adds one of the CALLER's confirmed
   * friends to the activity's read audience (host opt-in, server-checked). */
  inviteFriend(
    actor: ActivityActor,
    id: string,
    targetUid: string,
  ): Promise<'invited' | 'already_invited'>;
}
