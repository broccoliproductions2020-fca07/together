import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { TEXT_CAPPED } from '@/shared/theme';

import type { PickerGeometry, PickerState, RangeEdge, TimeRange } from './core';
import {
  HOUR_MS,
  MINUTE_MS,
  adoptExternalRange,
  applyPointer,
  beginGesture,
  clampRangeIntoLimits,
  createPickerState,
  durationOf,
  edgeTick,
  endGesture,
  ensureRangeVisible,
  fitRange,
  isEdgePhase,
  pxPerHourFromPxPerMs,
  pxPerMsFromPxPerHour,
  resolveRange,
  snapRange,
  snappedRange,
  tickSettle,
  timeToX,
  validateScaleConfiguration,
} from './core';
import type {
  PartialTimeRangePickerTheme,
  TimeRangePickerDensity,
  TimeRangePickerTheme,
} from './theme';
import { handleHeightPx, resolveTimeRangePickerTheme, withAlpha } from './theme';
import { hourTicks, hoursSinceEpoch, labelIntervalFor } from './ticks';

/**
 * A time range picker built as four separated parts: a range engine, a
 * viewport, a gesture state machine (all three in `core/`, pure and testable)
 * and this renderer.
 *
 * ## React is not in the frame path
 *
 * The whole interaction lives in ONE Reanimated shared value and runs on the UI
 * thread — gesture callbacks, the edge loop and every position are worklets, so
 * a drag produces exactly zero React renders. React handles mount, props,
 * theme, external values and the two callbacks, and is told about the value
 * only when the SNAPPED value changes, which is a handful of times a second.
 *
 * ## What the renderer may not assume
 *
 * Nothing about sizes. Handle width and hit width are separate theme values,
 * the height comes from the density preset or an override, and the engines read
 * only `safeInsetPx`, `edgeZonePx` and the hit widths. Restyling cannot break
 * the interaction, which is the point of the split.
 */

/** The scale the picker opens at and works at. Nothing during a gesture ever
 * raises the scale, so this stays the everyday view. */
const DEFAULT_PREFERRED_PX_PER_HOUR = 80;
const DEFAULT_MIN_PX_PER_HOUR = 16;
/**
 * The ceiling, reachable only by the re-zoom after a handle is released.
 *
 * 85% of the usable width is about 248 dp, so at 80 dp/h the target was
 * unreachable below three hours and every further shrink only made the bar
 * smaller — measured: 41%, 21%, 11%, 7% over four halvings, with no zoom at all
 * after the second.
 *
 * On a ~292 dp band this value buys, and costs:
 *
 * | ceiling | context shown | 5-min step | 85% reachable from | 1 h of travel |
 * | ------- | ------------- | ---------- | ------------------ | ------------- |
 * |      80 |       219 min |     6.7 dp |            3 h 06  |   27% of band |
 * |     160 |       110 min |    13.3 dp |            1 h 33  |   55% of band |
 * |     240 |        73 min |      20 dp |              62 min |  82% of band |
 *
 * The last column is the real limit: past ~292 dp/h an hour of adjustment no
 * longer fits in one gesture and every ordinary edit has to go through the edge
 * mechanics. Note also that precision per step does NOT depend on the duration —
 * at any ceiling a five-minute step is the same width whether the range is
 * fifteen minutes or three hours. Below the boundary only the BAR gets shorter,
 * which for a short activity is honest rather than broken.
 *
 * Currently trialling 160: half the precision of 240, but half again as much of
 * the day in view.
 *
 * It is ONE number rather than a separate re-zoom limit on purpose:
 * `ensureRangeVisible` runs on every release before `planReZoom` and clamps to
 * this ceiling, so a lower value here would claw the re-zoom straight back — and
 * on a release that needs no re-zoom it would zoom OUT instead.
 */
const DEFAULT_MAX_PX_PER_HOUR = 160;
/** How much of the usable width an initial fit lets the range claim. */
const FIT_TARGET_FILL = 0.9;
/** Calibrated as time per second, never pixels: the scale changes under an edge
 * expand, so a pixel speed would silently accelerate as the picker zooms out.
 * Squared ramp, so this ceiling only affects the far end of the travel. */
const EDGE_MAX_SPEED_MS_PER_SECOND = 7 * HOUR_MS;
/** ~4 minutes per second at the very entrance — a creep, not a jump. */
const EDGE_MIN_STRENGTH = 0.01;
/** Hours rendered beyond each side, so panning does not re-cut the list often. */
/** How many of this picker's own reported values to remember. A drag reports a
 * few times a second and a parent lags by a fraction of one, so a couple of
 * dozen covers the window generously. */
const REPORTED_HISTORY = 24;
const TICK_OVERSCAN_PX = 240;
const MAX_TICK_NODES = 160;
/** Pixels of room across which the duration label fades in, so it never pops. */
const RANGE_LABEL_FADE_PX = 18;

export interface TimeRangeValue {
  start: Date;
  end: Date;
}

export interface HandleSlotState {
  edge: 'start' | 'end';
  /** True while this handle is the one being dragged. */
  active: boolean;
  height: number;
}

export interface TimeRangePickerProps {
  value: TimeRangeValue;
  /** Earliest selectable time. Defaults to the value's own start, so a picker
   * without a `min` never fights a range it was given. */
  min?: Date;
  max?: Date;

  stepMinutes?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;

  /** Pointer travel past the safe edge that reaches full edge speed. */
  edgeZonePx?: number;
  safeInsetPx?: number;

  density?: TimeRangePickerDensity;
  accent?: string;
  /**
   * The two ends of a colour cross-fade, driven by `accentProgress`.
   *
   * Supplied together, the range interpolates between them on the UI thread
   * instead of hard-swapping when `accent` changes. That matters wherever the
   * drag itself is what changes the meaning of the range — the colour then has
   * to travel with the finger rather than snap once the state lands.
   *
   * Six-digit colours only: eight-digit hex is parsed inconsistently by
   * `interpolateColor`, and a silently opaque fill would cover the hour marks.
   */
  accentSequence?: readonly [string, string];
  accentProgress?: SharedValue<number>;
  theme?: PartialTimeRangePickerTheme;
  style?: StyleProp<ViewStyle>;

  formatTime?: (date: Date) => string;
  formatDuration?: (durationMs: number) => string;

  renderStartHandle?: (state: HandleSlotState) => ReactNode;
  renderEndHandle?: (state: HandleSlotState) => ReactNode;
  renderRangeLabel?: (range: TimeRangeValue) => ReactNode;
  renderTickLabel?: (date: Date) => ReactNode;
  /** Replaces the bar's visual entirely. Position and size stay engine-owned —
   * the slot fills a wrapper the picker places, it does not place itself. */
  renderRange?: (range: TimeRangeValue) => ReactNode;

  /**
   * The edge pedal's calibration, in TIME per second — never pixels, because the
   * scale changes under an edge expand. Defaults to ~4 min/s at the entrance and
   * 7 h/s hard against the edge, over a squared ramp.
   */
  edgeSpeed?: { maxMsPerSecond?: number; minStrength?: number };

  disabled?: boolean;
  accessibilityLabelStart?: string;
  accessibilityLabelEnd?: string;
  testID?: string;

  onChange?: (range: TimeRangeValue) => void;
  onChangeEnd?: (range: TimeRangeValue) => void;
}

function defaultFormatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function defaultFormatDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / MINUTE_MS));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} Min`;
  if (minutes === 0) return `${hours} Std`;
  return `${hours} Std ${minutes} Min`;
}

export function TimeRangePicker({
  value,
  min,
  max,
  stepMinutes = 5,
  minDurationMinutes = 15,
  maxDurationMinutes = 720,
  edgeZonePx = 52,
  safeInsetPx,
  density = 'default',
  accent = '#41C08D',
  accentSequence,
  accentProgress,
  theme: themeOverride,
  style,
  formatTime = defaultFormatTime,
  formatDuration = defaultFormatDuration,
  renderStartHandle,
  renderEndHandle,
  renderRangeLabel,
  renderTickLabel,
  renderRange,
  edgeSpeed,
  disabled = false,
  accessibilityLabelStart = 'Startzeit',
  accessibilityLabelEnd = 'Endzeit',
  testID,
  onChange,
  onChangeEnd,
}: TimeRangePickerProps) {
  const theme = useMemo(
    () => resolveTimeRangePickerTheme(density, accent, themeOverride),
    [density, accent, themeOverride],
  );
  const insetPx = safeInsetPx ?? theme.interaction.safeInsetPx;

  const [width, setWidth] = useState(0);

  /**
   * The grid anchor, frozen at mount.
   *
   * Snapping is relative to it, so a moving anchor would quietly re-round every
   * value; the whole hour containing the first start keeps five-minute steps
   * landing on :00, :05 and so on.
   */
  const snapOriginRef = useRef(Math.floor(value.start.getTime() / HOUR_MS) * HOUR_MS);

  // Milliseconds, not Dates, from here on: a Date is compared by identity, so a
  // parent that rebuilds `new Date(...)` on every render would rebuild the
  // geometry — and with it the gesture — on every render too.
  const valueStartMs = value.start.getTime();
  const valueEndMs = value.end.getTime();
  const minMs = min ? min.getTime() : undefined;
  const maxMs = max ? max.getTime() : undefined;

  const geometry = useMemo<PickerGeometry>(() => {
    const minTimeMs = minMs ?? valueStartMs;
    return {
      bounds: { width, safeInsetPx: insetPx },
      limits: {
        minTimeMs,
        maxTimeMs: maxMs ?? Number.POSITIVE_INFINITY,
        minDurationMs: minDurationMinutes * MINUTE_MS,
        maxDurationMs: maxDurationMinutes * MINUTE_MS,
      },
      scale: {
        minPxPerMs: pxPerMsFromPxPerHour(DEFAULT_MIN_PX_PER_HOUR),
        maxPxPerMs: pxPerMsFromPxPerHour(DEFAULT_MAX_PX_PER_HOUR),
      },
      edge: {
        // Measured from the SAFE edge, so the pedal starts at exactly zero the
        // moment the handle pins. The default lands full speed on the picker's
        // physical edge, which is the furthest a finger can reliably reach.
        travelPx: Math.max(1, edgeZonePx - insetPx),
        maxSpeedMsPerSecond: edgeSpeed?.maxMsPerSecond ?? EDGE_MAX_SPEED_MS_PER_SECOND,
        minStrength: edgeSpeed?.minStrength ?? EDGE_MIN_STRENGTH,
      },
      stepMs: stepMinutes * MINUTE_MS,
      snapOriginMs: snapOriginRef.current,
    };
    // The range itself is deliberately not a dependency: it lives in the shared
    // state, not in the geometry. Only the `min` fallback reads the value.
  }, [
    width,
    insetPx,
    minMs,
    maxMs,
    valueStartMs,
    minDurationMinutes,
    maxDurationMinutes,
    edgeZonePx,
    stepMinutes,
    edgeSpeed?.maxMsPerSecond,
    edgeSpeed?.minStrength,
  ]);

  const initialRange = useMemo<TimeRange>(
    () => ({ startMs: value.start.getTime(), endMs: value.end.getTime() }),
    // Only ever read for the very first state; later changes go through the
    // controlled-value effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const state = useSharedValue<PickerState>(
    createPickerState(initialRange, { startMs: initialRange.startMs, pxPerMs: pxPerMsFromPxPerHour(DEFAULT_PREFERRED_PX_PER_HOUR) }),
  );
  const geo = useSharedValue<PickerGeometry>(geometry);
  const lastReported = useSharedValue<TimeRange>(initialRange);
  const gestureActive = useSharedValue(false);
  /** What the touch landed on, decided at touch-down and consumed at
   * activation. 0 = nothing, 1 = start, 2 = end, 3 = range. */
  const pendingKind = useSharedValue<0 | 1 | 2 | 3>(0);
  /** Where the finger touched down. The grab offset is frozen against THIS, not
   * against wherever the pan happened to activate — see `beginGesture`. */
  const pendingPointerX = useSharedValue(0);
  const activeEdge = useSharedValue<0 | 1 | 2>(0);
  const labelInterval = useSharedValue(1);
  const renderedWindow = useSharedValue({ fromMs: 0, toMs: 0 });
  const didInit = useRef(false);

  /** Snapped mirror for the label and the accessibility values. Deliberately
   * NOT in the frame path: it changes at most a few times a second, when the
   * reported value changes — the same moment `onChange` fires. */
  const [snapped, setSnapped] = useState<TimeRange>(initialRange);

  /**
   * The values this picker has reported, newest last.
   *
   * A controlled parent lags the gesture by frames, so an echo landing after
   * pointer-up can carry a value from mid-drag — measured 50 minutes out,
   * corrected 200 ms later. Adopting it re-runs `ensureRangeVisible`, which can
   * only ever LOWER the scale to make the longer range fit; the correcting echo
   * then restores the range but not the zoom, and nothing puts it back because
   * the re-zoom only runs on release. Recognising our own superseded output is
   * what stops a late echo from undoing the camera that was just set.
   */
  const reportedRef = useRef<string[]>([]);
  const rememberReported = useCallback((startMs: number, endMs: number) => {
    const key = `${startMs}:${endMs}`;
    const history = reportedRef.current;
    if (history[history.length - 1] === key) return;
    history.push(key);
    if (history.length > REPORTED_HISTORY) history.shift();
  }, []);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onChangeEndRef = useRef(onChangeEnd);
  onChangeEndRef.current = onChangeEnd;

  const emitChange = useCallback((startMs: number, endMs: number) => {
    rememberReported(startMs, endMs);
    setSnapped({ startMs, endMs });
    onChangeRef.current?.({ start: new Date(startMs), end: new Date(endMs) });
  }, [rememberReported]);

  const emitChangeEnd = useCallback((startMs: number, endMs: number) => {
    rememberReported(startMs, endMs);
    setSnapped({ startMs, endMs });
    onChangeEndRef.current?.({ start: new Date(startMs), end: new Date(endMs) });
  }, [rememberReported]);

  useEffect(() => {
    geo.value = geometry;
    if (width <= 0) return;

    if (!didInit.current) {
      didInit.current = true;
      const clamped = clampRangeIntoLimits(state.value.range, geometry.limits);
      state.value = createPickerState(
        clamped,
        fitRange(
          clamped,
          geometry.bounds,
          geometry.scale,
          pxPerMsFromPxPerHour(DEFAULT_PREFERRED_PX_PER_HOUR),
          FIT_TARGET_FILL,
        ),
      );
      lastReported.value = clamped;
      setSnapped(clamped);
      return;
    }

    // A resize or a limits change repairs the camera only where it has become
    // invalid. A viewport the user left behind is one they chose.
    const current = state.value;
    const repaired = ensureRangeVisible(
      current.viewport,
      current.range,
      geometry.bounds,
      geometry.scale,
    );
    if (repaired !== current.viewport) state.value = { ...current, viewport: repaired };
  }, [geometry, width, geo, state, lastReported]);

  useEffect(() => {
    if (!__DEV__ || width <= 0) return;
    const verdict = validateScaleConfiguration(
      geometry.bounds,
      geometry.scale,
      geometry.limits.maxDurationMs,
    );
    if (verdict.ok) return;
    console.warn(
      `[TimeRangePicker] ${Math.round(width)}px is too narrow to show ${
        maxDurationMinutes / 60
      }h at ${DEFAULT_MIN_PX_PER_HOUR}dp/h — it needs about ${Math.ceil(
        verdict.requiredWidth,
      )}px. Both handles stay visible; the scale floor drops to ${pxPerHourFromPxPerMs(
        verdict.effectiveMinPxPerMs,
      ).toFixed(1)}dp/h instead.`,
    );
  }, [geometry, width, maxDurationMinutes]);

  /**
   * Controlled value.
   *
   * A parent that re-renders with exactly what was just reported must not
   * disturb an active gesture — that echo is the normal controlled cycle. A
   * genuinely different value takes over, ends the gesture and adopts, so there
   * is never a moment with two owners of the truth.
   */
  useEffect(() => {
    // While a finger is down the gesture OWNS the value. Nothing external may
    // land — not even an echo that looks different.
    //
    // This is not defensive coding, it is the whole controlled contract. The
    // component reports at snap cadence during a drag; the parent turns that
    // into state and hands a value back, and that round trip is asynchronous and
    // may transform what it received. Adopting such an echo cancels the gesture
    // (`adoptExternalRange` clears the snapshot), after which every further
    // pointer sample is ignored and the handle sits still while the finger keeps
    // moving. Measured on device: the range followed for six minutes, the echo
    // arrived 323 ms in, the value snapped back to where the drag started and
    // never moved again. Small drags survived because they only needed the one
    // step before the echo killed the gesture — which is exactly why this read
    // as "slow works, fast does not".
    // ...and the same holds for the settle that finishes it. The parent lags the
    // gesture by frames, so the echo landing right after pointer-up can carry a
    // value from mid-drag — measured 50 minutes out, corrected 200 ms later.
    // Adopting it would clear the re-zoom before its first frame ever ran, which
    // is exactly what made the release do nothing.
    if (gestureActive.value || state.value.settle) return;

    // A value this picker itself produced and has already moved past. Not new
    // information — an echo in flight — and adopting it costs the camera.
    if (reportedRef.current.includes(`${valueStartMs}:${valueEndMs}`)) return;

    const incoming: TimeRange = { startMs: valueStartMs, endMs: valueEndMs };
    if (
      incoming.startMs === lastReported.value.startMs &&
      incoming.endMs === lastReported.value.endMs
    ) {
      return;
    }
    const clamped = clampRangeIntoLimits(incoming, geo.value.limits);
    rememberReported(clamped.startMs, clamped.endMs);
    lastReported.value = clamped;
    setSnapped(clamped);
    state.value = adoptExternalRange(state.value, clamped, geo.value);
  }, [valueStartMs, valueEndMs, geo, lastReported, state, gestureActive, rememberReported]);

  const hitWidths = useMemo(
    () => ({ start: theme.startHandle.hitWidth, end: theme.endHandle.hitWidth }),
    [theme.startHandle.hitWidth, theme.endHandle.hitWidth],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Inherited from the band this replaces: the picker claims horizontal
        // intent and lets a vertical drag fall through to the surrounding
        // scroll view, which is the React Native equivalent of touch-action.
        .activeOffsetX([-6, 6])
        .failOffsetY([-12, 12])
        // One finger owns the range. Without this a second touch would average
        // into the reported position and drag the handle somewhere neither
        // finger is pointing.
        .maxPointers(1)
        .enabled(!disabled)
        // The hit test runs at touch-down so the target is decided before the
        // finger has moved, but ownership only begins at ACTIVATION: onFinalize
        // fires even for a gesture that never activated, so claiming it here
        // would report a change for every tap and every vertical scroll across
        // the picker.
        .onBegin((event) => {
          'worklet';
          const current = state.value;
          const startHandleX = timeToX(current.viewport, current.range.startMs);
          const endHandleX = timeToX(current.viewport, current.range.endMs);
          const startDistance = Math.abs(event.x - startHandleX);
          const endDistance = Math.abs(event.x - endHandleX);

          // Handle beats range beats track; between the two handles the nearer
          // one wins, so an overlap at the minimum duration is never ambiguous.
          let kind: RangeEdge | null = null;
          if (startDistance <= hitWidths.start / 2 || endDistance <= hitWidths.end / 2) {
            kind = startDistance <= endDistance ? 'start' : 'end';
          } else if (event.x > startHandleX && event.x < endHandleX) {
            kind = 'range';
          }
          pendingKind.value = kind === 'start' ? 1 : kind === 'end' ? 2 : kind === 'range' ? 3 : 0;
          pendingPointerX.value = event.x;
        })
        .onStart((event) => {
          'worklet';
          const pending = pendingKind.value;
          if (pending === 0) return;
          const kind: RangeEdge = pending === 1 ? 'start' : pending === 2 ? 'end' : 'range';
          gestureActive.value = true;
          activeEdge.value = pending === 3 ? 0 : (pending as 1 | 2);
          // Anchor on the touch-down position, then catch up to where the finger
          // actually is now. Everything travelled during the activation slop
          // counts — on a fast flick that is most of the gesture.
          state.value = beginGesture(state.value, kind, pendingPointerX.value, geo.value);
          state.value = applyPointer(state.value, event.x, geo.value);
          const started = snappedRange(state.value, geo.value);
          if (
            started.startMs !== lastReported.value.startMs ||
            started.endMs !== lastReported.value.endMs
          ) {
            lastReported.value = started;
            runOnJS(emitChange)(started.startMs, started.endMs);
          }
        })
        .onUpdate((event) => {
          'worklet';
          if (!gestureActive.value) return;
          // Nothing may raise the scale while a finger is down; the camera only
          // ever gives way to edge expand here. The re-zoom happens on release.
          state.value = applyPointer(state.value, event.x, geo.value);
          const next = snappedRange(state.value, geo.value);
          if (
            next.startMs !== lastReported.value.startMs ||
            next.endMs !== lastReported.value.endMs
          ) {
            lastReported.value = next;
            runOnJS(emitChange)(next.startMs, next.endMs);
          }
        })
        .onFinalize(() => {
          'worklet';
          pendingKind.value = 0;
          if (!gestureActive.value) return;
          gestureActive.value = false;
          activeEdge.value = 0;
          state.value = endGesture(state.value, geo.value);
          const final = state.value.range;
          lastReported.value = final;
          runOnJS(emitChangeEnd)(final.startMs, final.endMs);
        }),
    [
      disabled,
      hitWidths,
      state,
      geo,
      gestureActive,
      pendingKind,
      pendingPointerX,
      activeEdge,
      lastReported,
      emitChange,
      emitChangeEnd,
    ],
  );

  /**
   * The edge loop.
   *
   * Runs on the UI thread and only while an edge phase is active — it is armed
   * and disarmed by a reaction rather than polling every frame of the picker's
   * life. A frame that buys nothing still ticks: leaving the zone or lifting
   * the finger is what ends it, never hitting a limit.
   */
  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    'worklet';
    const deltaMs = Math.min(50, timeSincePreviousFrame ?? 16);
    // The settle only moves the camera, so it reports nothing and shares the
    // loop rather than needing one of its own.
    if (state.value.settle) {
      state.value = tickSettle(state.value, deltaMs);
      return;
    }
    const deltaSeconds = deltaMs / 1000;
    state.value = edgeTick(state.value, deltaSeconds, geo.value);
    const next = snappedRange(state.value, geo.value);
    if (next.startMs !== lastReported.value.startMs || next.endMs !== lastReported.value.endMs) {
      lastReported.value = next;
      runOnJS(emitChange)(next.startMs, next.endMs);
    }
  }, false);

  /**
   * Which handle is under the finger, mirrored to React for the render slots.
   *
   * Two renders per gesture (start and end), never per frame — a custom handle
   * has to be able to show that it is being dragged, and that is a prop, not a
   * shared value the slot could read.
   */
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);
  useAnimatedReaction(
    () => activeEdge.value,
    (now, previous) => {
      'worklet';
      if (now === previous) return;
      runOnJS(setActiveHandle)(now === 1 ? 'start' : now === 2 ? 'end' : null);
    },
    [],
  );

  const [edgeRunning, setEdgeRunning] = useState(false);
  useAnimatedReaction(
    () => isEdgePhase(state.value.phase) || state.value.settle !== null,
    (now, previous) => {
      'worklet';
      if (now !== previous) runOnJS(setEdgeRunning)(now);
    },
    [],
  );
  useEffect(() => {
    frame.setActive(edgeRunning);
    return () => frame.setActive(false);
  }, [edgeRunning, frame]);

  // Label density follows the scale on the UI thread, so an edge expand never
  // has to ask React which hours may still speak.
  useAnimatedReaction(
    () => pxPerHourFromPxPerMs(state.value.viewport.pxPerMs),
    (pxPerHour) => {
      'worklet';
      labelInterval.value = labelIntervalFor(labelInterval.value, pxPerHour);
    },
    [],
  );

  const [ticks, setTicks] = useState<number[]>([]);
  const cutTickWindow = useCallback(
    (fromMs: number, toMs: number) => {
      const span = Math.max(HOUR_MS, toMs - fromMs);
      const padded = { fromMs: fromMs - span / 2, toMs: toMs + span / 2 };
      renderedWindow.value = padded;
      setTicks(hourTicks(padded.fromMs, padded.toMs, MAX_TICK_NODES));
    },
    [renderedWindow],
  );

  useAnimatedReaction(
    () => {
      'worklet';
      const viewport = state.value.viewport;
      const bounds = geo.value.bounds;
      if (bounds.width <= 0) return null;
      return {
        fromMs: viewport.startMs - TICK_OVERSCAN_PX / viewport.pxPerMs,
        toMs: viewport.startMs + (bounds.width + TICK_OVERSCAN_PX) / viewport.pxPerMs,
      };
    },
    (needed) => {
      'worklet';
      if (!needed) return;
      const have = renderedWindow.value;
      if (needed.fromMs < have.fromMs || needed.toMs > have.toMs) {
        runOnJS(cutTickWindow)(needed.fromMs, needed.toMs);
      }
    },
    [],
  );

  const trackHeight = theme.container.height - theme.ticks.bottom;
  const barTop = Math.max(0, Math.round((trackHeight - theme.range.height) / 2));
  const startHandleHeight = handleHeightPx(theme.startHandle, theme.range.height);
  const endHandleHeight = handleHeightPx(theme.endHandle, theme.range.height);

  /** Stand-ins so the hooks below stay unconditional when a consumer drives no
   * cross-fade: a static pair interpolates to the theme colour at every point. */
  const ownProgress = useSharedValue(0);
  const progress = accentProgress ?? ownProgress;
  // The fill opacity is folded into the COLOUR rather than set on the view: an
  // opacity on the bar would fade its own duration label with it.
  const sequence = useMemo<readonly [string, string]>(() => {
    const ends = accentSequence ?? [theme.range.color, theme.range.color];
    return [withAlpha(ends[0], theme.range.fillOpacity), withAlpha(ends[1], theme.range.fillOpacity)];
  }, [accentSequence, theme.range.color, theme.range.fillOpacity]);

  /** The border travels with the fill. With a visible edge a static border would
   * snap to the new mode while the fill was still crossing — the one frame the
   * cross-fade exists to avoid. */
  const borderSequence = useMemo<readonly [string, string]>(() => {
    const ends = accentSequence ?? [theme.range.borderColor, theme.range.borderColor];
    return [
      withAlpha(ends[0], theme.range.borderOpacity),
      withAlpha(ends[1], theme.range.borderOpacity),
    ];
  }, [accentSequence, theme.range.borderColor, theme.range.borderOpacity]);

  const rangeStyle = useAnimatedStyle(() => {
    const { viewport, range } = state.value;
    return {
      width: Math.max(0, durationOf(range) * viewport.pxPerMs),
      transform: [{ translateX: timeToX(viewport, range.startMs) }],
    };
  });

  const rangeFillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [sequence[0], sequence[1]]),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [borderSequence[0], borderSequence[1]],
    ),
  }));

  const startHandleStyle = useAnimatedStyle(() => {
    const { viewport, range } = state.value;
    return {
      transform: [{ translateX: timeToX(viewport, range.startMs) - theme.startHandle.width / 2 }],
    };
  });

  const endHandleStyle = useAnimatedStyle(() => {
    const { viewport, range } = state.value;
    return {
      transform: [{ translateX: timeToX(viewport, range.endMs) - theme.endHandle.width / 2 }],
    };
  });

  /**
   * The duration only speaks when the bar has room for it.
   *
   * A hard cut would pop on every frame near the threshold, so it fades across
   * the last few pixels of room instead. Below it the label is simply absent —
   * a clipped time reads as a rendering fault, and the value is stated outside
   * the picker anyway.
   */
  const rangeLabelStyle = useAnimatedStyle(() => {
    const { viewport, range } = state.value;
    const barWidth = durationOf(range) * viewport.pxPerMs;
    const minWidth = theme.rangeLabel.fontSize * 8.2;
    return { opacity: Math.max(0, Math.min(1, (barWidth - minWidth) / RANGE_LABEL_FADE_PX)) };
  });

  const pastStyle = useAnimatedStyle(() => {
    const { viewport } = state.value;
    const limit = geo.value.limits.minTimeMs;
    const edge = timeToX(viewport, limit);
    return { width: Math.max(0, Math.min(geo.value.bounds.width, edge)) };
  });

  const durationText = formatDuration(snapped.endMs - snapped.startMs);
  const rangeValue: TimeRangeValue = useMemo(
    () => ({ start: new Date(snapped.startMs), end: new Date(snapped.endMs) }),
    [snapped.startMs, snapped.endMs],
  );

  const adjust = useCallback(
    (edge: 'start' | 'end', steps: number) => {
      const geometryNow = geo.value;
      const current = state.value;
      const target =
        (edge === 'end' ? current.range.endMs : current.range.startMs) +
        steps * geometryNow.stepMs;
      const next = snapRange(
        resolveRange(current.range, edge, target, geometryNow.limits),
        edge,
        geometryNow.stepMs,
        geometryNow.snapOriginMs,
        geometryNow.limits,
      );
      state.value = {
        ...current,
        range: next,
        viewport: ensureRangeVisible(
          current.viewport,
          next,
          geometryNow.bounds,
          geometryNow.scale,
        ),
      };
      lastReported.value = next;
      emitChange(next.startMs, next.endMs);
      onChangeEndRef.current?.({ start: new Date(next.startMs), end: new Date(next.endMs) });
    },
    [geo, state, lastReported, emitChange],
  );

  return (
    <GestureDetector gesture={pan}>
      <View
        testID={testID}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[
          styles.container,
          {
            height: theme.container.height,
            borderRadius: theme.container.radius,
            backgroundColor: theme.container.background,
            borderColor: theme.container.borderColor,
            borderWidth: theme.container.borderWidth,
            borderStyle: theme.container.borderStyle,
            paddingHorizontal: theme.container.paddingHorizontal,
            paddingVertical: theme.container.paddingVertical,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.past,
            { backgroundColor: theme.past.color, opacity: theme.past.opacity },
            pastStyle,
          ]}
        />

        {ticks.map((tickMs) => (
          <Tick
            key={tickMs}
            tickMs={tickMs}
            state={state}
            labelInterval={labelInterval}
            theme={theme}
            formatTime={formatTime}
            renderTickLabel={renderTickLabel}
          />
        ))}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.range,
            { top: barTop, height: theme.range.height, borderRadius: theme.range.radius },
            rangeStyle,
          ]}
        >
          {renderRange ? (
            <View style={StyleSheet.absoluteFill}>{renderRange(rangeValue)}</View>
          ) : (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: theme.range.radius,
                  borderWidth: theme.range.borderWidth,
                },
                rangeFillStyle,
              ]}
            />
          )}
          <Animated.View style={rangeLabelStyle}>
            {renderRangeLabel ? (
              renderRangeLabel(rangeValue)
            ) : (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                allowFontScaling={TEXT_CAPPED.allowFontScaling}
                style={{
                  color: theme.rangeLabel.color,
                  fontFamily: theme.rangeLabel.fontFamily,
                  fontSize: theme.rangeLabel.fontSize,
                }}
              >
                {durationText}
              </Text>
            )}
          </Animated.View>
        </Animated.View>

        <Animated.View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabelStart}
          accessibilityValue={{ text: formatTime(rangeValue.start) }}
          accessibilityActions={ACCESSIBILITY_ACTIONS}
          onAccessibilityAction={(event) =>
            adjust('start', event.nativeEvent.actionName === 'increment' ? 1 : -1)
          }
          style={[styles.handleHit, { top: barTop, width: theme.startHandle.hitWidth, marginLeft: -theme.startHandle.hitWidth / 2 + theme.startHandle.width / 2, height: theme.range.height }, startHandleStyle]}
        >
          {renderStartHandle ? (
            renderStartHandle({ edge: 'start', active: activeHandle === 'start', height: startHandleHeight })
          ) : (
            <View
              style={{
                width: theme.startHandle.width,
                height: startHandleHeight,
                borderRadius: theme.startHandle.radius,
                backgroundColor: theme.startHandle.color,
                borderColor: theme.startHandle.borderColor,
                borderWidth: theme.startHandle.borderWidth,
              }}
            />
          )}
        </Animated.View>

        <Animated.View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabelEnd}
          accessibilityValue={{ text: formatTime(rangeValue.end) }}
          accessibilityActions={ACCESSIBILITY_ACTIONS}
          onAccessibilityAction={(event) =>
            adjust('end', event.nativeEvent.actionName === 'increment' ? 1 : -1)
          }
          style={[styles.handleHit, { top: barTop, width: theme.endHandle.hitWidth, marginLeft: -theme.endHandle.hitWidth / 2 + theme.endHandle.width / 2, height: theme.range.height }, endHandleStyle]}
        >
          {renderEndHandle ? (
            renderEndHandle({ edge: 'end', active: activeHandle === 'end', height: endHandleHeight })
          ) : (
            <View
              style={{
                width: theme.endHandle.width,
                height: endHandleHeight,
                borderRadius: theme.endHandle.radius,
                backgroundColor: theme.endHandle.color,
                borderColor: theme.endHandle.borderColor,
                borderWidth: theme.endHandle.borderWidth,
              }}
            />
          )}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const ACCESSIBILITY_ACTIONS = [{ name: 'increment' as const }, { name: 'decrement' as const }];

interface TickProps {
  tickMs: number;
  state: SharedValue<PickerState>;
  labelInterval: SharedValue<number>;
  theme: TimeRangePickerTheme;
  formatTime: (date: Date) => string;
  renderTickLabel?: (date: Date) => ReactNode;
}

/**
 * One hour mark, placed by a worklet from its OWN time.
 *
 * Because each node knows the moment it stands for, panning and zooming need no
 * React work at all — the list is only re-cut when the camera leaves the hours
 * it covers. The label fades in and out from the shared interval instead of
 * being added and removed, which is what keeps a changing scale from
 * re-rendering the axis.
 */
function Tick({ tickMs, state, labelInterval, theme, formatTime, renderTickLabel }: TickProps) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: timeToX(state.value.viewport, tickMs) }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: hoursSinceEpoch(tickMs) % labelInterval.value === 0 ? 1 : 0,
  }));
  const date = useMemo(() => new Date(tickMs), [tickMs]);

  return (
    <Animated.View pointerEvents="none" style={[styles.tick, style]}>
      <View
        style={{
          width: theme.ticks.width,
          height: theme.ticks.height,
          backgroundColor: theme.ticks.color,
          position: 'absolute',
          bottom: theme.ticks.bottom,
        }}
      />
      <Animated.View style={[styles.tickLabel, { bottom: theme.labels.bottom }, labelStyle]}>
        {renderTickLabel ? (
          renderTickLabel(date)
        ) : (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
            allowFontScaling={TEXT_CAPPED.allowFontScaling}
            style={{
              color: theme.labels.color,
              fontFamily: theme.labels.fontFamily,
              fontSize: theme.labels.fontSize,
              textAlign: 'center',
            }}
          >
            {formatTime(date)}
          </Text>
        )}
      </Animated.View>
    </Animated.View>
  );
}

/** The label is absolutely positioned inside a 1 px container, so it needs an
 * explicit width — measured against its parent it would wrap itself away. */
const TICK_LABEL_WIDTH = 40;

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden', justifyContent: 'flex-start' },
  past: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  tick: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 1 },
  tickLabel: {
    position: 'absolute',
    width: TICK_LABEL_WIDTH,
    left: -TICK_LABEL_WIDTH / 2,
    alignItems: 'center',
  },
  range: { position: 'absolute', left: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  handleHit: { position: 'absolute', left: 0, alignItems: 'center', justifyContent: 'center' },
});
