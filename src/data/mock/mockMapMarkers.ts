import type { MapMarker, MarkerCluster } from '@/features/map/types/map.types';

import { mockMapUsers } from './mockUsers';

/** Offset from now, used for demo activity time windows. */
/** Offset from RIGHT NOW — used for the `now` seeds' time windows so the
 * countdown ring demo works at any wall-clock time. */
function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export const mockMapMarkers: MapMarker[] = [
  // pin-visibility NearbyFriends — positions MUST stay in sync with their
  // `coordinate` field in mockNearbyFriends so navigation lands on the avatar.
  {
    id: 'marker-max-nearby',
    userId: 'u_max',
    displayName: 'Max',
    initials: 'M',
    mode: 'open',
    label: 'Biergarten oder Kaffee',
    title: 'Biergarten oder Kaffee',
    timeLabel: 'Heute 18:00–21:00',
    placeLabel: 'Prater Garten',
    position: { x: 62, y: 42 },
    hasExactLocation: true,
    friendId: 'nearby-max',
  },
  {
    id: 'marker-lisa-nearby',
    userId: 'u_lisa_bock',
    displayName: 'Lisa Bock',
    initials: 'LB',
    mode: 'open',
    label: 'Bar oder Essen',
    title: 'Bar oder Essen',
    timeLabel: 'Heute ab 19:30',
    placeLabel: 'Kreuzberg 36',
    position: { x: 35, y: 55 },
    hasExactLocation: true,
    friendId: 'nearby-lisa',
  },
  {
    id: 'marker-jonas-cafe',
    userId: 'u_jonas',
    displayName: 'Jonas',
    initials: 'J',
    mode: 'now',
    label: 'Corner Cafe',
    title: 'Kaffee im Corner Cafe',
    timeLabel: 'Jetzt · noch ~2 Std',
    placeLabel: 'Corner Cafe',
    position: { x: 67, y: 37 },
    hasExactLocation: true,
    category: 'kaffee',
    // Ring demo: 1h in, 2h left → ~2/3 remaining.
    startsAt: hoursFromNow(-1),
    endsAt: hoursFromNow(2),
  },
  {
    id: 'marker-lina-bouldering',
    userId: 'u_lina',
    displayName: 'Lina',
    initials: 'L',
    mode: 'soon',
    label: 'Bouldering at 7',
    title: 'Bouldern',
    timeLabel: 'Später',
    placeLabel: 'Boulderhalle Ostbloc',
    position: { x: 43, y: 57 },
    hasExactLocation: true,
    category: 'sport',
    // Keep at least one Soon marker visible regardless of the current wall
    // clock; the resolver will still transition it to Now after this time.
    startsAt: hoursFromNow(1.5),
  },
  {
    id: 'marker-mara-park',
    userId: 'u_mara',
    displayName: 'Mara',
    initials: 'M',
    mode: 'now',
    label: 'Walk in the park',
    title: 'Spaziergang',
    timeLabel: 'Jetzt aktiv',
    placeLabel: 'Volkspark Friedrichshain',
    position: { x: 74, y: 68 },
    hasExactLocation: true,
    category: 'outdoor',
    // Ring demo: halfway through a 1h walk → 50%.
    startsAt: hoursFromNow(-0.5),
    endsAt: hoursFromNow(0.5),
  },
  {
    id: 'marker-theo-gym',
    userId: 'u_theo',
    displayName: 'Theo',
    initials: 'T',
    mode: 'soon',
    label: 'Gym later',
    title: 'Gym-Session',
    timeLabel: 'Später',
    placeLabel: 'FitX Mitte',
    position: { x: 24, y: 46 },
    hasExactLocation: true,
    category: 'sport',
    startsAt: hoursFromNow(3.5),
  },
  {
    id: 'marker-nora-open',
    userId: 'u_nora',
    displayName: 'Nora',
    initials: 'N',
    mode: 'open',
    label: 'Open near Mitte',
    title: 'Offen für Spontanes',
    timeLabel: 'Flexibel heute',
    placeLabel: 'Mitte',
    position: { x: 56, y: 24 },
    approximate: true,
    hasExactLocation: false,
  },
  {
    id: 'marker-sam-open',
    userId: 'u_sam',
    displayName: 'Sam',
    initials: 'S',
    mode: 'open',
    label: 'Open for food',
    title: 'Offen fürs Essen',
    timeLabel: 'Flexibel',
    placeLabel: 'rund um Neukölln',
    position: { x: 19, y: 66 },
    approximate: true,
    hasExactLocation: false,
  },
  {
    id: 'marker-ali-market',
    userId: 'u_ali',
    displayName: 'Ali',
    initials: 'A',
    mode: 'now',
    label: 'Street food market',
    title: 'Street Food',
    timeLabel: 'Jetzt · bis 22:00',
    placeLabel: 'Markthalle Neun',
    position: { x: 81, y: 49 },
    hasExactLocation: true,
    category: 'essen',
    // Ring demo: 2h in, 1h left → last third.
    startsAt: hoursFromNow(-2),
    endsAt: hoursFromNow(1),
  },
];

export const mockMarkerClusters: MarkerCluster[] = [
  {
    id: 'cluster-biergarten',
    count: 7,
    // 7 participants → marker shows the first 4 as a 2×2 quad; the detail sheet
    // lists all 7 (scrollable). maxParticipants set → "7/8" badge.
    avatars: mockMapUsers.filter((user) =>
      ['u_lina', 'u_theo', 'u_kim', 'u_nora', 'u_sam', 'u_pia', 'u_mara'].includes(user.userId),
    ),
    mode: 'soon',
    label: 'Biergarten später',
    position: { x: 36, y: 31 },
    maxParticipants: 8,
    category: 'drinks',
    startsAt: hoursFromNow(2),
  },
  {
    id: 'cluster-market-now',
    count: 9,
    // Large cluster (no limit): first 4 avatars as a quad, plain "9" badge.
    avatars: mockMapUsers.filter((user) =>
      ['u_ali', 'u_jonas', 'u_emil', 'u_kim'].includes(user.userId),
    ),
    mode: 'now',
    label: 'Street Food gerade',
    position: { x: 17, y: 74 },
    category: 'essen',
    // Ring demo on a cluster: halfway through a 4h window.
    startsAt: hoursFromNow(-2),
    endsAt: hoursFromNow(2),
  },
];
