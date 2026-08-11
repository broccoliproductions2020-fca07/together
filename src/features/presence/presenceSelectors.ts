import type { GeoCoordinate } from '@/domain/geo';
import type { MapMarker, NearbyFriend } from '@/features/map/types/map.types';

import type { PresenceDoc } from './services/presenceService.types';

/** Prefix that keeps an open-presence marker id from ever colliding with an
 * activity id, and makes the marker's kind obvious in a log line. */
const OPEN_PRESENCE_MARKER_PREFIX = 'open-presence:';

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in km. */
function haversineKm(a: GeoCoordinate, b: GeoCoordinate): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Maps live presence docs to the NearbyFriend shape used only in the Offen-Fenster.
 * A shared coarse location enables local distance filtering and a coarse label;
 * it never creates an open-person marker or a navigation target.
 */
export function presenceToNearby(
  docs: PresenceDoc[],
  myLocation: GeoCoordinate | null,
): NearbyFriend[] {
  return docs.map((doc) => {
    const activity = doc.vibe
      ? `offen${doc.vibe.emoji ? ` ${doc.vibe.emoji}` : ''} ${doc.vibe.label}`
      : 'offen';

    if (doc.shareLocation && doc.coarseLocation && myLocation) {
      const coordinate: GeoCoordinate = {
        latitude: doc.coarseLocation.lat,
        longitude: doc.coarseLocation.lng,
      };
      return {
        id: doc.uid,
        displayName: doc.displayName,
        initials: doc.initials,
        avatarUrl: doc.avatarUrl,
        activity,
        locationVisibility: 'pin',
        distanceKm: Number(haversineKm(myLocation, coordinate).toFixed(1)),
        coordinate,
        expiresAt: doc.expiresAt,
        vibeLabel: doc.vibe?.label,
      };
    }

    return {
      id: doc.uid,
      displayName: doc.displayName,
      initials: doc.initials,
      avatarUrl: doc.avatarUrl,
      activity,
      locationVisibility: 'none',
      expiresAt: doc.expiresAt,
      vibeLabel: doc.vibe?.label,
    };
  });
}

export function isOpenPresenceMarkerId(id: string): boolean {
  return id.startsWith(OPEN_PRESENCE_MARKER_PREFIX);
}

export function openPresenceMarkerId(uid: string): string {
  return `${OPEN_PRESENCE_MARKER_PREFIX}${uid}`;
}

/**
 * Open friends who may appear ON the map, as plain marker records.
 *
 * The privacy rule is this filter and nothing else: a presence doc only carries
 * `coarseLocation` while the person has deliberately switched sharing on, and
 * the backend removes the field the moment they switch it off. So "no marker
 * without consent" is structural — when sharing ends, or the window expires,
 * the doc stops qualifying here and the marker is gone on the next snapshot.
 * There is no separate visibility flag to keep in sync, and none should be added.
 *
 * `mode: 'open'` + `friendId` is what marks these as presence rather than a
 * plan; MapCanvas keys its round-avatar rendering off exactly that pair.
 */
export function presenceToMapMarkers(docs: PresenceDoc[], now = Date.now()): MapMarker[] {
  return docs
    .filter((doc) => doc.shareLocation && doc.coarseLocation && doc.expiresAt > now)
    .map((doc) => ({
      id: openPresenceMarkerId(doc.uid),
      userId: doc.uid,
      displayName: doc.displayName,
      initials: doc.initials,
      avatarUrl: doc.avatarUrl,
      mode: 'open' as const,
      friendId: doc.uid,
      coordinate: {
        latitude: doc.coarseLocation!.lat,
        longitude: doc.coarseLocation!.lng,
      },
    }));
}
