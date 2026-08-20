import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';

import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import type { ActivityDraft } from '../../types';
import { addMinutes, durationMinutes, parseISO, toISO } from '../../utils/datetime';
import { MODE_ACCENT_SEQUENCE } from '../../utils/modeAccent';
import { draftDurationMinutes } from '../../utils/modeDefaults';
import { DayStrip } from '../DayStrip';
import { ActivityTimeBand } from '../ActivityTimeBand';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Rail geometry is deliberately MODE-INDEPENDENT.
 *
 * The start handle can now drag a Jetzt into a Soon and back, and the mode flips
 * mid-gesture. If origin or length depended on the mode, the whole rail would
 * re-lay-out under the finger at the exact moment of the flip and the span would
 * appear to jump — the one thing a direct-manipulation control must never do.
 * One origin rule, one length, both derived from the span alone.
 *
 * 36 h is a minimum, not a size: `railMinutesFor` grows it to contain whatever
 * span it is handed. It has to cover a midnight-anchored day plus the 12 h
 * maximum duration (a 23:45 start ends at 11:45 the next day).
 */
const RAIL_MINUTES = 36 * 60;
const RAIL_TAIL_MINUTES = 2 * 60;
/**
 * How close to now the start has to sit to count as "Jetzt".
 *
 * One snap step. The handle has to be pushed against the left wall — the
 * earliest slot the band offers — before the mode flips, so a time you place
 * deliberately stays a plan even if it is only ten minutes out. That preserves
 * the older rule that any concrete clock time is a `soon`.
 */
const NOW_TOLERANCE_MS = 5 * 60_000;

function railMinutesFor(originMs: number, endMs: number): number {
  const spanEndMinutes = Math.ceil((endMs - originMs) / 60_000);
  return Math.max(RAIL_MINUTES, spanEndMinutes + RAIL_TAIL_MINUTES);
}

function floorToHour(date: Date): Date {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  return next;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function clock(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function dayLabel(date: Date): string {
  const today = startOfDay(new Date());
  const days = Math.round((startOfDay(date).getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return 'Heute';
  if (days === 1) return 'Morgen';
  if (days < 7) return date.toLocaleDateString('de-DE', { weekday: 'long' });
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} Min`;
  if (rest === 0) return `${hours} Std`;
  return `${hours} Std ${rest} Min`;
}

/**
 * The offer rows are a SECONDARY path and are coloured like one.
 *
 * They used to carry five accent surfaces each — border, fill, icon disc, icon
 * and chevron — which made an optional detour as loud as the bar the whole
 * bench is about. With nine accent-bearing elements on the page the colour
 * stopped meaning "mode" and started meaning "theme". The accent now marks the
 * span itself and the committing action, nothing else.
 */
const OFFER_ICON = 'rgba(244,245,247,0.62)';
const OFFER_CHEVRON = 'rgba(244,245,247,0.38)';

/** True while the span begins at the earliest moment the band can offer. */
export function spanStartsNow(startMs: number, nowMs: number): boolean {
  return startMs <= nowMs + NOW_TOLERANCE_MS;
}

export interface ScheduleBenchProps {
  draft: ActivityDraft;
  accent: string;
  editing: boolean;
  /** 0 = now, 1 = soon. Drives the band's colour so a mode flip fades. */
  accentProgress: SharedValue<number>;
  onChange: (draft: ActivityDraft) => void;
  /** Renders the multi-window planner in place of the single band. */
  planning?: boolean;
  /**
   * How many windows the planner has produced. Once there are any, the single
   * band is no longer the answer to "wann" and must not be shown as if it were.
   */
  offerCount?: number;
  /** Enters/leaves planning. Absent = the mode is unavailable at all (edit).
   * Present in Jetzt too, where the footer simply does not offer it. */
  onPlanningChange?: (planning: boolean) => void;
  /** Discards the proposed windows and brings the single band back. Offered on
   * the proposals row itself: an action has to be undoable where it left you,
   * not only from inside the mode you have to re-enter to find the exit. */
  onFixedTime?: () => void;
  /** The planner itself, handed in so the bench does not depend on the
   * time-planning feature — the composer already owns that state. */
  planner?: ReactNode;
}

/**
 * The single time control for both modes — what used to be NowFields and
 * SoonFields.
 *
 * Its LAYOUT is mode-independent, and that is the rule to keep: the same
 * summary line, the same day strip, the same band and the same fixed-height
 * slot below it in Jetzt as in Soon. The mode is decided by dragging the start
 * handle, so a mode change happens WHILE the band is under a finger — anything
 * that mounts, unmounts or resizes at that moment moves the rail away from the
 * thumb that is dragging it. Only colour, wording and the slot's occupant may
 * change, and those cross-fade.
 *
 * In Jetzt the span sits on a provisional start frozen when the sheet opened
 * and is re-stamped at publish time (`resolveDraftForPublish`), which is why
 * nothing here prints a clock time for that mode — it would drift while the
 * person is still typing. What they edit there is the DURATION.
 */
export function ScheduleBench({
  draft,
  accent,
  editing,
  accentProgress,
  onChange,
  planning = false,
  offerCount = 0,
  onPlanningChange,
  onFixedTime,
  planner,
}: ScheduleBenchProps) {
  const reducedMotion = useReducedMotion();
  const isNow = draft.mode === 'now';
  const start = draft.startsAt ? parseISO(draft.startsAt) : new Date();
  const end = draft.endsAt
    ? parseISO(draft.endsAt)
    : addMinutes(start, draftDurationMinutes(draft));
  // From the span itself, not from the draft's stored duration: the band emits
  // both ends on every frame of a drag, so this is what stays live.
  const spanMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));

  /**
   * Today anchors on the hour, another day on its midnight.
   *
   * `Math.min(start, now)` matters: it guarantees the current moment is never
   * left of the rail, which is what lets the start handle be dragged back to
   * "now" from anywhere. No `isNow` anywhere in here — see RAIL_MINUTES.
   */
  const naturalOrigin = isSameDay(start, new Date())
    ? floorToHour(new Date(Math.min(start.getTime(), Date.now()))).getTime()
    : startOfDay(start).getTime();

  const [anchorMs, setAnchorMs] = useState(() => naturalOrigin);

  // Re-anchor only when the span would sit BEFORE the rail — dragging left
  // across midnight, a new day from the strip, or a fresh draft. Never merely
  // because the start moved forward past midnight.
  const originMs = start.getTime() < anchorMs ? naturalOrigin : anchorMs;

  useEffect(() => {
    if (originMs !== anchorMs) setAnchorMs(originMs);
  }, [anchorMs, originMs]);

  const railMinutes = railMinutesFor(originMs, end.getTime());

  /**
   * The BAND decides the mode, not a switch.
   *
   * Dragging the start onto the now-edge makes a plan a Jetzt; dragging it away
   * makes a Jetzt a plan. The rest of the sheet follows the mode change on its
   * own — the wash, the header icon, the accent and the CTA all animate off
   * `draft.mode` already. The past is unreachable regardless: `TimeBand` clamps
   * every drag to `earliestMs`.
   */
  function emit(nextStart: Date, nextEnd: Date) {
    const startsAt = toISO(nextStart);
    const endsAt = toISO(nextEnd);
    const minutes = durationMinutes(startsAt, endsAt);
    // An edit never re-decides the mode: an existing activity's start is a fact
    // other people have already acted on, and a stored `soon` that has begun
    // legitimately displays as `now` without being one.
    const nextMode = editing
      ? draft.mode
      : spanStartsNow(nextStart.getTime(), Date.now())
        ? 'now'
        : 'soon';
    onChange({
      ...draft,
      mode: nextMode,
      startsAt,
      endsAt,
      plannedDurationMinutes: minutes,
      expiresInMinutes: nextMode === 'now' ? minutes : undefined,
    });
  }

  /**
   * Planning takes the WHOLE workbench, it does not sit under the band.
   *
   * Both answer "when", so showing them together would ask the same question
   * twice with two different controls — and stacking a 31-day chooser under a
   * time rail is exactly the height that forced this into a full-screen sheet
   * before. One at a time, swapped with a cross-fade.
   */
  if (planning) {
    return (
      <Animated.View
        key="planning"
        entering={reducedMotion ? undefined : FadeIn.duration(220)}
        layout={reducedMotion ? undefined : LinearTransition.duration(260).easing(EASE)}
        style={styles.root}
      >
        {planner}
      </Animated.View>
    );
  }

  /**
   * Windows are proposed — the single span is not what happens any more.
   *
   * Leaving the band up would show one concrete time beside a CTA offering to
   * send several: two different answers to the same question, on one screen.
   * The row states what was decided and takes you back in to change it.
   */
  if (offerCount > 0 && onPlanningChange) {
    return (
      <Animated.View
        key="proposed"
        entering={reducedMotion ? undefined : FadeIn.duration(220)}
        layout={reducedMotion ? undefined : LinearTransition.duration(260).easing(EASE)}
        style={styles.root}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${offerCount} Zeitfenster bearbeiten`}
          onPress={() => onPlanningChange(true)}
          style={({ pressed }) => [
            styles.offer,
            styles.offerSurface,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.offerIcon}>
            <Ionicons name="calendar-outline" size={16} color={OFFER_ICON} />
          </View>
          <View style={styles.offerText}>
            <Text style={styles.offerTitle} {...TEXT_CAPPED}>
              {offerCount} Zeitfenster zur Abstimmung
            </Text>
            <Text style={styles.offerSub} {...TEXT_CAPPED}>
              Antippen zum Ändern
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={OFFER_CHEVRON} />
        </Pressable>
        {onFixedTime ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stattdessen eine feste Zeit wählen"
            onPress={onFixedTime}
            style={({ pressed }) => [styles.fixedTime, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={13} color="rgba(244,245,247,0.6)" />
            <Text style={styles.fixedTimeLabel} {...TEXT_CAPPED}>
              Doch eine feste Zeit
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    );
  }

  const bandProps = {
    startMs: start.getTime(),
    endMs: end.getTime(),
    originMs,
    railMinutes,
    accent,
    accentSequence: MODE_ACCENT_SEQUENCE,
    accentProgress,
    startFixed: false,
    nowMs: Date.now(),
    spanLabel: durationLabel(spanMinutes),
    onChange: (span: { startMs: number; endMs: number }) =>
      emit(new Date(span.startMs), new Date(span.endMs)),
  };

  return (
    <Animated.View
      key="single"
      entering={reducedMotion ? undefined : FadeIn.duration(220)}
      layout={reducedMotion ? undefined : LinearTransition.duration(260).easing(EASE)}
      style={styles.root}
    >
      {/* The span in words, on ONE line above the band: which day, from when to
          when, and how long that is. The band answers all three by position;
          this is the readable form of the same answer, and it is what makes the
          end time visible at all. Jetzt names no clock time — its start is
          provisional until publish, so a printed range would drift. */}
      <View style={styles.summary}>
        <Text
          style={[styles.summaryLead, isNow && { color: accent }]}
          numberOfLines={1}
          {...TEXT_FLEXIBLE}
        >
          {isNow ? 'Startet sofort' : dayLabel(start)}
        </Text>
        {isNow ? null : <Text style={styles.summarySep}>·</Text>}
        {/* The duration lives INSIDE the bar (see `spanLabel`), so this line
            never repeats it — in Jetzt that left the same two words twice, 40 px
            apart. The line answers WHICH slice, the bar HOW LONG. A very short
            span has no room for the label and then shows its duration nowhere;
            the range (or "startet sofort" plus the tab's "bis HH:MM") still says
            it, and widening the bar brings the label straight back. */}
        {isNow ? null : (
          <Text
            style={styles.summaryValue}
            numberOfLines={1}
            {...TEXT_FLEXIBLE}
          >
            {`${clock(start)} – ${clock(end)}`}
          </Text>
        )}
      </View>

      {/* Mounted in BOTH modes, and that is load-bearing.
          It used to arrive and leave with the mode, which meant that dragging
          the start onto the now-edge tore ~54 dp out of the workbench mid-drag:
          the sheet is bottom-anchored, so the whole rail jumped down under the
          finger at the exact frame the colour changed. A direct-manipulation
          control may never move while it is being manipulated. The strip also
          earns its place in Jetzt — picking a day is the second way to turn a
          Jetzt back into a plan, and "Heute" is simply the truth there. */}
      <DayStrip
        value={start}
        onChange={(nextDay) => {
          // Choosing a day IS the deliberate re-anchor. Carry the whole span,
          // not just its start — moving to Saturday must not shorten it.
          setAnchorMs(startOfDay(nextDay).getTime());
          const shift = nextDay.getTime() - start.getTime();
          emit(nextDay, new Date(end.getTime() + shift));
        }}
      />

      {/* `startFixed` is false in BOTH modes now. The start handle is what turns
          a Jetzt into a plan and back, so removing it in Now-mode would remove
          the gesture the whole interaction rests on. The old reason for the cap
          — "a handle that refuses to move is worse than no handle" — only held
          while the start genuinely could not move. */}
      {/* The rebuilt `TimeRangePicker`, behind an adapter that speaks the
          scheduler's prop shape. It emits a span and nothing else, so the
          Jetzt/Soon flip in `emit` below is what decides the mode. */}
      <ActivityTimeBand {...bandProps} />

      {/* ONE slot with a FIXED height, holding whichever of the two belongs to
          the current mode, and both of them positioned absolutely inside it.
          They live below the band, so swapping them in flow would resize the
          workbench — and the workbench resizing mid-drag is what made the mode
          flip feel like a rebuild. Absolute children also let the outgoing and
          the incoming one cross-fade over each other instead of stacking.
          An edit never re-decides the mode, so it reserves nothing. */}
      {editing ? null : (
        <View style={styles.footerSlot}>
          {isNow ? (
            <Animated.View
              entering={reducedMotion ? undefined : FadeIn.duration(200)}
              exiting={reducedMotion ? undefined : FadeOut.duration(140)}
              style={styles.footerFill}
            >
              <Text style={styles.hint} {...TEXT_FLEXIBLE}>
                Startet, sobald du sie erstellst. Zieh den Start nach rechts oder wähle einen Tag,
                um sie zu planen.
              </Text>
            </Animated.View>
          ) : onPlanningChange ? (
            <Animated.View
              entering={reducedMotion ? undefined : FadeIn.duration(200)}
              exiting={reducedMotion ? undefined : FadeOut.duration(140)}
              style={styles.footerFill}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mehrere Zeitfenster vorschlagen"
                onPress={() => onPlanningChange(true)}
                style={({ pressed }) => [
                  styles.offer,
                  styles.offerSurface,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.offerIcon}>
                  <Ionicons name="people-outline" size={16} color={OFFER_ICON} />
                </View>
                <View style={styles.offerText}>
                  <Text style={styles.offerTitle} {...TEXT_CAPPED}>
                    Mehrere Zeitfenster vorschlagen
                  </Text>
                  <Text style={styles.offerSub} {...TEXT_CAPPED}>
                    Zur Abstimmung stellen
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={OFFER_CHEVRON} />
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /** Fills the reserved slot so the two mode-specific rows can cross-fade in
   * place, with the shorter one optically centred in the taller one's height. */
  footerFill: {
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  /** The offer row's own height — the taller of the two occupants. */
  footerSlot: { height: 52 },
  hint: {
    color: 'rgba(244,245,247,0.45)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
  },
  offer: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
  },
  offerIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  offerSub: {
    color: 'rgba(244,245,247,0.5)',
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
    marginTop: 1,
  },
  offerSurface: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)' },
  offerText: { flex: 1 },
  fixedTime: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    height: 36,
    paddingHorizontal: 10,
  },
  fixedTimeLabel: {
    color: 'rgba(244,245,247,0.6)',
    fontFamily: FONT.semibold,
    fontSize: TYPE.micro.fontSize,
  },
  offerTitle: { color: '#F4F5F7', fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  pressed: { opacity: 0.75 },
  root: { gap: 10 },
  summary: { alignItems: 'baseline', flexDirection: 'row', gap: 6 },
  summaryLead: {
    color: 'rgba(244,245,247,0.62)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
  },
  summaryMeta: {
    color: 'rgba(244,245,247,0.45)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
  },
  summarySep: { color: 'rgba(244,245,247,0.28)', fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  summaryValue: { color: '#F4F5F7', fontFamily: FONT.bold, fontSize: TYPE.label.fontSize },
});
