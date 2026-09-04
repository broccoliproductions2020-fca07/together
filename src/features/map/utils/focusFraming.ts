/** Air between a focused map object and either overlay edge. */
export const FOCUS_FRAME_GAP = 8;

export interface FocusTargetInsets {
  /** Visible marker geometry above its geographic coordinate. */
  above: number;
  /** Visible marker geometry below its geographic coordinate. */
  below: number;
}

export interface FocusFrame {
  /** Lowest screen y occupied by persistent controls above the map. */
  topCoveredHeight?: number;
  /** Height covered from the bottom screen edge by a sheet or control deck. */
  bottomCoveredHeight?: number;
  targetInsets?: FocusTargetInsets;
}

export interface FocusCoordinate {
  latitude: number;
  longitude: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Minimum vertical strip needed to show the complete target with breathing room. */
export function minimumFocusViewportHeight(targetInsets?: FocusTargetInsets) {
  return (
    FOCUS_FRAME_GAP * 2 +
    Math.max(0, targetInsets?.above ?? 0) +
    Math.max(0, targetInsets?.below ?? 0)
  );
}

/** Largest bottom obstruction that still leaves the complete target visible. */
export function maximumFocusBottomCoveredHeight(
  topCoveredHeight: number,
  viewportHeight: number,
  targetInsets?: FocusTargetInsets,
) {
  return Math.max(
    0,
    viewportHeight - Math.max(0, topCoveredHeight) - minimumFocusViewportHeight(targetInsets),
  );
}

/**
 * Screen y for the geographic anchor of a focused object.
 *
 * This centres the object's visible bounds, not merely its coordinate. An
 * activity pin is strongly asymmetric around that coordinate: almost all of
 * its board sits above its ground point. Hosts cap the sheet with
 * `maximumFocusBottomCoveredHeight`, so both visible edges remain satisfiable.
 */
export function focusTargetY(frame: FocusFrame, viewportHeight: number) {
  if (viewportHeight <= 0) return 0;

  const top = clamp(Math.max(0, frame.topCoveredHeight ?? 0) + FOCUS_FRAME_GAP, 0, viewportHeight);
  const bottom = clamp(
    viewportHeight - Math.max(0, frame.bottomCoveredHeight ?? 0) - FOCUS_FRAME_GAP,
    top,
    viewportHeight,
  );
  const above = Math.max(0, frame.targetInsets?.above ?? 0);
  const below = Math.max(0, frame.targetInsets?.below ?? 0);
  const minimumAnchor = top + above;
  const maximumAnchor = bottom - below;

  if (minimumAnchor <= maximumAnchor) return (minimumAnchor + maximumAnchor) / 2;
  return clamp(maximumAnchor, top, bottom);
}

/** Signed screen-height fraction from the physical map centre to the target anchor. */
export function focusCameraOffset(frame: FocusFrame, viewportHeight: number) {
  if (viewportHeight <= 0) return 0;
  return (focusTargetY(frame, viewportHeight) - viewportHeight / 2) / viewportHeight;
}

/** Pixel distance between two framing answers for the same geographic target. */
export function focusPinShift(fromFrame: FocusFrame, toFrame: FocusFrame, viewportHeight: number) {
  return Math.abs(focusTargetY(toFrame, viewportHeight) - focusTargetY(fromFrame, viewportHeight));
}

const MAX_MERCATOR_LATITUDE = 85.05112878;

function mercatorNorthing(latitude: number) {
  const clampedLatitude = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE);
  const radians = (clampedLatitude * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function latitudeFromMercatorNorthing(northing: number) {
  return (Math.atan(Math.sinh(northing)) * 180) / Math.PI;
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/**
 * Camera centre that moves `target` onto a screen point sampled by the native
 * map projection. Working in Web Mercator keeps this accurate under pitch and
 * rotation, where a latitude-delta approximation visibly misses the point.
 */
export function focusCameraCenterFromProjection(
  cameraCenter: FocusCoordinate,
  target: FocusCoordinate,
  coordinateAtTargetPoint: FocusCoordinate,
): FocusCoordinate {
  const longitudeDelta = normalizeLongitude(target.longitude - coordinateAtTargetPoint.longitude);
  return {
    latitude: latitudeFromMercatorNorthing(
      mercatorNorthing(cameraCenter.latitude) +
        mercatorNorthing(target.latitude) -
        mercatorNorthing(coordinateAtTargetPoint.latitude),
    ),
    longitude: normalizeLongitude(cameraCenter.longitude + longitudeDelta),
  };
}
