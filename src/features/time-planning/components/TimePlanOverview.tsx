import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

import {
  AVAILABLE_COLOR,
  PLANNING_COLOR,
  UNAVAILABLE_COLOR,
  usePlanningColors,
  type PlanningSurfaceColors,
} from '../planningTheme';
import type { TimePlanMember, TimePlanWindow } from '../types';
import {
  aggregateWindow,
  memberIntervals,
  rankWindows,
  type WindowAvailability,
} from '../utils/availability';
import { axisHourMarks, formatAxisMinutes, sharedDayAxis } from '../utils/dayAxis';
import { AvailabilityAxis, AvailabilityRow, AvailabilityStrip } from './AvailabilityStrip';

/**
 * The shared overview: every proposed day on ONE time-of-day axis.
 *
 * Reading is chronological and deciding is ranked — deliberately two different
 * orders. Floating the best day to the top before someone has answered nudges
 * them toward it; the host's lock button is where a ranking belongs, because
 * there the ranking IS the question.
 *
 * Tapping a day fans it out in place into one row per person. The aggregate
 * stays above as the sum line, because the density is literally those rows
 * stacked — take it away and the fan-out stops explaining anything.
 */

const LABEL_WIDTH = 62;
const COUNT_WIDTH = 58;
/** Above this many people, individual rows are a wall nobody reads and the
 * stacking metaphor stops holding — 30 layers cannot be told apart. */
const MAX_FANNED_ROWS = 10;

/** Compact on purpose: the label column is fixed so every row's strip starts
 * at the same x, and "Fr., 21. Aug." does not fit in it. Truncating the date
 * away would leave rows that cannot be told apart. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const weekday = date.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  return `${weekday} ${date.getDate()}.${date.getMonth() + 1}.`;
}

/** The long form, for screen readers and anywhere with room. */
function fullDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function clock(ms: number): string {
  const date = new Date(ms);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function Face({
  initials,
  state,
  t,
}: {
  initials: string;
  state: 'yes' | 'no' | 'pending';
  t: PlanningSurfaceColors;
}) {
  return (
    <View
      style={[
        styles.face,
        state === 'yes'
          ? styles.faceYes
          : state === 'no'
            ? { backgroundColor: t.faint }
            : { borderColor: t.faint, borderStyle: 'dashed', borderWidth: 1 },
      ]}
    >
      <Text
        maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
        allowFontScaling={TEXT_CAPPED.allowFontScaling}
        style={[styles.faceText, { color: t.muted }, state === 'yes' ? styles.faceTextYes : null]}
      >
        {initials.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

/** Above {@link MAX_FANNED_ROWS} the answers are grouped instead of listed.
 * "28 können den ganzen Abend" is readable; twenty-eight bars are not. */
function groupedRows(window: TimePlanWindow, members: TimePlanMember[]) {
  const windowStart = Date.parse(window.startsAt);
  const windowEnd = Date.parse(window.endsAt);
  let whole = 0;
  let partial = 0;
  let none = 0;
  let pending = 0;
  members.forEach((member) => {
    const intervals = memberIntervals(member, window);
    if (!intervals) {
      pending += 1;
      return;
    }
    if (intervals.length === 0) {
      none += 1;
      return;
    }
    const covers =
      intervals.length === 1 &&
      Date.parse(intervals[0].startsAt) <= windowStart &&
      Date.parse(intervals[0].endsAt) >= windowEnd;
    if (covers) whole += 1;
    else partial += 1;
  });
  return [
    whole ? `${whole} können den ganzen Zeitraum` : null,
    partial ? `${partial} können teilweise` : null,
    none ? `${none} können nicht` : null,
    pending ? `${pending} haben noch nicht geantwortet` : null,
  ].filter((line): line is string => Boolean(line));
}

export const TimePlanOverview = memo(function TimePlanOverview({
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
  const [axisWidth, setAxisWidth] = useState(0);

  const ordered = useMemo(
    () =>
      [...windows].sort(
        (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
      ),
    [windows],
  );
  const axis = useMemo(() => sharedDayAxis(ordered), [ordered]);
  const marks = useMemo(() => axisHourMarks(axis, axisWidth), [axis, axisWidth]);

  const availabilityByWindow = useMemo(() => {
    const map = new Map<string, WindowAvailability>();
    ordered.forEach((window) => {
      const result = aggregateWindow(window, members);
      if (result) map.set(window.id, result);
    });
    return map;
  }, [members, ordered]);

  const pendingCount = members.filter((member) => member.responseStatus !== 'responded').length;
  const answeredCount = members.length - pendingCount;

  const bestWindow = useMemo(() => {
    const ranked = rankWindows([...availabilityByWindow.values()]);
    const top = ranked[0];
    if (!top?.best) return null;
    const window = ordered.find((entry) => entry.id === top.windowId);
    return window ? { window, best: top.best } : null;
  }, [availabilityByWindow, ordered]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: t.text }]}>Gemeinsame Zeit</Text>
        <Text style={[styles.headerMeta, { color: t.muted }]}>
          {pendingCount > 0
            ? `${answeredCount} von ${members.length} geantwortet`
            : `${members.length} ${members.length === 1 ? 'Antwort' : 'Antworten'}`}
        </Text>
      </View>

      <View style={styles.axisRow}>
        <View style={{ width: LABEL_WIDTH }} />
        <View style={styles.axisArea} onLayout={(event: LayoutChangeEvent) => setAxisWidth(event.nativeEvent.layout.width)}>
          <AvailabilityAxis axis={axis} marks={marks} format={formatAxisMinutes} />
        </View>
        <View style={{ width: COUNT_WIDTH }} />
      </View>

      <Animated.View layout={reducedMotion ? undefined : LinearTransition.duration(220)}>
        {ordered.map((window) => {
          const availability = availabilityByWindow.get(window.id) ?? null;
          const expanded = expandedId === window.id;
          const best = availability?.best;
          const fanned = members.length <= MAX_FANNED_ROWS;
          return (
            <View key={window.id} style={styles.dayBlock}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${fullDayLabel(window.startsAt)}, ${
                  best ? `${best.count} von ${availability?.totalCount ?? 0} können` : 'niemand kann'
                }. Antippen für die einzelnen Antworten.`}
                // Only one day open at a time: the stack is what makes the axis
                // worth sharing, and three expanded days push it off screen.
                onPress={() => setExpandedId(expanded ? null : window.id)}
                style={styles.dayRow}
              >
                <View style={{ width: LABEL_WIDTH }}>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                    allowFontScaling={TEXT_CAPPED.allowFontScaling}
                    style={[styles.dayLabel, { color: t.text }]}
                  >
                    {dayLabel(window.startsAt)}
                  </Text>
                </View>
                <View style={styles.axisArea}>
                  <AvailabilityStrip window={window} axis={axis} availability={availability} />
                </View>
                <View style={[styles.countCell, { width: COUNT_WIDTH }]}>
                  <Text style={[styles.countText, { color: t.text }]}>
                    {best ? `${best.count}/${availability?.totalCount ?? 0}` : '–'}
                  </Text>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={13}
                    color={t.muted}
                  />
                </View>
              </Pressable>

              <View style={styles.summaryRow}>
                <View style={{ width: LABEL_WIDTH }} />
                <Text style={[styles.summaryText, { color: t.muted }]}>
                  {best
                    ? best.everyone
                      ? `alle ${best.count} können · ${clock(best.startMs)} – ${clock(best.endMs)}`
                      : `am besten ${clock(best.startMs)} – ${clock(best.endMs)}`
                    : 'niemand kann an diesem Tag'}
                </Text>
              </View>

              {expanded ? (
                <View style={styles.fanned}>
                  {fanned ? (
                    members.map((member, index) => {
                      const intervals = memberIntervals(member, window);
                      const isSelf = member.uid === currentUid;
                      const content = (
                        <View style={styles.personRow}>
                          <View style={{ width: LABEL_WIDTH }}>
                            <Text
                              numberOfLines={1}
                              maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                              allowFontScaling={TEXT_CAPPED.allowFontScaling}
                              style={[
                                styles.personName,
                                { color: t.muted },
                                isSelf ? { color: t.text, fontFamily: FONT.semibold } : null,
                              ]}
                            >
                              {isSelf ? 'Du' : member.displayName}
                            </Text>
                          </View>
                          <View style={styles.axisArea}>
                            {intervals && intervals.length > 0 ? (
                              <AvailabilityRow
                                window={window}
                                axis={axis}
                                intervals={intervals}
                                color={isSelf ? t.text : AVAILABLE_COLOR}
                              />
                            ) : (
                              <Text style={[styles.personEmpty, { color: t.muted }]}>
                                {intervals ? 'kann nicht' : 'noch keine Antwort'}
                              </Text>
                            )}
                          </View>
                          <View style={{ width: COUNT_WIDTH }} />
                        </View>
                      );
                      return reducedMotion ? (
                        <View key={member.uid}>{content}</View>
                      ) : (
                        // Out from under the strip, one after another — the
                        // stack coming apart into the rows it was made of.
                        <Animated.View
                          key={member.uid}
                          entering={FadeInDown.delay(index * 28).duration(180)}
                        >
                          {content}
                        </Animated.View>
                      );
                    })
                  ) : (
                    <View style={styles.groupedBlock}>
                      {groupedRows(window, members).map((line) => (
                        <Text key={line} style={[styles.groupedLine, { color: t.muted }]}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.facesRow}>
                  <View style={{ width: LABEL_WIDTH }} />
                  <View style={styles.faces}>
                    {members.slice(0, 8).map((member) => {
                      const intervals = memberIntervals(member, window);
                      const state =
                        !intervals
                          ? ('pending' as const)
                          : intervals.length === 0
                            ? ('no' as const)
                            : ('yes' as const);
                      return (
                        <Face key={member.uid} initials={member.initials} state={state} t={t} />
                      );
                    })}
                    {members.length > 8 ? (
                      <Text style={[styles.facesMore, { color: t.muted }]}>+{members.length - 8}</Text>
                    ) : null}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </Animated.View>

      {isHost && bestWindow && onLock ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(locking) }}
          disabled={locking}
          onPress={() =>
            onLock(
              bestWindow.window,
              new Date(bestWindow.best.startMs).toISOString(),
              new Date(bestWindow.best.endMs).toISOString(),
            )
          }
          style={[styles.lockButton, locking ? styles.lockButtonBusy : null]}
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
            allowFontScaling={TEXT_CAPPED.allowFontScaling}
            style={[styles.lockLabel, { color: t.onAccent }]}
          >
            {locking
              ? 'Termin wird festgelegt …'
              : `Auf ${dayLabel(bestWindow.window.startsAt)} ${clock(bestWindow.best.startMs)} – ${clock(bestWindow.best.endMs)} festlegen`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 12 },
  headerRow: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  headerTitle: { fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
  headerMeta: { fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize },
  axisRow: { alignItems: 'flex-end', flexDirection: 'row' },
  axisArea: { flex: 1, minWidth: 0 },
  dayBlock: { paddingVertical: 4 },
  dayRow: { alignItems: 'center', flexDirection: 'row', minHeight: 44 - 8 },
  dayLabel: { fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  countCell: { alignItems: 'center', flexDirection: 'row', gap: 2, justifyContent: 'flex-end' },
  countText: { fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  summaryRow: { flexDirection: 'row', marginTop: 2 },
  summaryText: { flex: 1, fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize },
  facesRow: { flexDirection: 'row', marginTop: 4 },
  faces: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 2 },
  facesMore: { fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize, marginLeft: 2 },
  face: { alignItems: 'center', borderRadius: 999, height: 20, justifyContent: 'center', width: 20 },
  faceYes: { backgroundColor: AVAILABLE_COLOR },
  // Not answered is an OUTLINE, never a dimmed fill: "hasn't said yet" and
  // "said no" are different facts and must not look like degrees of the same one.
  faceText: { fontFamily: FONT.semibold, fontSize: TYPE.micro.fontSize - 2 },
  faceTextYes: { color: '#0B1310' },
  fanned: { gap: 4, marginTop: 8 },
  personRow: { alignItems: 'center', flexDirection: 'row', minHeight: 18 },
  personName: { fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize },
  personEmpty: { fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize - 1 },
  groupedBlock: { gap: 2, paddingLeft: LABEL_WIDTH },
  groupedLine: { fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize },
  lockButton: {
    alignItems: 'center',
    backgroundColor: PLANNING_COLOR,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  lockButtonBusy: { opacity: 0.6 },
  lockLabel: { fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
});
