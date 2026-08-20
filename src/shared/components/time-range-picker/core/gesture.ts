import type { RangeEdge, RangeLimits, TimeRange } from './constraints';
import {
  acceptedDeltaMs,
  durationOf,
  requestDelta,
  resolveRange,
  snapRange,
  withGeometricDurationBounds,
} from './constraints';
import { clamp } from './units';
import type { ScaleLimits, Viewport, ViewportBounds } from './viewport';
import {
  centreRange,
  ensureRangeVisible,
  safeLeft,
  safeRight,
  timeToX,
  usableWidth,
  xToTime,
  zoomAround,
} from './viewport';

/**
 * The interaction, as an explicit state machine over pure transitions.
 *
 * Three gestures, each with a normal phase and an edge phase, and no boolean
 * soup between them: what a frame does is decided by `phase`, and `phase` is
 * decided by one number — whether the grab-corrected pointer is still inside
 * the safe area.
 *
 * ## The two edge modes are NOT variations of one mechanic
 *
 * `edgeExpand` (a single handle) holds the OPPOSITE handle still and changes
 * the duration, so the scale must change. `edgePan` (the whole range) holds the
 * duration still and moves the camera, so the scale must NOT change. Sharing
 * code between them is what produces a control that zooms when it should pan.
 *
 * ## Why nothing accumulates
 *
 * `grabDx` is frozen at pointer-down and every frame recomputes the handle
 * position absolutely from the raw pointer. There is no per-frame `+= delta`,
 * so fast direction changes cannot drift, and pushing the finger far past the
 * edge cannot build up slack that has to be paid back on the way in: the clamp
 * is stateless, so the handle leaves the edge on the first pixel back.
 *
 * ## DEFINITION ORDER IS LOAD-BEARING — do not sort this file
 *
 * Every function here must be defined BEFORE the ones that call it. The
 * worklets Babel plugin rewrites a `'worklet'` function declaration into an
 * assignment, which removes the hoisting a plain declaration would have had, and
 * it captures a callee into the caller's closure at module-evaluation time. A
 * caller placed above its callee therefore captures `undefined` and dies on the
 * UI thread with "X is not a function" — the first drag, every time.
 *
 * This is invisible to `scripts/test-time-range-picker.mjs`: node hoists the
 * declarations normally, so the tests pass on an order the device rejects. Only
 * a real gesture on a device catches it. (Measured 19 August 2026: `beginGesture`
 * above `applyPointer` crashed the app on the first drag while every unit test
 * stayed green.)
 */

export type GesturePhase =
  | 'idle'
  | 'startDrag'
  | 'startEdgeExpand'
  | 'endDrag'
  | 'endEdgeExpand'
  | 'rangeDrag'
  | 'rangeEdgePan';

export interface EdgeConfig {
  /**
   * Pointer travel PAST the safe edge that reaches full speed.
   *
   * Measured from the safe edge rather than from the viewport edge so the pedal
   * is continuous: the speed is exactly zero at the moment the handle pins and
   * grows from there. A zone starting earlier would move the time while the
   * finger was still moving the handle, counting one gesture twice.
   */
  travelPx: number;
  maxSpeedMsPerSecond: number;
  /** Floor under the squared ramp, so the entrance still creeps. */
  minStrength: number;
}

export interface PickerGeometry {
  bounds: ViewportBounds;
  limits: RangeLimits;
  scale: ScaleLimits;
  edge: EdgeConfig;
  stepMs: number;
  snapOriginMs: number;
}

/**
 * What a gesture has to remember. Deliberately two fields.
 *
 * The brief's snapshot also carried the base range, the base viewport, the base
 * duration and the pointer's start position, to compute each frame from a stable
 * base and avoid cumulative drift. This design reaches that goal a shorter way:
 * every frame maps the RAW pointer to a handle position absolutely, so there is
 * no accumulation to protect against and nothing to reconstruct from a baseline.
 * Those fields were written into a shared value sixty times a second and read
 * exactly never — so they are gone. A second finger is handled where it belongs,
 * by `maxPointers(1)` on the gesture, rather than by carrying a pointer id.
 */
export interface GestureSnapshot {
  kind: RangeEdge;
  /** Pointer offset from the reference handle at pointer-down. Frozen. */
  grabDx: number;
}

export interface PickerState {
  phase: GesturePhase;
  range: TimeRange;
  viewport: Viewport;
  snapshot: GestureSnapshot | null;
  /** Raw and unclamped. The pedal reads this and nothing else. */
  pointerX: number;
  /** Signed pixels the pointer sits outside the safe area. 0 = normal drag. */
  overshootPx: number;
  /**
   * The pivot an edge expand turns around, captured ONCE when the edge phase is
   * entered.
   *
   * Re-deriving it every frame from a viewport that was itself derived from it
   * feeds each frame's rounding into the next, and the still handle creeps —
   * about a nanometre per frame, which is invisible for a second and then is
   * not. Held fixed, `zoomAround` reproduces it with a single rounding that
   * never compounds.
   */
  anchorMs: number;
  anchorX: number;
  /** The re-zoom running after pointer-up, or null. Never set while a finger is
   * down — a new gesture clears it and adopts whatever it had reached. */
  settle: ViewportSettle | null;
}

export function createPickerState(range: TimeRange, viewport: Viewport): PickerState {
  'worklet';
  return {
    phase: 'idle',
    range,
    viewport,
    snapshot: null,
    pointerX: 0,
    overshootPx: 0,
    anchorMs: range.startMs,
    anchorX: 0,
    settle: null,
  };
}

/** The handle a gesture steers by. A range drag is steered by its start; its
 * end follows rigidly. */
function referenceTime(range: TimeRange, kind: RangeEdge): number {
  'worklet';
  return kind === 'end' ? range.endMs : range.startMs;
}

/** Where that handle may sit. The range's window is shortened by the bar's own
 * width, which is what keeps its FAR handle inside the safe area. */
function referenceWindow(
  state: PickerState,
  kind: RangeEdge,
  bounds: ViewportBounds,
): { min: number; max: number } {
  'worklet';
  const min = safeLeft(bounds);
  if (kind !== 'range') return { min, max: safeRight(bounds) };
  const barWidth = durationOf(state.range) * state.viewport.pxPerMs;
  return { min, max: Math.max(min, safeRight(bounds) - barWidth) };
}

function phaseFor(kind: RangeEdge, atEdge: boolean): GesturePhase {
  'worklet';
  if (kind === 'start') return atEdge ? 'startEdgeExpand' : 'startDrag';
  if (kind === 'end') return atEdge ? 'endEdgeExpand' : 'endDrag';
  return atEdge ? 'rangeEdgePan' : 'rangeDrag';
}

/**
 * One pointer sample.
 *
 * Inside the safe area the handle follows the finger and the camera is not
 * touched — which is what makes "the other handle does not move" true by
 * construction rather than by correction. Outside it the handle is pinned and
 * this frame changes nothing: the pedal owns that motion, on its own clock.
 */
export function applyPointer(
  state: PickerState,
  pointerX: number,
  geometry: PickerGeometry,
): PickerState {
  'worklet';
  const snapshot = state.snapshot;
  if (!snapshot) return state;

  const window = referenceWindow(state, snapshot.kind, geometry.bounds);
  const pointerRefX = pointerX - snapshot.grabDx;
  const visibleRefX = clamp(pointerRefX, window.min, window.max);
  const overshootPx = pointerRefX - visibleRefX;
  const phase = phaseFor(snapshot.kind, overshootPx !== 0);

  // ONE path for both phases. The clamp is what separates them: inside the safe
  // area it does nothing and the handle tracks the finger, outside it pins the
  // handle to the edge and this becomes idempotent — the pedal has already put
  // the viewport where `xToTime(edge)` is the time the handle already shows.
  // Skipping the assignment while pinned would leave a flick that crosses the
  // whole zone in one sample behind, and the next tick would have to make that
  // distance up by zooming: a jump, produced by the mechanism meant to prevent
  // one.
  const desiredMs = xToTime(state.viewport, visibleRefX);
  const range = resolveRange(state.range, snapshot.kind, desiredMs, geometry.limits);
  const next = { ...state, phase, pointerX, overshootPx, range };

  // Entering the edge phase is the one moment the pivot is known and settled:
  // the handle has just reached the edge, and the opposite handle is wherever
  // the user's own drag left it.
  if (overshootPx !== 0 && state.overshootPx === 0 && snapshot.kind !== 'range') {
    const anchorMs = snapshot.kind === 'end' ? range.startMs : range.endMs;
    return { ...next, anchorMs, anchorX: timeToX(state.viewport, anchorMs) };
  }
  return next;
}

/**
 * `pointerDownX` must be the position the finger TOUCHED DOWN at — never the
 * position it had when the gesture activated.
 *
 * A pan activates only after a few pixels of slop, and on a fast flick the
 * finger can be most of the way through the gesture by then. Freezing the grab
 * offset at activation silently throws that travel away: slow drags lose the
 * slop and feel fine, fast ones lose almost everything and read as a control
 * that ignores you. Measured on device: 105 px in 60 ms produced no change at
 * all, because the activating event was also the last one.
 */
export function beginGesture(
  state: PickerState,
  kind: RangeEdge,
  pointerDownX: number,
  geometry: PickerGeometry,
): PickerState {
  'worklet';
  const handleX = timeToX(state.viewport, referenceTime(state.range, kind));
  const snapshot: GestureSnapshot = { kind, grabDx: pointerDownX - handleX };
  const phase: GesturePhase =
    kind === 'start' ? 'startDrag' : kind === 'end' ? 'endDrag' : 'rangeDrag';
  // A settle still running is abandoned where it stands: whatever the camera
  // had reached is simply the starting point of this gesture.
  return applyPointer(
    { ...state, phase, snapshot, pointerX: pointerDownX, overshootPx: 0, settle: null },
    pointerDownX,
    geometry,
  );
}

/**
 * Depth in the edge zone, squared.
 *
 * The ramp is what buys the slow half of the travel its share of the distance;
 * a linear one spends most of its speed in the first few pixels, which is how a
 * two-hour span becomes six in a single flick.
 */
export function edgeStrength(overshootPx: number, edge: EdgeConfig): number {
  'worklet';
  const depth = clamp(Math.abs(overshootPx) / Math.max(1, edge.travelPx), 0, 1);
  return Math.max(edge.minStrength, depth * depth);
}

/**
 * The whole range travels and the camera follows it exactly.
 *
 * Both times and the viewport shift by the same accepted delta, so every screen
 * position in the picker is arithmetically unchanged — the range cannot drift a
 * pixel while the hours slide underneath it.
 */
function edgePan(state: PickerState, requestedMs: number, geometry: PickerGeometry): PickerState {
  'worklet';
  const { range, acceptedMs } = requestDelta(state.range, 'range', requestedMs, geometry.limits);
  if (acceptedMs === 0) return state;
  return {
    ...state,
    range,
    viewport: { startMs: state.viewport.startMs + acceptedMs, pxPerMs: state.viewport.pxPerMs },
  };
}

/**
 * The dragged handle holds the safe edge, the opposite one holds its pixel.
 *
 * Two fixed screen positions and a new duration determine the scale exactly
 * (`distance / duration`), and the anchor is then substituted back into the
 * transform — so the still handle is mathematically still for the whole frame,
 * not merely returned to its place at the end of one.
 *
 * The scale is never clamped here. `withGeometricDurationBounds` turns both
 * scale limits into duration limits first, so the constraint engine stops the
 * duration before the geometry could break, and the pinned handle stays pinned
 * without a single special case.
 */
function edgeExpand(
  state: PickerState,
  kind: 'start' | 'end',
  requestedMs: number,
  direction: 1 | -1,
  geometry: PickerGeometry,
): PickerState {
  'worklet';
  const anchorMs = state.anchorMs;
  const anchorX = state.anchorX;
  const pinnedX = direction > 0 ? safeRight(geometry.bounds) : safeLeft(geometry.bounds);
  const distancePx = Math.abs(pinnedX - anchorX);

  const limits = withGeometricDurationBounds(
    geometry.limits,
    distancePx,
    geometry.scale.minPxPerMs,
    geometry.scale.maxPxPerMs,
  );
  const { range, acceptedMs } = requestDelta(state.range, kind, requestedMs, limits);
  if (acceptedMs === 0) return state;

  const duration = durationOf(range);
  if (duration <= 0 || distancePx <= 0) return { ...state, range };
  return { ...state, range, viewport: zoomAround(anchorMs, anchorX, distancePx / duration) };
}

/**
 * One frame of edge motion.
 *
 * Ask, then move: the pedal proposes a delta, the constraint engine answers
 * with what it allows, and the camera reacts to the ANSWER. A frame that buys
 * nothing leaves range and viewport untouched and keeps the loop running —
 * stopping at a limit is what makes a control bounce, and restarting it on the
 * next pointer sample is what makes it shudder.
 */
export function edgeTick(
  state: PickerState,
  deltaSeconds: number,
  geometry: PickerGeometry,
): PickerState {
  'worklet';
  const snapshot = state.snapshot;
  if (!snapshot || state.overshootPx === 0 || deltaSeconds <= 0) return state;

  const direction = state.overshootPx > 0 ? 1 : -1;
  const speed = geometry.edge.maxSpeedMsPerSecond * edgeStrength(state.overshootPx, geometry.edge);
  const requestedMs = direction * speed * deltaSeconds;

  if (snapshot.kind === 'range') return edgePan(state, requestedMs, geometry);
  return edgeExpand(state, snapshot.kind, requestedMs, direction, geometry);
}

/**
 * The re-zoom that runs once a single handle is released.
 *
 * One rule, no special cases: a range occupying less than
 * `RE_ZOOM_TRIGGER_FRACTION` of the usable width is zoomed until it occupies
 * `RE_ZOOM_TARGET_FRACTION`; anything wider is left exactly as the user left it.
 *
 * This replaces two earlier mechanisms — a zoom that ran DURING the drag and a
 * narrower rescue keyed on a handle touching a safe edge. The first could not
 * work where it was needed: with the opposite handle against an edge the bar's
 * width is `fingerX - safeEdge`, so zooming could only push that handle out of
 * view and was correctly refused, measured at zero steps over six hundred
 * frames. With the finger up there is no anchor to honour and no time to
 * disturb, so the rule is free to simply centre the range at a workable scale.
 */
export const RE_ZOOM_TRIGGER_FRACTION = 0.65;
export const RE_ZOOM_TARGET_FRACTION = 0.85;
/** Short enough to read as a settle rather than a journey; eased out, so it
 * never overshoots and never needs a second correction. */
export const RE_ZOOM_DURATION_MS = 180;

export interface ViewportSettle {
  fromStartMs: number;
  fromPxPerMs: number;
  toStartMs: number;
  toPxPerMs: number;
  elapsedMs: number;
  durationMs: number;
}

/**
 * The viewport a released range should settle into, or null to leave it alone.
 *
 * Times are not an input to this and not an output: only the camera moves. If
 * the scale ceiling stops the range short of the target width, the ceiling
 * wins and the widest reachable view is used — there is no second rule for that.
 */
export function planReZoom(
  range: TimeRange,
  viewport: Viewport,
  geometry: PickerGeometry,
): Viewport | null {
  'worklet';
  const usable = usableWidth(geometry.bounds);
  const duration = durationOf(range);
  if (usable <= 0 || duration <= 0) return null;

  if (duration * viewport.pxPerMs >= usable * RE_ZOOM_TRIGGER_FRACTION) return null;

  const target = Math.min(
    (usable * RE_ZOOM_TARGET_FRACTION) / duration,
    geometry.scale.maxPxPerMs,
  );
  if (target <= viewport.pxPerMs) return null;
  return centreRange(range, target, geometry.bounds);
}

export function beginSettle(
  state: PickerState,
  target: Viewport,
  durationMs: number,
): PickerState {
  'worklet';
  return {
    ...state,
    settle: {
      fromStartMs: state.viewport.startMs,
      fromPxPerMs: state.viewport.pxPerMs,
      toStartMs: target.startMs,
      toPxPerMs: target.pxPerMs,
      elapsedMs: 0,
      durationMs,
    },
  };
}

/** One frame of the settle. Eased out, so it approaches the target and stops
 * there — no overshoot, no ringing, and the last frame lands exactly on it. */
export function tickSettle(state: PickerState, deltaMs: number): PickerState {
  'worklet';
  const settle = state.settle;
  if (!settle) return state;

  const elapsedMs = settle.elapsedMs + deltaMs;
  if (elapsedMs >= settle.durationMs) {
    return {
      ...state,
      viewport: { startMs: settle.toStartMs, pxPerMs: settle.toPxPerMs },
      settle: null,
    };
  }
  const t = elapsedMs / settle.durationMs;
  const eased = 1 - (1 - t) * (1 - t) * (1 - t);
  return {
    ...state,
    viewport: {
      startMs: settle.fromStartMs + (settle.toStartMs - settle.fromStartMs) * eased,
      pxPerMs: settle.fromPxPerMs + (settle.toPxPerMs - settle.fromPxPerMs) * eased,
    },
    settle: { ...settle, elapsedMs },
  };
}

/**
 * Pointer-up. The value lands on the grid and the camera stays where the user
 * left it — `ensureRangeVisible` only repairs a viewport the snap made invalid,
 * which is at most half a step of movement.
 */
export function endGesture(state: PickerState, geometry: PickerGeometry): PickerState {
  'worklet';
  const snapshot = state.snapshot;
  if (!snapshot) return { ...state, phase: 'idle', overshootPx: 0 };
  const range = snapRange(
    state.range,
    snapshot.kind,
    geometry.stepMs,
    geometry.snapOriginMs,
    geometry.limits,
  );
  const viewport = ensureRangeVisible(
    state.viewport,
    range,
    geometry.bounds,
    geometry.scale,
  );
  const idle: PickerState = {
    phase: 'idle',
    range,
    viewport,
    snapshot: null,
    pointerX: state.pointerX,
    overshootPx: 0,
    anchorMs: range.startMs,
    anchorX: 0,
    settle: null,
  };

  // Only a single handle. Moving the whole range changes nothing about how
  // precisely it can be edited, so it must not move the camera either.
  if (snapshot.kind === 'range') return idle;
  const target = planReZoom(range, viewport, geometry);
  return target ? beginSettle(idle, target, RE_ZOOM_DURATION_MS) : idle;
}

/** Cancellation keeps what the gesture already produced — the range is not
 * rolled back, only the interaction ends. */
export function cancelGesture(state: PickerState, geometry: PickerGeometry): PickerState {
  'worklet';
  return endGesture(state, geometry);
}

/** Adopting an external value mid-gesture: one owner at a time, never two. */
export function adoptExternalRange(
  state: PickerState,
  range: TimeRange,
  geometry: PickerGeometry,
): PickerState {
  'worklet';
  return {
    phase: 'idle',
    range,
    viewport: ensureRangeVisible(state.viewport, range, geometry.bounds, geometry.scale),
    snapshot: null,
    pointerX: state.pointerX,
    overshootPx: 0,
    anchorMs: range.startMs,
    anchorX: 0,
    settle: null,
  };
}

export function snappedRange(state: PickerState, geometry: PickerGeometry): TimeRange {
  'worklet';
  const kind: RangeEdge = state.snapshot ? state.snapshot.kind : 'range';
  return snapRange(state.range, kind, geometry.stepMs, geometry.snapOriginMs, geometry.limits);
}

export function isEdgePhase(phase: GesturePhase): boolean {
  'worklet';
  return phase === 'startEdgeExpand' || phase === 'endEdgeExpand' || phase === 'rangeEdgePan';
}

export { acceptedDeltaMs, durationOf };
