import { MAP_GROUND_VERTICAL_SCALE } from '../utils/mapPerspective';

/** Shared geometry for captured activity markers and their live ground signal. */
export const ACTIVITY_MARKER_CAPTURE_WIDTH = 160;
export const ACTIVITY_MARKER_CAPTURE_HEIGHT = 112;

/** The face row keeps a constant height and only grows sideways with map detail. */
export const ACTIVITY_MARKER_SHELL_TOP = 6;
export const ACTIVITY_MARKER_SHELL_HEIGHT = 38;
/** Squircle radius keeps the avatar shell card-like instead of pill-shaped. */
export const ACTIVITY_MARKER_SHELL_RADIUS = 14;

export const ACTIVITY_MARKER_TITLE_FONT_SIZE = 10.5;
export const ACTIVITY_MARKER_TITLE_LINE_HEIGHT = 12.5;
/** The band hugs the text: one line is the line box plus 1.25 px of air top
 * and bottom, two lines the same. Anything more and the name floats in a
 * plate instead of being carried by one. */
export const ACTIVITY_MARKER_TITLE_ONE_LINE_HEIGHT = 15;
export const ACTIVITY_MARKER_TITLE_TWO_LINE_HEIGHT = 26;
export const ACTIVITY_MARKER_TITLE_HEIGHT = ACTIVITY_MARKER_TITLE_TWO_LINE_HEIGHT;
export const ACTIVITY_MARKER_TITLE_TOP = ACTIVITY_MARKER_SHELL_TOP + ACTIVITY_MARKER_SHELL_HEIGHT;
export const ACTIVITY_MARKER_TITLE_MIN_WIDTH = 40;
export const ACTIVITY_MARKER_TITLE_MAX_WIDTH = 138;
/** Total side air around the name — 4.5 px per side. */
export const ACTIVITY_MARKER_TITLE_HORIZONTAL_PADDING = 9;
export const ACTIVITY_MARKER_COLLAPSED_BODY_OFFSET = ACTIVITY_MARKER_TITLE_HEIGHT;

/** The map coordinate is the shadow centre; the fin stops above it. */
export function activityMarkerFinTopY(titleHeight: number) {
  'worklet';
  return ACTIVITY_MARKER_TITLE_TOP + titleHeight - 2;
}
export const ACTIVITY_MARKER_FIN_TOP_Y = activityMarkerFinTopY(ACTIVITY_MARKER_TITLE_HEIGHT);
export const ACTIVITY_MARKER_FIN_END_Y = 70;
export const ACTIVITY_MARKER_GROUND_Y = 78;
export const ACTIVITY_MARKER_GROUND_DEPTH = 14;
export const ACTIVITY_MARKER_GROUND_HEIGHT =
  ACTIVITY_MARKER_GROUND_DEPTH * MAP_GROUND_VERTICAL_SCALE;
export const ACTIVITY_MARKER_VISIBLE_ABOVE_ANCHOR =
  ACTIVITY_MARKER_GROUND_Y - ACTIVITY_MARKER_SHELL_TOP;
export const ACTIVITY_MARKER_VISIBLE_BELOW_ANCHOR = ACTIVITY_MARKER_GROUND_HEIGHT;
export const ACTIVITY_MARKER_ANCHOR = {
  x: 0.5,
  y: ACTIVITY_MARKER_GROUND_Y / ACTIVITY_MARKER_CAPTURE_HEIGHT,
} as const;

export const ACTIVITY_MARKER_GROUND_MIN_WIDTH = 30;
export const ACTIVITY_MARKER_GROUND_WIDTH_RATIO = 0.62;

export const ACTIVITY_MARKER_GROUP_FACE_STREET = 34;
export const ACTIVITY_MARKER_ROW_STEP = 25;
export const ACTIVITY_MARKER_SOLO_FACE = 34;
export const ACTIVITY_MARKER_CITY_FACE = 14;
export const ACTIVITY_MARKER_QUAD_SPREAD = 7.5;
/**
 * The 2×2 stage gets its width stated outright instead of derived from face +
 * spread + padding. The quad needs room on BOTH axes, but the shell height is
 * fixed — so the corner clearance has to be bought with width. Derivation gave
 * 36, which left the plate corners 0.16 px inside the rounded corner.
 */
export const ACTIVITY_MARKER_QUAD_SHELL = 40;
/** Air between the face row and the shell edge, left and right. */
export const ACTIVITY_MARKER_SHELL_PAD = 7;
/**
 * Avatar plates are SQUIRCLES, like the shell. 0.46 is a circle in all but
 * name and lost the family resemblance to everything else in the app; 0.36
 * keeps the soft-square read while staying rounder than the old 0.30.
 */
export const ACTIVITY_MARKER_FACE_RADIUS_RATIO = 0.36;

/** Shell width per detail progress [city, neighborhood, street]. */
export function activityMarkerShellWidths(
  faceCount: number,
  solo: boolean,
): [number, number, number] {
  const pad = ACTIVITY_MARKER_SHELL_PAD;
  if (solo) {
    const width = ACTIVITY_MARKER_SOLO_FACE + pad;
    return [width, width, width];
  }
  const quad = ACTIVITY_MARKER_QUAD_SHELL;
  const streetSpan =
    ACTIVITY_MARKER_GROUP_FACE_STREET + Math.max(0, faceCount - 1) * ACTIVITY_MARKER_ROW_STEP + pad;
  return [quad, quad + 4, streetSpan];
}

export function activityMarkerShellWidth(faceCount: number, solo: boolean, progress: number) {
  const [city, neighborhood, street] = activityMarkerShellWidths(faceCount, solo);
  const t = Math.max(0, Math.min(1, progress));
  return t <= 0.5
    ? city + (neighborhood - city) * (t / 0.5)
    : neighborhood + (street - neighborhood) * ((t - 0.5) / 0.5);
}

export function activityMarkerTitleReveal(
  progress: number,
  titlePriority: boolean,
  hasTitle: boolean,
) {
  'worklet';
  if (!hasTitle) return 0;
  if (titlePriority) return 1;
  return Math.max(0, Math.min(1, (progress - 0.28) / (0.55 - 0.28)));
}

function glyphWidthEm(character: string) {
  if ((character.codePointAt(0) ?? 0) > 0x2e80) return 1;
  if (/\s/u.test(character)) return 0.33;
  if (/[ilIjtfr.,:;!'|]/u.test(character)) return 0.31;
  if (/[MW@#%&ÄÖÜQG]/u.test(character)) return 0.88;
  if (/[A-Z0-9]/u.test(character)) return 0.64;
  return 0.54;
}

function activityMarkerRawTitleWidth(title?: string, journeyUnderwayCount = 0) {
  const normalized = title?.trim() ?? '';
  if (!normalized) return 0;
  const textWidth = Array.from(normalized).reduce(
    (width, character) => width + glyphWidthEm(character) * ACTIVITY_MARKER_TITLE_FONT_SIZE,
    0,
  );
  const journeyWidth =
    journeyUnderwayCount > 0
      ? Math.ceil(
          27 +
            Array.from(String(journeyUnderwayCount)).reduce(
              (width, character) => width + glyphWidthEm(character) * 10,
              0,
            ),
        )
      : 0;
  return Math.ceil(textWidth + ACTIVITY_MARKER_TITLE_HORIZONTAL_PADDING + journeyWidth);
}

/** Deterministic width for fixed-size captured marker text. */
export function activityMarkerTitleWidth(title?: string, journeyUnderwayCount = 0) {
  const rawWidth = activityMarkerRawTitleWidth(title, journeyUnderwayCount);
  if (rawWidth === 0) return 0;
  return Math.max(
    ACTIVITY_MARKER_TITLE_MIN_WIDTH,
    Math.min(ACTIVITY_MARKER_TITLE_MAX_WIDTH, rawWidth),
  );
}

export function activityMarkerTitleHeight(title?: string, journeyUnderwayCount = 0) {
  const rawWidth = activityMarkerRawTitleWidth(title, journeyUnderwayCount);
  if (rawWidth === 0) return 0;
  return activityMarkerTitleLineCount(title, journeyUnderwayCount) === 2
    ? ACTIVITY_MARKER_TITLE_TWO_LINE_HEIGHT
    : ACTIVITY_MARKER_TITLE_ONE_LINE_HEIGHT;
}

export function activityMarkerTitleLineCount(title?: string, journeyUnderwayCount = 0): 1 | 2 {
  const rawWidth = activityMarkerRawTitleWidth(title, journeyUnderwayCount);
  return rawWidth > ACTIVITY_MARKER_TITLE_MAX_WIDTH ? 2 : 1;
}

export function activityMarkerTitleSectionWidth(
  shellWidth: number,
  titleWidth: number,
  titleReveal: number,
) {
  'worklet';
  const reveal = Math.max(0, Math.min(1, titleReveal));
  return shellWidth + (titleWidth - shellWidth) * reveal;
}

export function activityMarkerCardWidthForShell(
  shellWidth: number,
  titleWidth: number,
  titleReveal: number,
) {
  'worklet';
  return Math.max(shellWidth, activityMarkerTitleSectionWidth(shellWidth, titleWidth, titleReveal));
}

export function activityMarkerCardWidth(
  faceCount: number,
  solo: boolean,
  progress: number,
  titlePriority = false,
  title?: string,
  journeyUnderwayCount = 0,
) {
  const shellWidth = activityMarkerShellWidth(faceCount, solo, progress);
  const titleReveal = activityMarkerTitleReveal(progress, titlePriority, Boolean(title));
  return activityMarkerCardWidthForShell(
    shellWidth,
    activityMarkerTitleWidth(title, journeyUnderwayCount),
    titleReveal,
  );
}

export function activityMarkerShellRadius(shellWidth: number) {
  'worklet';
  return Math.min(ACTIVITY_MARKER_SHELL_RADIUS, shellWidth / 2, ACTIVITY_MARKER_SHELL_HEIGHT / 2);
}

/**
 * The shell alone, as a closed stadium. This is what the countdown ring runs
 * on — NOT the whole silhouette. A ring around the full board would have to
 * follow the transition and two different widths, which is unreadable as a
 * clock; around the shell it is one continuous curve of constant shape.
 * Corners are true circular arcs, so {@link activityMarkerShellPerimeter} is
 * exact rather than an approximation of a quadratic corner.
 */
export function activityMarkerShellPath(shellWidth: number) {
  'worklet';
  const centerX = ACTIVITY_MARKER_CAPTURE_WIDTH / 2;
  const left = centerX - shellWidth / 2;
  const right = centerX + shellWidth / 2;
  const top = ACTIVITY_MARKER_SHELL_TOP;
  const bottom = top + ACTIVITY_MARKER_SHELL_HEIGHT;
  const r = activityMarkerShellRadius(shellWidth);
  return [
    `M ${left + r} ${top}`,
    `L ${right - r} ${top}`,
    `A ${r} ${r} 0 0 1 ${right} ${top + r}`,
    `L ${right} ${bottom - r}`,
    `A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
    `L ${left + r} ${bottom}`,
    `A ${r} ${r} 0 0 1 ${left} ${bottom - r}`,
    `L ${left} ${top + r}`,
    `A ${r} ${r} 0 0 1 ${left + r} ${top}`,
    'Z',
  ].join(' ');
}

export function activityMarkerShellPerimeter(shellWidth: number) {
  'worklet';
  const r = activityMarkerShellRadius(shellWidth);
  return (
    2 * Math.max(0, shellWidth - 2 * r) +
    2 * Math.max(0, ACTIVITY_MARKER_SHELL_HEIGHT - 2 * r) +
    2 * Math.PI * r
  );
}

/**
 * Roughly how long one dash plus its gap should be on the planning ring, and
 * how much of that period is drawn. Both are targets, never the values used:
 * see {@link activityMarkerPlanningDash}.
 */
const PLANNING_DASH_PERIOD = 7.5;
const PLANNING_DASH_SHARE = 0.55;
/** Below this the dashes stop reading as dashes and start reading as noise. */
const PLANNING_DASH_MIN_COUNT = 6;

/**
 * The dash pattern for a round that is still looking for a time.
 *
 * The ring is this app's clock, so a Terminfindung — whose clock is precisely
 * what has not been decided — wears the same ring with the stroke broken. It is
 * the same colour, the same path and the same slot; one property differs, and
 * closing it later is exactly what happens when the host locks a slot.
 *
 * The period is DERIVED, never fixed: the shell is three different widths as
 * the map zooms, so a constant dash length would leave a ragged remainder at
 * the seam — a stray long or short dash at the top-left corner, at one zoom
 * stage only. Dividing the real perimeter into a whole number of periods makes
 * the pattern close on itself at every width.
 *
 * `strokeWidth` is needed because round caps add half a stroke at each end. At
 * the marker's 3 px stroke and a ~7.5 px period that is the whole gap, so the
 * requested dash has to be a full stroke shorter than the dash you want to see.
 */
export function activityMarkerPlanningDash(shellWidth: number, strokeWidth: number) {
  'worklet';
  const perimeter = activityMarkerShellPerimeter(shellWidth);
  const count = Math.max(PLANNING_DASH_MIN_COUNT, Math.round(perimeter / PLANNING_DASH_PERIOD));
  const period = perimeter / count;
  const drawn = period * PLANNING_DASH_SHARE;
  const dash = Math.max(0.1, drawn - strokeWidth);
  return { dash, gap: Math.max(0.1, period - dash), count, period };
}

/**
 * Distance along {@link activityMarkerShellPath} from its start to twelve
 * o'clock. The path starts after the top-left radius, but a clock has to begin
 * at the top centre — feed the negative of this as `strokeDashoffset`.
 */
export function activityMarkerShellClockStart(shellWidth: number) {
  'worklet';
  return shellWidth / 2 - activityMarkerShellRadius(shellWidth);
}

export function activityMarkerBoardPath(
  shellWidth: number,
  titleSectionWidth: number,
  titleReveal: number,
  titleHeight = ACTIVITY_MARKER_TITLE_HEIGHT,
) {
  'worklet';
  const reveal = Math.max(0, Math.min(1, titleReveal));
  const topY = ACTIVITY_MARKER_SHELL_TOP;
  const joinY = topY + ACTIVITY_MARKER_SHELL_HEIGHT;
  const bottomY = joinY + titleHeight * reveal;
  const topHalf = shellWidth / 2;
  const bottomHalf = titleSectionWidth / 2;
  const centerX = ACTIVITY_MARKER_CAPTURE_WIDTH / 2;
  const topLeft = centerX - topHalf;
  const topRight = centerX + topHalf;
  const topRadius = activityMarkerShellRadius(shellWidth);

  if (reveal <= 0.001) return activityMarkerShellPath(shellWidth);

  const bottomLeft = centerX - bottomHalf;
  const bottomRight = centerX + bottomHalf;
  const bottomHeight = bottomY - joinY;
  // The band ends round, but capped so a two-line band stays a squircle
  // instead of turning into a pill — same language as the shell above it.
  const bottomRadius = Math.min(bottomHalf, bottomHeight / 2, 10);

  return [
    `M ${centerX} ${topY}`,
    `L ${topRight - topRadius} ${topY}`,
    `A ${topRadius} ${topRadius} 0 0 1 ${topRight} ${topY + topRadius}`,
    `L ${topRight} ${joinY}`,
    `L ${bottomRight} ${joinY}`,
    `L ${bottomRight} ${bottomY - bottomRadius}`,
    `A ${bottomRadius} ${bottomRadius} 0 0 1 ${bottomRight - bottomRadius} ${bottomY}`,
    `L ${bottomLeft + bottomRadius} ${bottomY}`,
    `A ${bottomRadius} ${bottomRadius} 0 0 1 ${bottomLeft} ${bottomY - bottomRadius}`,
    `L ${bottomLeft} ${joinY}`,
    `L ${topLeft} ${joinY}`,
    `L ${topLeft} ${topY + topRadius}`,
    `A ${topRadius} ${topRadius} 0 0 1 ${topLeft + topRadius} ${topY}`,
    'Z',
  ].join(' ');
}

/** Shadow and live pulse derive from the whole visible board. */
export function activityMarkerGroundWidthForCard(cardWidth: number) {
  'worklet';
  return Math.max(ACTIVITY_MARKER_GROUND_MIN_WIDTH, cardWidth * ACTIVITY_MARKER_GROUND_WIDTH_RATIO);
}

export function activityMarkerGroundWidth(
  faceCount: number,
  solo: boolean,
  progress: number,
  titlePriority = false,
  title?: string,
  journeyUnderwayCount = 0,
) {
  return activityMarkerGroundWidthForCard(
    activityMarkerCardWidth(faceCount, solo, progress, titlePriority, title, journeyUnderwayCount),
  );
}
