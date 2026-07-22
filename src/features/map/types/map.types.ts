export type ActivityMode = 'open' | 'soon' | 'now';

/** Creator-chosen activity category (composer icon chips → marker badge).
 * Deliberately manual, NOT from Google Places: `onPoiClick` carries no `types`,
 * Place Details costs per call, and the category describes the ACTIVITY, not
 * the venue. Optional — undefined shows no badge. */
export type ActivityCategory =
  | 'essen'
  | 'drinks'
  | 'kaffee'
  | 'sport'
  | 'outdoor'
  | 'feiern'
  | 'kultur'
  | 'spiele'
  | 'lernen'
  | 'chillen'
  | 'shopping'
  | 'sonstiges';

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
}

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MockMapPosition {
  /** Percentage from the left edge in MockMapCanvas. Later: longitude. */
  x: number;
  /** Percentage from the top edge in MockMapCanvas. Later: latitude. */
  y: number;
}

export interface MarkerAvatar {
  userId: string;
  displayName: string;
  initials: string;
  avatarUrl?: string;
  mode?: ActivityMode;
}

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
  position: MockMapPosition;
  /** Known activity participants, in the same order as the detail sheet. */
  avatars?: MarkerAvatar[];
  /** Current participant count. It can exceed `avatars.length` only when a
   * legacy record does not contain every participant profile yet. */
  participantCount?: number;
  /** Max participants incl. host; undefined = unbegrenzt. */
  maxParticipants?: number;
  approximate?: boolean;
  hasExactLocation?: boolean;
  /** Links this marker to a NearbyFriend (`mockNearbyFriends[].id`) for pin friends. */
  friendId?: string;
  /** Creator-chosen category → icon badge top-right on the marker. */
  category?: ActivityCategory;
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
  position: MockMapPosition;
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
  participantCount: number;
  participants: MarkerAvatar[];
  /** Max participants incl. host; undefined = unbegrenzt. */
  maxParticipants?: number;
  targetCoordinate?: MapCoordinate;
  targetPosition?: MockMapPosition;
  /** Optional time window, e.g. "Heute 18:00–21:00". */
  timeLabel?: string;
  /** Optional place, e.g. "Prater Garten". */
  placeLabel?: string;
  startsAt?: string;
  endsAt?: string;
  /** Uid of the creator — drives the "Bearbeiten" affordance (host-only). */
  hostId?: string;
}

export type MapSelection =
  | ({ type: 'Avatar'; hostName: string } & ActivitySelectionPreview)
  | ({ type: 'Cluster' } & ActivitySelectionPreview)
  | {
      type: 'Place';
      title: string;
      subtitle: string;
      coordinate: MapCoordinate;
      placeId?: string;
      source: 'poi' | 'long-press';
    }
  | { type: 'Action'; title: string; subtitle: string; mode?: ActivityMode };
