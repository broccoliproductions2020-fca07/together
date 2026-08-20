import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  LinearTransition,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FONT, TEXT_FIXED } from '@/shared/theme';

import {
  TIME_BAND_FIT_INSET_PX,
  TIME_BAND_FIT_TARGET_FILL,
  TIME_BAND_MAX_DURATION_MINUTES,
  TIME_BAND_MIN_DURATION_MINUTES,
  TIME_BAND_SNAP_MINUTES,
  TIME_BAND_SPAN_LABEL_FADE,
  timeBandLabelInterval,
  timeBandMetrics,
} from './timeBandGeometry';

import type {
  LinkedTimeBandSync,
  Span,
  TimeBandDragKind,
  TimeBandHandle,
  TimeBandProps,
} from './TimeBand';

const DEFAULT_PX_PER_HOUR = 80;
const FIT_INSET_PX = TIME_BAND_FIT_INSET_PX;
const FIT_TARGET_FILL = TIME_BAND_FIT_TARGET_FILL;
const SNAP_MINUTES = TIME_BAND_SNAP_MINUTES;
const DEFAULT_MIN_DURATION_MINUTES = TIME_BAND_MIN_DURATION_MINUTES;
const MAX_DURATION_MINUTES = TIME_BAND_MAX_DURATION_MINUTES;
const HANDLE_HIT_SIZE = 44;

const IDLE = 0;
const MOVE = 2;
const START = 3;
const END = 4;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

function overviewViewport(
  width: number,
  startMinutes: number,
  endMinutes: number,
  currentOffset: number,
) {
  'worklet';
  const defaultPixelsPerMinute = DEFAULT_PX_PER_HOUR / 60;
  if (width <= 0) {
    return { offset: currentOffset, pixelsPerMinute: defaultPixelsPerMinute };
  }

  const durationMinutes = Math.max(1, endMinutes - startMinutes);
  const availableWidth = Math.max(1, (width - FIT_INSET_PX * 2) * FIT_TARGET_FILL);
  const pixelsPerMinute = Math.min(defaultPixelsPerMinute, availableWidth / durationMinutes);
  const left = startMinutes * pixelsPerMinute;
  const right = endMinutes * pixelsPerMinute;
  const minOffset = right + FIT_INSET_PX - width;
  const maxOffset = left - FIT_INSET_PX;
  const offset = clamp(currentOffset, minOffset, maxOffset);

  return { offset, pixelsPerMinute };
}

function clockLabel(ms: number): string {
  const date = new Date(ms);
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function minutesFrom(originMs: number, ms: number): number {
  return (ms - originMs) / 60_000;
}

function spanFromMinutes(originMs: number, startMinutes: number, endMinutes: number): Span {
  'worklet';
  return {
    startMs: originMs + startMinutes * 60_000,
    endMs: originMs + endMinutes * 60_000,
  };
}

function dragKindFor(code: number): TimeBandDragKind | null {
  if (code === MOVE) return 'move';
  if (code === START) return 'start';
  if (code === END) return 'end';
  return null;
}

function HourTick({
  index,
  originMs,
  bandHeight,
  labelZone,
  labelFont,
  labelInterval,
}: {
  index: number;
  originMs: number;
  bandHeight: number;
  labelZone: number;
  labelFont: number;
  labelInterval: SharedValue<number>;
}) {
  const dayOffset = Math.floor(index / 24);
  const hourLabel = new Date(originMs + index * 3_600_000).getHours().toString().padStart(2, '0');
  const labelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(index % labelInterval.value === 0 ? 1 : 0, { duration: 120 }),
  }));

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: index * DEFAULT_PX_PER_HOUR }}>
      <View style={[styles.tick, { height: bandHeight - labelZone }]} />
      <Animated.Text
        style={[styles.tickLabel, labelStyle, { fontSize: labelFont, top: bandHeight - labelZone }]}
      >
        {`${hourLabel}${dayOffset > 0 ? `+${dayOffset}` : ''}`}
      </Animated.Text>
    </View>
  );
}

interface PlanningTimeBandProps extends TimeBandProps {
  linkedSync?: LinkedTimeBandSync;
}

export const PlanningTimeBand = forwardRef<TimeBandHandle, PlanningTimeBandProps>(
  function PlanningTimeBand(
    {
      startMs,
      endMs,
      originMs,
      railMinutes,
      accent,
      startFixed,
      nowMs,
      minDurationMinutes = DEFAULT_MIN_DURATION_MINUTES,
      onPreviewChange,
      onLinkedPreviewChange,
      onDragKindChange,
      railOffset,
      onRailOffsetCommit,
      density = 'regular',
      spanLabel,
      linkedSync,
      onChange,
    },
    ref,
  ) {
    const metrics = timeBandMetrics(density);
    const { bandHeight, gripHeight, trackTop, trackBottom } = metrics;
    const initialStartMinutes = minutesFrom(originMs, startMs);
    const initialEndMinutes = minutesFrom(originMs, endMs);
    const initialLinkedSnapshot = linkedSync?.initialSnapshot;
    const initialSpan = initialLinkedSnapshot
      ? spanFromMinutes(
          originMs,
          initialLinkedSnapshot.startMinutes,
          initialLinkedSnapshot.endMinutes,
        )
      : { startMs, endMs };
    const earliestMinutes = Math.max(
      0,
      Math.ceil(minutesFrom(originMs, nowMs) / SNAP_MINUTES) * SNAP_MINUTES,
    );

    const [live, setLive] = useState<Span>(initialSpan);
    const liveRef = useRef<Span>(initialSpan);
    const viewportWidthRef = useRef(0);
    const lastFittedViewportWidthRef = useRef(0);
    const offsetRef = useRef(initialLinkedSnapshot?.railOffset ?? 0);
    const pixelsPerMinuteRef = useRef(
      initialLinkedSnapshot?.pixelsPerMinute ?? DEFAULT_PX_PER_HOUR / 60,
    );
    const draggingRef = useRef(false);
    const linkedPreviewRef = useRef(Boolean(initialLinkedSnapshot));
    const needsInitialSnapshotLayoutRef = useRef(Boolean(initialLinkedSnapshot));

    const previewCallbackRef = useRef(onPreviewChange);
    const linkedPreviewCallbackRef = useRef(onLinkedPreviewChange);
    const dragKindCallbackRef = useRef(onDragKindChange);
    const changeCallbackRef = useRef(onChange);
    const railCommitCallbackRef = useRef(onRailOffsetCommit);

    useEffect(() => {
      previewCallbackRef.current = onPreviewChange;
      linkedPreviewCallbackRef.current = onLinkedPreviewChange;
      dragKindCallbackRef.current = onDragKindChange;
      changeCallbackRef.current = onChange;
      railCommitCallbackRef.current = onRailOffsetCommit;
    }, [onChange, onDragKindChange, onLinkedPreviewChange, onPreviewChange, onRailOffsetCommit]);

    const viewportWidth = useSharedValue(0);
    const visualStartMinutes = useSharedValue(
      initialLinkedSnapshot?.startMinutes ?? initialStartMinutes,
    );
    const visualEndMinutes = useSharedValue(initialLinkedSnapshot?.endMinutes ?? initialEndMinutes);
    const visualPixelsPerMinute = useSharedValue(
      initialLinkedSnapshot?.pixelsPerMinute ?? DEFAULT_PX_PER_HOUR / 60,
    );
    const visualOffset = useSharedValue(initialLinkedSnapshot?.railOffset ?? 0);
    const labelInterval = useSharedValue(1);
    const interaction = useSharedValue(IDLE);
    const dragBaseStart = useSharedValue(
      initialLinkedSnapshot?.startMinutes ?? initialStartMinutes,
    );
    const dragBaseEnd = useSharedValue(initialLinkedSnapshot?.endMinutes ?? initialEndMinutes);
    const dragBaseOffset = useSharedValue(initialLinkedSnapshot?.railOffset ?? 0);
    const dragPixelsPerMinute = useSharedValue(
      initialLinkedSnapshot?.pixelsPerMinute ?? DEFAULT_PX_PER_HOUR / 60,
    );
    const dragAnchorMinute = useSharedValue(0);
    const dragAnchorX = useSharedValue(0);
    const reportedStart = useSharedValue(
      Math.round((initialLinkedSnapshot?.startMinutes ?? initialStartMinutes) / SNAP_MINUTES) *
        SNAP_MINUTES,
    );
    const reportedEnd = useSharedValue(
      Math.round((initialLinkedSnapshot?.endMinutes ?? initialEndMinutes) / SNAP_MINUTES) *
        SNAP_MINUTES,
    );

    const contentWidth = railMinutes * (DEFAULT_PX_PER_HOUR / 60);
    const linkedTimeline = linkedSync?.timeline;
    const linkedId = linkedSync?.id ?? '';
    const isLinkedMaster = linkedSync?.isMaster ?? false;

    useAnimatedReaction(
      () => visualPixelsPerMinute.value * 60,
      (pixelsPerHour) => {
        const nextInterval = timeBandLabelInterval(labelInterval.value, pixelsPerHour);
        if (nextInterval !== labelInterval.value) labelInterval.value = nextInterval;
      },
      [labelInterval, visualPixelsPerMinute],
    );

    const positionRangeFromJs = useCallback(
      (nextStartMinutes: number, nextEndMinutes: number, preferredOffset?: number) => {
        const width = viewportWidthRef.current;
        visualStartMinutes.value = nextStartMinutes;
        visualEndMinutes.value = nextEndMinutes;
        const { offset: nextOffset, pixelsPerMinute } = overviewViewport(
          width,
          nextStartMinutes,
          nextEndMinutes,
          preferredOffset ?? offsetRef.current,
        );

        offsetRef.current = nextOffset;
        pixelsPerMinuteRef.current = pixelsPerMinute;
        visualPixelsPerMinute.value = pixelsPerMinute;
        visualOffset.value = nextOffset;
        return nextOffset;
      },
      [railMinutes, visualEndMinutes, visualOffset, visualPixelsPerMinute, visualStartMinutes],
    );

    const emitPreview = useCallback(
      (next: Span, nextOffset: number, nextPixelsPerMinute: number) => {
        liveRef.current = next;
        offsetRef.current = nextOffset;
        pixelsPerMinuteRef.current = nextPixelsPerMinute;
        setLive(next);
        previewCallbackRef.current?.(next, nextOffset);
      },
      [],
    );

    const emitBegin = useCallback((code: number) => {
      draggingRef.current = true;
      const kind = dragKindFor(code);
      if (kind) dragKindCallbackRef.current?.(kind);
    }, []);

    const emitFinalize = useCallback(
      (code: number, next: Span, nextOffset: number, nextPixelsPerMinute: number) => {
        draggingRef.current = false;
        liveRef.current = next;
        offsetRef.current = nextOffset;
        pixelsPerMinuteRef.current = nextPixelsPerMinute;
        setLive(next);
        dragKindCallbackRef.current?.(null);
        previewCallbackRef.current?.(next, nextOffset);
        changeCallbackRef.current(next);
        railCommitCallbackRef.current?.(nextOffset);
      },
      [],
    );

    const emitLinkedPreview = useCallback(
      (next: Span, nextOffset: number, nextPixelsPerMinute: number) => {
        linkedPreviewRef.current = true;
        liveRef.current = next;
        offsetRef.current = nextOffset;
        pixelsPerMinuteRef.current = nextPixelsPerMinute;
        setLive(next);
        linkedPreviewCallbackRef.current?.(next);
      },
      [],
    );

    useAnimatedReaction(
      () => linkedTimeline?.value,
      (next) => {
        if (!next || next.revision === 0 || !next.sourceId || next.sourceId === linkedId) return;
        const pixelsPerMinute = next.pixelsPerMinute;
        if (pixelsPerMinute <= 0) return;
        visualStartMinutes.value = next.startMinutes;
        visualEndMinutes.value = next.endMinutes;
        visualPixelsPerMinute.value = pixelsPerMinute;
        visualOffset.value = next.railOffset;

        const nextReportedStart = Math.round(next.startMinutes / SNAP_MINUTES) * SNAP_MINUTES;
        const nextReportedEnd = Math.round(next.endMinutes / SNAP_MINUTES) * SNAP_MINUTES;
        if (nextReportedStart !== reportedStart.value || nextReportedEnd !== reportedEnd.value) {
          reportedStart.value = nextReportedStart;
          reportedEnd.value = nextReportedEnd;
          runOnJS(emitLinkedPreview)(
            spanFromMinutes(originMs, nextReportedStart, nextReportedEnd),
            next.railOffset,
            pixelsPerMinute,
          );
        }
      },
      [
        emitLinkedPreview,
        linkedId,
        linkedTimeline,
        originMs,
        reportedEnd,
        reportedStart,
        visualEndMinutes,
        visualOffset,
        visualPixelsPerMinute,
        visualStartMinutes,
      ],
    );

    useEffect(() => {
      if (draggingRef.current) return;
      if (linkedPreviewRef.current) {
        if (liveRef.current.startMs === startMs && liveRef.current.endMs === endMs) {
          linkedPreviewRef.current = false;
        } else {
          return;
        }
      }

      const next = { startMs, endMs };
      if (liveRef.current.startMs === next.startMs && liveRef.current.endMs === next.endMs) return;
      liveRef.current = next;
      setLive(next);
      positionRangeFromJs(minutesFrom(originMs, startMs), minutesFrom(originMs, endMs));
    }, [endMs, originMs, positionRangeFromJs, startMs]);

    useEffect(() => {
      if (!linkedTimeline || !isLinkedMaster || linkedTimeline.value.revision !== 0) return;
      linkedTimeline.value = {
        sourceId: linkedId,
        startMinutes: minutesFrom(originMs, liveRef.current.startMs),
        endMinutes: minutesFrom(originMs, liveRef.current.endMs),
        pixelsPerMinute: pixelsPerMinuteRef.current,
        railOffset: offsetRef.current,
        revision: 1,
      };
    }, [isLinkedMaster, linkedId, linkedTimeline, originMs]);

    useEffect(() => {
      if (railOffset == null || viewportWidthRef.current <= 0) return;
      offsetRef.current = railOffset;
      visualOffset.value = railOffset;
    }, [railOffset, visualOffset]);

    useImperativeHandle(
      ref,
      () => ({
        previewLinkedSpan(next, nextOffset) {
          linkedPreviewRef.current = true;
          liveRef.current = next;
          setLive(next);
          offsetRef.current = nextOffset;
          linkedPreviewCallbackRef.current?.(next);
          if (!linkedSync) {
            positionRangeFromJs(
              minutesFrom(originMs, next.startMs),
              minutesFrom(originMs, next.endMs),
              nextOffset,
            );
          }
        },
        previewLinkedRail(nextOffset) {
          if (linkedSync) return;
          offsetRef.current = nextOffset;
          visualOffset.value = nextOffset;
        },
      }),
      [linkedSync, originMs, positionRangeFromJs, visualOffset],
    );

    const applySpanForGesture = useCallback(
      (translationX: number): boolean => {
        'worklet';
        const nextInteraction = interaction.value;
        if (nextInteraction === IDLE) return false;

        const baseStartMinutes = dragBaseStart.value;
        const baseEndMinutes = dragBaseEnd.value;
        const baseDurationMinutes = baseEndMinutes - baseStartMinutes;
        const basePixelsPerMinute = Math.max(0.01, dragPixelsPerMinute.value);
        const maxDurationMinutes = Math.min(MAX_DURATION_MINUTES, railMinutes);
        const width = viewportWidth.value;
        const leftLimit = FIT_INSET_PX;
        const rightLimit = Math.max(leftLimit + 1, width - FIT_INSET_PX);
        let nextStartMinutes = baseStartMinutes;
        let nextEndMinutes = baseEndMinutes;
        let nextPixelsPerMinute = basePixelsPerMinute;
        let nextOffset = dragBaseOffset.value;

        if (nextInteraction === MOVE) {
          const duration = baseDurationMinutes;
          nextStartMinutes = clamp(
            baseStartMinutes + translationX / basePixelsPerMinute,
            earliestMinutes,
            railMinutes - duration,
          );
          nextEndMinutes = nextStartMinutes + duration;
          let nextStartX =
            baseStartMinutes * basePixelsPerMinute -
            dragBaseOffset.value +
            (nextStartMinutes - baseStartMinutes) * basePixelsPerMinute;
          if (nextStartX < leftLimit) nextStartX = leftLimit;
          if (nextStartX + duration * basePixelsPerMinute > rightLimit) {
            nextStartX = rightLimit - duration * basePixelsPerMinute;
          }
          nextOffset = nextStartMinutes * basePixelsPerMinute - nextStartX;
        } else if (nextInteraction === END) {
          const duration = clamp(
            baseDurationMinutes + translationX / basePixelsPerMinute,
            minDurationMinutes,
            Math.min(maxDurationMinutes, railMinutes - baseStartMinutes),
          );
          nextEndMinutes = baseStartMinutes + duration;
          const anchorX = dragAnchorX.value;
          const maxPixelsPerMinute = (rightLimit - anchorX) / Math.max(1, duration);
          nextPixelsPerMinute = Math.max(
            0.01,
            Math.min(visualPixelsPerMinute.value, basePixelsPerMinute, maxPixelsPerMinute),
          );
          nextOffset = dragAnchorMinute.value * nextPixelsPerMinute - anchorX;
        } else {
          const duration = clamp(
            baseDurationMinutes - translationX / basePixelsPerMinute,
            minDurationMinutes,
            Math.min(maxDurationMinutes, baseEndMinutes - earliestMinutes),
          );
          nextStartMinutes = baseEndMinutes - duration;
          const anchorX = dragAnchorX.value;
          const maxPixelsPerMinute = (anchorX - leftLimit) / Math.max(1, duration);
          nextPixelsPerMinute = Math.max(
            0.01,
            Math.min(visualPixelsPerMinute.value, basePixelsPerMinute, maxPixelsPerMinute),
          );
          nextOffset = dragAnchorMinute.value * nextPixelsPerMinute - anchorX;
        }

        if (
          nextStartMinutes === visualStartMinutes.value &&
          nextEndMinutes === visualEndMinutes.value &&
          nextPixelsPerMinute === visualPixelsPerMinute.value &&
          nextOffset === visualOffset.value
        ) {
          return false;
        }

        visualStartMinutes.value = nextStartMinutes;
        visualEndMinutes.value = nextEndMinutes;
        visualPixelsPerMinute.value = nextPixelsPerMinute;
        visualOffset.value = nextOffset;

        if (linkedTimeline) {
          linkedTimeline.value = {
            sourceId: linkedId,
            startMinutes: nextStartMinutes,
            endMinutes: nextEndMinutes,
            pixelsPerMinute: nextPixelsPerMinute,
            railOffset: nextOffset,
            revision: linkedTimeline.value.revision + 1,
          };
        }

        const nextReportedStart = Math.round(nextStartMinutes / SNAP_MINUTES) * SNAP_MINUTES;
        const nextReportedEnd = Math.round(nextEndMinutes / SNAP_MINUTES) * SNAP_MINUTES;
        if (nextReportedStart !== reportedStart.value || nextReportedEnd !== reportedEnd.value) {
          reportedStart.value = nextReportedStart;
          reportedEnd.value = nextReportedEnd;
          runOnJS(emitPreview)(
            spanFromMinutes(originMs, nextReportedStart, nextReportedEnd),
            nextOffset,
            nextPixelsPerMinute,
          );
        }

        return true;
      },
      [
        dragBaseEnd,
        dragBaseStart,
        dragAnchorMinute,
        dragAnchorX,
        dragPixelsPerMinute,
        earliestMinutes,
        emitPreview,
        interaction,
        linkedId,
        linkedTimeline,
        minDurationMinutes,
        originMs,
        railMinutes,
        reportedEnd,
        reportedStart,
        visualEndMinutes,
        visualOffset,
        visualPixelsPerMinute,
        visualStartMinutes,
      ],
    );

    const planningGesture = useMemo(
      () =>
        Gesture.Pan()
          .activeOffsetX([-6, 6])
          .failOffsetY([-12, 12])
          .onBegin((event) => {
            const pixelsPerMinute = visualPixelsPerMinute.value;
            const startX = visualStartMinutes.value * pixelsPerMinute - visualOffset.value;
            const endX = visualEndMinutes.value * pixelsPerMinute - visualOffset.value;
            const startDistance = Math.abs(event.x - startX);
            const endDistance = Math.abs(event.x - endX);
            let nextInteraction = IDLE;

            if (
              !startFixed &&
              startDistance <= HANDLE_HIT_SIZE / 2 &&
              startDistance <= endDistance
            ) {
              nextInteraction = START;
            } else if (endDistance <= HANDLE_HIT_SIZE / 2) {
              nextInteraction = END;
            } else if (!startFixed && event.x >= startX && event.x <= endX) {
              nextInteraction = MOVE;
            }

            interaction.value = nextInteraction;
            dragBaseStart.value = visualStartMinutes.value;
            dragBaseEnd.value = visualEndMinutes.value;
            dragBaseOffset.value = visualOffset.value;
            dragPixelsPerMinute.value = pixelsPerMinute;
            if (nextInteraction === END) {
              dragAnchorMinute.value = visualStartMinutes.value;
              dragAnchorX.value = startX;
            } else if (nextInteraction === START) {
              dragAnchorMinute.value = visualEndMinutes.value;
              dragAnchorX.value = endX;
            }
            reportedStart.value =
              Math.round(visualStartMinutes.value / SNAP_MINUTES) * SNAP_MINUTES;
            reportedEnd.value = Math.round(visualEndMinutes.value / SNAP_MINUTES) * SNAP_MINUTES;
            if (nextInteraction !== IDLE) runOnJS(emitBegin)(nextInteraction);
          })
          .onUpdate((event) => {
            const nextInteraction = interaction.value;
            if (nextInteraction === IDLE) return;

            applySpanForGesture(event.translationX);
          })
          .onFinalize(() => {
            const nextInteraction = interaction.value;
            if (nextInteraction === IDLE) return;

            let nextStartMinutes = visualStartMinutes.value;
            let nextEndMinutes = visualEndMinutes.value;
            let nextOffset = visualOffset.value;
            nextStartMinutes = Math.round(nextStartMinutes / SNAP_MINUTES) * SNAP_MINUTES;
            nextEndMinutes = Math.round(nextEndMinutes / SNAP_MINUTES) * SNAP_MINUTES;
            visualStartMinutes.value = nextStartMinutes;
            visualEndMinutes.value = nextEndMinutes;
            if (linkedTimeline) {
              linkedTimeline.value = {
                sourceId: linkedId,
                startMinutes: nextStartMinutes,
                endMinutes: nextEndMinutes,
                pixelsPerMinute: visualPixelsPerMinute.value,
                railOffset: nextOffset,
                revision: linkedTimeline.value.revision + 1,
              };
            }

            interaction.value = IDLE;
            runOnJS(emitFinalize)(
              nextInteraction,
              spanFromMinutes(originMs, nextStartMinutes, nextEndMinutes),
              nextOffset,
              visualPixelsPerMinute.value,
            );
          }),
      [
        applySpanForGesture,
        dragBaseEnd,
        dragBaseOffset,
        dragBaseStart,
        dragAnchorMinute,
        dragAnchorX,
        dragPixelsPerMinute,
        emitBegin,
        emitFinalize,
        interaction,
        linkedId,
        linkedTimeline,
        originMs,
        reportedEnd,
        reportedStart,
        startFixed,
        viewportWidth,
        visualEndMinutes,
        visualOffset,
        visualPixelsPerMinute,
        visualStartMinutes,
      ],
    );

    const gridTranslateStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: -visualOffset.value }],
    }));
    const gridScaleStyle = useAnimatedStyle(() => ({
      transform: [{ scaleX: visualPixelsPerMinute.value / (DEFAULT_PX_PER_HOUR / 60) }],
      transformOrigin: 'left center',
    }));
    /** Hard-cut at the threshold would pop on every drag frame near it, so the
     * label fades across the last few pixels of room instead. */
    const minLabelWidth = metrics.spanLabelMinWidth;
    const spanLabelStyle = useAnimatedStyle(() => {
      const width =
        (visualEndMinutes.value - visualStartMinutes.value) * visualPixelsPerMinute.value;
      return {
        opacity: interpolate(
          width,
          [minLabelWidth - TIME_BAND_SPAN_LABEL_FADE, minLabelWidth],
          [0, 1],
          Extrapolation.CLAMP,
        ),
      };
    });

    const spanStyle = useAnimatedStyle(() => ({
      left: visualStartMinutes.value * visualPixelsPerMinute.value - visualOffset.value,
      width: Math.max(
        10,
        (visualEndMinutes.value - visualStartMinutes.value) * visualPixelsPerMinute.value,
      ),
    }));
    const startHandleStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateX:
            visualStartMinutes.value * visualPixelsPerMinute.value -
            visualOffset.value -
            HANDLE_HIT_SIZE / 2,
        },
      ],
    }));
    const startCapStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateX: visualStartMinutes.value * visualPixelsPerMinute.value - visualOffset.value,
        },
      ],
    }));
    const endHandleStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateX:
            visualEndMinutes.value * visualPixelsPerMinute.value -
            visualOffset.value -
            HANDLE_HIT_SIZE / 2,
        },
      ],
    }));

    const pastWidth = Math.max(0, earliestMinutes * (DEFAULT_PX_PER_HOUR / 60));
    const hourCount = Math.ceil(railMinutes / 60);

    return (
      <Animated.View
        layout={LinearTransition.duration(220)}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          viewportWidthRef.current = width;
          viewportWidth.value = width;
          if (needsInitialSnapshotLayoutRef.current) {
            needsInitialSnapshotLayoutRef.current = false;
            lastFittedViewportWidthRef.current = width;
            return;
          }
          if (Math.abs(lastFittedViewportWidthRef.current - width) < 1) return;
          lastFittedViewportWidthRef.current = width;
          positionRangeFromJs(
            minutesFrom(originMs, liveRef.current.startMs),
            minutesFrom(originMs, liveRef.current.endMs),
          );
        }}
        className="overflow-hidden rounded-2xl border border-white/10"
        style={{ height: bandHeight, backgroundColor: 'rgba(255,255,255,0.045)' }}
      >
        <GestureDetector gesture={planningGesture}>
          <Animated.View
            accessibilityRole="adjustable"
            accessibilityLabel="Zeitraum bearbeiten"
            accessibilityValue={{
              text: `${clockLabel(live.startMs)} bis ${clockLabel(live.endMs)}`,
            }}
            style={{ flex: 1 }}
          >
            <Animated.View
              style={[{ width: contentWidth, height: bandHeight }, gridTranslateStyle]}
              pointerEvents="none"
            >
              <Animated.View style={[{ width: contentWidth, height: bandHeight }, gridScaleStyle]}>
                {Array.from({ length: hourCount + 1 }, (_, index) => (
                  <HourTick
                    key={index}
                    index={index}
                    originMs={originMs}
                    bandHeight={bandHeight}
                    labelZone={metrics.labelZone}
                    labelFont={metrics.labelFont}
                    labelInterval={labelInterval}
                  />
                ))}
                {pastWidth > 0 ? (
                  <View pointerEvents="none" style={[styles.past, { width: pastWidth }]} />
                ) : null}
              </Animated.View>
            </Animated.View>

            <Animated.View
              pointerEvents="none"
              style={[
                styles.span,
                spanStyle,
                {
                  bottom: trackBottom,
                  top: trackTop,
                  backgroundColor: `${accent}3d`,
                  borderColor: `${accent}a8`,
                },
              ]}
            >
              {/* The window states its own hours, right where the eye already
                  is. The text comes from the parent (it re-renders on every
                  preview frame, so it is live); only WHETHER there is room for
                  it is decided here, on the UI thread, against the span's live
                  width. */}
              {spanLabel ? (
                <Animated.Text
                  numberOfLines={1}
                  style={[styles.spanLabel, spanLabelStyle, { fontSize: metrics.spanFont }]}
                  {...TEXT_FIXED}
                >
                  {spanLabel}
                </Animated.Text>
              ) : null}
            </Animated.View>
            {!startFixed ? (
              <Animated.View pointerEvents="none" style={[styles.handle, startHandleStyle]}>
                <View
                  style={[
                    styles.grip,
                    {
                      backgroundColor: accent,
                      height: gripHeight,
                      transform: [{ translateY: (trackTop - trackBottom) / 2 }],
                    },
                  ]}
                />
              </Animated.View>
            ) : (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.fixedCap,
                  startCapStyle,
                  { bottom: trackBottom, top: trackTop, backgroundColor: accent },
                ]}
              />
            )}
            <Animated.View pointerEvents="none" style={[styles.handle, endHandleStyle]}>
              <View
                style={[
                  styles.grip,
                  {
                    backgroundColor: accent,
                    height: gripHeight,
                    transform: [{ translateY: (trackTop - trackBottom) / 2 }],
                  },
                ]}
              />
            </Animated.View>
          </Animated.View>
        </GestureDetector>

      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  fixedCap: {
    borderBottomLeftRadius: 10,
    borderTopLeftRadius: 10,
    position: 'absolute',
    width: 3,
  },
  grip: { borderRadius: 2, height: 16, width: 3 },
  handle: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    width: HANDLE_HIT_SIZE,
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
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    position: 'absolute',
  },
  spanLabel: {
    color: '#F4F5F7',
    fontFamily: FONT.bold,
    letterSpacing: -0.1,
  },
  tick: { backgroundColor: 'rgba(255,255,255,0.1)', width: 1 },
  tickLabel: {
    color: 'rgba(255,255,255,0.42)',
    left: 3,
    position: 'absolute',
  },
});
