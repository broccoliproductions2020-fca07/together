import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

import { FRAME_COLOR, usePlanningColors } from '../planningTheme';
import type { TimePlanMember, TimePlanWindow } from '../types';
import { aggregateWindow, type WindowAvailability } from '../utils/availability';
import { clockLabel, dayLabelFor } from '../utils/matchingSummary';
import { TimePlanDayAnswers } from './TimePlanDayAnswers';

/**
 * The overview of a round: one row per proposed day, opening into the
 * individual answers.
 *
 * The poll model people already know — a count and a bar per option, tap an
 * option to see who is behind it. It replaced the stacked staircase in
 * September 2026 as the ONLY overview (`TimeMatchingCard` is deleted). The
 * staircase was not wrong, but it was a second machine
 * for the same question: two cards with different titles, different layouts
 * and a switch between them, so someone who saw both saw two features.
 *
 * The row states the BEST COMMON stretch, never the host's own window. The
 * count beside it has always meant "at the best time on this day, N can" — a
 * row printing the proposal's 18:00–24:00 next to "4 von 5" therefore read as
 * "four can the whole evening", which is a different and usually false claim.
 */

/** The bar has to read as a proportion at a glance, so an answered-but-tiny
 * share still gets a visible sliver rather than nothing at all. */
const MIN_BAR_FRACTION = 0.04;

/** Platform touch floor — every row opens its answers, for everyone. */
const MIN_TAP = 44;

interface TallyRow {
  window: TimePlanWindow;
  availability: WindowAvailability | null;
  count: number;
  total: number;
  leading: boolean;
}

export const TimeTallyCard = memo(function TimeTallyCard({
  windows,
  members,
  isHost,
  currentUid,
  onLock,
  locking,
}: {
  windows: TimePlanWindow[];
  members: TimePlanMember[];
  isHost: boolean;
  currentUid?: string;
  onLock?: (window: TimePlanWindow, startsAt: string, endsAt: string) => void;
  locking?: boolean;
}) {
  const t = usePlanningColors();
  const reducedMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ordered = useMemo(
    () =>
      [...windows].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)),
    [windows],
  );

  /**
   * Counts come from the SAME aggregation the matching card uses. A second
   * tally computed here would be a second definition of "can", and the two
   * would disagree the first time anyone touched either.
   */
  const rows = useMemo<TallyRow[]>(() => {
    const measured = ordered.map((window) => {
      const availability = aggregateWindow(window, members) ?? null;
      return {
        window,
        availability,
        count: availability?.best?.count ?? 0,
        total: availability?.totalCount ?? members.length,
      };
    });
    const top = Math.max(0, ...measured.map((row) => row.count));
    return measured.map((row) => ({ ...row, leading: top > 0 && row.count === top }));
  }, [members, ordered]);

  const respondedCount = members.length;
  /**
   * Chronological, never ranked. Sorting the best day to the top before people
   * have finished answering pushes the round in a direction nobody chose —
   * ranking belongs on the host's lock control, where the ranking IS the
   * question.
   */
  const leadingCount = rows.filter((row) => row.leading).length;

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <View style={styles.head}>
        <Text
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          style={[styles.title, { color: t.text }]}
        >
          Wer kann wann?
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          style={[styles.progress, { color: t.muted }]}
        >
          {respondedCount === 1 ? '1 Antwort' : `${respondedCount} Antworten`}
        </Text>
      </View>

      <Animated.View
        layout={reducedMotion ? undefined : LinearTransition.duration(200)}
        style={styles.rows}
      >
        {rows.map((row, index) => {
          const share = row.total > 0 ? row.count / row.total : 0;
          // Everyone opens a day, not just the host: seeing who can is the
          // whole reason the overview is worth opening. A day nobody answered
          // has nothing behind it.
          const openable = row.total > 0;
          const active = selectedId === row.window.id;
          const best = row.availability?.best ?? null;
          // The stretch the count actually refers to. Without a `best` nobody
          // can, and the proposal itself is the only honest thing left to name.
          const timeLabel = best
            ? `${clockLabel(best.startMs)}–${clockLabel(best.endMs)}`
            : `${clockLabel(Date.parse(row.window.startsAt))}–${clockLabel(Date.parse(row.window.endsAt))}`;

          return (
            <View key={row.window.id}>
              {index > 0 ? (
                <View style={[styles.hairline, { backgroundColor: t.cardBorder }]} />
              ) : null}
              <Pressable
                accessibilityRole={openable ? 'button' : 'text'}
                accessibilityState={openable ? { expanded: active } : undefined}
                accessibilityLabel={`${dayLabelFor(Date.parse(row.window.startsAt))}, ${row.count} von ${row.total} können ${timeLabel}`}
                accessibilityHint={openable ? 'Zeigt die einzelnen Antworten.' : undefined}
                disabled={!openable}
                onPress={() => setSelectedId(active ? null : row.window.id)}
                style={styles.row}
              >
                <View style={styles.rowHead}>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                    allowFontScaling={TEXT_CAPPED.allowFontScaling}
                    style={[styles.day, { color: t.text }]}
                  >
                    {dayLabelFor(Date.parse(row.window.startsAt))}
                  </Text>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                    allowFontScaling={TEXT_CAPPED.allowFontScaling}
                    style={[styles.time, { color: t.muted }]}
                  >
                    {timeLabel}
                  </Text>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                    allowFontScaling={TEXT_CAPPED.allowFontScaling}
                    style={[
                      styles.count,
                      { color: row.leading ? t.text : t.muted },
                      row.leading ? styles.countLeading : null,
                    ]}
                  >
                    {row.count} von {row.total}
                  </Text>
                  {openable ? (
                    <Ionicons
                      name={active ? 'chevron-down' : 'chevron-forward'}
                      size={13}
                      color={t.muted}
                    />
                  ) : null}
                </View>

                <View style={[styles.track, { backgroundColor: t.track }]}>
                  <View
                    style={[
                      styles.fill,
                      {
                        backgroundColor: FRAME_COLOR,
                        // Below the leader the same amber steps back, so the
                        // recommendation is carried by weight rather than by a
                        // second colour that would need its own meaning.
                        opacity: row.leading ? 1 : 0.42,
                        width: `${Math.round(
                          (row.count > 0 ? Math.max(share, MIN_BAR_FRACTION) : 0) * 100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </Pressable>

              {active ? (
                <Animated.View
                  entering={reducedMotion ? undefined : FadeIn.duration(160)}
                  exiting={reducedMotion ? undefined : FadeOut.duration(110)}
                >
                  <TimePlanDayAnswers
                    window={row.window}
                    members={members}
                    availability={row.availability}
                    currentUid={currentUid}
                  />

                  {/* The decision sits where the evidence is. It locks the best
                      COMMON stretch, not the host's whole proposal — locking
                      18:00–24:00 when only four can 20:00–22:00 would drop the
                      very people the round was run for. */}
                  {isHost && onLock && best ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(locking) }}
                      disabled={locking}
                      onPress={() =>
                        onLock(
                          row.window,
                          new Date(best.startMs).toISOString(),
                          new Date(best.endMs).toISOString(),
                        )
                      }
                      style={[
                        styles.lock,
                        { backgroundColor: FRAME_COLOR },
                        locking ? styles.busy : null,
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                        allowFontScaling={TEXT_CAPPED.allowFontScaling}
                        style={[styles.lockLabel, { color: t.onAccent }]}
                      >
                        {locking
                          ? 'Termin wird festgelegt …'
                          : `${dayLabelFor(Date.parse(row.window.startsAt))} ${timeLabel} festlegen`}
                      </Text>
                    </Pressable>
                  ) : null}
                </Animated.View>
              ) : null}
            </View>
          );
        })}
      </Animated.View>

      {rows.every((row) => row.count === 0) ? (
        <Text
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          style={[styles.hint, { color: t.muted }]}
        >
          Noch hat niemand geantwortet.
        </Text>
      ) : leadingCount > 1 ? (
        <Text
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          style={[styles.hint, { color: t.muted }]}
        >
          {leadingCount} Tage liegen gleichauf.
        </Text>
      ) : null}

    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 14 },
  head: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  title: { fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
  progress: { flexShrink: 1, fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  rows: { marginTop: 10 },
  hairline: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  row: { gap: 6, justifyContent: 'center', minHeight: MIN_TAP },
  rowHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  day: { fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize, minWidth: 62 },
  time: { flex: 1, fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize, minWidth: 0 },
  count: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  countLeading: { fontFamily: FONT.semibold },
  track: { borderRadius: 999, height: 8, overflow: 'hidden' },
  fill: { borderRadius: 999, height: '100%' },
  hint: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize, marginTop: 10 },
  lock: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 52,
    paddingHorizontal: 12,
  },
  busy: { opacity: 0.7 },
  lockLabel: { fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
});
