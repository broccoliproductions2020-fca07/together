import type { NearbyFriend } from '@/features/map/types/map.types';

/**
 * Mock open-friends list demonstrating the two location-visibility tiers:
 *   pin        → counts as nearby (in radius) + shown as map pin + distance shown
 *   none       → NOT counted as nearby + no pin + no distance ("Ohne Standort")
 *
 * IMPORTANT: `none` friends must NOT have a distanceKm — they have no location
 * basis at all. There is no hidden-location middle tier.
 */
export const mockNearbyFriends: NearbyFriend[] = [
  {
    id: 'nearby-max',
    displayName: 'Max',
    initials: 'M',
    activity: 'Biergarten oder Kaffee',
    locationVisibility: 'pin',
    distanceKm: 0.7,
    // coordinate derived from mockMapMarkers position {x:62, y:42}
    coordinate: { latitude: 52.5272, longitude: 13.4173 },
  },
  {
    id: 'nearby-lisa',
    displayName: 'Lisa Bock',
    initials: 'LB',
    activity: 'Bar oder Essen',
    locationVisibility: 'pin',
    distanceKm: 2.1,
    // coordinate derived from mockMapMarkers position {x:35, y:55}
    coordinate: { latitude: 52.5168, longitude: 13.3998 },
  },
  {
    id: 'nearby-jonas',
    displayName: 'Jonas',
    initials: 'J',
    activity: 'Heute Abend offen',
    locationVisibility: 'none',
  },
  {
    id: 'nearby-anna',
    displayName: 'Anna',
    initials: 'A',
    activity: 'Offen für etwas heute Abend',
    locationVisibility: 'none',
  },
  {
    id: 'nearby-tom',
    displayName: 'Tom',
    initials: 'T',
    activity: 'Kino oder Bar',
    locationVisibility: 'none',
  },
];
