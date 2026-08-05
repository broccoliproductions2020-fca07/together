/**
 * Shared geometry for captured activity markers. The native map anchor keeps
 * the label below the circular bubble without shifting the activity location.
 */
export const ACTIVITY_MARKER_CAPTURE_WIDTH = 160;
export const ACTIVITY_MARKER_CAPTURE_HEIGHT = 112;
export const ACTIVITY_MARKER_ANCHOR = { x: 0.5, y: 0.72 } as const;

/** Center of the visible circle relative to the map anchor. */
export const ACTIVITY_MARKER_AURA_OFFSET_Y = -40;
