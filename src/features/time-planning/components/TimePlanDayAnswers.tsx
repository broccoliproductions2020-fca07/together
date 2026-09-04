import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { FRAME_COLOR, usePlanningColors } from '../planningTheme';
import type { TimePlanMember, TimePlanWindow } from '../types';
import { memberIntervals, type WindowAvailability } from '../utils/availability';
import { clockLabel } from '../utils/matchingSummary';

/**
 * Who can, on one proposed day.
 *
 * The poll model people already know: the overview counts per option, and one
 * option opens into the individual answers. This replaces the stacked
 * staircase as the way availability is read (September 2026) — the staircase
 * lives on in `TimeMatchingCard`, which is no longer mounted anywhere.
 *
 * What makes it work is that it does NOT mark the people who differ. Everyone
 * who said "Passt" gets the identical full-width bar, so somebody who narrowed
 * their day is the only row whose SHAPE is different — and the only one
 * carrying a time on the right. A marker would be a second signal for what the
 * picture already states, and it would read as singling that person out.
 *
 * Times are therefore printed only where they differ. Repeating the host's own
 * window on every full row states the same thing five times.
 */

const NAME_W = 58;
const GAP = 8;
const LABEL_W = 74;
const ROW_H = 26;
const BAR_H = 10;
/** A span shorter than this renders as a dot. It still has to read as a bar
 * sitting at a position in the day. */
const MIN_SPAN_FRACTION = 0.035;

interface Span {
  left: number;
  width: number;
}

interface PersonAnswer {
  uid: string;
  name: string;
  isSelf: boolean;
  spans: Span[];
  /** Covers the host's whole window — the reference shape every other row is
   * read against. */
  whole: boolean;
  declined: boolean;
  label: string | null;
}

function buildAnswers(
  window: TimePlanWindow,
  members: TimePlanMember[],
  currentUid: string | undefined,
): PersonAnswer[] {
  const windowStart = Date.parse(window.startsAt);
  const windowEnd = Date.parse(window.endsAt);
  const total = windowEnd - windowStart;
  if (!Number.isFinite(total) || total <= 0) return [];

  return members
    .map((member) => {
      const intervals = memberIntervals(member, window) ?? [];
      const parsed = intervals.map((interval) => ({
        startMs: Date.parse(interval.startsAt),
        endMs: Date.parse(interval.endsAt),
      }));
      const declined = parsed.length === 0;
      const whole =
        parsed.length === 1 && parsed[0].startMs <= windowStart && parsed[0].endMs >= windowEnd;
      return {
        uid: member.uid,
        name: member.uid === currentUid ? 'Du' : member.displayName,
        isSelf: member.uid === currentUid,
        declined,
        whole,
        spans: parsed.map((entry) => ({
          left: Math.max(0, (entry.startMs - windowStart) / total),
          width: Math.max(MIN_SPAN_FRACTION, (entry.endMs - entry.startMs) / total),
        })),
        label: declined
          ? 'kann nicht'
          : whole
            ? null
            : parsed
                .map((entry) => `${clockLabel(entry.startMs)}–${clockLabel(entry.endMs)}`)
                .join(', '),
      };
    })
    .sort((left, right) => Number(right.isSelf) - Number(left.isSelf));
}

function SpanBar({ span, grow }: { span: Span; grow: SharedValue<number> }) {
  /**
   * Width, not `scaleX`. `transformOrigin` is not dependable across both
   * platforms here, and a centred scale would grow the bar out of its own
   * position — the position IS the information.
   */
  const style = useAnimatedStyle(() => ({ width: `${span.width * grow.value * 100}%` }));
  return (
    <Animated.View
      style={[styles.fill, { backgroundColor: FRAME_COLOR, left: `${span.left * 100}%` }, style]}
    />
  );
}

const PersonRow = memo(function PersonRow({
  person,
  index,
  reservesLabel,
  reducedMotion,
}: {
  person: PersonAnswer;
  index: number;
  reservesLabel: boolean;
  reducedMotion: boolean;
}) {
  const t = usePlanningColors();
  const grow = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      grow.value = 1;
      return;
    }
    // Staggered, so the bars read as running out from the names instead of
    // appearing at once — which is what makes a differing length visible while
    // it happens rather than only afterwards.
    grow.value = withDelay(
      index * 35,
      withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
    );
  }, [grow, index, reducedMotion]);

  return (
    <View style={styles.row}>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
        allowFontScaling={TEXT_CAPPED.allowFontScaling}
        style={[
          styles.name,
          { color: person.declined ? t.muted : t.text },
          person.isSelf ? styles.nameSelf : null,
        ]}
      >
        {person.name}
      </Text>
      <View style={[styles.track, { backgroundColor: t.track }]}>
        {person.spans.map((span, spanIndex) => (
          <SpanBar key={spanIndex} span={span} grow={grow} />
        ))}
      </View>
      {reservesLabel ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          style={[styles.label, { color: t.muted }]}
        >
          {person.label ?? ''}
        </Text>
      ) : null}
    </View>
  );
});

export const TimePlanDayAnswers = memo(function TimePlanDayAnswers({
  window,
  members,
  availability,
  currentUid,
}: {
  window: TimePlanWindow;
  members: TimePlanMember[];
  availability: WindowAvailability | null;
  currentUid?: string;
}) {
  const t = usePlanningColors();
  const reducedMotion = useReducedMotion();
  const people = useMemo(
    () => buildAnswers(window, members, currentUid),
    [currentUid, members, window],
  );
  const reservesLabel = people.some((person) => person.label !== null);

  const windowStart = Date.parse(window.startsAt);
  const total = Date.parse(window.endsAt) - windowStart;
  const best = availability?.best ?? null;
  const band =
    best && total > 0
      ? {
          left: Math.max(0, (best.startMs - windowStart) / total),
          width: Math.min(1, (best.endMs - best.startMs) / total),
        }
      : null;

  const plot = { marginLeft: NAME_W + GAP, marginRight: reservesLabel ? LABEL_W + GAP : 0 };

  if (people.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={[styles.axis, plot]}>
        {[0, 0.5, 1].map((fraction) => (
          <Text
            key={fraction}
            {...TEXT_FLEXIBLE}
            style={[
              styles.axisLabel,
              {
                color: t.muted,
                left: `${fraction * 100}%`,
                marginLeft: fraction === 0 ? 0 : fraction === 1 ? -34 : -17,
                textAlign: fraction === 0 ? 'left' : fraction === 1 ? 'right' : 'center',
              },
            ]}
          >
            {clockLabel(windowStart + fraction * total)}
          </Text>
        ))}
      </View>

      <View style={styles.rows}>
        {/* The best common stretch, drawn once across every row: it is what
            makes "who is inside it" readable without colouring anybody. */}
        {band ? (
          <Animated.View
            pointerEvents="none"
            entering={reducedMotion ? undefined : FadeIn.duration(220).delay(140)}
            style={[styles.bandLayer, plot]}
          >
            <View
              style={[
                styles.band,
                {
                  borderColor: t.peakOutline,
                  left: `${band.left * 100}%`,
                  width: `${band.width * 100}%`,
                },
              ]}
            />
          </Animated.View>
        ) : null}

        {people.map((person, index) => (
          <PersonRow
            key={person.uid}
            person={person}
            index={index}
            reservesLabel={reservesLabel}
            reducedMotion={reducedMotion}
          />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingBottom: 4, paddingTop: 8 },
  axis: { height: 14 },
  axisLabel: {
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
    position: 'absolute',
    width: 34,
  },
  rows: { position: 'relative' },
  bandLayer: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  band: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    position: 'absolute',
    top: 0,
  },
  row: { alignItems: 'center', flexDirection: 'row', gap: GAP, height: ROW_H },
  name: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize, width: NAME_W },
  nameSelf: { fontFamily: FONT.semibold },
  track: { borderRadius: 999, flex: 1, height: BAR_H, overflow: 'hidden', position: 'relative' },
  fill: { borderRadius: 999, bottom: 0, position: 'absolute', top: 0 },
  label: {
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
    textAlign: 'right',
    width: LABEL_W,
  },
});
