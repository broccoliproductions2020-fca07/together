import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useAuth } from '@/features/auth';
import { useSyncOutbox, type SyncOperation } from '@/features/sync';
import { loaderSizeForIcon, TogetherLoader } from '@/shared/components';
import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';
import { haptics } from '@/shared/utils/haptics';

import { AVAILABLE_COLOR, PLANNING_COLOR, usePlanningColors } from '../planningTheme';
import { timePlanningService } from '../services/timePlanningService';
import type { TimePlan, TimePlanInterval, TimePlanMember, TimePlanWindow } from '../types';
import { aggregateWindow, type WindowAvailability } from '../utils/availability';
import { bestAcrossWindows } from '../utils/matchingSummary';
import { describePlanStatus } from '../utils/planSummary';
import {
  canSeedResponseDraft,
  fullInterval,
  replaceFirstInterval,
  responseDraftToResponses,
  seedResponseDraft,
} from '../utils/responseDraft';
import { TimePlanAnswerCard, type DayAnswer } from './TimePlanAnswerCard';
import { TimeTallyCard } from './TimeTallyCard';
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

function isTimePlanResponseOperation(
  operation: SyncOperation,
): operation is Extract<SyncOperation, { kind: 'timePlan.response' }> {
  return operation.kind === 'timePlan.response';
}

function isTimePlanCreateOperation(
  operation: SyncOperation,
): operation is Extract<SyncOperation, { kind: 'timePlan.create' }> {
  return operation.kind === 'timePlan.create';
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
  const [membersLoadedPlanId, setMembersLoadedPlanId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, DayAnswer>>({});
  const [intervals, setIntervals] = useState<Record<string, TimePlanInterval[]>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const savingRef = useRef(false);
  const lockingRef = useRef(false);
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

  const isMember = Boolean(uid && plan?.joined);

  /**
   * Availability is members-only, so this listener is keyed on MEMBERSHIP and
   * not merely on the sheet being open.
   *
   * Two reasons, and the second is a bug that already happened. Attaching it as
   * an invitee is a guaranteed permission error — and a Firestore listener does
   * not recover from one: the error callback fires once and the subscription is
   * dead. Joining then changed nothing on screen, because the listener that
   * would have reported the new membership had already given up. Keying it on
   * The viewer-relative `plan.joined` projection makes it
   * attach exactly when it is allowed to, including right after joining.
   */
  useEffect(() => {
    if (!planId || !uid || !isMember) {
      setMembers([]);
      setMembersLoadedPlanId(null);
      return;
    }
    setMembersLoadedPlanId(null);
    const revision = ++membersRevisionRef.current;
    const stopMembers = timePlanningService.subscribeMembers({ uid }, planId, (next) => {
      if (revision !== membersRevisionRef.current) return;
      setMembers(next);
      setMembersLoadedPlanId(planId);
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
    if (
      !plan ||
      !canSeedResponseDraft({
        planId: plan.id,
        seededPlanId: seededRef.current,
        isMember,
        membersLoadedPlanId,
      })
    ) {
      return;
    }
    seededRef.current = plan.id;
    const seed = seedResponseDraft(windows, ownMember);
    setAnswers(seed.answers);
    setIntervals(seed.intervals);
  }, [isMember, membersLoadedPlanId, ownMember, plan, windows]);

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
  const queuedCreation = useMemo(
    () =>
      syncOperations
        .filter(isTimePlanCreateOperation)
        .find((operation) => operation.payload.planId === planId && operation.status === 'queued'),
    [planId, syncOperations],
  );
  const failedCreation = useMemo(
    () =>
      syncOperations
        .filter(isTimePlanCreateOperation)
        .find((operation) => operation.payload.planId === planId && operation.status === 'failed'),
    [planId, syncOperations],
  );

  useEffect(() => {
    if (!failedResponse) return;
    setError('Deine Verfügbarkeit konnte nicht gespeichert werden. Bitte versuche es erneut.');
    setSaving(false);
    setEditing(true);
    haptics.warning();
  }, [failedResponse]);

  /**
   * The same aggregate the matching card builds, but kept here so the compact
   * row can name the favourite without a second data path. Note this one
   * includes the current user, because it describes the round as a whole.
   */
  const roundHighlights = useMemo(() => {
    const map = new Map<string, WindowAvailability>();
    windows.forEach((window) => {
      const result = aggregateWindow(window, members);
      if (result) map.set(window.id, result);
    });
    return bestAcrossWindows(windows, map);
  }, [members, windows]);

  const anyActive = windows.some((window) => (answers[window.id] ?? 'full') !== 'none');
  const memberResponseResolved = !isMember || membersLoadedPlanId === planId;
  const answering = ((!hasAnswered && !submitted) || editing) && memberResponseResolved;

  const setAnswer = useCallback((windowId: string, next: DayAnswer) => {
    setAnswers((current) => ({ ...current, [windowId]: next }));
    setError(null);
    haptics.selection();
  }, []);

  const setInterval = useCallback((windowId: string, next: TimePlanInterval) => {
    setIntervals((current) => ({
      ...current,
      [windowId]: replaceFirstInterval(current[windowId], next),
    }));
  }, []);

  /**
   * The way back out of an edit. "Meine Zeiten ändern" used to be a one-way
   * door: the only ways to leave the cards again were to send them or to close
   * the whole sheet, so a mis-tap on a switch had no undo. Re-seeding from the
   * stored member is what makes this a cancel rather than a second edit —
   * anything less would leave the changed answers sitting in state, ready to
   * be sent by the next visit.
   */
  const cancelEditing = useCallback(() => {
    const seed = seedResponseDraft(windows, ownMember);
    setAnswers(seed.answers);
    setIntervals(seed.intervals);
    setError(null);
    setEditing(false);
  }, [ownMember, windows]);

  async function submit() {
    if (!plan || !uid || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const responses = responseDraftToResponses(windows, answers, intervals);
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
      setError(planningErrorMessage(caught, 'Das hat nicht geklappt. Bitte versuche es erneut.'));
      haptics.warning();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function lock(window: TimePlanWindow, startsAt: string, endsAt: string) {
    if (!plan || !uid || lockingRef.current) return;
    lockingRef.current = true;
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
      setError(planningErrorMessage(caught, 'Der Termin konnte nicht festgelegt werden.'));
      haptics.warning();
    } finally {
      lockingRef.current = false;
      setLocking(false);
    }
  }

  const ctaLabel = saving
    ? 'Wird gespeichert …'
    : hasAnswered
      ? 'Änderungen übernehmen'
      : anyActive
        ? 'Zeiten übernehmen & beitreten'
        : 'Absage übernehmen & beitreten';

  if (!plan) {
    return (
      <View style={styles.loading}>
        {failedCreation ? (
          <>
            <Text style={[styles.errorText, { textAlign: 'center' }]}>
              Die Terminfindung konnte nicht angelegt werden. Bitte erstelle sie erneut.
            </Text>
            {onClose ? (
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondary}>
                <Text style={[styles.secondaryLabel, { color: t.muted }]}>Schließen</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <TogetherLoader color={PLANNING_COLOR} size={loaderSizeForIcon(20)} />
            {queuedCreation ? (
              <Text style={[styles.loadingText, { color: t.muted }]}>
                Offline gespeichert — die Terminfindung wird angelegt, sobald du wieder Netz hast.
              </Text>
            ) : null}
          </>
        )}
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
        /**
         * One list, one border. The instruction line that used to sit above it
         * ("Sag pro Tag kurz Bescheid …") is gone: three segments reading
         * Passt · Teilweise · Passt nicht explain themselves, and what the
         * sentence added — that "Teilweise" opens a picker — is discovered by
         * the tap that does it. A full line box to teach a control that teaches
         * itself is the most expensive kind of copy on a sheet this tall.
         */
        <View style={[styles.answerList, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          {windows.map((window, index) => (
            <TimePlanAnswerCard
              key={window.id}
              window={window}
              separated={index > 0}
              answer={answers[window.id] ?? 'full'}
              interval={intervals[window.id]?.[0] ?? fullInterval(window)}
              onAnswer={(next) => setAnswer(window.id, next)}
              onInterval={(next) => setInterval(window.id, next)}
            />
          ))}
        </View>
      ) : variant === 'summary' && onOpenMembers && onOpenMatching ? (
        <>
          <TimePlanRows
            members={members}
            memberCount={plan.memberCount}
            status={describePlanStatus({
              respondedCount: plan.memberCount,
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
          <TimeTallyCard
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
        <View style={styles.ctaRow}>
          {hasAnswered ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={cancelEditing}
              style={[styles.cancel, { borderColor: t.cardBorder }]}
            >
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
                allowFontScaling={TEXT_CAPPED.allowFontScaling}
                style={[styles.cancelLabel, { color: t.muted }]}
              >
                Abbrechen
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={() => void submit()}
            style={[styles.cta, saving ? { backgroundColor: t.faint } : null]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
              allowFontScaling={TEXT_CAPPED.allowFontScaling}
              style={[styles.ctaLabel, { color: saving ? t.muted : t.onAccent }]}
            >
              {ctaLabel}
            </Text>
          </Pressable>
        </View>
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
  loading: { alignItems: 'center', gap: 12, justifyContent: 'center', paddingVertical: 32 * 2 },
  loadingText: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize, textAlign: 'center' },
  subtitle: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  content: { gap: 12 },
  answerList: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  secondary: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  secondaryLabel: { fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  ctaRow: { flexDirection: 'row', gap: 8 },
  cta: {
    alignItems: 'center',
    backgroundColor: PLANNING_COLOR,
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 12,
  },
  ctaLabel: { fontFamily: FONT.semibold, fontSize: TYPE.body.fontSize },
  cancel: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
  },
  cancelLabel: { fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
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
