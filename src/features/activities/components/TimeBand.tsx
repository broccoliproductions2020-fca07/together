import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  LinearTransition,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { colorWithAlpha } from '@/features/map/utils/markerStyles';

import { FONT, TEXT_FIXED } from '@/shared/theme';

import { PlanningTimeBand } from './PlanningTimeBand';
import {
  fitPixelsPerHour,
  TIME_BAND_DEFAULT_PX_PER_HOUR,
  TIME_BAND_FIT_INSET_PX,
  TIME_BAND_FIT_TARGET_FILL,
  TIME_BAND_MAX_DURATION_MINUTES,
  TIME_BAND_MIN_DURATION_MINUTES,
  TIME_BAND_MIN_PX_PER_HOUR,
  TIME_BAND_SNAP_MINUTES,
  timeBandLabelInterval,
  timeBandMetrics,
} from './timeBandGeometry';

import type { TimeBandDensity } from './timeBandGeometry';

export type { TimeBandDensity };

/** One hour of wall-clock time is this many pixels of rail. 80 keeps a 5-minute
 * snap at ~6.7 px — fine enough to land on 18:35 without hunting, and still
 * about four hours of context in a phone-width viewport. */
const DEFAULT_PX_PER_HOUR = TIME_BAND_DEFAULT_PX_PER_HOUR;
const MIN_FIT_PX_PER_HOUR = TIME_BAND_MIN_PX_PER_HOUR;
const FIT_INSET_PX = TIME_BAND_FIT_INSET_PX;
/** One settle, ~a dozen renders. Long enough to read as motion, short enough
 * that letting go and grabbing again never has to wait for it. */
const SCALE_SETTLE_MS = 220;
/**
 * The zoom back to the working scale when a grip is touched.
 *
 * Shorter than the settle, because it happens with a finger already down. It
 * used to be instant, on the reasoning that an animation would move the rail
 * while the finger was aiming — which was wrong: the zoom is ANCHORED on the
 * touched grip, so the grip is the one thing that does not move. What moves is
 * the rest of the picture, and that is exactly what may be animated.
 */
const ZOOM_IN_MS = 140;
const FIT_TARGET_FILL = TIME_BAND_FIT_TARGET_FILL;
const SNAP_MINUTES = TIME_BAND_SNAP_MINUTES;
const DEFAULT_MIN_DURATION_MINUTES = TIME_BAND_MIN_DURATION_MINUTES;
const MAX_DURATION_MINUTES = TIME_BAND_MAX_DURATION_MINUTES;
const HANDLE_WIDTH = 30;
const MAX_HANDLE_HIT_WIDTH = 38;
/** Keeps a little rail visible before the span when the view first settles. */
const LEAD_IN_PX = 44;

/** How hard the pedal is pressed: squared, so the crawl gets real distance. */
function travelStrength(distanceFromEdge: number): number {
  const depth = Math.max(0, Math.min(1, (EDGE_ZONE - distanceFromEdge) / EDGE_ZONE));
  return Math.max(MIN_AUTO_TRAVEL_STRENGTH, depth * depth);
}

/**
 * How much of the band is kept clear so a held grip is never clipped away.
 *
 * The band is narrower than the screen, and the grip follows the finger — so a
 * finger carried past the band's edge used to leave the grip drawn outside it,
 * where the band clips it: you were dragging something you could not see. Worse,
 * the overshoot kept counting, so coming back in the grip had to make up that
 * distance before it moved at all — the control had play in it, like a steering
 * wheel with slack. Past this margin the finger stops moving the grip and only
 * feeds the pedal.
 */
const GRIP_KEEP_IN_VIEW_PX = 12;

/** How near an edge the finger must come before the rail starts travelling. */
const EDGE_ZONE = 52;
/**
 * The edge is a PEDAL, not a switch — and the calibration is the whole feature.
 *
 * At 62.5 ticks a second and the working scale of 80 dp/h these numbers mean:
 * just inside the zone ~4 min/s, half way in ~1.8 h/s, hard against the edge
 * ~7 h/s. Fine adjustment at the entrance, distance at the far end.
 *
 * Raising the ceiling only ever affects the far end — that is what the squared
 * ramp buys. The crawl at the entrance is held by the FLOOR, which moved down
 * by the same factor the ceiling moved up, so it stayed at ~4 min/s.
 *
 * The previous values were 10 px at a floor of 0.18 on a LINEAR ramp, i.e. 1.4
 * h/s the moment the zone was entered and 7.8 h/s at the edge. There was a ramp
 * in the code and none in the hand: every speed it offered was a fast one, which
 * is how a 2 h span became 6 h 10 in a single 900 ms drag. Squaring the ramp is
 * what buys the slow half its share of the travel — a linear one spends half its
 * speed in the first half of the distance.
 *
 * These figures are only stable because a held grip always works at 80 dp/h
 * (see the two-scale rule): before that, the same gesture meant a different
 * amount of time depending on how long the span happened to be.
 */
const MAX_AUTO_TRAVEL_PX = 9;
const MIN_AUTO_TRAVEL_STRENGTH = 0.01;
const AUTO_TRAVEL_TICK_MS = 16;

export type TimeBandDragKind = 'move' | 'start' | 'end';

export interface TimeBandHandle {
  previewLinkedSpan: (span: Span, railOffset: number) => void;
  previewLinkedRail: (railOffset: number) => void;
}

export interface LinkedTimePreview {
  sourceId: string;
  startMinutes: number;
  endMinutes: number;
  pixelsPerMinute: number;
  railOffset: number;
  revision: number;
}

export interface LinkedTimeBandSync {
  id: string;
  isMaster: boolean;
  initialSnapshot?: LinkedTimePreview;
  timeline: SharedValue<LinkedTimePreview>;
}

export interface Span {
  startMs: number;
  endMs: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clockLabel(ms: number): string {
  const date = new Date(ms);
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export interface TimeBandProps {
  startMs: number;
  endMs: number;
  /** Left edge of the rail in epoch ms. Always on a whole hour. */
  originMs: number;
  /** Rail length. Must exceed MAX_DURATION_MINUTES or the span cannot grow. */
  railMinutes: number;
  accent: string;
  /**
   * The two ends of a mode cross-fade, paired with `accentProgress`.
   *
   * Supplied together, the span and the grips interpolate between them on the
   * UI thread instead of hard-swapping when `accent` changes. That matters
   * because dragging the start handle is what changes the mode — the colour has
   * to travel with the finger, not snap once the state lands.
   */
  accentSequence?: readonly [string, string];
  accentProgress?: SharedValue<number>;
  /**
   * Replaces the start grip with a solid cap.
   *
   * No longer used by the composer: the start handle is what turns a Jetzt into
   * a plan and back, so fixing it would remove that gesture entirely. Kept for
   * the planning band, which still has rows whose start is not a choice.
   */
  startFixed: boolean;
  /** Everything left of this is in the past and cannot be selected. */
  nowMs: number;
  /** Defaults to 15 min; planning proposals deliberately use a clearer 30 min floor. */
  minDurationMinutes?: number;
  /** Keeps a parent form out of the frame-by-frame drag path when true. */
  commitOnFinalize?: boolean;
  /** A throttled local preview for labels near the band. */
  onPreviewChange?: (span: Span, railOffset: number) => void;
  /** Live rail position for linked rows; never needed by the standard scheduler. */
  onRailOffsetPreview?: (offset: number) => void;
  /** Lets a mirrored row update labels without re-emitting the source gesture. */
  onLinkedPreviewChange?: (span: Span) => void;
  /** Fires only on contact/finalize, never per move. */
  onDragKindChange?: (kind: TimeBandDragKind | null) => void;
  /** Restores a previously committed horizontal rail position when supplied. */
  railOffset?: number;
  /** Reports the settled rail position, never every panning frame. */
  onRailOffsetCommit?: (offset: number) => void;
  /** Selects the planning-specific rail with linked UI-thread previews. */
  keepSpanVisible?: boolean;
  /**
   * Scale, in dp per hour. CONTROLLED when given: the band then never picks its
   * own — which is what keeps a stack of bands comparable, since the planner can
   * derive one scale from its longest window and hand the same number to every
   * row. Omit it for a standalone band, which fits and zooms by itself.
   */
  pixelsPerHour?: number;
  /** Reports the scale a standalone band settled on. */
  onPixelsPerHourChange?: (pixelsPerHour: number) => void;
  /**
   * Row height. Slimmer steps keep their full touch height and only give up
   * chrome — the planner picks one per number of proposed windows.
   */
  density?: TimeBandDensity;
  /**
   * The window's own hours, drawn INSIDE the span when it is wide enough.
   *
   * Passed in rather than derived here so it stays one string with one
   * formatting rule — the row header shows the identical text, and a band
   * that formatted its own would drift from it (day offsets, +1 suffixes).
   * Only the planning band draws it; the scheduler states the span on its
   * own line above the rail instead.
   */
  spanLabel?: string;
  /** Shares the active planning drag with other linked days on the UI thread. */
  linkedSync?: LinkedTimeBandSync;
  onChange: (span: Span) => void;
}

/**
 * A horizontal hour rail carrying one draggable span — start, end and duration
 * in a single 56 px row, in place of two datetime fields and a duration slider.
 *
 * The rail is deliberately longer than the viewport: pull the span against
 * either edge and the rail travels under your finger, so a 20-minute coffee and
 * an eight-hour hike are the same gesture. That auto-travel is the entire reason
 * this fits in one row — without it the rail would have to be wide enough for
 * the longest activity anyone might pick.
 *
 * The rail owns its own offset rather than living in a ScrollView. A horizontal
 * ScrollView and a horizontal drag fight over the same touch, and losing that
 * fight means the span jumps while the rail scrolls under it.
 */
const StandardTimeBand = forwardRef<TimeBandHandle, TimeBandProps>(function StandardTimeBand(
  {
    startMs,
    endMs,
    originMs,
    railMinutes,
    accent,
    accentSequence,
    accentProgress,
    startFixed,
    nowMs,
    minDurationMinutes = DEFAULT_MIN_DURATION_MINUTES,
    commitOnFinalize = false,
    onPreviewChange,
    onRailOffsetPreview,
    onLinkedPreviewChange,
    onDragKindChange,
    railOffset,
    onRailOffsetCommit,
    keepSpanVisible = false,
    density = 'regular',
    spanLabel,
    pixelsPerHour: controlledPixelsPerHour,
    onPixelsPerHourChange,
    onChange,
  },
  ref,
) {
  const viewportRef = useRef<View>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const viewportWidthRef = useRef(0);
  viewportWidthRef.current = viewportWidth;
  const [ownPixelsPerHour, setPixelsPerHour] = useState(DEFAULT_PX_PER_HOUR);
  /**
   * TWO scales, and the split is what lets the 5-minute grid survive.
   *
   * While a grip is held the band works at the full scale, so one snap step is
   * a comfortable 6.7 dp and the grip tracks the finger exactly — the rail
   * travels instead of the span being squeezed. As soon as it is released the
   * band settles to whatever scale shows the WHOLE span, because at rest the
   * question is "how long is this", not "which five minutes". Touching a grip
   * again zooms back in, anchored on that grip. Precision where it is used,
   * overview where it is read.
   */
  const pixelsPerHour = controlledPixelsPerHour ?? ownPixelsPerHour;
  const [linkedPreview, setLinkedPreview] = useState(false);
  const metrics = timeBandMetrics(density);
  const { bandHeight, gripHeight, trackTop, trackBottom } = metrics;
  const pixelsPerMinute = pixelsPerHour / 60;
  const pixelsPerHourRef = useRef(pixelsPerHour);
  pixelsPerHourRef.current = pixelsPerHour;
  const pixelsPerMinuteRef = useRef(pixelsPerMinute);
  pixelsPerMinuteRef.current = pixelsPerMinute;

  /** Hysteresis lives in a ref: the thresholds overlap so a scale drifting
   * across one cannot flicker the labels, which needs the previous answer. */
  const labelIntervalRef = useRef(1);
  labelIntervalRef.current = timeBandLabelInterval(labelIntervalRef.current, pixelsPerHour);
  const labelInterval = Math.max(labelIntervalRef.current, density === 'compact' ? 3 : 1);

  /**
   * Room needed for THIS label, not for the longest one imaginable.
   *
   * A fixed threshold sized against "18:00–21:00" hid a short "2 Std" on spans
   * with ample room for it. Rough but stable: the metric font's average advance
   * is close to 0.62 em, plus a little breathing space each side.
   */
  const spanLabelWidth = spanLabel
    ? Math.max(28, spanLabel.length * metrics.spanFont * 0.62 + 14)
    : 0;

  const contentWidth = railMinutes * pixelsPerMinute;
  const railEndMs = originMs + railMinutes * 60_000;

  /**
   * The colour ramps, precomputed in JS.
   *
   * `interpolateColor` is fed plain rgba strings rather than the `${accent}3d`
   * eight-digit hex the static styles use: hex-with-alpha is parsed
   * inconsistently across Reanimated versions, and a colour that silently
   * decodes as opaque would paint the span over the rail's hour ticks.
   *
   * A fallback pair is always present so the hooks below run unconditionally —
   * they are ordinary hooks and cannot be skipped when the props are absent.
   */
  const ramp = useMemo(() => {
    const pair = accentSequence ?? ([accent, accent] as const);
    return {
      fill: [colorWithAlpha(pair[0], 0.239), colorWithAlpha(pair[1], 0.239)],
      border: [colorWithAlpha(pair[0], 0.659), colorWithAlpha(pair[1], 0.659)],
      solid: [pair[0], pair[1]],
    };
  }, [accent, accentSequence]);

  const fallbackProgress = useSharedValue(0);
  const colorProgress = accentProgress ?? fallbackProgress;
  const animated = accentSequence != null && accentProgress != null;

  const spanColorStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(colorProgress.value, [0, 1], ramp.fill),
    borderColor: interpolateColor(colorProgress.value, [0, 1], ramp.border),
  }));
  const solidColorStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(colorProgress.value, [0, 1], ramp.solid),
  }));

  // Rail position. The shared value drives the transform so panning stays off
  // the JS render path; the ref is the same number for arithmetic.
  const offset = useSharedValue(0);
  const offsetRef = useRef(0);
  const maxOffsetRef = useRef(0);
  maxOffsetRef.current = Math.max(0, contentWidth - viewportWidth);

  // Screen rect of the viewport, because Pan reports absoluteX. Re-measured on
  // every drag start, so a sheet that slid or resized still lines up.
  const viewportRectRef = useRef({ x: 0, width: 0 });

  const [drag, setDrag] = useState<TimeBandDragKind | null>(null);
  const [live, setLive] = useState<Span>({ startMs, endMs });
  const liveRef = useRef<Span>({ startMs, endMs });
  const dragBaseRef = useRef<Span>({ startMs, endMs });
  /** The last value handed OUT, always on the grid — so a frame that only moved
   * the drawing does not re-render the whole composer. */
  const reportedRef = useRef<Span>({ startMs, endMs });
  const panBaseRef = useRef(0);
  // The finger's LAST POSITION, already clamped to the band. Positions rather
  // than the gesture's own translation, because the clamping has to happen
  // before the difference is taken, not after.
  const lastFingerXRef = useRef(0);
  /** Fixed for the whole drag: a gesture must convert at one rate even while
   * the zoom animation is still catching up visually. */
  const dragPixelsPerMinuteRef = useRef(1);
  const fingerMinutesRef = useRef(0);
  /** Minutes contributed by auto-travel rather than by finger movement, kept
   * separate so the two simply add instead of fighting. */
  const autoMinutesRef = useRef(0);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTravelRef = useRef<{
    kind: TimeBandDragKind;
    direction: -1 | 1;
    strength: number;
  } | null>(null);
  const lastPreviewAtRef = useRef(0);
  const didInitialScrollRef = useRef(false);

  const span = drag || linkedPreview ? live : { startMs, endMs };
  const snapMs = useCallback(
    (ms: number) => {
      const step = SNAP_MINUTES * 60_000;
      return originMs + Math.round((ms - originMs) / step) * step;
    },
    [originMs],
  );
  const earliestMs = Math.max(originMs, snapMs(nowMs));
  const minDurationMs = minDurationMinutes * 60_000;
  const xOf = useCallback(
    (ms: number) => ((ms - originMs) / 60_000) * pixelsPerMinute,
    [originMs, pixelsPerMinute],
  );

  useEffect(() => {
    if (drag) return;
    if (linkedPreview) {
      if (liveRef.current.startMs === startMs && liveRef.current.endMs === endMs) {
        setLinkedPreview(false);
      }
      return;
    }
    liveRef.current = { startMs, endMs };
    setLive({ startMs, endMs });
  }, [drag, endMs, linkedPreview, startMs]);

  const moveRail = useCallback(
    (next: number) => {
      const clamped = clamp(next, 0, maxOffsetRef.current);
      offsetRef.current = clamped;
      offset.value = clamped;
      return clamped;
    },
    [offset],
  );

  const scaleFrameRef = useRef<number | null>(null);
  const onScaleChangeRef = useRef(onPixelsPerHourChange);
  onScaleChangeRef.current = onPixelsPerHourChange;

  const stopScaleAnimation = useCallback(() => {
    if (scaleFrameRef.current != null) cancelAnimationFrame(scaleFrameRef.current);
    scaleFrameRef.current = null;
  }, []);

  useEffect(() => stopScaleAnimation, [stopScaleAnimation]);

  /** Scale and rail position always move together — a scale without its matching
   * offset would slide the span sideways for no reason the user can see. */
  const applyScale = useCallback(
    (nextPixelsPerHour: number, nextOffset: number) => {
      pixelsPerHourRef.current = nextPixelsPerHour;
      pixelsPerMinuteRef.current = nextPixelsPerHour / 60;
      maxOffsetRef.current = Math.max(
        0,
        railMinutes * (nextPixelsPerHour / 60) - viewportWidthRef.current,
      );
      const clamped = clamp(nextOffset, 0, maxOffsetRef.current);
      offsetRef.current = clamped;
      offset.value = clamped;
      setPixelsPerHour(nextPixelsPerHour);
      onScaleChangeRef.current?.(nextPixelsPerHour);
    },
    [offset, railMinutes],
  );

  /**
   * Animating the scale re-renders per frame: these positions are layout, not
   * transforms. Affordable for one ~220 ms settle — the same order a drag costs
   * anyway — and it is the whole difference between the band settling and the
   * band snapping.
   */
  const animateScaleTo = useCallback(
    (targetPixelsPerHour: number, targetOffset: number, durationMs = SCALE_SETTLE_MS) => {
      stopScaleAnimation();
      const fromScale = pixelsPerHourRef.current;
      const fromOffset = offsetRef.current;
      if (Math.abs(targetPixelsPerHour - fromScale) < 0.05) {
        applyScale(targetPixelsPerHour, targetOffset);
        return;
      }
      const startedAt = Date.now();
      const step = () => {
        const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        applyScale(
          fromScale + (targetPixelsPerHour - fromScale) * eased,
          fromOffset + (targetOffset - fromOffset) * eased,
        );
        scaleFrameRef.current = progress < 1 ? requestAnimationFrame(step) : null;
      };
      step();
    },
    [applyScale, stopScaleAnimation],
  );

  /**
   * At rest the band shows the WHOLE span, centred.
   *
   * This replaced a rule that pinned the rail to the span's start whenever the
   * span did not fit — which is exactly the case that needed the other end, so
   * a span longer than the viewport had an end grip that could not be reached,
   * scrolled to, or dragged. Measured on device: three 170 px pans moved the
   * hour marks by zero, because the pin re-ran on every render.
   */
  const settleScale = useCallback(
    (span: Span) => {
      if (controlledPixelsPerHour != null) return;
      const width = viewportWidthRef.current;
      if (width <= 0) return;
      const durationMinutes = Math.max(1, (span.endMs - span.startMs) / 60_000);
      const target = fitPixelsPerHour(durationMinutes, width);
      // Nothing to fix, nothing to move. Re-centring a span that is already
      // whole and in view is a jump the user cannot attribute to anything they
      // did — the settle exists to RESCUE the view, not to tidy it.
      const perMinuteNow = pixelsPerHourRef.current / 60;
      const leftNow = ((span.startMs - originMs) / 60_000) * perMinuteNow - offsetRef.current;
      const rightNow = leftNow + durationMinutes * perMinuteNow;
      if (
        Math.abs(target - pixelsPerHourRef.current) < 0.05 &&
        leftNow >= 0 &&
        rightNow <= width
      ) {
        return;
      }
      const perMinute = target / 60;
      const spanWidth = durationMinutes * perMinute;
      const left = ((span.startMs - originMs) / 60_000) * perMinute;
      animateScaleTo(target, left - Math.max(FIT_INSET_PX, (width - spanWidth) / 2));
    },
    [animateScaleTo, controlledPixelsPerHour, originMs],
  );

  /**
   * Touching a grip restores the working scale, anchored ON that grip so it does
   * not jump out from under the finger. Instant, never animated: the gesture has
   * already begun, and an animation here would move the rail while the finger is
   * trying to aim at it.
   */
  const zoomForEditing = useCallback(
    (anchorMs: number) => {
      if (controlledPixelsPerHour != null) return;
      const current = pixelsPerHourRef.current;
      if (current >= DEFAULT_PX_PER_HOUR - 0.05) return;
      const anchorX = ((anchorMs - originMs) / 60_000) * (current / 60) - offsetRef.current;
      const anchorAt = ((anchorMs - originMs) / 60_000) * (DEFAULT_PX_PER_HOUR / 60);
      // Scale and offset are eased by the SAME factor, which is what keeps the
      // anchor mathematically still for the whole animation rather than only at
      // its two ends.
      animateScaleTo(DEFAULT_PX_PER_HOUR, anchorAt - anchorX, ZOOM_IN_MS);
    },
    [animateScaleTo, controlledPixelsPerHour, originMs],
  );

  const fitSpanInViewport = useCallback(
    (next: Span) => {
      if (!keepSpanVisible || viewportWidth <= 0) return;

      const durationMinutes = Math.max(1, (next.endMs - next.startMs) / 60_000);
      const availableWidth = Math.max(1, (viewportWidth - FIT_INSET_PX * 2) * FIT_TARGET_FILL);
      const targetPixelsPerHour = clamp(
        (availableWidth / durationMinutes) * 60,
        MIN_FIT_PX_PER_HOUR,
        DEFAULT_PX_PER_HOUR,
      );
      const currentPixelsPerHour = pixelsPerHourRef.current;
      const didScaleChange = Math.abs(targetPixelsPerHour - currentPixelsPerHour) > 0.01;
      const activePixelsPerMinute =
        (didScaleChange ? targetPixelsPerHour : currentPixelsPerHour) / 60;
      const maxOffset = Math.max(0, railMinutes * activePixelsPerMinute - viewportWidth);
      maxOffsetRef.current = maxOffset;

      if (didScaleChange) {
        pixelsPerHourRef.current = targetPixelsPerHour;
        pixelsPerMinuteRef.current = activePixelsPerMinute;
        setPixelsPerHour(targetPixelsPerHour);
      }

      const left = ((next.startMs - originMs) / 60_000) * activePixelsPerMinute;
      const right = ((next.endMs - originMs) / 60_000) * activePixelsPerMinute;
      const minOffset = Math.max(0, right + FIT_INSET_PX - viewportWidth);
      const maxVisibleOffset = Math.min(maxOffset, left - FIT_INSET_PX);
      const nextOffset =
        minOffset <= maxVisibleOffset
          ? clamp(offsetRef.current, minOffset, maxVisibleOffset)
          : clamp(left - (viewportWidth - (right - left)) / 2, 0, maxOffset);
      moveRail(nextOffset);
    },
    [keepSpanVisible, moveRail, originMs, railMinutes, viewportWidth],
  );

  useImperativeHandle(
    ref,
    () => ({
      previewLinkedSpan(next, nextRailOffset) {
        liveRef.current = next;
        setLive(next);
        setLinkedPreview(true);
        onLinkedPreviewChange?.(next);
        fitSpanInViewport(next);
        moveRail(nextRailOffset);
      },
      previewLinkedRail(nextRailOffset) {
        moveRail(nextRailOffset);
      },
    }),
    [fitSpanInViewport, moveRail, onLinkedPreviewChange],
  );

  // Bring the span into view once the width is known. Without this the rail
  // opens at midnight and an 18:00 activity is off-screen.
  useEffect(() => {
    if (viewportWidth <= 0 || didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    onRailOffsetCommit?.(moveRail(railOffset ?? xOf(startMs) - LEAD_IN_PX));
  }, [moveRail, onRailOffsetCommit, railOffset, startMs, viewportWidth, xOf]);

  useEffect(() => {
    if (railOffset == null || viewportWidth <= 0) return;
    moveRail(railOffset);
  }, [moveRail, railOffset, viewportWidth]);

  useEffect(() => {
    if (keepSpanVisible || railOffset != null || drag || viewportWidth <= 0) return;
    // A settle in flight is already on its way to a fitting state; re-deciding
    // per frame would restart the animation forever.
    if (scaleFrameRef.current != null) return;
    const left = xOf(startMs) - offsetRef.current;
    const right = xOf(endMs) - offsetRef.current;
    if (left >= 0 && right <= viewportWidth) return;
    settleScale({ startMs, endMs });
  }, [drag, endMs, keepSpanVisible, railOffset, settleScale, startMs, viewportWidth, xOf]);

  useEffect(() => {
    fitSpanInViewport(liveRef.current);
  }, [endMs, fitSpanInViewport, startMs]);

  const stopAutoTravel = useCallback(() => {
    if (!autoTimerRef.current) return;
    clearInterval(autoTimerRef.current);
    autoTimerRef.current = null;
    autoTravelRef.current = null;
  }, []);

  useEffect(() => stopAutoTravel, [stopAutoTravel]);

  /** Resolve a drag to a span. `base` is the span as it was when the finger went
   * down, so accumulated deltas never drift against themselves. */
  const resolve = useCallback(
    (kind: TimeBandDragKind, deltaMinutes: number): Span => {
      const base = dragBaseRef.current;
      const deltaMs = deltaMinutes * 60_000;

      if (kind === 'move') {
        const duration = base.endMs - base.startMs;
        const start = clamp(base.startMs + deltaMs, earliestMs, railEndMs - duration);
        return { startMs: start, endMs: start + duration };
      }

      if (kind === 'end') {
        const end = clamp(
          base.endMs + deltaMs,
          base.startMs + minDurationMs,
          Math.min(base.startMs + MAX_DURATION_MINUTES * 60_000, railEndMs),
        );
        return { startMs: base.startMs, endMs: end };
      }

      const start = clamp(
        base.startMs + deltaMs,
        Math.max(earliestMs, base.endMs - MAX_DURATION_MINUTES * 60_000),
        base.endMs - minDurationMs,
      );
      return { startMs: start, endMs: base.endMs };
    },
    [earliestMs, minDurationMs, railEndMs],
  );

  /**
   * The grid applies to the VALUE, never to the drawing.
   *
   * Drawing the snapped span made the bar advance in 6.7 dp hops at the working
   * scale, which reads as stutter — the control looked like it was struggling
   * to keep up with a finger it was in fact tracking perfectly. The bar now
   * follows the finger continuously while every reported and committed time
   * stays on the five-minute grid; the largest the two can disagree is half a
   * step, 2.5 minutes, or 3.3 dp. The clamps are re-applied after snapping,
   * because rounding can push a value across a limit it was just inside of.
   */
  const snapSpan = useCallback(
    (span: Span, kind: TimeBandDragKind): Span => {
      if (kind === 'end') {
        return {
          startMs: span.startMs,
          endMs: clamp(
            snapMs(span.endMs),
            span.startMs + minDurationMs,
            Math.min(span.startMs + MAX_DURATION_MINUTES * 60_000, railEndMs),
          ),
        };
      }
      if (kind === 'start') {
        return {
          startMs: clamp(
            snapMs(span.startMs),
            Math.max(earliestMs, span.endMs - MAX_DURATION_MINUTES * 60_000),
            span.endMs - minDurationMs,
          ),
          endMs: span.endMs,
        };
      }
      const duration = span.endMs - span.startMs;
      const start = clamp(snapMs(span.startMs), earliestMs, railEndMs - duration);
      return { startMs: start, endMs: start + duration };
    },
    [earliestMs, minDurationMs, railEndMs, snapMs],
  );

  const notifyPreview = useCallback(
    (next: Span, force = false) => {
      if (!onPreviewChange) return;
      const now = Date.now();
      if (!force && !keepSpanVisible && now - lastPreviewAtRef.current < 80) return;
      lastPreviewAtRef.current = now;
      onPreviewChange(next, offsetRef.current);
    },
    [keepSpanVisible, onPreviewChange],
  );

  const applyDrag = useCallback(
    (kind: TimeBandDragKind) => {
      const deltaMinutes = fingerMinutesRef.current + autoMinutesRef.current;
      const next = resolve(kind, deltaMinutes);
      const current = liveRef.current;
      if (next.startMs === current.startMs && next.endMs === current.endMs) return false;
      liveRef.current = next;
      setLive(next);
      fitSpanInViewport(next);
      // Reporting only when the SNAPPED value moves also takes the composer out
      // of the per-frame render path it used to sit in.
      const snapped = snapSpan(next, kind);
      const reported = reportedRef.current;
      if (snapped.startMs !== reported.startMs || snapped.endMs !== reported.endMs) {
        reportedRef.current = snapped;
        notifyPreview(snapped);
        if (!commitOnFinalize) onChange(snapped);
      }
      return true;
    },
    [commitOnFinalize, fitSpanInViewport, notifyPreview, onChange, resolve, snapSpan],
  );

  /**
   * Runs while the finger sits in an edge zone: travels the rail and credits the
   * travelled distance to the drag, so the span keeps growing even though the
   * finger has stopped moving. Stops itself at either end of the rail.
   */
  const startAutoTravel = useCallback(
    (kind: TimeBandDragKind, direction: -1 | 1, strength: number) => {
      const active = autoTravelRef.current;
      if (autoTimerRef.current && active?.kind === kind && active.direction === direction) {
        active.strength = strength;
        return;
      }
      stopAutoTravel();
      autoTravelRef.current = { kind, direction, strength };
      autoTimerRef.current = setInterval(() => {
        const travel = autoTravelRef.current;
        if (!travel) return;
        // ASK FIRST, THEN MOVE. The rail exists to buy the span room the finger
        // has run out of; if the span cannot change, moving it buys nothing and
        // only slides the whole bar sideways — which is what carried the far
        // grip out of view. Moving and then undoing was worse still: the undo
        // ended the travel, so the next finger sample restarted it, and the rail
        // shuttled back and forth sixty times a second.
        const before = offsetRef.current;
        const room =
          clamp(
            before + travel.direction * MAX_AUTO_TRAVEL_PX * travel.strength,
            0,
            maxOffsetRef.current,
          ) - before;
        // Rail exhausted, or the span is against a limit: idle this tick and
        // keep the timer. NEVER stop from in here — stopping is what produced
        // the restart loop, and the finger may yet turn round. Only leaving the
        // edge zone or lifting ends the travel.
        if (room === 0) return;
        const offered = room / pixelsPerMinuteRef.current;
        const probe = resolve(kind, fingerMinutesRef.current + autoMinutesRef.current + offered);
        const live = liveRef.current;
        // What the span ACTUALLY took, which is less than what was offered on
        // the tick that meets a limit. Moving the rail by the offered step
        // instead put the difference into pure sideways travel: the bar jumped
        // by up to a whole step at the exact moment of contact, which is the
        // bounce. Crediting only what was taken also stops an overshoot from
        // piling up in `autoMinutes`, so reversing out of the limit moves the
        // span on the first pixel instead of first paying off a debt.
        const taken =
          (kind === 'end' ? probe.endMs - live.endMs : probe.startMs - live.startMs) / 60_000;
        if (taken === 0) return;

        autoMinutesRef.current += taken;
        moveRail(before + taken * pixelsPerMinuteRef.current);
        applyDrag(kind);
      }, AUTO_TRAVEL_TICK_MS);
    },
    [applyDrag, moveRail, resolve, stopAutoTravel],
  );

  /** Decide, on every move, whether the rail should travel and how fast. */
  const updateAutoTravel = useCallback(
    (kind: TimeBandDragKind, absoluteX: number) => {
      const { x, width } = viewportRectRef.current;
      if (width <= 0) return;
      const fromLeft = absoluteX - x;
      const fromRight = x + width - absoluteX;

      if (fromRight < EDGE_ZONE) {
        startAutoTravel(kind, 1, travelStrength(fromRight));
      } else if (fromLeft < EDGE_ZONE) {
        startAutoTravel(kind, -1, travelStrength(fromLeft));
      } else {
        stopAutoTravel();
      }
    },
    [startAutoTravel, stopAutoTravel],
  );

  /** Beyond the band's edge the finger stops moving the grip; see
   * GRIP_KEEP_IN_VIEW_PX. */
  const clampFingerX = useCallback((absoluteX: number) => {
    const { x, width } = viewportRectRef.current;
    if (width <= 0) return absoluteX;
    return clamp(absoluteX, x + GRIP_KEEP_IN_VIEW_PX, x + width - GRIP_KEEP_IN_VIEW_PX);
  }, []);

  const measureViewport = useCallback(() => {
    viewportRef.current?.measureInWindow((x, _y, width) => {
      viewportRectRef.current = { x, width };
    });
  }, []);

  /** One factory for all three grips: they differ only in what they resolve to,
   * never in how the drag behaves. `activeOffsetX` lets a vertical swipe fall
   * through to the composer's own ScrollView instead of being swallowed here. */
  const spanGesture = (kind: TimeBandDragKind) =>
    Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
      .onBegin((event) => {
        measureViewport();
        // A settle still in flight would keep changing the scale under the
        // drag, which is a resize nobody asked for whatever is being dragged.
        stopScaleAnimation();
        /**
         * Only RESIZING zooms back in.
         *
         * Moving the span deliberately does not: the zoom is a scale change, so
         * it is a visible resize of a bar whose duration is not changing — which
         * is exactly what a move must never look like. It also widens the bar
         * past the viewport and pushes both ends out of sight, and the ends are
         * the thing you are aiming with while you move it. The precision the
         * zoom buys is worth that trade at a grip, where you are placing one
         * edge to the minute; it is not worth it for a block you are sliding.
         */
        if (kind !== 'move') {
          // The picture eases to the working scale over a moment; the RATE is at
          // the target from the first frame, so a quick opening flick cannot
          // mean more time than the same flick a second later.
          zoomForEditing(kind === 'end' ? liveRef.current.endMs : liveRef.current.startMs);
        }
        // A move therefore converts at whatever scale is on screen — anything
        // else would make the bar travel at a different speed than the finger.
        dragPixelsPerMinuteRef.current =
          kind === 'move'
            ? pixelsPerMinuteRef.current
            : (controlledPixelsPerHour ?? DEFAULT_PX_PER_HOUR) / 60;
        dragBaseRef.current = liveRef.current;
        reportedRef.current = liveRef.current;
        lastFingerXRef.current = clampFingerX(event.absoluteX);
        fingerMinutesRef.current = 0;
        autoMinutesRef.current = 0;
        lastPreviewAtRef.current = 0;
        setDrag(kind);
        onDragKindChange?.(kind);
      })
      .onUpdate((event) => {
        const fingerX = clampFingerX(event.absoluteX);
        fingerMinutesRef.current +=
          (fingerX - lastFingerXRef.current) / dragPixelsPerMinuteRef.current;
        lastFingerXRef.current = fingerX;
        // The pedal reads the RAW position on purpose: pushing further out has
        // to keep meaning "faster" even once the grip has parked at the edge.
        if (!keepSpanVisible) updateAutoTravel(kind, event.absoluteX);
        applyDrag(kind);
      })
      .onFinalize(() => {
        stopAutoTravel();
        fingerMinutesRef.current = 0;
        autoMinutesRef.current = 0;
        setDrag(null);
        onDragKindChange?.(null);
        // The bar lands ON the grid at the end — at most 3.3 dp of travel, so
        // it settles rather than snapping.
        const settled = snapSpan(liveRef.current, kind);
        liveRef.current = settled;
        reportedRef.current = settled;
        setLive(settled);
        notifyPreview(settled, true);
        onChange(settled);
        onRailOffsetCommit?.(offsetRef.current);
        settleScale(settled);
      });

  /** Panning the rail itself — browsing the day without changing the activity. */
  const railGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      panBaseRef.current = offsetRef.current;
    })
    .onUpdate((event) => {
      const requestedOffset = panBaseRef.current - event.translationX;
      if (!keepSpanVisible) {
        moveRail(requestedOffset);
      } else {
        const activeSpan = liveRef.current;
        const left = ((activeSpan.startMs - originMs) / 60_000) * pixelsPerMinuteRef.current;
        const right = ((activeSpan.endMs - originMs) / 60_000) * pixelsPerMinuteRef.current;
        const minOffset = Math.max(0, right + FIT_INSET_PX - viewportWidth);
        const maxVisibleOffset = Math.min(maxOffsetRef.current, left - FIT_INSET_PX);
        moveRail(
          minOffset <= maxVisibleOffset
            ? clamp(requestedOffset, minOffset, maxVisibleOffset)
            : requestedOffset,
        );
      }
      onRailOffsetPreview?.(offsetRef.current);
    })
    .onFinalize(() => {
      onRailOffsetCommit?.(offsetRef.current);
    });

  const railStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -offset.value }] }));

  const spanLeft = xOf(span.startMs);
  // Handles straddle the edges rather than sitting inside, so the visual span
  // stays honest even when a consumer chooses a short minimum duration.
  const spanWidth = Math.max(10, xOf(span.endMs) - spanLeft);
  const handleHitWidth = Math.min(MAX_HANDLE_HIT_WIDTH, Math.max(HANDLE_WIDTH, spanWidth - 2));
  const hourCount = Math.ceil(railMinutes / 60);
  const pastWidth = Math.max(0, xOf(earliestMs));

  return (
    <Animated.View
      ref={viewportRef}
      layout={LinearTransition.duration(220)}
      onLayout={(event) => {
        setViewportWidth(event.nativeEvent.layout.width);
        measureViewport();
      }}
      className="overflow-hidden rounded-2xl border border-white/10"
      style={{ height: bandHeight, backgroundColor: 'rgba(255,255,255,0.045)' }}
    >
      <GestureDetector gesture={railGesture}>
        <Animated.View style={[{ width: contentWidth, height: bandHeight }, railStyle]}>
          {/* Hour grid */}
          {Array.from({ length: hourCount + 1 }, (_, index) => (
            <View
              key={index}
              pointerEvents="none"
              style={{ position: 'absolute', left: index * pixelsPerHour }}
            >
              <View style={[styles.tick, { height: bandHeight - metrics.labelZone }]} />
              {index % labelInterval === 0 ? (
                <Text
                  style={[
                    styles.tickLabel,
                    { fontSize: metrics.labelFont, top: bandHeight - metrics.labelZone },
                  ]}
                >
                  {`${new Date(originMs + index * 3_600_000)
                    .getHours()
                    .toString()
                    .padStart(2, '0')}:00`}
                </Text>
              ) : null}
            </View>
          ))}

          {/* The past is not a choice — show it, do not offer it. */}
          {pastWidth > 0 ? (
            <View pointerEvents="none" style={[styles.past, { width: pastWidth }]} />
          ) : null}

          {/* The span. Handles are SIBLINGS drawn on top, not children: nested
              pan gestures can both activate, which moves and resizes at once.
              In Now-mode the body carries NO move gesture — the start is fixed,
              so sliding the whole span would move a start that cannot move. */}
          {startFixed ? (
            <View
              pointerEvents="none"
              style={[
                styles.span,
                {
                  left: spanLeft,
                  width: spanWidth,
                  bottom: trackBottom,
                  top: trackTop,
                  backgroundColor: `${accent}3d`,
                  borderColor: `${accent}a8`,
                },
              ]}
            >
              {spanLabel && spanWidth >= spanLabelWidth ? (
                <Text
                  numberOfLines={1}
                  style={[styles.spanLabel, { fontSize: metrics.spanFont }]}
                  {...TEXT_FIXED}
                >
                  {spanLabel}
                </Text>
              ) : null}
            </View>
          ) : (
            <GestureDetector gesture={spanGesture('move')}>
              <Animated.View
                accessibilityRole="adjustable"
                accessibilityLabel="Zeitraum verschieben"
                accessibilityValue={{
                  text: `${clockLabel(span.startMs)} bis ${clockLabel(span.endMs)}`,
                }}
                style={[
                  styles.span,
                  {
                    left: spanLeft,
                    width: spanWidth,
                    bottom: trackBottom,
                    top: trackTop,
                    backgroundColor: `${accent}3d`,
                    borderColor: `${accent}a8`,
                  },
                  animated && spanColorStyle,
                ]}
              >
                {spanLabel && spanWidth >= spanLabelWidth ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.spanLabel, { fontSize: metrics.spanFont }]}
                    {...TEXT_FIXED}
                  >
                    {spanLabel}
                  </Text>
                ) : null}
              </Animated.View>
            </GestureDetector>
          )}

          {startFixed ? (
            <View
              pointerEvents="none"
              style={[
                styles.fixedCap,
                { left: spanLeft, bottom: trackBottom, top: trackTop, backgroundColor: accent },
              ]}
            />
          ) : (
            <GestureDetector gesture={spanGesture('start')}>
              <View
                accessibilityRole="adjustable"
                accessibilityLabel="Startzeit"
                accessibilityValue={{ text: clockLabel(span.startMs) }}
                style={[
                  styles.handle,
                  {
                    left: spanLeft - handleHitWidth / 2,
                    width: handleHitWidth,
                    bottom: 0,
                    top: 0,
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.grip,
                    { height: gripHeight },
                    {
                      backgroundColor: accent,
                      transform: [{ translateY: (trackTop - trackBottom) / 2 }],
                    },
                    animated && solidColorStyle,
                  ]}
                />
              </View>
            </GestureDetector>
          )}

          <GestureDetector gesture={spanGesture('end')}>
            <View
              accessibilityRole="adjustable"
              accessibilityLabel="Endzeit"
              accessibilityValue={{ text: clockLabel(span.endMs) }}
              style={[
                styles.handle,
                {
                  left: spanLeft + spanWidth - handleHitWidth / 2,
                  width: handleHitWidth,
                  bottom: 0,
                  top: 0,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.grip,
                  { height: gripHeight },
                  {
                    backgroundColor: accent,
                    transform: [{ translateY: (trackTop - trackBottom) / 2 }],
                  },
                  animated && solidColorStyle,
                ]}
              />
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>

      {/* The rail continues past the viewport, and the gesture only makes sense
          if you believe that. */}
    </Animated.View>
  );
});

export const TimeBand = forwardRef<TimeBandHandle, TimeBandProps>(function TimeBand(props, ref) {
  if (props.keepSpanVisible) return <PlanningTimeBand {...props} ref={ref} />;
  return <StandardTimeBand {...props} ref={ref} />;
});

const styles = StyleSheet.create({
  fixedCap: {
    borderBottomLeftRadius: 10,
    borderTopLeftRadius: 10,
    position: 'absolute',
    width: 3,
  },
  grip: { borderRadius: 2, width: 3 },
  handle: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  past: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  span: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    position: 'absolute',
  },
  spanLabel: {
    color: '#F4F5F7',
    fontFamily: FONT.bold,
    letterSpacing: -0.1,
  },
  tick: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    width: 1,
  },
  tickLabel: {
    // Was 0.28 and bare hour digits — legible as decoration, not as a scale you
    // read a time off. The full "23:00" also removes the momentary "is that an
    // hour or a minute?" that a lone number invites next to a span label that
    // does print minutes.
    color: 'rgba(244,245,247,0.5)',
    // Sits BESIDE its tick, not centred on it. Centred, a 34 dp label overhangs
    // 17 dp each way, so the first and last were always half cut off by the
    // band's own clipping; beside it the leftmost is whole and only a trailing
    // one can lose its last characters, where the hour has already been read.
    // The width must stay EXPLICIT: the label is absolutely positioned inside
    // the 1 dp tick container, so without one it is measured against that and
    // wraps itself out of existence.
    left: 3,
    position: 'absolute',
    width: 40,
  },
});
