/**
 * Pure selection math for the Together Core.
 *
 * Deliberately free of React, Reanimated and gesture types: this is the part
 * that decides whether letting go starts an activity, navigates, or does
 * nothing at all. Keeping it as plain functions means the dead-zone and
 * hysteresis rules can be read and reasoned about without mounting a map.
 *
 * Angle convention: radians measured from straight UP, growing clockwise. So
 * `0` is above the core, `-π/2` is left of it and `+π/2` is right of it. Screen
 * coordinates have y growing downwards, which is why `pointerAngle` negates it.
 */

export interface CoreGeometry {
  /** The thumb must travel at least this far before ANY target can arm. */
  deadZoneRadius: number;
  /**
   * After a LEVEL change the thumb sits wherever the previous level left it, so
   * the same coordinate would immediately arm a target on the new level. It has
   * to move this far from that point before anything can arm again.
   */
  reArmRadius: number;
  /** A rival target must beat the armed one by this much track coordinate. */
  slotHysteresis: number;
  /**
   * How far PAST the outermost target the thumb may stray and still count.
   *
   * The limit is deliberately on the ends of the arc rather than on the
   * distance to the nearest target: interior gaps are already settled by
   * nearest-neighbour, so a per-target capture wedge only creates dead spots
   * between widely spaced targets. It did exactly that with the two-option
   * sub-level, where pointing straight up sat 40° from both Jetzt and Bald and
   * armed neither — while the UI still showed Jetzt highlighted.
   */
  edgeMargin: number;
}

/**
 * Tuned for thumb-on-glass, not for pixels: selection is driven by direction,
 * so the travel only has to be large enough to express one. 24px is past the
 * usual finger jitter while still counting as the "minimal relative movement"
 * the core promises.
 */
export const CORE_GEOMETRY: CoreGeometry = {
  deadZoneRadius: 24,
  reArmRadius: 26,
  slotHysteresis: 0.17,
  edgeMargin: 0.52,
};

/**
 * The return zone in the lower portion of the enlarged Core.
 *
 * Measured from the CORE CENTRE, not from where the finger first landed. That
 * distinction is the whole point: these numbers describe the lower part of
 * the Core itself. The small home-bar-like curve only hints that this area has
 * a function; it is never a narrow physical target. Feeding relative gesture
 * translation instead made the zone wander by ±40 px with the grab point.
 *
 * The zone is the lower third of the circular thumb pad. It is a broad target,
 * never a narrow line the thumb has to find.
 */
export const CORE_RETURN_GESTURE = {
  coreRadius: 86,
  lowerZoneTop: 29,
  closeZoneTop: 58,
} as const;

export function isCoreReturnLane(x: number, y: number): boolean {
  return (
    y >= CORE_RETURN_GESTURE.lowerZoneTop &&
    y < CORE_RETURN_GESTURE.closeZoneTop &&
    Math.hypot(x, y) <= CORE_RETURN_GESTURE.coreRadius
  );
}

/** The deeper part of the lower third, aligned with the home-bar affordance. */
export function isCoreCloseLane(x: number, y: number): boolean {
  return (
    y >= CORE_RETURN_GESTURE.closeZoneTop && Math.hypot(x, y) <= CORE_RETURN_GESTURE.coreRadius
  );
}

export function isCoreReturnGesture(x: number, y: number): boolean {
  return isCoreReturnLane(x, y);
}

/** Thumb offset (screen coords, y down) → angle from straight up, clockwise. */
export function pointerAngle(dx: number, dy: number): number {
  return Math.atan2(dx, -dy);
}

/**
 * Evenly spaced angles for `count` targets across `spread`, centred on straight
 * up. An even count therefore has no target exactly at the apex — the two
 * middle ones straddle it.
 */
export function arcAngles(count: number, spread: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const step = spread / (count - 1);
  const start = -spread / 2;
  return Array.from({ length: count }, (_, index) => start + index * step);
}

/** Offset of a target from the core centre, in screen coords (y down). */
export function polarOffset(angle: number, radius: number): { x: number; y: number } {
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}

/**
 * How much catch area each target deserves, from the OBLIQUE EFFECT.
 *
 * A thumb does not slide equally precisely in every direction: measured spreads
 * of finger-sliding angles are widest on the diagonals and tightest on the
 * orthogonals (Yang & Ren, "A mechanism based on finger-sliding behavior for
 * designing radial menus", IJHCS 2019). Dividing the arc into equal wedges
 * therefore spends the same angular budget on a direction the thumb hits
 * reliably and one it does not — and that paper measured the cost: ~2.00%
 * pointing errors for an evenly divided eight-way menu against ~0.05% once the
 * ranges are re-proportioned.
 *
 * `sin²(2θ)` peaks at 45° and vanishes at 0° and 90°, which is exactly the
 * shape of the effect. `strength` is how much extra a full diagonal gets; it is
 * held low on purpose (see CORE_SECTOR_BIAS) so no sector ends up narrower than
 * the equal division it replaced.
 *
 * The WEIGHTS ARE NOT POSITIONS. Icons stay on their fixed angles; only the
 * invisible boundaries between them move.
 */
export function obliqueSectorWeights(angles: number[], strength: number): number[] {
  return angles.map((angle) => {
    const s = Math.sin(2 * angle);
    return 1 + strength * s * s;
  });
}

/**
 * The boundaries between neighbouring targets, split in proportion to the
 * weights instead of at the midpoint. Exported because it is the part worth
 * checking numerically: it decides how forgiving each direction is.
 */
export function sectorBoundaries(angles: number[], weights?: number[]): number[] {
  const boundaries: number[] = [];
  for (let index = 0; index < angles.length - 1; index += 1) {
    const a = angles[index];
    const b = angles[index + 1];
    const wa = weights?.[index] ?? 1;
    const wb = weights?.[index + 1] ?? 1;
    const share = wa + wb <= 0 ? 0.5 : wa / (wa + wb);
    boundaries.push(a + (b - a) * share);
  }
  return boundaries;
}

/** The one gesture grammar used for a held Core. */
export type CoreGestureTrack = 'adaptive' | 'cancelled';

/** Stateful part of the Core's adaptive gesture calculation. */
export interface CoreGesturePathState {
  track: CoreGestureTrack;
  /**
   * Suppresses arming until the thumb has left this point. Set when a level
   * opens or closes under a finger that has not moved: without it the very next
   * pan sample re-reads the unchanged position against the NEW level's angles
   * and arms whatever happens to sit there.
   */
  latch: { x: number; y: number } | null;
}

export function createCoreGesturePathState(
  latch: { x: number; y: number } | null = null,
): CoreGesturePathState {
  return { track: 'adaptive', latch };
}

export interface GestureTrackArmedInput {
  dx: number;
  dy: number;
  angles: number[];
  weights?: number[];
  /** Horizontal input range that maps to the outermost target. */
  horizontalReach: number;
  previous: number | null;
  path: CoreGesturePathState;
  geometry?: CoreGeometry;
  /** Optional neutral interval in continuous target coordinates. */
  neutralZone?: { center: number; halfWidth: number };
}

export interface GestureTrackArmedResult {
  index: number | null;
  path: CoreGesturePathState;
  /** Continuous target coordinate. Drives the position indicator. */
  position: number | null;
  /** True while a level change is still holding arming back. */
  latched: boolean;
  /** How far the thumb has come toward being able to arm again, 0…1. */
  reArmProgress: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Maps an angle onto a continuous target coordinate. Sector boundaries, rather
 * than equal wedges, preserve the larger diagonal catch areas from the radial
 * menu research while still allowing a smooth value between targets.
 */
function slotPositionFromAngle(
  angle: number,
  angles: number[],
  weights: number[] | undefined,
  edgeMargin: number,
): number {
  const lastIndex = angles.length - 1;
  const bounds = sectorBoundaries(angles, weights);
  const knots = [angles[0] - edgeMargin, ...bounds, angles[lastIndex] + edgeMargin];
  const values = Array.from({ length: angles.length + 1 }, (_, index) => index - 0.5);
  const limited = clamp(angle, knots[0], knots[knots.length - 1]);

  for (let index = 0; index < knots.length - 1; index += 1) {
    const start = knots[index];
    const end = knots[index + 1];
    if (limited <= end) {
      const progress = end === start ? 0 : (limited - start) / (end - start);
      return clamp(values[index] + (values[index + 1] - values[index]) * progress, 0, lastIndex);
    }
  }

  return lastIndex;
}

/**
 * Preserve only state that cannot be inferred from the current point: a
 * post-level-change latch and a deliberate downward cancellation. The selector
 * itself stays adaptive, so a natural stroke may change between a sideways
 * scrub and a curved mark without being captured by its first few pixels.
 */
export function isCoreDownwardCancellation(dx: number, dy: number): boolean {
  return dy > Math.max(18, Math.abs(dx) * 0.62);
}

function nextGesturePathState(
  path: CoreGesturePathState,
  dx: number,
  dy: number,
  geometry: CoreGeometry,
): CoreGesturePathState {
  // A latched path stays neutral until the thumb deliberately leaves the point
  // where the level changed, so residual jitter cannot arm a revealed item.
  if (path.latch && Math.hypot(dx - path.latch.x, dy - path.latch.y) < geometry.reArmRadius) {
    return { track: 'adaptive', latch: path.latch };
  }
  const latch = null;

  const home = Math.hypot(dx, dy) < geometry.deadZoneRadius;
  if (path.track === 'cancelled') {
    return home || dy <= 0 ? { track: 'adaptive', latch } : { ...path, latch };
  }
  if (home) return { track: 'adaptive', latch };

  // Preserve the map's natural "drag down = get out" affordance. A small
  // downward wobble during a deliberate side scrub is still allowed.
  if (isCoreDownwardCancellation(dx, dy)) return { track: 'cancelled', latch };

  return { track: 'adaptive', latch };
}

function slotIndexWithHysteresis(
  position: number,
  count: number,
  previous: number | null,
  hysteresis: number,
): number {
  // Exact boundaries favour the lower/left item, at EVERY boundary. The old
  // `floor(position + 0.5 - EPSILON)` only did so up to index 1: past that,
  // Number.EPSILON is below half an ULP, so 2.5 rounded back up to 3 and the
  // arc's tie-break flipped direction halfway across a symmetric control.
  const candidate = clamp(Math.ceil(position - 0.5), 0, count - 1);
  if (previous == null || previous < 0 || previous >= count || previous === candidate) {
    return candidate;
  }

  const boundary = candidate > previous ? previous + 0.5 : previous - 0.5;
  const cleared =
    candidate > previous ? position > boundary + hysteresis : position < boundary - hysteresis;
  return cleared ? candidate : previous;
}

/**
 * Adaptive marking-menu selection for radial marks and horizontal scrubs.
 *
 * Both coordinates share one target order. The blend changes continuously as
 * the thumb rises or settles into a line, so hybrid strokes remain predictable.
 */
export function resolveGestureTrackArmedIndex({
  dx,
  dy,
  angles,
  weights,
  horizontalReach,
  previous,
  path,
  geometry = CORE_GEOMETRY,
  neutralZone,
}: GestureTrackArmedInput): GestureTrackArmedResult {
  const nextPath = nextGesturePathState(path, dx, dy, geometry);
  const held = (index: number | null): GestureTrackArmedResult => ({
    index,
    path: nextPath,
    position: null,
    latched: nextPath.latch != null,
    reArmProgress: nextPath.latch
      ? clamp(Math.hypot(dx - nextPath.latch.x, dy - nextPath.latch.y) / geometry.reArmRadius, 0, 1)
      : clamp(Math.hypot(dx, dy) / geometry.deadZoneRadius, 0, 1),
  });

  if (angles.length === 0) return held(null);
  // Nothing may arm until the thumb has left the point a level change left it
  // on — see `CoreGesturePathState.latch`.
  if (nextPath.latch) return held(previous);
  // A downward drift outside the dedicated return lane never replaces an
  // already armed action with a hidden "close" command. It simply keeps the
  // current action; with nothing armed it remains neutral and release closes.
  if (nextPath.track === 'cancelled') return held(previous);

  const radius = Math.hypot(dx, dy);
  // Once a target is armed, travelling back through the Core must keep it
  // armed. The centre is part of every comfortable thumb path between targets;
  // turning it into neutral made the control flicker and weakened selection.
  // The lower return lane is handled before this selector, as its own action.
  if (previous == null && radius < geometry.deadZoneRadius) return held(previous);

  const lastIndex = angles.length - 1;
  const railPosition = ((clamp(dx / Math.max(1, horizontalReach), -1, 1) + 1) * lastIndex) / 2;
  // A real thumb does not stay loyal to a mathematical path: it may begin as
  // a sideways scrub, then climb into an arc (or the other way around). The
  // old locked grammar picked one coordinate system from the first sample and
  // made the rest of that natural hybrid path feel erratic. Blend continuously
  // instead: level movement gives radial direction more authority, a flat
  // movement gives the forgiving horizontal rail more authority.
  const radialPosition = slotPositionFromAngle(
    pointerAngle(dx, dy),
    angles,
    weights,
    geometry.edgeMargin,
  );
  const upward = Math.max(0, -dy);
  const radialWeight = clamp((upward - 4) / (Math.abs(dx) * 0.85 + 20), 0, 1);
  const position = railPosition + (radialPosition - railPosition) * radialWeight;

  if (
    neutralZone &&
    Math.abs(position - neutralZone.center) <= Math.max(0, neutralZone.halfWidth)
  ) {
    return {
      index: null,
      path: nextPath,
      position,
      latched: false,
      reArmProgress: 1,
    };
  }

  return {
    index: slotIndexWithHysteresis(position, angles.length, previous, geometry.slotHysteresis),
    path: nextPath,
    position,
    latched: false,
    reArmProgress: 1,
  };
}

/**
 * Where the position indicator should point while nothing can arm yet.
 *
 * Inside the dead zone the selector deliberately reports no position, but the
 * indicator still has to follow the thumb — otherwise it sits at the apex and
 * then teleports to wherever the first armed target is. Clamped to the fan, so
 * it never promises a direction the release would not honour.
 */
export function previewTrackAngle(dx: number, dy: number, angles: number[]): number | null {
  if (angles.length === 0 || Math.hypot(dx, dy) < 8) return null;
  const first = angles[0];
  const last = angles[angles.length - 1];
  return clamp(pointerAngle(dx, dy), Math.min(first, last), Math.max(first, last));
}
