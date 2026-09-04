import type {
  ActivityCategory as DomainActivityCategory,
  ActivityMode as DomainActivityMode,
} from '@/domain/activity';
import type { GeoCoordinate } from '@/domain/geo';
import type { ParticipantPreview } from '@/domain/person';

export type ActivityMode = DomainActivityMode;

/** Creator-chosen activity category (composer icon chips → marker badge).
 * Deliberately manual, NOT from Google Places: `onPoiClick` carries no `types`,
 * Place Details costs per call, and the category describes the ACTIVITY, not
 * the venue. Optional — undefined shows no badge. */
export type ActivityCategory = DomainActivityCategory;

/**
 * How an open status shares proximity inside the Offen-Fenster:
 *  - pin        → counts toward "in deiner Nähe" and allows a coarse distance
 *                 label. It NEVER creates a map marker or navigation target.
 *  - none       → does NOT count toward "nearby"; no distance is shown and the
 *                 person appears only under "Ohne Näheangabe".
 *
 * Rule: there is no hidden-location middle tier. A friend either shares a pin or
 * chooses no location at all.
 */
export type LocationVisibility = 'pin' | 'none';

export interface NearbyFriend {
  id: string;
  displayName: string;
  initials: string;
  avatarUrl?: string;
  activity: string;
  locationVisibility: LocationVisibility;
  /** Present only for pin; MUST be absent for none. */
  distanceKm?: number;
  /** Coarse coordinate used solely for local proximity calculation; never rendered on the map. */
  coordinate?: MapCoordinate;
  /** Optional expiry of the open status, used only in its status detail. */
  expiresAt?: number;
  /** The vibe this friend typed themselves, if any. Ranking treats it as a
   * signal of intent — never as a category the app may act on. */
  vibeLabel?: string;
}

export type MapCoordinate = GeoCoordinate;

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export type MarkerAvatar = ParticipantPreview;

export interface MapMarker {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  initials: string;
  mode: ActivityMode;
  label?: string;
  /** Activity name shown at the top of the detail sheet. Falls back to `label`. */
  title?: string;
  /** Human-readable time window, e.g. "Heute 18:00–21:00". */
  timeLabel?: string;
  /** Human-readable place, e.g. "Prater Garten". */
  placeLabel?: string;
  coordinate: MapCoordinate;
  /** Known activity participants, in the same order as the detail sheet. */
  avatars?: MarkerAvatar[];
  /** Current participant count. It can exceed `avatars.length` only when a
   * legacy record does not contain every participant profile yet. */
  participantCount?: number;
  /** Max participants incl. host; undefined = unbegrenzt. */
  maxParticipants?: number;
  /** Links this marker to a nearby friend when it represents that person's activity. */
  friendId?: string;
  /** Creator-chosen category → icon badge top-right on the marker. */
  category?: ActivityCategory;
  /**
   * A round still looking for a time (Terminfindung), not a fixed plan.
   *
   * Visually it remains a future (`soon`) activity. The missing concrete time
   * is communicated in its detail sheet, not through a second map colour.
   */
  planning?: boolean;
  /** ISO 8601 — drives the "soon" → "now" auto-transition, if set. */
  startsAt?: string;
  /** ISO 8601 — with startsAt, drives the depleting countdown ring on `now`. */
  endsAt?: string;
  journeyUnderwayCount?: number;
}

export interface MarkerCluster {
  id: string;
  count: number;
  avatars: MarkerAvatar[];
  mode: ActivityMode;
  label: string;
  coordinate: MapCoordinate;
  /** Max participants incl. host; set → marker/detail show "N/MAX". */
  maxParticipants?: number;
  /** Creator-chosen category → icon badge top-right on the marker. */
  category?: ActivityCategory;
  /** ISO 8601 — drives the "soon" → "now" auto-transition, if set. */
  startsAt?: string;
  /** ISO 8601 — with startsAt, drives the depleting countdown ring on `now`. */
  endsAt?: string;
  journeyUnderwayCount?: number;
}

export interface MapPlaceSelection {
  id: string;
  title: string;
  coordinate: MapCoordinate;
  placeId?: string;
  source: 'poi' | 'long-press';
}

export interface ActivitySelectionPreview {
  id: string;
  title: string;
  subtitle: string;
  mode: ActivityMode;
  /**
   * The mode the activity was CREATED with, unresolved — `mode` above is run
   * through `resolveActivityMode` and reads `now` for every started `soon`
   * activity. Only this field can tell the two apart, which is what decides
   * whether Anreise exists at all (`activitySupportsJourney`).
   */
  plannedMode?: ActivityMode;
  participantCount: number;
  participants: MarkerAvatar[];
  /** Max participants incl. host; undefined = unbegrenzt. */
  maxParticipants?: number;
  targetCoordinate?: MapCoordinate;
  /** Optional time window, e.g. "Heute 18:00–21:00". */
  timeLabel?: string;
  /** Optional place, e.g. "Prater Garten". */
  placeLabel?: string;
  startsAt?: string;
  endsAt?: string;
  /** Uid of the creator — drives the "Bearbeiten" affordance (host-only). */
  hostId?: string;
  /** Host opt-in: participants may invite their OWN confirmed friends. */
  guestInvitesEnabled?: boolean;
}

/** One selectable plan inside a map stack. A stack groups map furniture only;
 * it never turns several independent activities into one participant group. */
export interface ActivityStackItem {
  id: string;
  title: string;
  mode: ActivityMode;
  planning?: boolean;
  timeLabel?: string;
  placeLabel?: string;
  participantCount: number;
  maxParticipants?: number;
  participants: MarkerAvatar[];
}

export type MapSelection =
  /**
   * A round still looking for a time. It is a selection like any other, so it
   * lands in the SAME detail sheet as an activity — same header, same place
   * row. Only where a fixed activity shows its time, this shows the proposals.
   */
  | {
      type: 'Planning';
      planId: string;
      title: string;
      hostName: string;
      placeLabel?: string;
      coordinate?: MapCoordinate;
    }
  | {
      type: 'ActivityStack';
      id: string;
      title: string;
      coordinate: MapCoordinate;
      activities: ActivityStackItem[];
    }
  | ({ type: 'Avatar'; hostName: string } & ActivitySelectionPreview)
  | ({ type: 'Cluster' } & ActivitySelectionPreview)
  | {
      type: 'Place';
      title: string;
      /** The street address, when one is known. Optional on purpose: a place
       * whose name IS its address has nothing to add here, and an empty line
       * beats inventing something to fill it. */
      subtitle?: string;
      coordinate: MapCoordinate;
      placeId?: string;
      source: 'poi' | 'long-press';
    }
  | { type: 'Action'; title: string; subtitle: string; mode?: ActivityMode };
