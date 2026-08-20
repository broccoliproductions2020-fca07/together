import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { TimeRangePicker, type TimeRangeLayer } from '@/shared/components/time-range-picker';
import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

import { AVAILABILITY_RAMP, AVAILABLE_COLOR, FRAME_COLOR, usePlanningColors } from '../planningTheme';
import type { TimePlanInterval, TimePlanWindow } from '../types';
import { availabilityLevel, type WindowAvailability } from '../utils/availability';
import { PLANNING_SNAP_MINUTES } from '../utils/intervals';

/**
 * One proposed day, answered — as a single ROW.
 *
 * Both directions cost exactly one tap: "Passt" preselects the WHOLE window, so
 * doing nothing further is already the commonest answer, and "Passt nicht" ends
 * the day outright. Narrowing the span is the exception and stays optional.
 *
 * Nothing is pre-answered. That breaks the app's usual defaults-first habit on
 * purpose: a default may guess a SETTING, never a CLAIM ABOUT REALITY. A
 * careless "I can always" wrecks the round for everyone.
 *
 * ## Why a row and not a card
 *
 * Each day used to sit in its own bordered, padded box — about 142 dp for three
 * lines of content, so three days filled two thirds of the sheet and pushed the
 * button that finishes the job off screen. The box carried no information; only
 * the day, the bar and the switch do. Dropping the packaging and putting those
 * three side by side lands at roughly 62 dp with nothing lost.
 *
 * The hour scale STAYS. It is not decoration: it is the only thing that says
 * where to aim a grip, and without it you grab blind and correct afterwards. It
 * also costs no height at all — the picker draws it inside its own box.
 */

export type DayAnswer = 'yes' | 'no' | null;

const MIN_DURATION_MINUTES = 15;
/** Room for the aggregate band above the bar plus the hour scale below it. The
 * smallest preset (36) would leave the bar ~13 dp, too thin to grab. */
const PICKER_HEIGHT = 54;
const LABEL_WIDTH = 62;
/** Drawn small, touched large — the same split the picker's own 6 dp handles
 * use for their 44 dp targets. `hitSlop` restores the platform floor. */
const SEGMENT_SIZE = 30;
const SEGMENT_SLOP = 8;

function clock(ms: number): string {
  const date = new Date(ms);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const weekday = date.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  return `${weekday} ${date.getDate()}.${date.getMonth() + 1}.`;
}

function AnswerSwitch({
  value,
  onChange,
  label,
}: {
  value: DayAnswer;
  onChange: (next: DayAnswer) => void;
  label: string;
}) {
  const t = usePlanningColors();
  return (
    <View style={[styles.switchTrack, { backgroundColor: t.track }]} accessibilityRole="radiogroup">
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: value === 'yes' }}
        accessibilityLabel={`${label}: passt mir`}
        hitSlop={SEGMENT_SLOP}
        onPress={() => onChange(value === 'yes' ? null : 'yes')}
        style={[styles.switchSegment, value === 'yes' ? styles.switchSegmentYes : null]}
      >
        <Ionicons name="checkmark" size={16} color={value === 'yes' ? '#0B1310' : t.muted} />
      </Pressable>
      <View style={[styles.switchDivider, { backgroundColor: t.cardBorder }]} />
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: value === 'no' }}
        accessibilityLabel={`${label}: passt mir nicht`}
        hitSlop={SEGMENT_SLOP}
        onPress={() => onChange(value === 'no' ? null : 'no')}
        style={[styles.switchSegment, value === 'no' ? { backgroundColor: t.cardBorder } : null]}
      >
        <Ionicons name="close" size={16} color={value === 'no' ? t.text : t.muted} />
      </Pressable>
    </View>
  );
}

export const TimePlanAnswerCard = memo(function TimePlanAnswerCard({
  window,
  availability,
  answer,
  interval,
  onAnswer,
  onInterval,
}: {
  window: TimePlanWindow;
  /** What the others have said so far — drawn behind your own bar, so a span
   * you could shift by half an hour to meet everyone is visible while you drag,
   * not afterwards. */
  availability: WindowAvailability | null;
  answer: DayAnswer;
  interval: TimePlanInterval;
  onAnswer: (next: DayAnswer) => void;
  onInterval: (next: TimePlanInterval) => void;
}) {
  const t = usePlanningColors();
  const reducedMotion = useReducedMotion();
  const windowStart = useMemo(() => new Date(window.startsAt), [window.startsAt]);
  const windowEnd = useMemo(() => new Date(window.endsAt), [window.endsAt]);
  const label = dayLabel(window.startsAt);

  const layers = useMemo<TimeRangeLayer[]>(() => {
    if (!availability) return [];
    return availability.segments
      .map((segment) => ({
        startMs: segment.startMs,
        endMs: segment.endMs,
        level: availabilityLevel(segment.count, availability.totalCount),
      }))
      .filter((layer) => layer.level > 0);
  }, [availability]);

  const value = useMemo(
    () => ({ start: new Date(interval.startsAt), end: new Date(interval.endsAt) }),
    [interval.endsAt, interval.startsAt],
  );

  return (
    <Animated.View
      layout={reducedMotion ? undefined : LinearTransition.duration(220)}
      style={styles.row}
    >
      <View style={styles.labelColumn}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          style={[styles.day, { color: answer === 'no' ? t.muted : t.text }]}
        >
          {label}
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          style={[styles.window, { color: t.muted }]}
        >
          {clock(Date.parse(window.startsAt))}–{clock(Date.parse(window.endsAt))}
        </Text>
      </View>

      <View style={styles.pickerColumn}>
        {answer === 'no' ? null : (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(160)}
            exiting={reducedMotion ? undefined : FadeOut.duration(120)}
          >
            <TimeRangePicker
              value={value}
              min={windowStart}
              max={windowEnd}
              stepMinutes={PLANNING_SNAP_MINUTES}
              minDurationMinutes={MIN_DURATION_MINUTES}
              layers={layers}
              // Amber, not green. Amber is the CONTROL — the host's rail and
              // your bar inside it; green is the DATA behind it, what everyone
              // else already said. Painting your own bar green put the thing
              // you are setting in the same colour as the thing you are reading
              // it against, and the two only separated by an outline.
              accent={FRAME_COLOR}
              disabled={answer !== 'yes'}
              theme={{
                container: { height: PICKER_HEIGHT, background: t.track, radius: 10 },
                layers: { colors: AVAILABILITY_RAMP },
                labels: { color: t.muted },
                rangeLabel: { color: t.text },
                ticks: { color: t.cardBorder },
                startHandle: { color: t.handle },
                endHandle: { color: t.handle },
                past: { color: t.faint, opacity: 0.35 },
              }}
              onChange={(next) =>
                onInterval({
                  startsAt: next.start.toISOString(),
                  endsAt: next.end.toISOString(),
                })
              }
              accessibilityLabelStart={`${label}: Beginn deiner Zeit`}
              accessibilityLabelEnd={`${label}: Ende deiner Zeit`}
            />
          </Animated.View>
        )}
      </View>

      <AnswerSwitch value={answer} onChange={onAnswer} label={label} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 34 },
  labelColumn: { width: LABEL_WIDTH },
  day: { fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  window: { fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize - 1, marginTop: 1 },
  pickerColumn: { flex: 1, justifyContent: 'center', minWidth: 0 },
  switchTrack: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  switchSegment: {
    alignItems: 'center',
    height: SEGMENT_SIZE,
    justifyContent: 'center',
    width: SEGMENT_SIZE,
  },
  switchSegmentYes: { backgroundColor: AVAILABLE_COLOR },
  switchDivider: { height: '60%', width: 1 },
});
