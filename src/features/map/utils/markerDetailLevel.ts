import type { MarkerAvatar } from '../types/map.types';

/**
 * Level-of-detail for activity markers. The marker keeps a constant height and
 * only reorganises its avatars and label as the map zooms:
 *   city         → compact, up to four faces as a 2×2 quad, no title
 *   neighborhood → same quad, slightly larger, prioritised titles
 *   street       → faces unfold into a single overlapping row, full titles
 *
 * The concrete zoom band is picked in MapCanvas from `MapRegion.latitudeDelta`.
 */
export type MapMarkerDetailLevel = 'city' | 'neighborhood' | 'street';

/** 0 = fully collapsed (city), 1 = fully expanded (street). Drives every morph. */
export const DETAIL_PROGRESS: Record<MapMarkerDetailLevel, number> = {
  city: 0,
  neighborhood: 0.5,
  street: 1,
};

/** Never show more than four faces; the fourth becomes a "+N" chip when needed. */
export const MARKER_MAX_FACES = 4;

// Hysteresis: separate enter/exit thresholds on latitudeDelta so the level never
// flickers while the user rests near a boundary. Calibrate the exact numbers on
// a real device — only the SEPARATION between enter and exit matters structurally.
const CITY_ENTER = 0.11; // zooming OUT past this collapses to city
const CITY_LEAVE = 0.09; // zooming IN past this leaves city
const STREET_ENTER = 0.02; // zooming IN past this expands to street
const STREET_LEAVE = 0.028; // zooming OUT past this leaves street

/** Pure hysteresis step: given where we are and the current zoom, where to go. */
export function detailLevelForDelta(
  current: MapMarkerDetailLevel,
  latitudeDelta: number,
): MapMarkerDetailLevel {
  if (current === 'city') {
    if (latitudeDelta >= CITY_LEAVE) return 'city';
    return latitudeDelta < STREET_ENTER ? 'street' : 'neighborhood';
  }
  if (current === 'street') {
    if (latitudeDelta <= STREET_LEAVE) return 'street';
    return latitudeDelta > CITY_ENTER ? 'city' : 'neighborhood';
  }
  // neighborhood
  if (latitudeDelta > CITY_ENTER) return 'city';
  if (latitudeDelta < STREET_ENTER) return 'street';
  return 'neighborhood';
}

/** First level for a fresh map, without a previous state to apply hysteresis to. */
export function initialDetailLevel(latitudeDelta: number): MapMarkerDetailLevel {
  if (latitudeDelta > CITY_ENTER) return 'city';
  if (latitudeDelta < STREET_ENTER) return 'street';
  return 'neighborhood';
}

export interface MarkerFace {
  key: string;
  avatarUrl?: string;
  initials?: string;
  /** When set this slot is the "+N more" chip, not a person. */
  overflowLabel?: string;
}

/**
 * Turns a participant list + total count into at most {@link MARKER_MAX_FACES}
 * slots. If more people exist than fit, the last slot becomes a "+N" chip that
 * counts the people NOT shown (never the total).
 */
export function buildMarkerFaces(
  avatars: MarkerAvatar[],
  count: number,
  maxFaces = MARKER_MAX_FACES,
): MarkerFace[] {
  const total = Math.max(count, avatars.length, 1);
  if (total <= maxFaces) {
    return avatars.slice(0, total).map((avatar) => ({
      key: avatar.userId,
      avatarUrl: avatar.avatarUrl,
      initials: avatar.initials,
    }));
  }
  const shown: MarkerFace[] = avatars.slice(0, maxFaces - 1).map((avatar) => ({
    key: avatar.userId,
    avatarUrl: avatar.avatarUrl,
    initials: avatar.initials,
  }));
  shown.push({ key: '__overflow__', overflowLabel: `+${total - (maxFaces - 1)}` });
  return shown;
}

export interface FacePoint {
  x: number;
  y: number;
}

/**
 * Face CENTERS for the compact 2×2 quad (city/neighborhood) and the unfolded
 * horizontal row (street), in the marker's 112×… capture space. Same face index
 * maps grid→row, so the morph is a stable slide, never a reshuffle.
 */
export function quadCenters(faceCount: number, cx: number, cy: number): FacePoint[] {
  const hx = 10;
  const vy = 9;
  switch (faceCount) {
    case 1:
      return [{ x: cx, y: cy }];
    case 2:
      return [
        { x: cx - hx, y: cy },
        { x: cx + hx, y: cy },
      ];
    case 3:
      return [
        { x: cx - hx, y: cy - vy },
        { x: cx + hx, y: cy - vy },
        { x: cx, y: cy + vy },
      ];
    default:
      return [
        { x: cx - hx, y: cy - vy },
        { x: cx + hx, y: cy - vy },
        { x: cx - hx, y: cy + vy },
        { x: cx + hx, y: cy + vy },
      ];
  }
}

export function rowCenters(
  faceCount: number,
  cx: number,
  cy: number,
  faceStreet: number,
  step: number,
): FacePoint[] {
  const total = faceStreet + Math.max(0, faceCount - 1) * step;
  const first = cx - total / 2 + faceStreet / 2;
  return Array.from({ length: faceCount }, (_, index) => ({
    x: first + index * step,
    y: cy,
  }));
}
