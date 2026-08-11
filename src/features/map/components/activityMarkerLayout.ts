/**
 * Shared geometry for captured activity markers. The native map anchor keeps
 * the label below the circular bubble without shifting the activity location.
 */
export const ACTIVITY_MARKER_CAPTURE_WIDTH = 160;
export const ACTIVITY_MARKER_CAPTURE_HEIGHT = 112;
export const ACTIVITY_MARKER_ANCHOR = { x: 0.5, y: 0.72 } as const;

/**
 * The marker shell's own geometry, shared so anything drawn AROUND the marker
 * (the live aura) is the same shape rather than a lookalike. Height is constant
 * by design — the shell only ever grows sideways as the map zooms in.
 */
export const ACTIVITY_MARKER_SHELL_TOP = 6;
export const ACTIVITY_MARKER_SHELL_HEIGHT = 48;
export const ACTIVITY_MARKER_SHELL_RADIUS = 16;

/**
 * Where the shell's centre sits relative to the point the map projects, i.e.
 * relative to the anchor. DERIVED, never a typed-in number: the aura has to
 * land on the avatar bubble, and the bubble's position follows from the canvas
 * height and the anchor.
 *
 * This was hard-coded to -40 and therefore wrong by ~10.6 px — that value is
 * the centre of the whole marker BLOCK (bubble plus the name pill below it),
 * not the centre of the bubble. It went unnoticed while the aura was a soft,
 * oversized circle; once the waves became the shell's own squircle, hugging
 * its outline, the same error was immediately visible as a pulse sitting too
 * low. Anything drawn around the bubble must use this, not a fresh constant.
 */
export const ACTIVITY_MARKER_AURA_OFFSET_Y =
  ACTIVITY_MARKER_SHELL_TOP +
  ACTIVITY_MARKER_SHELL_HEIGHT / 2 -
  ACTIVITY_MARKER_ANCHOR.y * ACTIVITY_MARKER_CAPTURE_HEIGHT;

/** Unfolded face size and its step in a group row — the width maths needs both. */
export const ACTIVITY_MARKER_GROUP_FACE_STREET = 42;
export const ACTIVITY_MARKER_ROW_STEP = 32; // restrained 10 px overlap at 42 px

/** Shell width per detail progress [city, neighborhood, street]. */
export function activityMarkerShellWidths(
  faceCount: number,
  solo: boolean,
): [number, number, number] {
  // 43 px is exactly the 48 px shell's inner diameter after the 2.5 px ring.
  if (solo) {
    return [
      ACTIVITY_MARKER_SHELL_HEIGHT,
      ACTIVITY_MARKER_SHELL_HEIGHT,
      ACTIVITY_MARKER_SHELL_HEIGHT,
    ];
  }
  const streetSpan =
    ACTIVITY_MARKER_GROUP_FACE_STREET + Math.max(0, faceCount - 1) * ACTIVITY_MARKER_ROW_STEP + 10;
  return [50, 54, streetSpan];
}

/**
 * The width the shell actually has at a settled zoom, matching the chrome's
 * `interpolate(progress, [0, 0.5, 1], widths)` on the JS side.
 */
export function activityMarkerShellWidth(faceCount: number, solo: boolean, progress: number) {
  const [city, neighborhood, street] = activityMarkerShellWidths(faceCount, solo);
  const t = Math.max(0, Math.min(1, progress));
  return t <= 0.5
    ? city + (neighborhood - city) * (t / 0.5)
    : neighborhood + (street - neighborhood) * ((t - 0.5) / 0.5);
}
