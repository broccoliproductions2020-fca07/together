import type { MapCoordinate, NearbyFriend } from '@/features/map/types/map.types';

import type { PresenceDoc } from './services/presenceService.types';

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in km. */
function haversineKm(a: MapCoordinate, b: MapCoordinate): number {
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
  myLocation: MapCoordinate | null,
): NearbyFriend[] {
  return docs.map((doc) => {
    const activity = doc.vibe
      ? `offen${doc.vibe.emoji ? ` ${doc.vibe.emoji}` : ''} ${doc.vibe.label}`
      : 'offen';

    if (doc.shareLocation && doc.coarseLocation && myLocation) {
      const coordinate: MapCoordinate = {
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
    };
  });
}
