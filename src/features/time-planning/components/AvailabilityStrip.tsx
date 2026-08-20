import { memo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

import {
  AVAILABLE_COLOR,
  MEMBER_AVAILABILITY_COLOR,
  overviewAvailabilityColor,
  usePlanningColors,
} from '../planningTheme';
import type { TimePlanInterval, TimePlanWindow } from '../types';
import {
  availabilityLevel,
  type BestSlot,
  type WindowAvailability,
} from '../utils/availability';
import { axisFraction, dayStartMs, type DayAxis } from '../utils/dayAxis';

const STRIP_HEIGHT = 20;
const AXIS_LABEL_WIDTH = 38;
const BEST_LABEL_MIN_WIDTH = 30;

function percent(value: number): `${number}%` {
  return `${Math.max(0, Math.min(100, value * 100))}%`;
}

/**
 * A flat availability field, not a disabled picker. The same time grid is
 * reused for every proposal; fills have hard boundaries because the count
 * changes at exact moments.
 */
export const AvailabilityStrip = memo(function AvailabilityStrip({
  window,
  axis,
  availability,
  participantCount,
  highlightedSlots = [],
  height = STRIP_HEIGHT,
}: {
  window: TimePlanWindow;
  axis: DayAxis;
  availability: WindowAvailability | null;
  participantCount: number;
  highlightedSlots?: BestSlot[];
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const dayStart = dayStartMs(window);

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.field, { height }]}
    >
      {availability?.segments.map((segment) => {
        const level = availabilityLevel(segment.count, participantCount);
        if (level === 0) return null;
        const left = axisFraction(segment.startMs, dayStart, axis);
        const right = axisFraction(segment.endMs, dayStart, axis);
        return (
          <View
            key={`${segment.startMs}-${segment.endMs}`}
            style={[
              styles.fill,
              {
                backgroundColor: overviewAvailabilityColor(level),
                left: percent(left),
                width: percent(right - left),
              },
            ]}
          />
        );
      })}

      {highlightedSlots.map((slot) => {
        const left = axisFraction(slot.startMs, dayStart, axis);
        const right = axisFraction(slot.endMs, dayStart, axis);
        const canShowLabel = (right - left) * width >= BEST_LABEL_MIN_WIDTH;
        return (
          <View
            key={`${slot.startMs}-${slot.endMs}`}
            pointerEvents="none"
            style={[styles.bestOutline, { left: percent(left), width: percent(right - left) }]}
          >
            {canShowLabel ? (
              <Text
                allowFontScaling={TEXT_CAPPED.allowFontScaling}
                maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                numberOfLines={1}
                style={styles.bestLabel}
              >
                {slot.count}/{participantCount}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

/** One person's answer on the same flat grid as the aggregate above it. */
export const AvailabilityRow = memo(function AvailabilityRow({
  window,
  axis,
  intervals,
  color = MEMBER_AVAILABILITY_COLOR,
  height = 8,
}: {
  window: TimePlanWindow;
  axis: DayAxis;
  intervals: TimePlanInterval[];
  color?: string;
  height?: number;
}) {
  const dayStart = dayStartMs(window);
  return (
    <View style={[styles.field, { height }]}>
      {intervals.map((interval) => {
        const left = axisFraction(Date.parse(interval.startsAt), dayStart, axis);
        const right = axisFraction(Date.parse(interval.endsAt), dayStart, axis);
        if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return null;
        return (
          <View
            key={`${interval.startsAt}-${interval.endsAt}`}
            style={[
              styles.fill,
              { backgroundColor: color, left: percent(left), width: percent(right - left) },
            ]}
          />
        );
      })}
    </View>
  );
});

/** Labels lead; the small ticks start below them and hand the reading line to
 * the vertical grid in the rows underneath. */
export const AvailabilityAxis = memo(function AvailabilityAxis({
  axis,
  marks,
  format,
}: {
  axis: DayAxis;
  marks: number[];
  format: (minutes: number) => string;
}) {
  const t = usePlanningColors();
  return (
    <View style={styles.axis}>
      {marks.map((minutes) => (
        <View
          key={minutes}
          style={[
            styles.axisMark,
            { left: percent((minutes - axis.startMinutes) / axis.spanMinutes) },
          ]}
        >
          <Text
            allowFontScaling={TEXT_CAPPED.allowFontScaling}
            maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
            numberOfLines={1}
            style={[styles.axisLabel, { color: t.muted }]}
          >
            {format(minutes)}
          </Text>
          <View style={[styles.axisTick, { backgroundColor: t.faint }]} />
        </View>
      ))}
    </View>
  );
});

/** One continuous grid layer, rendered behind every collapsed and expanded row. */
export const AvailabilityGuides = memo(function AvailabilityGuides({
  axis,
  marks,
}: {
  axis: DayAxis;
  marks: number[];
}) {
  const t = usePlanningColors();
  return (
    <View pointerEvents="none" style={styles.guides}>
      {marks.map((minutes) => (
        <View
          key={minutes}
          style={[
            styles.guide,
            {
              backgroundColor: t.faint,
              left: percent((minutes - axis.startMinutes) / axis.spanMinutes),
            },
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { overflow: 'hidden', position: 'relative', width: '100%' },
  fill: { bottom: 0, position: 'absolute', top: 0 },
  bestOutline: {
    alignItems: 'center',
    borderColor: AVAILABLE_COLOR,
    borderRadius: 0,
    borderWidth: 2,
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
  },
  bestLabel: { color: '#FFFFFF', fontFamily: FONT.semibold, fontSize: TYPE.micro.fontSize - 1 },
  axis: { height: 29, position: 'relative', width: '100%' },
  axisMark: {
    alignItems: 'center',
    marginLeft: -AXIS_LABEL_WIDTH / 2,
    position: 'absolute',
    top: 0,
    width: AXIS_LABEL_WIDTH,
  },
  axisLabel: { fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize - 2, lineHeight: 11 },
  axisTick: { height: 8, marginTop: 3, width: StyleSheet.hairlineWidth },
  guides: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  guide: { bottom: 0, opacity: 0.78, position: 'absolute', top: 0, width: StyleSheet.hairlineWidth },
});
