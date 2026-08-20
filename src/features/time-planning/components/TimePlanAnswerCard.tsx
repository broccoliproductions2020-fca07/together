import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TimeRangePicker, type TimeRangeLayer } from '@/shared/components/time-range-picker';
import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

import { AVAILABILITY_RAMP, AVAILABLE_COLOR, UNAVAILABLE_COLOR } from '../planningTheme';
import type { TimePlanInterval, TimePlanWindow } from '../types';
import { availabilityLevel, type WindowAvailability } from '../utils/availability';
import { PLANNING_SNAP_MINUTES } from '../utils/intervals';

/**
 * One proposed day, answered.
 *
 * Both directions cost exactly one tap: "Passt" preselects the WHOLE window, so
 * doing nothing further is already the commonest answer, and "Passt nicht" ends
 * the day outright. Narrowing the span is the exception and stays optional.
 *
 * Nothing is pre-answered. That breaks the app's usual defaults-first habit on
 * purpose: a default may guess a SETTING, never a CLAIM ABOUT REALITY. A
 * careless "I can always" wrecks the round for everyone.
 */

export type DayAnswer = 'yes' | 'no' | null;

const MIN_DURATION_MINUTES = 15;

function clock(ms: number): string {
  const date = new Date(ms);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
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
  return (
    <View style={styles.switchTrack} accessibilityRole="radiogroup">
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: value === 'yes' }}
        accessibilityLabel={`${label}: passt mir`}
        onPress={() => onChange(value === 'yes' ? null : 'yes')}
        style={[styles.switchSegment, value === 'yes' ? styles.switchSegmentYes : null]}
      >
        <Ionicons
          name="checkmark"
          size={18}
          color={value === 'yes' ? '#0B1310' : 'rgba(244,245,247,0.55)'}
        />
      </Pressable>
      <View style={styles.switchDivider} />
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: value === 'no' }}
        accessibilityLabel={`${label}: passt mir nicht`}
        onPress={() => onChange(value === 'no' ? null : 'no')}
        style={[styles.switchSegment, value === 'no' ? styles.switchSegmentNo : null]}
      >
        <Ionicons
          name="close"
          size={18}
          color={value === 'no' ? '#F4F5F7' : 'rgba(244,245,247,0.55)'}
        />
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
  /** What the others have said so far — visible BEFORE you answer, so a span
   * you could shift by half an hour to meet everyone is visible while you drag,
   * not afterwards. */
  availability: WindowAvailability | null;
  answer: DayAnswer;
  interval: TimePlanInterval;
  onAnswer: (next: DayAnswer) => void;
  onInterval: (next: TimePlanInterval) => void;
}) {
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

  const startMs = Date.parse(interval.startsAt);
  const endMs = Date.parse(interval.endsAt);
  const whole =
    startMs <= Date.parse(window.startsAt) && endMs >= Date.parse(window.endsAt);
  const others = availability && availability.totalCount > 0 ? availability : null;

  return (
    <View style={[styles.card, answer === 'no' ? styles.cardMuted : null]}>
      <View style={styles.header}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          style={styles.day}
        >
          {label}
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          style={styles.window}
        >
          {clock(Date.parse(window.startsAt))} – {clock(Date.parse(window.endsAt))}
        </Text>
        <AnswerSwitch value={answer} onChange={onAnswer} label={label} />
      </View>

      {answer === 'no' ? (
        <Text style={styles.declined}>Passt dir nicht.</Text>
      ) : (
        <View style={styles.body}>
          {others ? (
            <Text style={styles.others}>
              {others.peakCount} von {others.totalCount} können hier schon
            </Text>
          ) : null}
          <TimeRangePicker
            value={value}
            min={windowStart}
            max={windowEnd}
            stepMinutes={PLANNING_SNAP_MINUTES}
            minDurationMinutes={MIN_DURATION_MINUTES}
            layers={layers}
            accent={AVAILABLE_COLOR}
            density="comfortable"
            disabled={answer !== 'yes'}
            theme={{
              // Room for the aggregate band above the bar. The picker clamps the
              // band into the container rather than growing it, so the height is
              // the caller's decision — which it should be, since only the caller
              // knows there is context to show.
              container: { height: 74, background: 'rgba(255,255,255,0.05)' },
              layers: { colors: AVAILABILITY_RAMP },
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
          {answer === 'yes' ? (
            <Text style={styles.summary}>
              {whole
                ? 'Passt · ganzer Zeitraum'
                : `Passt · ${clock(startMs)} – ${clock(endMs)}`}
            </Text>
          ) : (
            <Text style={styles.hint}>Noch nicht beantwortet</Text>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  // A rejected day keeps nothing but its one line: the screen visibly gets
  // shorter as the answer fills in, so progress needs no counter.
  cardMuted: { gap: 8, paddingVertical: 12 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  day: { color: '#F4F5F7', fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
  window: { color: 'rgba(244,245,247,0.55)', flex: 1, fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  body: { gap: 8 },
  others: { color: 'rgba(244,245,247,0.55)', fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize },
  summary: { color: AVAILABLE_COLOR, fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  hint: { color: 'rgba(244,245,247,0.42)', fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  declined: { color: UNAVAILABLE_COLOR, fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  switchTrack: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  switchSegment: {
    alignItems: 'center',
    height: 44 - 8,
    justifyContent: 'center',
    width: 44 - 6,
  },
  switchSegmentYes: { backgroundColor: AVAILABLE_COLOR },
  switchSegmentNo: { backgroundColor: 'rgba(255,255,255,0.16)' },
  switchDivider: { backgroundColor: 'rgba(255,255,255,0.10)', height: '60%', width: 1 },
});
