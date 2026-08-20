import { memo, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  LinearTransition,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { usePlanningColors } from '../planningTheme';
import type { TimePlanMember, TimePlanWindow } from '../types';
import { aggregateWindow, memberIntervals, type WindowAvailability } from '../utils/availability';
import { axisHourMarks, formatAxisMinutes, sharedDayAxis, axisFraction, dayStartMs } from '../utils/dayAxis';
import {
  bestAcrossWindows,
  clockLabel,
  dayLabelFor,
  dayRowHeight,
  summariseHighlights,
} from '../utils/matchingSummary';

/**
 * The Zeitmatching card — an availability MATRIX, not a stack of disabled
 * inputs.
 *
 * It deliberately shares nothing with `TimeRangePicker` but the time-to-x
 * arithmetic. A read-only surface that borrows a control's body (track, pill,
 * grips) reads as "an input you are not allowed to touch"; this reads as a
 * chart, because that is what it is.
 *
 * ## What the shape says
 *
 * Height is `availableCount / totalCount`, and opacity carries the same number
 * a second time — colour is never the only channel. Edges are HARD: cover
 * changes at the exact minute somebody's window opens or closes, so a gradient
 * between segments would assert a continuity the data does not have.
 *
 * Everything outside the peak keeps its true height and stays amber, only 18%
 * more transparent. Greying it would say "not available" or "outside the
 * offer", which is a different and false statement.
 *
 * ## Why there is no frame around the offer
 *
 * `createTimePlan` answers for the host with the WHOLE window, so the count
 * never drops to zero inside a proposal and the steps already span its exact
 * extent. A drawn frame would repeat what the shape shows.
 */

const AMBER = '#E0A23E';
/** The lighter edge that makes a step read as translucent glass rather than a
 * flat block — the same trick the picker's bar uses. */
const AMBER_EDGE = 'rgba(243, 200, 133, 0.95)';
const AMBER_PEAK = 'rgba(250, 214, 155, 0.98)';

const LABEL_W = 58;
const AXIS_LABEL_H = 15;
const PERSON_H = 12;
const PERSON_GAP = 3;
const STEP_TOP_INSET = 7;
/** Rows can drop to 32 dp; the touch target must not. */
const MIN_TAP = 44;

function fillFor(share: number, inPeak: boolean): string {
  const alpha = (0.16 + 0.46 * share) * (inPeak ? 1 : 0.82);
  return `rgba(224, 162, 62, ${alpha.toFixed(3)})`;
}

function percent(value: number): `${number}%` {
  return `${Math.max(0, Math.min(100, value * 100))}%`;
}

interface PersonAnswer {
  uid: string;
  name: string;
  spans: Array<{ startMs: number; endMs: number }>;
  isSelf: boolean;
}

/**
 * One person's answer, arriving out of the aggregate it was part of.
 *
 * The horizontal position and width are the person's REAL times and never
 * animate — only the vertical offset does. That is what keeps the movement
 * readable as "this piece of the shape belongs to this row" instead of tiles
 * flying into place.
 */
const PersonRow = memo(function PersonRow({
  person,
  window,
  axis,
  progress,
  fromOffset,
  index,
  reducedMotion,
}: {
  person: PersonAnswer;
  window: TimePlanWindow;
  axis: ReturnType<typeof sharedDayAxis>;
  progress: SharedValue<number>;
  fromOffset: number;
  index: number;
  reducedMotion: boolean;
}) {
  const t = usePlanningColors();
  const dayStart = dayStartMs(window);
  const stagger = reducedMotion ? 0 : Math.min(index * 0.07, 0.28);

  const local = useDerivedValue(() => {
    const raw = (progress.value - stagger) / Math.max(0.001, 1 - stagger);
    return Math.max(0, Math.min(1, raw));
  });

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: fromOffset * (1 - local.value) }],
    opacity: local.value,
  }));
  // Names only once the piece has arrived — while it is still travelling it is
  // part of the shape it came from, not yet a labelled row.
  const nameStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (local.value - 0.62) / 0.38),
  }));

  return (
    <View style={styles.personRow}>
      <Animated.View style={[styles.personLabel, nameStyle]}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          style={[
            styles.personName,
            { color: person.isSelf ? t.text : t.muted },
            person.isSelf ? styles.personNameSelf : null,
          ]}
        >
          {person.name}
        </Text>
      </Animated.View>
      <View style={styles.plot}>
        {person.spans.length === 0 ? (
          <Animated.Text
            {...TEXT_CAPPED}
            style={[styles.personEmpty, { color: t.muted }, nameStyle]}
          >
            kann nicht
          </Animated.Text>
        ) : (
          person.spans.map((span) => {
            const left = axisFraction(span.startMs, dayStart, axis);
            const right = axisFraction(span.endMs, dayStart, axis);
            return (
              <Animated.View
                key={`${span.startMs}-${span.endMs}`}
                style={[
                  styles.personBar,
                  {
                    left: percent(left),
                    width: percent(right - left),
                    backgroundColor: fillFor(person.isSelf ? 0.9 : 0.62, true),
                    borderTopColor: AMBER_EDGE,
                  },
                  barStyle,
                ]}
              />
            );
          })
        )}
      </View>
    </View>
  );
});

export const TimeMatchingCard = memo(function TimeMatchingCard({
  windows,
  members,
  currentUid,
  isHost,
  onLock,
  locking,
}: {
  windows: TimePlanWindow[];
  members: TimePlanMember[];
  currentUid?: string;
  isHost: boolean;
  onLock?: (window: TimePlanWindow, startsAt: string, endsAt: string) => void;
  locking?: boolean;
}) {
  const t = usePlanningColors();
  const reducedMotion = useReducedMotion();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  const progress = useSharedValue(0);

  const ordered = useMemo(
    () => [...windows].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)),
    [windows],
  );
  const axis = useMemo(() => sharedDayAxis(ordered), [ordered]);
  const marks = useMemo(() => axisHourMarks(axis, plotWidth), [axis, plotWidth]);
  const rowHeight = dayRowHeight(ordered.length);

  const availabilityByWindow = useMemo(() => {
    const map = new Map<string, WindowAvailability>();
    ordered.forEach((window) => {
      const result = aggregateWindow(window, members);
      if (result) map.set(window.id, result);
    });
    return map;
  }, [members, ordered]);

  const highlights = useMemo(
    () => bestAcrossWindows(ordered, availabilityByWindow),
    [availabilityByWindow, ordered],
  );
  const summaries = useMemo(() => summariseHighlights(highlights), [highlights]);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = expandedId ? 1 : 0;
      return;
    }
    progress.value = withDelay(
      expandedId ? 60 : 0,
      withTiming(expandedId ? 1 : 0, {
        duration: expandedId ? 420 : 240,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [expandedId, progress, reducedMotion]);

  // The aggregate stays behind its own decomposition, very faint, so the
  // pieces visibly came from somewhere.
  const ghostStyle = useAnimatedStyle(() => ({ opacity: 1 - 0.78 * progress.value }));

  function answersFor(window: TimePlanWindow): PersonAnswer[] {
    const rows = members.map((member) => {
      const intervals = memberIntervals(member, window) ?? [];
      return {
        uid: member.uid,
        name: member.uid === currentUid ? 'Du' : member.displayName,
        isSelf: member.uid === currentUid,
        spans: intervals.map((interval) => ({
          startMs: Date.parse(interval.startsAt),
          endMs: Date.parse(interval.endsAt),
        })),
      };
    });
    // "Du" is always the first row — you look for yourself first.
    return rows.sort((left, right) => Number(right.isSelf) - Number(left.isSelf));
  }

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <Text
        {...TEXT_FLEXIBLE}
        style={[styles.cardTitle, { color: t.text }]}
      >
        Zeitmatching
      </Text>
      {summaries.length > 0 ? (
        <View style={styles.summary}>
          <Text {...TEXT_FLEXIBLE} style={[styles.summaryLabel, { color: t.muted }]}>
            {summaries.length > 1 ? 'Beste Zeiten' : 'Beste Zeit'}
          </Text>
          {summaries.map((line) => (
            <Text key={line} {...TEXT_FLEXIBLE} style={[styles.summaryValue, { color: t.text }]}>
              · {line}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.axisRow}>
        <View style={{ width: LABEL_W }} />
        <View
          style={styles.plot}
          onLayout={(event: LayoutChangeEvent) => setPlotWidth(event.nativeEvent.layout.width)}
        >
          {marks.map((minutes) => (
            <Text
              key={minutes}
              numberOfLines={1}
              maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
              allowFontScaling={TEXT_CAPPED.allowFontScaling}
              style={[
                styles.axisLabel,
                { color: t.muted, left: percent((minutes - axis.startMinutes) / axis.spanMinutes) },
              ]}
            >
              {formatAxisMinutes(minutes)}
            </Text>
          ))}
        </View>
      </View>

      <Animated.View
        layout={reducedMotion ? undefined : LinearTransition.duration(280)}
        style={styles.rows}
      >
        {/* Grid: one set of lines, starting under the labels, running through
            every row including the fanned-out ones. */}
        <View pointerEvents="none" style={styles.grid}>
          <View style={{ width: LABEL_W }} />
          <View style={styles.plot}>
            {marks.map((minutes) => (
              <View
                key={minutes}
                style={[
                  styles.gridLine,
                  {
                    backgroundColor: t.cardBorder,
                    left: percent((minutes - axis.startMinutes) / axis.spanMinutes),
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {ordered.map((window, dayIndex) => {
          const availability = availabilityByWindow.get(window.id);
          const expanded = expandedId === window.id;
          const dayStart = dayStartMs(window);
          const best = availability?.best ?? null;
          const stepArea = rowHeight - STEP_TOP_INSET;
          const answers = expanded ? answersFor(window) : [];

          return (
            <View key={window.id}>
              {dayIndex > 0 ? (
                <View style={[styles.hairline, { backgroundColor: t.cardBorder }]} />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${dayLabelFor(Date.parse(window.startsAt))}, ${
                  best
                    ? `${best.count} von ${availability?.totalCount ?? 0} können ${clockLabel(best.startMs)} bis ${clockLabel(best.endMs)}`
                    : 'niemand kann'
                }`}
                accessibilityHint="Zeigt die einzelnen Antworten."
                hitSlop={Math.max(0, Math.round((MIN_TAP - rowHeight) / 2))}
                onPress={() => setExpandedId(expanded ? null : window.id)}
                style={[styles.dayRow, { height: rowHeight }]}
              >
                <View style={[styles.dayLabelColumn, { width: LABEL_W }]}>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                    allowFontScaling={TEXT_CAPPED.allowFontScaling}
                    style={[styles.dayLabel, { color: t.text }]}
                  >
                    {dayLabelFor(Date.parse(window.startsAt))}
                  </Text>
                </View>

                <Animated.View style={[styles.plot, expanded ? ghostStyle : null]}>
                  {availability?.segments.map((segment) => {
                    if (segment.count <= 0) return null;
                    const share = segment.count / Math.max(1, availability.totalCount);
                    const left = axisFraction(segment.startMs, dayStart, axis);
                    const right = axisFraction(segment.endMs, dayStart, axis);
                    const inPeak =
                      best != null && segment.startMs >= best.startMs && segment.endMs <= best.endMs;
                    return (
                      <View
                        key={`${segment.startMs}-${segment.endMs}`}
                        style={[
                          styles.step,
                          {
                            left: percent(left),
                            width: percent(right - left),
                            height: Math.max(3, share * stepArea),
                            backgroundColor: fillFor(share, inPeak),
                            borderTopColor: inPeak ? AMBER_EDGE : 'rgba(243, 200, 133, 0.55)',
                          },
                        ]}
                      />
                    );
                  })}

                  {best ? (
                    <PeakBracket
                      axis={axis}
                      dayStart={dayStart}
                      best={best}
                      total={availability?.totalCount ?? 0}
                      stepArea={stepArea}
                      plotWidth={plotWidth}
                    />
                  ) : null}
                </Animated.View>
              </Pressable>

              {expanded
                ? answers.map((person, index) => (
                    <PersonRow
                      key={person.uid}
                      person={person}
                      window={window}
                      axis={axis}
                      progress={progress}
                      index={index}
                      reducedMotion={reducedMotion}
                      fromOffset={-(PERSON_H + index * (PERSON_H + PERSON_GAP))}
                    />
                  ))
                : null}
            </View>
          );
        })}
      </Animated.View>

      {isHost && highlights[0] && onLock ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(locking) }}
          disabled={locking}
          onPress={() => {
            const target = ordered.find((entry) => entry.id === highlights[0].windowId);
            if (!target) return;
            onLock(
              target,
              new Date(highlights[0].slot.startMs).toISOString(),
              new Date(highlights[0].slot.endMs).toISOString(),
            );
          }}
          style={[styles.lock, { backgroundColor: AMBER }, locking ? styles.lockBusy : null]}
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
            allowFontScaling={TEXT_CAPPED.allowFontScaling}
            style={styles.lockLabel}
          >
            {locking ? 'Termin wird festgelegt …' : `Auf ${summaries[0]} festlegen`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

/** Start, end and top of the peak, as a bracket over the amber that is already
 * there. It marks where the peak begins and ends; it never fills. */
function PeakBracket({
  axis,
  dayStart,
  best,
  total,
  stepArea,
  plotWidth,
}: {
  axis: ReturnType<typeof sharedDayAxis>;
  dayStart: number;
  best: { startMs: number; endMs: number; count: number };
  total: number;
  stepArea: number;
  plotWidth: number;
}) {
  const left = axisFraction(best.startMs, dayStart, axis);
  const right = axisFraction(best.endMs, dayStart, axis);
  const share = best.count / Math.max(1, total);
  const height = Math.max(3, share * stepArea);
  const widthPx = (right - left) * plotWidth;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.peak,
        { left: percent(left), width: percent(right - left), height, borderColor: AMBER_PEAK },
      ]}
    >
      {widthPx >= 34 && height >= 13 ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          style={styles.peakCount}
        >
          {best.count}/{total}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 14 },
  cardTitle: { fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
  summary: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  summaryLabel: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  summaryValue: { fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },

  axisRow: { flexDirection: 'row', height: AXIS_LABEL_H, marginTop: 12 },
  plot: { flex: 1, minWidth: 0, position: 'relative' },
  axisLabel: {
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize - 2,
    marginLeft: -16,
    position: 'absolute',
    textAlign: 'center',
    top: 0,
    width: 32,
  },

  rows: { position: 'relative' },
  grid: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  gridLine: { bottom: 0, position: 'absolute', top: 0, width: StyleSheet.hairlineWidth },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: LABEL_W },

  dayRow: { alignItems: 'stretch', flexDirection: 'row' },
  dayLabelColumn: { justifyContent: 'flex-end', paddingBottom: 2 },
  dayLabel: { fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  step: { borderTopWidth: 1, bottom: 3, position: 'absolute' },
  peak: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    bottom: 3,
    position: 'absolute',
  },
  peakCount: {
    color: '#3A2A10',
    fontFamily: FONT.semibold,
    fontSize: TYPE.micro.fontSize - 2,
    textAlign: 'center',
    top: 1,
  },

  personRow: { alignItems: 'stretch', flexDirection: 'row', height: PERSON_H, marginTop: PERSON_GAP },
  personLabel: { justifyContent: 'center', width: LABEL_W },
  personName: { fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize - 2 },
  personNameSelf: { fontFamily: FONT.semibold },
  personBar: { borderRadius: 2, borderTopWidth: 1, bottom: 0, position: 'absolute', top: 0 },
  personEmpty: { alignSelf: 'center', fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize - 2, left: 0, position: 'absolute' },

  lock: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 46,
    paddingHorizontal: 16,
  },
  lockBusy: { opacity: 0.6 },
  lockLabel: { color: '#2A1C06', fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
});
