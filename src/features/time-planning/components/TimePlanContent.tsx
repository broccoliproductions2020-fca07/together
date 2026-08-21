import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useAuth } from '@/features/auth';
import { useSyncOutbox, type SyncOperation } from '@/features/sync';
import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';
import { haptics } from '@/shared/utils/haptics';

import { AVAILABLE_COLOR, PLANNING_COLOR, usePlanningColors } from '../planningTheme';
import { timePlanningService } from '../services/timePlanningService';
import type { TimePlan, TimePlanInterval, TimePlanMember, TimePlanWindow } from '../types';
import { aggregateWindow, type WindowAvailability } from '../utils/availability';
import { bestAcrossWindows } from '../utils/matchingSummary';
import { describePlanStatus } from '../utils/planSummary';
import { normalizeIntervals } from '../utils/intervals';
import { TimePlanAnswerCard, type DayAnswer } from './TimePlanAnswerCard';
import { TimeMatchingCard } from './TimeMatchingCard';
import { TimePlanMembersList, TimePlanRows } from './TimePlanRows';

/**
 * The Terminfindung surface — rendered INSIDE the normal marker detail sheet,
 * where a fixed activity shows its time. It is not a sheet of its own: a round
 * is an ordinary thing on the map, so tapping it must give the same container,
 * the same header and the same place row as everything else. A second detail
 * surface is exactly what `MarkerDetailSheet` exists to prevent.
 *
 * Two states, and which one you get depends on one thing only: whether you
 * have answered.
 *
 * - Not a member → the answer cards. Answering IS joining, in ONE call, because
 *   a member without an availability is a name the host waits on forever.
 *   Closing without answering saves nothing and makes you no member.
 * - Member → the shared overview, and for the host the button that ends the
 *   round by turning it into a real Activity.
 */

const MINUTE_MS = 60_000;

function isTimePlanResponseOperation(
  operation: SyncOperation,
): operation is Extract<SyncOperation, { kind: 'timePlan.response' }> {
  return operation.kind === 'timePlan.response';
}

/**
 * Callable failures come in two flavours and only one of them may be shown.
 *
 * The messages this feature's callables throw are already German, user-facing
 * sentences. Everything else arrives as a bare provider code — "INTERNAL",
 * "UNAVAILABLE" — which is precisely what the auth surface is forbidden to put
 * in front of a person, and for the same reason: it explains nothing and reads
 * as a crash. A real sentence has a lowercase letter and a space; a status code
 * has neither.
 */
function planningErrorMessage(caught: unknown, fallback: string): string {
  const message = caught instanceof Error ? caught.message : '';
  const looksWritten = /[a-zäöüß]/.test(message) && message.includes(' ');
  return looksWritten ? message : fallback;
}

function fullInterval(window: TimePlanWindow): TimePlanInterval {
  return { startsAt: window.startsAt, endsAt: window.endsAt };
}

/** What the answer cards hold, turned into what the server stores. An empty
 * list is the explicit "no" — that is the documented shape, not an omission. */
function toResponses(
  windows: TimePlanWindow[],
  answers: Record<string, DayAnswer>,
  intervals: Record<string, TimePlanInterval>,
): Record<string, TimePlanInterval[]> {
  return Object.fromEntries(
    windows.map((window) => {
      if (answers[window.id] !== 'yes') return [window.id, []];
      const chosen = intervals[window.id] ?? fullInterval(window);
      return [window.id, normalizeIntervals([chosen], window)];
    }),
  );
}

function seedFromMember(
  windows: TimePlanWindow[],
  member: TimePlanMember | undefined,
): { answers: Record<string, DayAnswer>; intervals: Record<string, TimePlanInterval> } {
  const answers: Record<string, DayAnswer> = {};
  const intervals: Record<string, TimePlanInterval> = {};
  windows.forEach((window) => {
    const stored = member?.responseStatus === 'responded' ? member.responsesByWindow[window.id] : undefined;
    intervals[window.id] = stored?.[0] ?? fullInterval(window);
    answers[window.id] = stored ? (stored.length > 0 ? 'yes' : 'no') : null;
  });
  return { answers, intervals };
}

export function TimePlanContent({
  planId,
  onOpenActivity,
  onClose,
  variant = 'full',
  onOpenMembers,
  onOpenMatching,
}: {
  planId: string;
  /** Called with the new Activity id once the host locks a slot. */
  onOpenActivity?: (activityId: string) => void;
  /** Closes the detail sheet — used only by the locked state's hand-off. */
  onClose?: () => void;
  /**
   * `summary` is the compact head of the detail sheet: two list rows instead
   * of the full timeline, which is then one tap away. The answering state is
   * NOT affected — someone who has not replied still gets the answer cards,
   * because on this surface answering is the whole point and a row pointing
   * at the thing you are already looking at says nothing.
   */
  variant?: 'summary' | 'full' | 'members';
  onOpenMembers?: () => void;
  onOpenMatching?: () => void;
}) {
  const t = usePlanningColors();
  const { user } = useAuth();
  const { operations: syncOperations } = useSyncOutbox();
  const uid = user?.id;
  const subscriptionRevisionRef = useRef(0);
  const membersRevisionRef = useRef(0);
  const [plan, setPlan] = useState<TimePlan | null>(null);
  const [members, setMembers] = useState<TimePlanMember[]>([]);
  const [answers, setAnswers] = useState<Record<string, DayAnswer>>({});
  const [intervals, setIntervals] = useState<Record<string, TimePlanInterval>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  // The member listener can only attach once the plan doc reports the new
  // membership, which is a round trip away. Without this the CTA sits there
  // saying "Antworten und beitreten" after it already succeeded.
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seededRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!planId || !uid) {
      setPlan(null);
      return;
    }
    const revision = ++subscriptionRevisionRef.current;
    const stopPlan = timePlanningService.subscribeTimePlan({ uid }, planId, (next) => {
      if (revision === subscriptionRevisionRef.current) setPlan(next);
    });
    return () => {
      subscriptionRevisionRef.current += 1;
      stopPlan();
    };
  }, [planId, uid]);

  const isMember = Boolean(uid && plan?.memberUids.includes(uid));

  /**
   * Availability is members-only, so this listener is keyed on MEMBERSHIP and
   * not merely on the sheet being open.
   *
   * Two reasons, and the second is a bug that already happened. Attaching it as
   * an invitee is a guaranteed permission error — and a Firestore listener does
   * not recover from one: the error callback fires once and the subscription is
   * dead. Joining then changed nothing on screen, because the listener that
   * would have reported the new membership had already given up. Keying it on
   * `plan.memberUids` (which the plan listener CAN read either way) makes it
   * attach exactly when it is allowed to, including right after joining.
   */
  useEffect(() => {
    if (!planId || !uid || !isMember) {
      setMembers([]);
      return;
    }
    const revision = ++membersRevisionRef.current;
    const stopMembers = timePlanningService.subscribeMembers({ uid }, planId, (next) => {
      if (revision === membersRevisionRef.current) setMembers(next);
    });
    return () => {
      membersRevisionRef.current += 1;
      stopMembers();
    };
  }, [isMember, planId, uid]);

  const ownMember = useMemo(() => members.find((member) => member.uid === uid), [members, uid]);
  const isHost = Boolean(plan && uid && plan.hostId === uid);
  const hasAnswered = ownMember?.responseStatus === 'responded';

  const windows = useMemo(
    () =>
      plan
        ? [...plan.sourceWindows].sort(
            (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
          )
        : [],
    [plan],
  );

  // Seed the cards once per plan. Re-seeding on every member update would wipe
  // an answer in progress the moment somebody else's response arrived.
  useEffect(() => {
    if (!plan || seededRef.current === plan.id) return;
    seededRef.current = plan.id;
    const seed = seedFromMember(windows, ownMember);
    setAnswers(seed.answers);
    setIntervals(seed.intervals);
  }, [ownMember, plan, windows]);

  const failedResponse = useMemo(
    () =>
      syncOperations
        .filter(isTimePlanResponseOperation)
        .find((operation) => operation.payload.planId === planId && operation.status === 'failed'),
    [planId, syncOperations],
  );
  const queuedResponse = useMemo(
    () =>
      syncOperations
        .filter(isTimePlanResponseOperation)
        .find((operation) => operation.payload.planId === planId && operation.status === 'queued'),
    [planId, syncOperations],
  );

  useEffect(() => {
    if (!failedResponse) return;
    setError('Deine Verfügbarkeit konnte nicht gespeichert werden. Bitte versuche es erneut.');
    setSaving(false);
    setEditing(true);
    haptics.warning();
  }, [failedResponse]);

  /** What the others have said, per window — drawn behind your own bar so a
   * span you could shift to meet everyone is visible WHILE you drag. */
  const availabilityByWindow = useMemo(() => {
    const map = new Map<string, WindowAvailability>();
    const others = members.filter((member) => member.uid !== uid);
    windows.forEach((window) => {
      const result = aggregateWindow(window, others);
      if (result) map.set(window.id, result);
    });
    return map;
  }, [members, uid, windows]);

  /**
   * The same aggregate the matching card builds, but kept here so the compact
   * row can name the favourite without a second data path. Note this one
   * includes the current user, unlike `availabilityByWindow` above, which
   * deliberately leaves you out so you can see what you are matching against.
   */
  const roundHighlights = useMemo(() => {
    const map = new Map<string, WindowAvailability>();
    windows.forEach((window) => {
      const result = aggregateWindow(window, members);
      if (result) map.set(window.id, result);
    });
    return bestAcrossWindows(windows, map);
  }, [members, windows]);

  const unanswered = windows.filter((window) => answers[window.id] == null).length;
  const anyYes = windows.some((window) => answers[window.id] === 'yes');
  const answering = (!hasAnswered && !submitted) || editing;

  const setAnswer = useCallback((windowId: string, next: DayAnswer) => {
    setAnswers((current) => ({ ...current, [windowId]: next }));
    setError(null);
    haptics.selection();
  }, []);

  const setInterval = useCallback((windowId: string, next: TimePlanInterval) => {
    setIntervals((current) => ({ ...current, [windowId]: next }));
  }, []);

  async function submit() {
    if (!plan || !uid || saving || unanswered > 0) return;
    setSaving(true);
    setError(null);
    const responses = toResponses(windows, answers, intervals);
    try {
      if (hasAnswered) {
        await timePlanningService.respondToTimePlan({ uid }, plan.id, plan.revision, responses);
      } else {
        await timePlanningService.joinTimePlan({ uid }, plan.id, responses);
      }
      haptics.success();
      setSubmitted(true);
      setEditing(false);
    } catch (caught) {
      setError(
        planningErrorMessage(caught, 'Das hat nicht geklappt. Bitte versuche es erneut.'),
      );
      haptics.warning();
    } finally {
      setSaving(false);
    }
  }

  async function lock(window: TimePlanWindow, startsAt: string, endsAt: string) {
    if (!plan || !uid || locking) return;
    setLocking(true);
    setError(null);
    try {
      await timePlanningService.lockTimePlan({ uid }, plan.id, window.id, {
        startsAt,
        endsAt,
      });
      haptics.success();
      // Deliberately does NOT close. The plan listener flips `status` to
      // `locked` a moment later and the sheet becomes the confirmation — which
      // is immediate and unambiguous. Closing and jumping straight to the new
      // Activity looked like nothing had happened at all: the activity feed has
      // not echoed the document yet, so there was nothing to open.
    } catch (caught) {
      setError(
        planningErrorMessage(caught, 'Der Termin konnte nicht festgelegt werden.'),
      );
      haptics.warning();
    } finally {
      setLocking(false);
    }
  }

  const ctaLabel = saving
    ? 'Wird gespeichert …'
    : unanswered > 0
      ? `Noch ${unanswered} ${unanswered === 1 ? 'Tag' : 'Tage'} offen`
      : hasAnswered
        ? 'Antwort speichern'
        : anyYes
          ? 'Antworten und beitreten'
          : 'Antworten · ich kann nicht';

  if (!plan) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={PLANNING_COLOR} />
      </View>
    );
  }

  if (variant === 'members') {
    return (
      <TimePlanMembersList
        members={members}
        currentUid={uid}
        hostId={plan.hostId}
        canRead={isMember}
      />
    );
  }

  return (
    <View style={styles.content}>
      <Text style={[styles.subtitle, { color: t.muted }]}>
        {plan.status === 'locked'
          ? 'Der Termin steht'
          : `Zeit wird noch gesucht · ${windows.length} ${windows.length === 1 ? 'Vorschlag' : 'Vorschläge'}`}
      </Text>

      {plan.status === 'locked' ? (
        <LockedNotice plan={plan} onOpenActivity={onOpenActivity} onClose={onClose} />
      ) : answering ? (
        <>
          <Text style={[styles.lead, { color: t.muted }]}>
            {hasAnswered
              ? 'Ändere, wann du kannst.'
              : 'Sag kurz, wann du kannst. Ein Tipp pro Tag reicht.'}
          </Text>
          {windows.map((window) => (
            <TimePlanAnswerCard
              key={window.id}
              window={window}
              availability={availabilityByWindow.get(window.id) ?? null}
              answer={answers[window.id] ?? null}
              interval={intervals[window.id] ?? fullInterval(window)}
              onAnswer={(next) => setAnswer(window.id, next)}
              onInterval={(next) => setInterval(window.id, next)}
            />
          ))}
        </>
      ) : variant === 'summary' && onOpenMembers && onOpenMatching ? (
        <>
          <TimePlanRows
            members={members}
            memberCount={plan.memberUids.length}
            status={describePlanStatus({
              respondedCount: plan.memberUids.length,
              expectedCount: plan.audienceUids.length,
              highlights: roundHighlights,
              canSeeFavourite: isMember,
            })}
            onOpenMembers={onOpenMembers}
            onOpenMatching={onOpenMatching}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditing(true)}
            style={styles.secondary}
          >
            <Ionicons name="create-outline" size={16} color={t.muted} />
            <Text style={[styles.secondaryLabel, { color: t.muted }]}>Meine Zeiten ändern</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TimeMatchingCard
            windows={windows}
            members={members}
            currentUid={uid}
            isHost={isHost}
            onLock={lock}
            locking={locking}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditing(true)}
            style={styles.secondary}
          >
            <Ionicons name="create-outline" size={16} color={t.muted} />
            <Text style={[styles.secondaryLabel, { color: t.muted }]}>Meine Zeiten ändern</Text>
          </Pressable>
        </>
      )}

      {error ? (
        <Animated.View entering={FadeIn.duration(140)} style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
        </Animated.View>
      ) : null}
      {queuedResponse ? (
        <Text style={styles.queued}>
          Offline gespeichert — wird gesendet, sobald du wieder Netz hast.
        </Text>
      ) : null}

      {plan.status === 'collecting' && answering ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: unanswered > 0 || saving }}
          disabled={unanswered > 0 || saving}
          onPress={() => void submit()}
          style={[
            styles.cta,
            unanswered > 0 || saving ? { backgroundColor: t.faint } : null,
          ]}
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
            allowFontScaling={TEXT_CAPPED.allowFontScaling}
            style={[
              styles.ctaLabel,
              { color: unanswered > 0 || saving ? t.muted : t.onAccent },
            ]}
          >
            {ctaLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function LockedNotice({
  plan,
  onOpenActivity,
  onClose,
}: {
  plan: TimePlan;
  onOpenActivity?: (activityId: string) => void;
  onClose?: () => void;
}) {
  const start = plan.lockedStartsAt ? Date.parse(plan.lockedStartsAt) : NaN;
  const end = plan.lockedEndsAt ? Date.parse(plan.lockedEndsAt) : NaN;
  const label = Number.isFinite(start)
    ? new Date(start).toLocaleDateString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : null;
  const time =
    Number.isFinite(start) && Number.isFinite(end)
      ? `${new Date(start).getHours().toString().padStart(2, '0')}:${new Date(start).getMinutes().toString().padStart(2, '0')} – ${new Date(end).getHours().toString().padStart(2, '0')}:${new Date(end).getMinutes().toString().padStart(2, '0')}`
      : null;
  const t = usePlanningColors();
  return (
    <View style={styles.locked}>
      <Ionicons name="checkmark-circle" size={28} color={AVAILABLE_COLOR} />
      <Text style={[styles.lockedTitle, { color: t.text }]}>{label ?? 'Der Termin steht'}</Text>
      {time ? <Text style={[styles.lockedTime, { color: t.muted }]}>{time}</Text> : null}
      {plan.activityId && onOpenActivity ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose?.();
            onOpenActivity(plan.activityId!);
          }}
          style={styles.lockedCta}
        >
          <Text style={styles.lockedCtaLabel}>Zur Aktivität</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 * 2 },
  subtitle: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  content: { gap: 12 },
  lead: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  secondary: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  secondaryLabel: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  cta: {
    alignItems: 'center',
    backgroundColor: PLANNING_COLOR,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 56,
  },
  ctaLabel: { fontFamily: FONT.semibold, fontSize: TYPE.body.fontSize },
  error: {
    backgroundColor: 'rgba(243,103,94,0.14)',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: '#F3675E', fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  queued: { fontFamily: FONT.medium, fontSize: TYPE.micro.fontSize },
  locked: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  lockedTitle: { fontFamily: FONT.bold, fontSize: TYPE.body.fontSize },
  lockedTime: { fontFamily: FONT.medium, fontSize: TYPE.label.fontSize },
  lockedCta: {
    alignItems: 'center',
    backgroundColor: PLANNING_COLOR,
    borderRadius: 16,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 52,
    paddingHorizontal: 24,
  },
  lockedCtaLabel: { color: '#FFFFFF', fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
});
