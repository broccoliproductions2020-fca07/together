import type { MarkerAvatar } from '../types/map.types';

/** Never show more than four faces; the fourth becomes a "+N" chip when needed. */
export const MARKER_MAX_FACES = 4;

// Continuous morph anchors: 0 = compact 2×2 quad, 0.5 = neighborhood form,
// 1 = unfolded row. MapCanvas feeds this value directly from onRegionChange,
// so the shape follows the pinch instead of starting a separate timed animation.
const PROGRESS_CITY = 0.13;
const PROGRESS_MID = 0.07;
const PROGRESS_STREET = 0.038;

/** Smooth latitudeDelta → morph progress in [0, 1]. No hysteresis needed: a
 * continuous value cannot flip-flop at a boundary the way a discrete level does. */
export function zoomProgressForDelta(latitudeDelta: number): number {
  if (latitudeDelta >= PROGRESS_CITY) return 0;
  if (latitudeDelta <= PROGRESS_STREET) return 1;
  if (latitudeDelta >= PROGRESS_MID) {
    return (0.5 * (PROGRESS_CITY - latitudeDelta)) / (PROGRESS_CITY - PROGRESS_MID);
  }
  return 0.5 + (0.5 * (PROGRESS_MID - latitudeDelta)) / (PROGRESS_MID - PROGRESS_STREET);
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
export function buildMarkerFaces(avatars: MarkerAvatar[], count: number): MarkerFace[] {
  const maxFaces = MARKER_MAX_FACES;
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
  const visibleCount = Math.max(1, Math.min(faceCount, MARKER_MAX_FACES));
  // The compact stage deliberately leaves breathing room to the mode ring.
  // With 16–18 px avatar squircles, ±8.5 keeps even four faces fully inside
  // the 48 px marker throughout the entire 2×2 zoom band.
  const hx = 8.5;
  const vy = 8.5;
  switch (visibleCount) {
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
  const visibleCount = Math.max(1, Math.min(faceCount, MARKER_MAX_FACES));
  const total = faceStreet + Math.max(0, visibleCount - 1) * step;
  const first = cx - total / 2 + faceStreet / 2;
  return Array.from({ length: visibleCount }, (_, index) => ({
    x: first + index * step,
    y: cy,
  }));
}
