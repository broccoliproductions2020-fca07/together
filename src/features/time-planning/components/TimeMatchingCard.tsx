import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import {
  defaultTimeRangePickerTheme,
  TimeRangePicker,
  type TimeRangeValue,
} from '@/shared/components/time-range-picker';
import { withAlpha } from '@/shared/components/time-range-picker/theme';
import { TimeMatchingHighlight } from '@/shared/product-ui/TimeMatchingHighlight';
import { NATIVE_FONTS } from '@/shared/product-ui/nativeFonts';
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
const GRAPH_EDGE_INSET = Math.max(1, PICKER_RANGE.borderWidth) / 2;

const LABEL_W = 64;
const AXIS_LABEL_H = 15;
/**
 * Person rows follow the same idea as the day rows: comfortable while there
 * are few, tighter as they multiply — and a floor, because below this a band
 * stops being a band and a bar stops being a surface. Every answer gets a row,
 * however many there are, so a large round is a long list by design.
 */
function personRowHeight(count: number): number {
  return count <= 6 ? 20 : 18;
}

const PERSON_H = 14;
const PERSON_GAP = 3;
/** Rows can drop to 32 dp; the touch target must not. */
const MIN_TAP = 44;
const SOURCE_RIBBON_HEIGHT = 3;
/** Just enough to take the sharpness off a tread without softening the data. */
const STEP_RADIUS = 3;
const DEFAULT_ACTIVITY_MINUTES = 120;
const MIN_ACTIVITY_MINUTES = 15;

function initialActivityRange(highlight: {
  slot: { startMs: number; endMs: number };
}): TimeRangeValue {
  const durationMs = Math.min(
    highlight.slot.endMs - highlight.slot.startMs,
    DEFAULT_ACTIVITY_MINUTES * 60_000,
  );
  return {
    start: new Date(highlight.slot.startMs),
    end: new Date(highlight.slot.startMs + durationMs),
  };
}

function pickerFill(inPeak: boolean): string {
  return withAlpha(PICKER_RANGE.color, PICKER_RANGE.fillOpacity * (inPeak ? 1 : 0.82));
}

function pickerBorder(inPeak: boolean): string {
  return withAlpha(PICKER_RANGE.borderColor, PICKER_RANGE.borderOpacity * (inPeak ? 1 : 0.82));
}

function percent(value: number): `${number}%` {
  return `${Math.max(0, Math.min(100, value * 100))}%`;
}

/**
 * Keep stroked SVG shapes inside their viewport. A path ending at exactly 0 or
 * `width` loses half of its outline to clipping on Android.
 */
function graphX(fraction: number, width: number): number {
  const inset = Math.min(GRAPH_EDGE_INSET, width / 2);
  const clamped = Math.max(0, Math.min(1, fraction));
  return inset + clamped * Math.max(0, width - inset * 2);
}

function highlightKey(highlight: { windowId: string; slot: { startMs: number; endMs: number } }): string {
  return `${highlight.windowId}:${highlight.slot.startMs}:${highlight.slot.endMs}`;
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
  peak,
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
  /** This row's own strongest stretch, outlined so the rows can be compared
   * by eye. Separate from {@link highlighted}, which is the winning window
   * across ALL rows and marks itself through the stronger fill. */
  peak: { startMs: number; endMs: number; count: number } | null;
}) {
  const t = usePlanningColors();
  const total = Math.max(1, availability.totalCount);
  const inPeak = (startMs: number, endMs: number) =>
    highlighted.some((slot) => startMs >= slot.startMs && endMs <= slot.endMs);

  const steps: StaircaseStep[] = availability.segments.map((segment) => ({
    startPx: graphX(axisFraction(segment.startMs, dayStart, axis), width),
    endPx: graphX(axisFraction(segment.endMs, dayStart, axis), width),
    height: segment.count > 0 ? Math.max(3, (segment.count / total) * stepArea) : 0,
  }));
  const paths = staircasePaths(steps, baseY, STEP_RADIUS);
  if (paths.length === 0) return null;
  const clipId = `stair-${id}`;

  // Derived from the same expressions as the steps above, never measured
  // separately — a second rounding is how an outline ends up half a pixel off
  // the shape it is supposed to trace.
  const peakRect = (() => {
    if (!peak || peak.count <= 0) return null;
    const x = graphX(axisFraction(peak.startMs, dayStart, axis), width);
    const right = graphX(axisFraction(peak.endMs, dayStart, axis), width);
    const w = right - x;
    if (w < 1) return null;
    const h = Math.max(3, (peak.count / total) * stepArea);
    return { x, y: baseY - h, width: w, height: h, radius: Math.min(STEP_RADIUS, w / 2, h / 2) };
  })();

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
      {peakRect ? (
        <Rect
          x={peakRect.x}
          y={peakRect.y}
          width={peakRect.width}
          height={peakRect.height}
          rx={peakRect.radius}
          ry={peakRect.radius}
          fill="none"
          stroke={t.peakOutline}
          strokeWidth={PICKER_RANGE.borderWidth}
        />
      ) : null}
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

export const TimeMatchingCard = memo(function TimeMatchingCard({
  windows,
  members,
  expectedCount,
  currentUid,
  isHost,
  onLock,
  locking,
}: {
  windows: TimePlanWindow[];
  members: TimePlanMember[];
  expectedCount?: number;
  currentUid?: string;
  isHost: boolean;
  onLock?: (window: TimePlanWindow, startsAt: string, endsAt: string) => void;
  locking?: boolean;
}) {
  const t = usePlanningColors();
  const reducedMotion = useReducedMotion();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedHighlightKey, setSelectedHighlightKey] = useState<string | null>(null);
  const [finalRange, setFinalRange] = useState<TimeRangeValue | null>(null);
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
  const selectedHighlight = useMemo(
    () =>
      highlights.find((highlight) => highlightKey(highlight) === selectedHighlightKey) ??
      highlights[0],
    [highlights, selectedHighlightKey],
  );

  useEffect(() => {
    setSelectedHighlightKey((current) =>
      current && highlights.some((highlight) => highlightKey(highlight) === current) ? current : null,
    );
  }, [highlights]);

  useEffect(() => {
    setFinalRange(selectedHighlight ? initialActivityRange(selectedHighlight) : null);
  }, [selectedHighlight]);
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

  const selectedWindow = selectedHighlight
    ? ordered.find((entry) => entry.id === selectedHighlight.windowId)
    : undefined;
  const selectedSlotMinutes = selectedHighlight
    ? Math.max(
        MIN_ACTIVITY_MINUTES,
        Math.floor((selectedHighlight.slot.endMs - selectedHighlight.slot.startMs) / 60_000),
      )
    : MIN_ACTIVITY_MINUTES;

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <Text {...TEXT_FLEXIBLE} style={[styles.cardTitle, { color: t.text }]}>Zeitmatching</Text>
      {selectedHighlight ? (
        <TimeMatchingHighlight
          label="Bester gemeinsamer Zeitraum"
          time={`${selectedHighlight.dayLabel} · ${clockLabel(selectedHighlight.slot.startMs)}–${clockLabel(selectedHighlight.slot.endMs)}`}
          availability={`${selectedHighlight.slot.count} von ${Math.max(1, members.length)} können`}
          responses={`${members.length} von ${Math.max(members.length, expectedCount ?? members.length)} geantwortet`}
          leading={<Ionicons name="people" size={15} color={AMBER} />}
          theme={{
            background: t.faint,
            border: t.cardBorder,
            text: t.text,
            muted: t.muted,
            accent: AMBER,
            accentSoft: withAlpha(AMBER, 0.18),
            fonts: NATIVE_FONTS,
          }}
        />
      ) : (
        <Text {...TEXT_FLEXIBLE} style={[styles.emptyMatch, { color: t.muted }]}>
          Noch kein gemeinsamer Zeitraum
        </Text>
      )}

      {summaries.length > 1 ? (
        <View
          style={styles.summary}
          accessibilityRole={isHost ? 'radiogroup' : undefined}
        >
          <Text {...TEXT_FLEXIBLE} style={[styles.summaryLabel, { color: t.muted }]}>
            Gleich gute Alternativen
          </Text>
          {summaries.map((line, index) => {
            const highlight = highlights[index];
            const selectable = isHost && Boolean(onLock);
            const selected = selectedHighlight === highlight;
            return selectable ? (
              <Pressable
                key={highlightKey(highlight)}
                accessibilityRole="radio"
                accessibilityLabel={line}
                accessibilityState={{ selected }}
                onPress={() => setSelectedHighlightKey(highlightKey(highlight))}
                style={[
                  styles.summaryOption,
                  { borderColor: t.cardBorder },
                  selected ? { backgroundColor: t.faint, borderColor: AMBER } : null,
                ]}
              >
                <Text {...TEXT_FLEXIBLE} style={[styles.summaryValue, { color: t.text }]}>
                  {line}
                </Text>
              </Pressable>
            ) : (
              <Text key={highlightKey(highlight)} {...TEXT_FLEXIBLE} style={[styles.summaryValue, { color: t.text }]}>
                · {line}
              </Text>
            );
          })}
        </View>
      ) : null}

      <View style={styles.legend}>
        <Ionicons name="stats-chart" size={15} color={AMBER} />
        <Text {...TEXT_FLEXIBLE} style={[styles.legendText, { color: t.muted }]}>
          Je höher die Stufe, desto mehr Personen können. Tippe auf einen Tag für Details.
        </Text>
      </View>

      <View style={styles.axisRow}>
        <View style={{ width: LABEL_W }} />
        <View
          style={styles.plot}
          onLayout={(event: LayoutChangeEvent) => setPlotWidth(event.nativeEvent.layout.width)}
        >
          {marks.map((minutes) => {
            const fraction = (minutes - axis.startMinutes) / axis.spanMinutes;
            const atStart = fraction <= 0;
            const atEnd = fraction >= 1;
            return (
              <Text
                key={minutes}
                numberOfLines={1}
                maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                allowFontScaling={TEXT_CAPPED.allowFontScaling}
                style={[
                  styles.axisLabel,
                  {
                    color: t.muted,
                    left: percent(fraction),
                    marginLeft: atStart ? 0 : atEnd ? -32 : -16,
                    textAlign: atStart ? 'left' : atEnd ? 'right' : 'center',
                  },
                ]}
              >
                {formatAxisMinutes(minutes)}
              </Text>
            );
          })}
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
          // The row's OWN maximum — what the outline traces, what the number
          // states and what the screen reader reads. The winning window across
          // all rows is a different fact and keeps its own, stronger fill.
          const best = availability?.best ?? null;
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
                  <View style={styles.dayLabelLine}>
                    <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                      allowFontScaling={TEXT_CAPPED.allowFontScaling}
                      style={[styles.dayLabel, { color: t.text }]}
                    >
                      {dayLabelFor(Date.parse(window.startsAt))}
                    </Text>
                    <Ionicons
                      name={expanded ? 'chevron-down' : 'chevron-forward'}
                      size={13}
                      color={t.muted}
                    />
                  </View>
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
                      peak={best}
                    />
                  ) : null}

                  {best ? (
                    <PeakCount
                      axis={axis}
                      best={best}
                      dayStart={dayStart}
                      plotWidth={plotWidth}
                      chartTop={rowHeight - chartBottom - stepArea}
                      stepArea={stepArea}
                      total={availability?.totalCount ?? 0}
                    />
                  ) : null}
                </Animated.View>
              </Pressable>

              {detailVisible
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

      {isHost && selectedHighlight && selectedWindow && finalRange && onLock ? (
        <View style={[styles.finalPanel, { backgroundColor: t.faint, borderColor: t.cardBorder }]}>
          <Text {...TEXT_FLEXIBLE} style={[styles.finalTitle, { color: t.text }]}>
            Activity-Zeit festlegen
          </Text>
          <Text {...TEXT_FLEXIBLE} style={[styles.finalHint, { color: t.muted }]}>
            Wähle innerhalb des besten Zeitraums die tatsächliche Dauer.
          </Text>
          <TimeRangePicker
            value={finalRange}
            min={new Date(selectedHighlight.slot.startMs)}
            max={new Date(selectedHighlight.slot.endMs)}
            viewportRange={{
              start: new Date(selectedHighlight.slot.startMs),
              end: new Date(selectedHighlight.slot.endMs),
            }}
            stepMinutes={5}
            minDurationMinutes={MIN_ACTIVITY_MINUTES}
            maxDurationMinutes={selectedSlotMinutes}
            rezoomOnRelease={false}
            accent={AMBER}
            theme={{
              container: { height: 56, background: t.track, radius: 14 },
              labels: { color: t.muted, fontSize: TYPE.micro.fontSize },
              ticks: { color: t.cardBorder },
              startHandle: { color: t.handle },
              endHandle: { color: t.handle },
            }}
            renderRangeLabel={(range) => (
              <Text style={[styles.finalRangeLabel, { color: t.text }]}>
                {clockLabel(range.start.getTime())}–{clockLabel(range.end.getTime())}
              </Text>
            )}
            onChange={setFinalRange}
            accessibilityLabelStart="Beginn der Activity"
            accessibilityLabelEnd="Ende der Activity"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: Boolean(locking) }}
            disabled={locking}
            onPress={() =>
              onLock(selectedWindow, finalRange.start.toISOString(), finalRange.end.toISOString())
            }
            style={[styles.lock, { backgroundColor: AMBER }, locking ? styles.lockBusy : null]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
              allowFontScaling={TEXT_CAPPED.allowFontScaling}
              style={styles.lockLabel}
            >
              {locking
                ? 'Termin wird festgelegt …'
                : `${clockLabel(finalRange.start.getTime())}–${clockLabel(finalRange.end.getTime())} festlegen`}
            </Text>
          </Pressable>
        </View>
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
  const t = usePlanningColors();
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
          color: t.peakLabel,
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
  hero: { borderRadius: 16, borderWidth: 1, marginTop: 10, padding: 12 },
  heroEyebrow: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  heroTime: { fontFamily: FONT.semibold, fontSize: TYPE.body.fontSize, marginTop: 3 },
  heroMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  coverBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  coverBadgeText: { fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  responseProgress: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  emptyMatch: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize, marginTop: 8 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  summaryLabel: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  summaryValue: { fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  summaryOption: {
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  legend: { alignItems: 'flex-start', flexDirection: 'row', gap: 7, marginTop: 12 },
  legendText: { flex: 1, fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize, lineHeight: 17 },

  axisRow: { flexDirection: 'row', height: AXIS_LABEL_H, marginTop: 10 },
  plot: { flex: 1, minWidth: 0, position: 'relative' },
  axisLabel: {
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
    marginLeft: -16,
    position: 'absolute',
    textAlign: 'center',
    top: 0,
    width: 32,
  },

  rows: { position: 'relative' },
  grid: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  gridLine: { bottom: 0, position: 'absolute', top: 0, width: StyleSheet.hairlineWidth },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: LABEL_W },

  dayRow: { alignItems: 'stretch', flexDirection: 'row' },
  dayLabelColumn: { justifyContent: 'center' },
  dayLabelLine: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  dayLabel: { fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  peakCount: {
    fontFamily: FONT.semibold,
    fontSize: TYPE.micro.fontSize,
    position: 'absolute',
    textAlign: 'center',
    zIndex: 2,
  },

  personRow: { alignItems: 'stretch', flexDirection: 'row', height: PERSON_H, marginTop: PERSON_GAP },
  personLabel: { justifyContent: 'center', width: LABEL_W },
  personName: { fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize },
  personNameSelf: { fontFamily: FONT.semibold },
  personBar: {
    bottom: 0,
    position: 'absolute',
    top: 0,
    zIndex: 3,
  },
  personEmpty: { alignSelf: 'center', fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize, left: 0, position: 'absolute' },

  finalPanel: { borderRadius: 16, borderWidth: 1, marginTop: 14, padding: 12 },
  finalTitle: { fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
  finalHint: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize, marginBottom: 10, marginTop: 2 },
  finalRangeLabel: { fontFamily: FONT.semibold, fontSize: TYPE.micro.fontSize },

  lock: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  lockBusy: { opacity: 0.6 },
  lockLabel: { color: '#2A1C06', fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
});
