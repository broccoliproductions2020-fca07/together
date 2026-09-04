import type { ActivityCategory } from '@/domain/activity';

import type { ActivityPlace } from '@/features/activities/services/activityService.types';
import type { ActivityVisibility } from '@/features/activities';

export interface TimePlanWindow {
  id: string;
  /** Windows from one host gesture share a group. They can be edited together. */
  groupId: string;
  startsAt: string;
  endsAt: string;
}

export interface TimePlanInterval {
  startsAt: string;
  endsAt: string;
}

export type TimePlanResponseStatus = 'pending' | 'responded';

export interface TimePlanMember {
  uid: string;
  displayName: string;
  initials: string;
  role: 'host' | 'member';
  responseStatus: TimePlanResponseStatus;
  /** An empty array is an explicit “Keine Zeit” for that source window. */
  responsesByWindow: Record<string, TimePlanInterval[]>;
  updatedAt: number;
}

export interface TimePlan {
  id: string;
  hostId: string;
  hostName: string;
  hostInitials: string;
  title: string;
  place?: ActivityPlace;
  category?: ActivityCategory;
  maxParticipants?: number;
  guestInvitesEnabled?: boolean;
  sourceWindows: TimePlanWindow[];
  revision: number;
  status: 'collecting' | 'locked' | 'cancelled';
  /** Set once the host locks a slot: from here on the round IS an Activity. */
  activityId?: string;
  lockedWindowId?: string;
  lockedStartsAt?: string;
  lockedEndsAt?: string;
  /** Counts are enough for progress; identities stay in member documents. */
  memberCount: number;
  audienceCount: number;
  /** Viewer-relative flag from the private audience projection. */
  joined: boolean;
  createdAt: number;
  updatedAt: number;
  expireAt: number;
}

export interface TimePlanOfferGroup {
  id: string;
  /** Local date keys (YYYY-MM-DD), deliberately independent from time zones in the UI. */
  dateKeys: string[];
  startMinutes: number;
  /** May exceed 1,440 when a window continues into the next local day. */
  endMinutes: number;
}

export interface TimePlanCreateInput {
  title: string;
  visibility: ActivityVisibility;
  place?: ActivityPlace;
  category?: ActivityCategory;
  maxParticipants?: number;
  guestInvitesEnabled?: boolean;
  sourceWindows: TimePlanWindow[];
}

export interface TimePlanActor {
  uid: string;
}
