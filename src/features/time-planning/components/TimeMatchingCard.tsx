import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { defaultTimeRangePickerTheme } from '@/shared/components/time-range-picker';
import { withAlpha } from '@/shared/components/time-range-picker/theme';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { FRAME_COLOR, usePlanningColors } from '../planningTheme';
import type { TimePlanMember, TimePlanWindow } from '../types';
import {
  aggregateWindow,
  memberIntervals,
  type WindowAvailability,
} from '../utils/availability';
import { axisHourMarks, formatAxisMinutes, sharedDayAxis, axisFraction, dayStartMs } from '../utils/dayAxis';
import { staircasePaths, type StaircaseStep } from '../utils/staircase';
import { ANSWER_LIST_LIMIT, groupAnswers, type AnswerGroup } from '../utils/answerGroups';
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
 * It borrows only material tokens from `TimeRangePicker`; it remains a
 * read-only data view, never an input.
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

const PICKER_RANGE = defaultTimeRangePickerTheme('default', FRAME_COLOR).range;
const AMBER = PICKER_RANGE.color;
/** Shared compact-picker material for availability steps. */

const LABEL_W = 58;
const AXIS_LABEL_H = 15;
/**
 * Person rows follow the same idea as the day rows: comfortable while there
 * are few, tighter as they multiply — and a floor, because below this a band
 * stops being a band and a bar stops being a surface. Past
 * {@link ANSWER_LIST_LIMIT} the rows give way to grouped patterns entirely, so
 * this never has to shrink further.
 */
function personRowHeight(count: number): number {
  return count <= 6 ? 16 : 14;
}

const PERSON_H = 12;
const PERSON_GAP = 3;
/** Rows can drop to 32 dp; the touch target must not. */
const MIN_TAP = 44;
const SOURCE_RIBBON_HEIGHT = 3;
/** Just enough to take the sharpness off a tread without softening the data. */
const STEP_RADIUS = 3;

function pickerFill(inPeak: boolean): string {
  return withAlpha(PICKER_RANGE.color, PICKER_RANGE.fillOpacity * (inPeak ? 1 : 0.82));
}

function pickerBorder(inPeak: boolean): string {
  return withAlpha(PICKER_RANGE.borderColor, PICKER_RANGE.borderOpacity * (inPeak ? 1 : 0.82));
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
 * The whole run of steps for one day as ONE shape.
 *
 * Each stretch used to be its own rounded View. Two things went wrong with
 * that, and they compound: a percentage width is rounded to physical pixels per
 * element, so neighbours land a fraction apart and the run tears open at every
 * change of cover — and a corner radius on separate blocks rounds each one AWAY
 * from its neighbour, so what should read as a staircase reads as loose tiles.
 *
 * One outline fixes both. The treads join because they are the same shape, and
 * the corners can be softened without opening a notch. The per-stretch opacity
 * survives because the rectangles carrying it are CLIPPED to the outline rather
 * than being the outline.
 */
function Staircase({
  id,
  availability,
  axis,
  dayStart,
  width,
  height,
  baseY,
  stepArea,
  highlighted,
}: {
  id: string;
  availability: WindowAvailability;
  axis: ReturnType<typeof sharedDayAxis>;
  dayStart: number;
  width: number;
  height: number;
  baseY: number;
  stepArea: number;
  highlighted: Array<{ startMs: number; endMs: number }>;
}) {
  const total = Math.max(1, availability.totalCount);
  const inPeak = (startMs: number, endMs: number) =>
    highlighted.some((slot) => startMs >= slot.startMs && endMs <= slot.endMs);

  const steps: StaircaseStep[] = availability.segments.map((segment) => ({
    startPx: axisFraction(segment.startMs, dayStart, axis) * width,
    endPx: axisFraction(segment.endMs, dayStart, axis) * width,
    height: segment.count > 0 ? Math.max(3, (segment.count / total) * stepArea) : 0,
  }));
  const paths = staircasePaths(steps, baseY, STEP_RADIUS);
  if (paths.length === 0) return null;
  const clipId = `stair-${id}`;

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <ClipPath id={clipId}>
          {paths.map((d) => (
            <Path key={d} d={d} />
          ))}
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        {availability.segments.map((segment, index) => {
          if (segment.count <= 0) return null;
          const x = axisFraction(segment.startMs, dayStart, axis) * width;
          const next = axisFraction(segment.endMs, dayStart, axis) * width;
          // Half a pixel of overlap each side. The clip owns the silhouette, so
          // this only removes the seam between neighbours.
          return (
            <Rect
              key={`${segment.startMs}-${index}`}
              x={x - 0.5}
              y={0}
              width={next - x + 1}
              height={height}
              fill={pickerFill(inPeak(segment.startMs, segment.endMs))}
            />
          );
        })}
      </G>
      {paths.map((d) => (
        <Path
          key={`edge-${d}`}
          d={d}
          fill="none"
          stroke={pickerBorder(true)}
          strokeWidth={PICKER_RANGE.borderWidth}
        />
      ))}
    </Svg>
  );
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
  rowH,
}: {
  person: PersonAnswer;
  window: TimePlanWindow;
  axis: ReturnType<typeof sharedDayAxis>;
  progress: SharedValue<number>;
  fromOffset: number;
  index: number;
  reducedMotion: boolean;
  rowH: number;
}) {
  const t = usePlanningColors();
  const dayStart = dayStartMs(window);
  const stagger = reducedMotion ? 0 : Math.min(index * 0.07, 0.28);

  const local = useDerivedValue(() => {
    const raw = (progress.value - stagger) / Math.max(0.001, 1 - stagger);
    return Math.max(0, Math.min(1, raw));
  });

  const barStyle = useAnimatedStyle(() => ({
    opacity: 0.74 + 0.26 * local.value,
    transform: [
      { translateY: fromOffset * (1 - local.value) },
      {
        scaleY:
          SOURCE_RIBBON_HEIGHT / rowH + (1 - SOURCE_RIBBON_HEIGHT / rowH) * local.value,
      },
    ],
  }));
  // Names only once the piece has arrived — while it is still travelling it is
  // part of the shape it came from, not yet a labelled row.
  const nameStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (local.value - 0.68) / 0.32),
  }));

  return (
    <View style={[styles.personRow, { height: rowH }]}>
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
      {/* The band IS the row. A banded row with nothing in it says "cannot" by
          having a definite extent and nothing inside — clearer than a label
          stranded at the left edge, and it doubles as the thing that stops the
          eye slipping between rows. */}
      <View style={[styles.plot, { backgroundColor: index % 2 === 0 ? t.band : 'transparent' }]}>
        {person.spans.length === 0
          ? null
          : person.spans.map((span) => {
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
                    backgroundColor: pickerFill(true),
                    borderColor: pickerBorder(true),
                    borderRadius: Math.min(PICKER_RANGE.radius, PERSON_H / 2),
                    borderWidth: PICKER_RANGE.borderWidth,
                  },
                  barStyle,
                ]}
              />
            );
            })}
      </View>
    </View>
  );
});

/** "erst ab 20:00", "nur bis 19:30", "den ganzen Zeitraum" — the pattern, not
 * the people. Singular is spelled out because "1 können" reads as a bug. */
function describeGroup(group: AnswerGroup): string {
  const verb = group.count === 1 ? 'kann' : 'können';
  switch (group.kind) {
    case 'whole':
      return `${verb} den ganzen Zeitraum`;
    case 'from':
      return `${verb} erst ab ${clockLabel(group.startMs ?? 0)}`;
    case 'until':
      return `${verb} nur bis ${clockLabel(group.endMs ?? 0)}`;
    case 'range':
      return `${verb} ${clockLabel(group.startMs ?? 0)}–${clockLabel(group.endMs ?? 0)}`;
    case 'other':
      return `${verb} zu anderen Zeiten`;
    default:
      return `${verb} nicht`;
  }
}

/**
 * One pattern in a round too large to list.
 *
 * There is nothing to decompose here — the aggregate does not become these
 * lines the way it becomes individual bars — so they simply arrive rather than
 * travelling out of the shape above.
 */
function AnswerGroupRow({
  group,
  progress,
  reducedMotion,
}: {
  group: AnswerGroup;
  progress: SharedValue<number>;
  reducedMotion: boolean;
}) {
  const t = usePlanningColors();
  const style = useAnimatedStyle(() =>
    reducedMotion ? { opacity: 1 } : { opacity: progress.value },
  );

  return (
    <Animated.View style={[styles.groupRow, style]}>
      <Text
        maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
        allowFontScaling={TEXT_CAPPED.allowFontScaling}
        style={[styles.groupCount, { color: t.text }]}
      >
        {group.count}
      </Text>
      <Text
        numberOfLines={1}
        {...TEXT_FLEXIBLE}
        style={[styles.groupLabel, { color: t.muted }]}
      >
        {describeGroup(group)}
      </Text>
    </Animated.View>
  );
}

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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  const expandedRef = useRef<string | null>(null);
  const progress = useSharedValue(0);

  const ordered = useMemo(
    () => [...windows].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)),
    [windows],
  );
  const axis = useMemo(() => sharedDayAxis(ordered), [ordered]);
  const marks = useMemo(() => axisHourMarks(axis, plotWidth), [axis, plotWidth]);
  const rowHeight = dayRowHeight(ordered.length);
  const personH = personRowHeight(members.length);
  /** Past a dozen answers the individual rows stop being read. */
  const grouped = members.length >= ANSWER_LIST_LIMIT;

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
  const highlightsByWindow = useMemo(() => {
    const map = new Map<string, Array<(typeof highlights)[number]['slot']>>();
    highlights.forEach(({ windowId, slot }) => {
      const current = map.get(windowId) ?? [];
      current.push(slot);
      map.set(windowId, current);
    });
    return map;
  }, [highlights]);

  const finishCollapse = useCallback((windowId: string) => {
    if (expandedRef.current !== null) return;
    setDetailId((current) => (current === windowId ? null : current));
  }, []);

  const toggleDay = useCallback(
    (windowId: string) => {
      if (expandedId === windowId) {
        expandedRef.current = null;
        setExpandedId(null);
        if (reducedMotion) {
          progress.value = 0;
          setDetailId(null);
          return;
        }
        progress.value = withTiming(
          0,
          { duration: 280, easing: Easing.inOut(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(finishCollapse)(windowId);
          },
        );
        return;
      }

      expandedRef.current = windowId;
      progress.value = 0;
      setDetailId(windowId);
      setExpandedId(windowId);
      progress.value = reducedMotion
        ? 1
        : withDelay(55, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
    },
    [expandedId, finishCollapse, progress, reducedMotion],
  );

  // The aggregate remains whole for the first release beat, then recedes just
  // enough that the material visibly becomes the individual ribbons.
  const ghostStyle = useAnimatedStyle(() => {
    const release = Math.max(0, Math.min(1, (progress.value - 0.12) / 0.88));
    return { opacity: 1 - 0.78 * release };
  });

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
          const detailVisible = detailId === window.id;
          const dayStart = dayStartMs(window);
          const highlightedSlots = highlightsByWindow.get(window.id) ?? [];
          const best = highlightedSlots[0] ?? availability?.best ?? null;
          const stepArea = Math.max(12, Math.min(20, rowHeight - 14));
          const chartBottom = Math.round((rowHeight - stepArea) / 2);
          const answers = detailVisible ? answersFor(window) : [];

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
                onPress={() => toggleDay(window.id)}
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

                <Animated.View style={[styles.plot, detailVisible ? ghostStyle : null]}>
                  {plotWidth > 0 && availability ? (
                    <Staircase
                      id={`${window.id}-${dayIndex}`}
                      availability={availability}
                      axis={axis}
                      dayStart={dayStart}
                      width={plotWidth}
                      height={rowHeight}
                      baseY={rowHeight - chartBottom}
                      stepArea={stepArea}
                      highlighted={highlightedSlots}
                    />
                  ) : null}

                  {highlightedSlots.map((slot) => (
                    <PeakCount
                      key={`${slot.startMs}-${slot.endMs}`}
                      axis={axis}
                      best={slot}
                      dayStart={dayStart}
                      plotWidth={plotWidth}
                      chartTop={rowHeight - chartBottom - stepArea}
                      stepArea={stepArea}
                      total={availability?.totalCount ?? 0}
                    />
                  ))}
                </Animated.View>
              </Pressable>

              {detailVisible && grouped
                ? // Too many answers to read one by one: the patterns behind
                  // them are what is still worth knowing at that size.
                  groupAnswers(window, members).map((group) => (
                    <AnswerGroupRow
                      key={`${group.kind}-${group.startMs ?? ''}-${group.endMs ?? ''}`}
                      group={group}
                      progress={progress}
                      reducedMotion={reducedMotion}
                    />
                  ))
                : null}

              {detailVisible && !grouped
                ? answers.map((person, index) => (
                    <PersonRow
                      key={person.uid}
                      person={person}
                      window={window}
                      axis={axis}
                      progress={progress}
                      index={index}
                      reducedMotion={reducedMotion}
                      rowH={personH}
                      fromOffset={
                        Math.max(
                          rowHeight - chartBottom - stepArea + 1,
                          rowHeight - chartBottom - (index + 1) * SOURCE_RIBBON_HEIGHT,
                        ) -
                        (rowHeight + PERSON_GAP + index * (personH + PERSON_GAP))
                      }
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

function PeakCount({
  axis,
  dayStart,
  best,
  total,
  stepArea,
  plotWidth,
  chartTop,
}: {
  axis: ReturnType<typeof sharedDayAxis>;
  dayStart: number;
  best: { startMs: number; endMs: number; count: number };
  total: number;
  stepArea: number;
  plotWidth: number;
  chartTop: number;
}) {
  const left = axisFraction(best.startMs, dayStart, axis);
  const right = axisFraction(best.endMs, dayStart, axis);
  const share = best.count / Math.max(1, total);
  const height = Math.max(3, share * stepArea);
  const widthPx = (right - left) * plotWidth;

  if (widthPx < 34 || height < 13) return null;

  return (
    <Text
      pointerEvents="none"
      numberOfLines={1}
      maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
      allowFontScaling={TEXT_CAPPED.allowFontScaling}
      style={[
        styles.peakCount,
        {
          left: percent(left),
          width: percent(right - left),
          top: chartTop + stepArea - height + 3,
        },
      ]}
    >
      {best.count}/{total}
    </Text>
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
  dayLabelColumn: { justifyContent: 'center' },
  dayLabel: { fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  peakCount: {
    color: '#3A2A10',
    fontFamily: FONT.semibold,
    fontSize: TYPE.micro.fontSize - 2,
    position: 'absolute',
    textAlign: 'center',
    zIndex: 2,
  },

  groupRow: { alignItems: 'baseline', flexDirection: 'row', gap: 8, minHeight: 18 },
  groupCount: {
    fontFamily: FONT.semibold,
    fontSize: TYPE.caption.fontSize,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    width: LABEL_W,
  },
  groupLabel: { flex: 1, fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  personRow: { alignItems: 'stretch', flexDirection: 'row', height: PERSON_H, marginTop: PERSON_GAP },
  personLabel: { justifyContent: 'center', width: LABEL_W },
  personName: { fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize - 2 },
  personNameSelf: { fontFamily: FONT.semibold },
  personBar: {
    bottom: 0,
    position: 'absolute',
    top: 0,
    zIndex: 3,
  },
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
