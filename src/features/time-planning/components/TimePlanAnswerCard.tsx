import { memo, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { TimeRangePicker } from '@/shared/components/time-range-picker';
import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';
import { onColorTextColor } from '@/shared/utils/contrastColor';

import { DECLINED_COLOR, FRAME_COLOR, usePlanningColors } from '../planningTheme';
import type { TimePlanInterval, TimePlanWindow } from '../types';
import { PLANNING_SNAP_MINUTES } from '../utils/intervals';
import { clockLabel, dayLabelFor } from '../utils/matchingSummary';
import type { TimePlanAnswer } from '../utils/responseDraft';

export type DayAnswer = TimePlanAnswer;

const MIN_DURATION_MINUTES = 15;
const PICKER_HEIGHT = 54;
const TIME_AXIS_SAFE_INSET = 24;

/** 44 is the platform touch floor, so the whole switch is one 44 px control and
 * the pill inside it is that minus the track's own padding on both sides. */
const SWITCH_HEIGHT = 44;
const TRACK_PADDING = 3;
const SEGMENT_HEIGHT = SWITCH_HEIGHT - TRACK_PADDING * 2;

const FAST_EASE = Easing.bezier(0.2, 0, 0, 1);
const PILL_SPRING = { damping: 22, stiffness: 240, mass: 0.7 } as const;

/**
 * Ordered as a scale — yes, yes-but, no — so the control reads left to right
 * like the answer it collects. "Nur teilweise" sits in the middle because it is
 * a qualified yes, not a third unrelated option.
 */
const SEGMENTS: { value: DayAnswer; label: string; a11y: string }[] = [
  { value: 'full', label: 'Passt', a11y: 'Passt, der ganze Zeitraum' },
  { value: 'partial', label: 'Teilweise', a11y: 'Passt nur teilweise, Zeit anpassen' },
  { value: 'none', label: 'Passt nicht', a11y: 'Passt nicht' },
];

/**
 * The three-way answer switch.
 *
 * Built here rather than shared: it takes its colours from `usePlanningColors`,
 * and the app's other segmented control (`AuthModeSwitch`) is hard-coded to the
 * dark auth stage. The MECHANICS are deliberately the same as that one —
 * measured track width, a spring-driven pill, labels cross-fading on a shorter
 * timing curve — so the two feel like one product.
 */
const AnswerSwitch = memo(function AnswerSwitch({
  value,
  label,
  onChange,
}: {
  value: DayAnswer;
  label: string;
  onChange: (next: DayAnswer) => void;
}) {
  const t = usePlanningColors();
  const reducedMotion = useReducedMotion();
  const index = Math.max(
    0,
    SEGMENTS.findIndex((segment) => segment.value === value),
  );
  const slide = useSharedValue(index);
  /**
   * The track width is a SHARED value, not React state read from the worklet's
   * closure. Measured on device: with the pill's offset derived from a captured
   * plain variable it stayed under the first segment while the labels correctly
   * switched — the worklet kept the width it was created with, so the selection
   * silently disagreed with the answer. A shared value is read fresh on the UI
   * thread every frame and cannot go stale.
   */
  const trackWidth = useSharedValue(0);

  useEffect(() => {
    slide.value = reducedMotion ? index : withSpring(index, PILL_SPRING);
  }, [index, reducedMotion, slide]);

  const pillStyle = useAnimatedStyle(() => {
    const segment = Math.max(0, (trackWidth.value - TRACK_PADDING * 2) / SEGMENTS.length);
    return { transform: [{ translateX: slide.value * segment }], width: segment };
  });

  /**
   * Amber for both yes-answers, clay for the no (September 2026 — reverses
   * "'Passt nicht' bekommt KEINEN Akzent", and takes the green off the switch
   * with it).
   *
   * This IS the feature's own colour rule, applied: amber is the control —
   * the host's rail and your own bar in it — and this switch is a control, so
   * the pill wears the same amber as the picker it opens. Green stays what the
   * rest of the feature already uses it for: the DATA, what other people
   * answered. A green switch had the one surface you operate painted in the
   * colour reserved for the answers you read.
   *
   * "Passt" and "Teilweise" therefore share a colour, which is correct — they
   * are both yes, and WHICH hours is the picker's question, not the pill's.
   * Position, label and the picker that unfolds below tell them apart far more
   * loudly than a hue would.
   *
   * The decline used to be painted in the border token, the same value the
   * track already carries as its hairline: 1.24:1 against it in light, 1.40:1
   * in dark. One answer of three did not look selected at all. It is still not
   * the destructive red the app uses for Absagen and Blockieren — declining is
   * not a failure — but a colour is also how you read your own five rows back
   * before sending them, and grey did not carry that across a scroll.
   */
  const pillColor = value === 'none' ? DECLINED_COLOR : FRAME_COLOR;
  const onPill = onColorTextColor(pillColor);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(event) => {
        trackWidth.value = event.nativeEvent.layout.width;
      }}
      style={[styles.track, { backgroundColor: t.track, borderColor: t.cardBorder }]}
    >
      <Animated.View style={[styles.pill, { backgroundColor: pillColor }, pillStyle]} />
      {SEGMENTS.map((segment) => {
        const active = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${label}: ${segment.a11y}`}
            onPress={() => onChange(segment.value)}
            style={styles.segment}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
              allowFontScaling={TEXT_CAPPED.allowFontScaling}
              style={[
                styles.segmentLabel,
                {
                  color: active ? onPill : t.muted,
                  fontFamily: active ? FONT.semibold : FONT.medium,
                },
              ]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

/**
 * One proposed day, answered in a single tap.
 *
 * Reverses the earlier model where every row WAS a time picker (August 2026).
 * That control was already a poll in disguise — rows started active and covering
 * the whole window, so the normal answer was "tap the X on the days you can't"
 * — but it charged everyone the cost of reading a draggable range to find that
 * out. The picker is not gone, it is demoted: it appears only under "Nur
 * teilweise", which is the one answer that actually needs it.
 *
 * A ROW in one list, not a card of its own (September 2026). Four proposals
 * used to be four bordered cards with 12 dp of padding all round and a 12 dp
 * gap between them: 98 dp per day, of which 26 was chrome and 12 more was the
 * gap. They are four answers to the same question, so they are one list with a
 * hairline between them, exactly like `TimePlanRows`.
 *
 * Day and switch stay STACKED, and that is measured, not preference: at
 * TYPE.caption the widest segment label ("Passt nicht") needs ~73 dp of glyphs,
 * so the three-way switch cannot go below ~273 dp. On a 390 dp phone the sheet
 * leaves ~318 dp inside this list — 45 dp for a "Sa · 20:00–02:00" that needs
 * about 100. Side by side, either the day truncates or the switch does.
 */
export const TimePlanAnswerCard = memo(function TimePlanAnswerCard({
  window,
  answer,
  interval,
  separated,
  onAnswer,
  onInterval,
}: {
  window: TimePlanWindow;
  answer: DayAnswer;
  interval: TimePlanInterval;
  /**
   * Draws the hairline above this row. It belongs to the ROW and not to the
   * list, because the row animates its own height when the picker unfolds — a
   * separator rendered as a sibling would jump to its new place while the row
   * slides to it.
   */
  separated: boolean;
  onAnswer: (next: DayAnswer) => void;
  onInterval: (next: TimePlanInterval) => void;
}) {
  const t = usePlanningColors();
  const reducedMotion = useReducedMotion();
  const windowStart = useMemo(() => new Date(window.startsAt), [window.startsAt]);
  const windowEnd = useMemo(() => new Date(window.endsAt), [window.endsAt]);
  const label = dayLabelFor(Date.parse(window.startsAt));
  const declined = answer === 'none';
  const value = useMemo(
    () => ({ start: new Date(interval.startsAt), end: new Date(interval.endsAt) }),
    [interval.endsAt, interval.startsAt],
  );

  /**
   * ONE time, beside the day, because they are one noun — "Samstag
   * 20:00–02:00". Splitting a single phrase across the two ends of a row and
   * letting the gap between them vary per weekday is what reads as unfinished.
   *
   * It shows the hours the host is asking about, and "Teilweise" replaces them
   * with the hours you picked — the times ARE the answer there, so a second
   * copy of the host window beside them would only be the question repeated.
   * The amber says which of the two you are reading and ties the line to the
   * picker that produced it.
   *
   * The picker cannot carry the chosen range on its own: its in-bar label is a
   * DURATION and fades out once the bar is narrower than about eight
   * characters, which at the 15-minute minimum it always is.
   */
  const narrowed = answer === 'partial';
  const timeRange = narrowed
    ? `${clockLabel(Date.parse(interval.startsAt))}–${clockLabel(Date.parse(interval.endsAt))}`
    : `${clockLabel(Date.parse(window.startsAt))}–${clockLabel(Date.parse(window.endsAt))}`;

  return (
    <Animated.View
      layout={reducedMotion ? undefined : LinearTransition.duration(200)}
      style={[styles.row, separated ? { borderTopColor: t.cardBorder, borderTopWidth: 1 } : null]}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
        allowFontScaling={TEXT_CAPPED.allowFontScaling}
        style={styles.headline}
      >
        <Text style={[styles.day, { color: declined ? t.muted : t.text }]}>{label}</Text>
        <Text style={[styles.range, { color: narrowed ? FRAME_COLOR : t.muted }]}>
          {`  ·  ${timeRange}`}
        </Text>
      </Text>

      <AnswerSwitch value={answer} label={label} onChange={onAnswer} />

      {answer === 'partial' ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(160).easing(FAST_EASE)}
          exiting={reducedMotion ? undefined : FadeOut.duration(110)}
          style={styles.pickerWrap}
        >
          <TimeRangePicker
            value={value}
            min={windowStart}
            max={windowEnd}
            viewportRange={{ start: windowStart, end: windowEnd }}
            stepMinutes={PLANNING_SNAP_MINUTES}
            minDurationMinutes={MIN_DURATION_MINUTES}
            safeInsetPx={TIME_AXIS_SAFE_INSET}
            rezoomOnRelease={false}
            renderRangeLabel={() => null}
            accent={FRAME_COLOR}
            theme={{
              container: { height: PICKER_HEIGHT, background: t.track, radius: 10 },
              labels: { color: t.muted },
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
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  headline: { minWidth: 0 },
  day: { fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
  range: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  track: {
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    height: SWITCH_HEIGHT,
    padding: TRACK_PADDING,
  },
  pill: {
    borderRadius: 11,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    position: 'absolute',
    top: TRACK_PADDING,
  },
  segment: {
    alignItems: 'center',
    flex: 1,
    height: SEGMENT_HEIGHT,
    justifyContent: 'center',
  },
  segmentLabel: { fontSize: TYPE.caption.fontSize },
  pickerWrap: { minWidth: 0 },
});
