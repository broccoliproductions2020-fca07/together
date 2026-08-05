import type { ActivityCategory, ActivityMode } from '@/domain/activity';

export type { ActivityCategory, ActivityMode };

export type ActivityLocationChoice = 'current' | 'map' | 'open';
export type ActivityLocationPrecision = 'none' | 'rough' | 'exact';

export interface SelectedPlace {
  id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  source: 'current' | 'map';
}

/**
 * The one social context in which an activity is published. It deliberately
 * contains no person-by-person selection: Together publishes passively inside
 * a trusted context; it does not send invitations.
 */
export type ActivityVisibility =
  { kind: 'all_friends' } | { kind: 'close_friends' } | { kind: 'group'; groupId: string };

export interface ActivityDraft {
  mode: ActivityMode;
  title?: string;
  description?: string;
  visibility: ActivityVisibility;
  place?: SelectedPlace;
  locationChoice: ActivityLocationChoice;
  locationPrecision: ActivityLocationPrecision;
  /** ISO 8601 start (Soon: chosen freely; Now: fixed to creation time). */
  startsAt?: string;
  /** ISO 8601 end (chosen freely for Soon and Now). */
  endsAt?: string;
  plannedDurationMinutes?: number;
  expiresInMinutes?: number;
  /** Max participants incl. host (2–50); undefined = offen, beliebig viele. */
  maxPeople?: number;
  /** Optional creator-chosen category → icon badge on the map marker. */
  category?: ActivityCategory;
  /** Host opt-in: participants may invite their OWN confirmed friends. */
  guestInvitesEnabled?: boolean;
}
