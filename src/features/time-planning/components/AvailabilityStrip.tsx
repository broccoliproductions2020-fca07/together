import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

import { AVAILABLE_COLOR, FRAME_COLOR, availabilityColor } from '../planningTheme';
import type { TimePlanInterval, TimePlanWindow } from '../types';
import { availabilityLevel, type WindowAvailability } from '../utils/availability';
import { axisFraction, dayStartMs, type DayAxis } from '../utils/dayAxis';

/**
 * One day's availability, drawn on the SHARED time-of-day axis.
 *
 * Every position here comes from `axisFraction`, so an hour is the same width
 * in every row of a stack. That is the whole reason the axis is shared: rows
 * that each filled their own width would invite a comparison the picture
 * cannot support.
 *
 * Edges are hard on purpose — the number of people available jumps at a
 * boundary, and a gradient would claim otherwise.
 */

const STRIP_HEIGHT = 22;

/** React Native types percentages as a template literal, so the return type
 * has to be one too — a plain `string` is rejected by every style prop. */
function percent(value: number): `${number}%` {
  return `${Math.max(0, Math.min(100, value * 100))}%`;
}

export const AvailabilityStrip = memo(function AvailabilityStrip({
  window,
  axis,
  availability,
  showBest = true,
  height = STRIP_HEIGHT,
}: {
  window: TimePlanWindow;
  axis: DayAxis;
  availability: WindowAvailability | null;
  showBest?: boolean;
  height?: number;
}) {
  const dayStart = dayStartMs(window);
  const frameLeft = axisFraction(Date.parse(window.startsAt), dayStart, axis);
  const frameRight = axisFraction(Date.parse(window.endsAt), dayStart, axis);

  return (
    <View style={[styles.row, { height }]}>
      <View
        style={[
          styles.frame,
          { left: percent(frameLeft), width: percent(frameRight - frameLeft) },
        ]}
      />
      {availability?.segments.map((segment) => {
        const level = availabilityLevel(segment.count, availability.totalCount);
        if (level <= 0) return null;
        const left = axisFraction(segment.startMs, dayStart, axis);
        const right = axisFraction(segment.endMs, dayStart, axis);
        return (
          <View
            key={`${segment.startMs}-${segment.endMs}`}
            style={[
              styles.segment,
              {
                left: percent(left),
                width: percent(right - left),
                backgroundColor: availabilityColor(level),
              },
            ]}
          />
        );
      })}
      {showBest && availability?.best ? (
        <View
          style={[
            styles.best,
            availability.best.everyone ? styles.bestEveryone : null,
            {
              left: percent(axisFraction(availability.best.startMs, dayStart, axis)),
              width: percent(
                axisFraction(availability.best.endMs, dayStart, axis) -
                  axisFraction(availability.best.startMs, dayStart, axis),
              ),
            },
          ]}
        />
      ) : null}
    </View>
  );
});

/** One person's answer for one window, on the same axis as the strip above it.
 * The rows and the aggregate are the same picture — one stacked, one not. */
export const AvailabilityRow = memo(function AvailabilityRow({
  window,
  axis,
  intervals,
  color = AVAILABLE_COLOR,
  height = 10,
}: {
  window: TimePlanWindow;
  axis: DayAxis;
  intervals: TimePlanInterval[];
  color?: string;
  height?: number;
}) {
  const dayStart = dayStartMs(window);
  return (
    <View style={[styles.row, { height }]}>
      {intervals.map((interval) => {
        const left = axisFraction(Date.parse(interval.startsAt), dayStart, axis);
        const right = axisFraction(Date.parse(interval.endsAt), dayStart, axis);
        if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return null;
        return (
          <View
            key={`${interval.startsAt}-${interval.endsAt}`}
            style={[
              styles.personSegment,
              { left: percent(left), width: percent(right - left), backgroundColor: color },
            ]}
          />
        );
      })}
    </View>
  );
});

/** The hour scale the whole stack is read against. Drawn once, above or below
 * the rows — never per row, or the rows stop looking like one grid. */
export const AvailabilityAxis = memo(function AvailabilityAxis({
  axis,
  marks,
  format,
}: {
  axis: DayAxis;
  marks: number[];
  format: (minutes: number) => string;
}) {
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
          <View style={styles.axisTick} />
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
            allowFontScaling={TEXT_CAPPED.allowFontScaling}
            style={styles.axisLabel}
          >
            {format(minutes)}
          </Text>
        </View>
      ))}
    </View>
  );
});

const AXIS_LABEL_WIDTH = 38;

const styles = StyleSheet.create({
  row: { position: 'relative', width: '100%' },
  frame: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderColor: `${FRAME_COLOR}55`,
    borderRadius: 5,
    borderWidth: 1,
  },
  segment: { position: 'absolute', top: 2, bottom: 2 },
  personSegment: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  best: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 6,
    borderWidth: 1,
  },
  // "Everyone can" is a different KIND of answer, not one more step on the
  // ramp. It is marked by form so it cannot be mistaken for a shade.
  bestEveryone: { borderColor: '#FFFFFF', borderWidth: 2 },
  axis: { height: 20, position: 'relative', width: '100%' },
  axisMark: { position: 'absolute', top: 0, width: AXIS_LABEL_WIDTH, marginLeft: -AXIS_LABEL_WIDTH / 2, alignItems: 'center' },
  axisTick: { width: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.20)' },
  axisLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize - 2,
    marginTop: 2,
  },
});
