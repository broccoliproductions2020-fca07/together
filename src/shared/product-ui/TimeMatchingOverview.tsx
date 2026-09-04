import { useId, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

import { defaultTimeRangePickerTheme } from '../components/time-range-picker/theme';
import { withAlpha } from '../components/time-range-picker/theme';

import type { ProductUiFonts } from './types';

const MINUTE_MS = 60_000;
const PICKER_RANGE = defaultTimeRangePickerTheme('default', '#E0A23E').range;
const LABEL_W = 64;
const AXIS_LABEL_H = 15;
const STEP_RADIUS = 3;
const MIN_SLOT_MINUTES = 15;
const GRAPH_EDGE_INSET = Math.max(1, PICKER_RANGE.borderWidth) / 2;

export interface TimeMatchingWindow {
  id: string;
  startsAt: string;
  endsAt: string;
}

export interface TimeMatchingInterval {
  startsAt: string;
  endsAt: string;
}

export interface TimeMatchingMember {
  uid: string;
  responseStatus: 'pending' | 'responded';
  responsesByWindow: Record<string, TimeMatchingInterval[]>;
}

export interface TimeMatchingOverviewTheme {
  text: string;
  muted: string;
  grid: string;
  band: string;
  peakOutline: string;
  peakLabel: string;
  accent: string;
  fonts: ProductUiFonts;
}

export interface TimeMatchingOverviewProps {
  windows: TimeMatchingWindow[];
  members: TimeMatchingMember[];
  theme: TimeMatchingOverviewTheme;
  /** Makes the graphic self-describing without turning it into a fake control. */
  accessibilityLabel?: string;
}

interface Segment {
  startMs: number;
  endMs: number;
  count: number;
  uids: string[];
}

interface BestSlot {
  startMs: number;
  endMs: number;
  count: number;
  uids: string[];
}

interface Availability {
  totalCount: number;
  segments: Segment[];
  best: BestSlot | null;
}

interface DayAxis {
  startMinutes: number;
  endMinutes: number;
  spanMinutes: number;
}

interface StaircaseStep {
  startPx: number;
  endPx: number;
  height: number;
}

/**
 * The collapsed matrix from the native time-matching card, with its real
 * aggregation rules but none of the native card, expansion or lock controls.
 * It is deliberately a read-only graphic: the landing has no selection state
 * to change, so an affordance would be misleading.
 */
export function TimeMatchingOverview({
  windows,
  members,
  theme,
  accessibilityLabel = 'Übersicht der gemeinsamen Verfügbarkeiten',
}: TimeMatchingOverviewProps) {
  const [plotWidth, setPlotWidth] = useState(0);
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ordered = useMemo(
    () => [...windows].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)),
    [windows],
  );
  const axis = useMemo(() => sharedDayAxis(ordered), [ordered]);
  const marks = useMemo(() => axisHourMarks(axis, plotWidth), [axis, plotWidth]);
  const rowHeight = dayRowHeight(ordered.length);
  const availabilityByWindow = useMemo(() => {
    const availability = new Map<string, Availability>();
    ordered.forEach((window) => {
      const result = aggregateWindow(window, members);
      if (result) availability.set(window.id, result);
    });
    return availability;
  }, [members, ordered]);
  const highlightsByWindow = useMemo(() => {
    const candidates = ordered.flatMap((window) => {
      const availability = availabilityByWindow.get(window.id);
      return availability ? bestSlots(availability.segments).map((slot) => ({ windowId: window.id, slot })) : [];
    });
    if (candidates.length === 0) return new Map<string, BestSlot[]>();
    const topCount = Math.max(...candidates.map((entry) => entry.slot.count));
    const topByCount = candidates.filter((entry) => entry.slot.count === topCount);
    const topLength = Math.max(...topByCount.map((entry) => entry.slot.endMs - entry.slot.startMs));
    const map = new Map<string, BestSlot[]>();
    topByCount
      .filter((entry) => entry.slot.endMs - entry.slot.startMs === topLength)
      .forEach((entry) => {
        const current = map.get(entry.windowId) ?? [];
        current.push(entry.slot);
        map.set(entry.windowId, current);
      });
    return map;
  }, [availabilityByWindow, ordered]);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={styles.root}>
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
                style={[
                  styles.axisLabel,
                  {
                    color: theme.muted,
                    fontFamily: theme.fonts.body.fontFamily,
                    fontWeight: theme.fonts.body.fontWeight,
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

      <View style={styles.rows}>
        <View pointerEvents="none" style={styles.grid}>
          <View style={{ width: LABEL_W }} />
          <View style={styles.plot}>
            {marks.map((minutes) => (
              <View
                key={minutes}
                style={[
                  styles.gridLine,
                  {
                    backgroundColor: theme.grid,
                    left: percent((minutes - axis.startMinutes) / axis.spanMinutes),
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {ordered.map((window, index) => {
          const availability = availabilityByWindow.get(window.id);
          const dayStart = dayStartMs(window);
          const best = availability?.best ?? null;
          const highlighted = highlightsByWindow.get(window.id) ?? [];
          const stepArea = Math.max(12, Math.min(20, rowHeight - 14));
          const chartBottom = Math.round((rowHeight - stepArea) / 2);
          const chartTop = rowHeight - chartBottom - stepArea;
          return (
            <View key={window.id}>
              {index > 0 ? <View style={[styles.hairline, { backgroundColor: theme.grid }]} /> : null}
              <View style={[styles.dayRow, { height: rowHeight }]}>
                <View style={[styles.dayLabelColumn, { width: LABEL_W }]}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.dayLabel,
                      {
                        color: theme.text,
                        fontFamily: theme.fonts.semibold.fontFamily,
                        fontWeight: theme.fonts.semibold.fontWeight,
                      },
                    ]}
                  >
                    {dayLabelFor(Date.parse(window.startsAt))}
                  </Text>
                </View>
                <View style={[styles.plot, { backgroundColor: index % 2 === 0 ? theme.band : 'transparent' }]}>
                  {plotWidth > 0 && availability ? (
                    <Staircase
                      id={`${instanceId}-${window.id}`}
                      availability={availability}
                      axis={axis}
                      dayStart={dayStart}
                      width={plotWidth}
                      height={rowHeight}
                      baseY={rowHeight - chartBottom}
                      stepArea={stepArea}
                      highlighted={highlighted}
                      peak={best}
                      theme={theme}
                    />
                  ) : null}
                  {best ? (
                    <PeakCount
                      axis={axis}
                      best={best}
                      dayStart={dayStart}
                      plotWidth={plotWidth}
                      chartTop={chartTop}
                      stepArea={stepArea}
                      total={availability?.totalCount ?? 0}
                      theme={theme}
                    />
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

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
  theme,
}: {
  id: string;
  availability: Availability;
  axis: DayAxis;
  dayStart: number;
  width: number;
  height: number;
  baseY: number;
  stepArea: number;
  highlighted: BestSlot[];
  peak: BestSlot | null;
  theme: TimeMatchingOverviewTheme;
}) {
  const total = Math.max(1, availability.totalCount);
  const inHighlight = (startMs: number, endMs: number) =>
    highlighted.some((slot) => startMs >= slot.startMs && endMs <= slot.endMs);
  const steps = availability.segments.map((segment) => ({
    startPx: graphX(axisFraction(segment.startMs, dayStart, axis), width),
    endPx: graphX(axisFraction(segment.endMs, dayStart, axis), width),
    height: segment.count > 0 ? Math.max(3, (segment.count / total) * stepArea) : 0,
  }));
  const paths = staircasePaths(steps, baseY, STEP_RADIUS);
  if (paths.length === 0) return null;
  const clipId = `matching-stair-${id}`;
  const peakRect = peak ? rectForSlot(peak, total, axis, dayStart, width, baseY, stepArea) : null;

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
          return (
            <Rect
              key={`${segment.startMs}-${index}`}
              x={x - 0.5}
              y={0}
              width={next - x + 1}
              height={height}
              fill={withAlpha(theme.accent, inHighlight(segment.startMs, segment.endMs) ? 0.24 : 0.197)}
            />
          );
        })}
      </G>
      {paths.map((d) => (
        <Path key={`edge-${d}`} d={d} fill="none" stroke={withAlpha(theme.accent, 0.66)} strokeWidth={PICKER_RANGE.borderWidth} />
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
          stroke={theme.peakOutline}
          strokeWidth={PICKER_RANGE.borderWidth}
        />
      ) : null}
    </Svg>
  );
}

function PeakCount({
  axis,
  dayStart,
  best,
  total,
  stepArea,
  plotWidth,
  chartTop,
  theme,
}: {
  axis: DayAxis;
  dayStart: number;
  best: BestSlot;
  total: number;
  stepArea: number;
  plotWidth: number;
  chartTop: number;
  theme: TimeMatchingOverviewTheme;
}) {
  const left = axisFraction(best.startMs, dayStart, axis);
  const right = axisFraction(best.endMs, dayStart, axis);
  const height = Math.max(3, (best.count / Math.max(1, total)) * stepArea);
  if ((right - left) * plotWidth < 34 || height < 13) return null;
  return (
    <Text
      pointerEvents="none"
      numberOfLines={1}
      style={[
        styles.peakCount,
        {
          color: theme.peakLabel,
          fontFamily: theme.fonts.semibold.fontFamily,
          fontWeight: theme.fonts.semibold.fontWeight,
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

function aggregateWindow(window: TimeMatchingWindow, members: TimeMatchingMember[]): Availability | null {
  const startMs = Date.parse(window.startsAt);
  const endMs = Date.parse(window.endsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const answered = members
    .filter((member) => member.responseStatus === 'responded')
    .map((member) => ({ uid: member.uid, intervals: normalizeIntervals(member.responsesByWindow[window.id] ?? [], startMs, endMs) }));
  const edges = new Set<number>([startMs, endMs]);
  answered.forEach(({ intervals }) => intervals.forEach((interval) => {
    if (interval.startMs > startMs && interval.startMs < endMs) edges.add(interval.startMs);
    if (interval.endMs > startMs && interval.endMs < endMs) edges.add(interval.endMs);
  }));
  const sorted = [...edges].sort((left, right) => left - right);
  const raw: Segment[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const segmentStart = sorted[index];
    const segmentEnd = sorted[index + 1];
    if (segmentStart == null || segmentEnd == null || segmentEnd <= segmentStart) continue;
    const uids = answered
      .filter(({ intervals }) => intervals.some((interval) => interval.startMs <= segmentStart && interval.endMs >= segmentEnd))
      .map(({ uid }) => uid);
    raw.push({ startMs: segmentStart, endMs: segmentEnd, count: uids.length, uids });
  }
  const segments: Segment[] = [];
  raw.forEach((segment) => {
    const previous = segments[segments.length - 1];
    if (previous && previous.endMs === segment.startMs && sameUids(previous.uids, segment.uids)) {
      previous.endMs = segment.endMs;
    } else {
      segments.push({ ...segment, uids: [...segment.uids] });
    }
  });
  return { totalCount: answered.length, segments, best: bestSlots(segments)[0] ?? null };
}

function normalizeIntervals(intervals: TimeMatchingInterval[], minMs: number, maxMs: number): Array<{ startMs: number; endMs: number }> {
  const stepMs = 5 * MINUTE_MS;
  const parsed = intervals
    .map((interval) => ({ startMs: Date.parse(interval.startsAt), endMs: Date.parse(interval.endsAt) }))
    .filter((interval) => Number.isFinite(interval.startMs) && Number.isFinite(interval.endMs) && interval.endMs > interval.startMs)
    .map((interval) => ({
      startMs: Math.max(minMs, Math.round(interval.startMs / stepMs) * stepMs),
      endMs: Math.min(maxMs, Math.round(interval.endMs / stepMs) * stepMs),
    }))
    .filter((interval) => interval.endMs > interval.startMs)
    .sort((left, right) => left.startMs - right.startMs);
  const merged: Array<{ startMs: number; endMs: number }> = [];
  parsed.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (previous && interval.startMs <= previous.endMs) previous.endMs = Math.max(previous.endMs, interval.endMs);
    else merged.push(interval);
  });
  return merged;
}

function bestSlots(segments: Segment[]): BestSlot[] {
  const minDurationMs = MIN_SLOT_MINUTES * MINUTE_MS;
  const candidates: BestSlot[] = [];
  for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
    const start = segments[startIndex];
    if (!start) continue;
    let sharedUids = [...start.uids];
    if (sharedUids.length === 0) continue;
    for (let endIndex = startIndex; endIndex < segments.length; endIndex += 1) {
      const current = segments[endIndex];
      if (!current) continue;
      if (endIndex > startIndex) {
        const previous = segments[endIndex - 1];
        if (!previous || previous.endMs !== current.startMs) break;
        sharedUids = sharedUids.filter((uid) => current.uids.includes(uid));
      }
      if (sharedUids.length === 0) break;
      if (current.endMs - start.startMs < minDurationMs) continue;
      candidates.push({ startMs: start.startMs, endMs: current.endMs, count: sharedUids.length, uids: [...sharedUids] });
    }
  }
  if (candidates.length === 0) return [];
  const topCount = Math.max(...candidates.map((candidate) => candidate.count));
  const byCount = candidates.filter((candidate) => candidate.count === topCount);
  const topDuration = Math.max(...byCount.map((candidate) => candidate.endMs - candidate.startMs));
  const seen = new Set<string>();
  return byCount
    .filter((candidate) => candidate.endMs - candidate.startMs === topDuration)
    .sort((left, right) => left.startMs - right.startMs)
    .filter((candidate) => {
      const key = `${candidate.startMs}:${candidate.endMs}:${candidate.uids.join(',')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sameUids(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((uid, index) => uid === right[index]);
}

function sharedDayAxis(windows: TimeMatchingWindow[]): DayAxis {
  if (windows.length === 0) return { startMinutes: 0, endMinutes: 1440, spanMinutes: 1440 };
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  windows.forEach((window) => {
    const dayStart = dayStartMs(window);
    const start = Date.parse(window.startsAt);
    const end = Date.parse(window.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    earliest = Math.min(earliest, (start - dayStart) / MINUTE_MS);
    latest = Math.max(latest, (end - dayStart) / MINUTE_MS);
  });
  if (!Number.isFinite(earliest) || !Number.isFinite(latest) || latest <= earliest) {
    return { startMinutes: 0, endMinutes: 1440, spanMinutes: 1440 };
  }
  const startMinutes = Math.floor(earliest / 60) * 60;
  const endMinutes = Math.ceil(latest / 60) * 60;
  return { startMinutes, endMinutes, spanMinutes: Math.max(60, endMinutes - startMinutes) };
}

function dayStartMs(window: TimeMatchingWindow): number {
  const date = new Date(window.startsAt);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function axisFraction(ms: number, dayStart: number, axis: DayAxis): number {
  return ((ms - dayStart) / MINUTE_MS - axis.startMinutes) / axis.spanMinutes;
}

function axisHourMarks(axis: DayAxis, widthPx: number): number[] {
  if (axis.spanMinutes <= 0 || widthPx <= 0) return [];
  const perHour = widthPx / (axis.spanMinutes / 60);
  const step = perHour >= 34 ? 1 : perHour >= 17 ? 2 : perHour >= 11 ? 3 : 6;
  const marks: number[] = [];
  const firstHour = Math.ceil(axis.startMinutes / 60);
  const lastHour = Math.floor(axis.endMinutes / 60);
  for (let hour = firstHour; hour <= lastHour; hour += 1) {
    if ((hour - firstHour) % step === 0) marks.push(hour * 60);
  }
  const endpoint = lastHour * 60;
  const previous = marks[marks.length - 1];
  if (previous !== endpoint && previous != null) {
    const distance = ((endpoint - previous) / 60) * perHour;
    if (distance >= 34) marks.push(endpoint);
    else if (marks.length > 1) marks[marks.length - 1] = endpoint;
  }
  return marks;
}

function formatAxisMinutes(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${Math.floor(normalized / 60).toString().padStart(2, '0')}:${(normalized % 60).toString().padStart(2, '0')}`;
}

function dayLabelFor(ms: number): string {
  const date = new Date(ms);
  const weekday = date.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  return `${weekday} ${date.getDate()}.${date.getMonth() + 1}.`;
}

function dayRowHeight(dayCount: number): number {
  if (dayCount <= 3) return 48;
  if (dayCount === 4) return 44;
  if (dayCount === 5) return 40;
  if (dayCount === 6) return 36;
  return 32;
}

function graphX(fraction: number, width: number): number {
  const inset = Math.min(GRAPH_EDGE_INSET, width / 2);
  const clamped = Math.max(0, Math.min(1, fraction));
  return inset + clamped * Math.max(0, width - inset * 2);
}

function rectForSlot(slot: BestSlot, total: number, axis: DayAxis, dayStart: number, width: number, baseY: number, stepArea: number) {
  const x = graphX(axisFraction(slot.startMs, dayStart, axis), width);
  const right = graphX(axisFraction(slot.endMs, dayStart, axis), width);
  const slotWidth = right - x;
  if (slotWidth < 1) return null;
  const height = Math.max(3, (slot.count / total) * stepArea);
  return { x, y: baseY - height, width: slotWidth, height, radius: Math.min(STEP_RADIUS, slotWidth / 2, height / 2) };
}

function staircasePaths(steps: StaircaseStep[], baseY: number, radius: number): string[] {
  const runs: StaircaseStep[][] = [];
  let current: StaircaseStep[] = [];
  steps.forEach((step) => {
    if (step.height <= 0 || step.endPx <= step.startPx) {
      if (current.length) runs.push(current);
      current = [];
      return;
    }
    const previous = current[current.length - 1];
    if (previous && Math.abs(previous.endPx - step.startPx) > 0.51) {
      runs.push(current);
      current = [];
    }
    current.push(step);
  });
  if (current.length) runs.push(current);
  return runs.map((run) => roundedPolygonPath(staircasePoints(run, baseY), radius)).filter(Boolean);
}

function staircasePoints(run: StaircaseStep[], baseY: number): Array<{ x: number; y: number }> {
  if (run.length === 0) return [];
  const first = run[0];
  if (!first) return [];
  const points = [{ x: first.startPx, y: baseY }];
  run.forEach((step, index) => {
    const top = baseY - step.height;
    if (index === 0) points.push({ x: step.startPx, y: top });
    else {
      const previous = run[index - 1];
      if (previous) points.push({ x: step.startPx, y: baseY - previous.height });
      points.push({ x: step.startPx, y: top });
    }
    points.push({ x: step.endPx, y: top });
  });
  const last = run[run.length - 1];
  if (last) points.push({ x: last.endPx, y: baseY });
  return points;
}

function roundedPolygonPath(points: Array<{ x: number; y: number }>, radius: number): string {
  if (points.length < 3) return '';
  const parts: string[] = [];
  points.forEach((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    if (!previous || !next) return;
    const incoming = Math.hypot(point.x - previous.x, point.y - previous.y);
    const outgoing = Math.hypot(next.x - point.x, next.y - point.y);
    const cut = Math.min(radius, incoming / 2, outgoing / 2);
    const before = { x: point.x + ((previous.x - point.x) * cut) / incoming, y: point.y + ((previous.y - point.y) * cut) / incoming };
    const after = { x: point.x + ((next.x - point.x) * cut) / outgoing, y: point.y + ((next.y - point.y) * cut) / outgoing };
    if (index === 0) parts.push(`M ${round2(before.x)} ${round2(before.y)}`);
    else parts.push(`L ${round2(before.x)} ${round2(before.y)}`);
    parts.push(`Q ${round2(point.x)} ${round2(point.y)} ${round2(after.x)} ${round2(after.y)}`);
  });
  parts.push('Z');
  return parts.join(' ');
}

function percent(value: number): `${number}%` {
  return `${Math.max(0, Math.min(100, value * 100))}%`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  axisRow: { flexDirection: 'row', height: AXIS_LABEL_H },
  plot: { flex: 1, minWidth: 0, position: 'relative' },
  axisLabel: { fontSize: 11, position: 'absolute', top: 0, width: 32 },
  rows: { position: 'relative' },
  grid: { bottom: 0, flexDirection: 'row', left: 0, position: 'absolute', right: 0, top: 0 },
  gridLine: { bottom: 0, position: 'absolute', top: 0, width: StyleSheet.hairlineWidth },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: LABEL_W },
  dayRow: { alignItems: 'stretch', flexDirection: 'row' },
  dayLabelColumn: { justifyContent: 'center' },
  dayLabel: { fontSize: 12 },
  peakCount: { fontSize: 11, position: 'absolute', textAlign: 'center', zIndex: 2 },
});
