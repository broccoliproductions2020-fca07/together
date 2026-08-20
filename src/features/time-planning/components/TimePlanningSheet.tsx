import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth';
import { useSyncOutbox, type SyncOperation } from '@/features/sync';
import { haptics } from '@/shared/utils/haptics';

import type { TimePlan, TimePlanInterval, TimePlanMember, TimePlanWindow } from '../types';
import { timePlanningService } from '../services/timePlanningService';
import { fullAvailability, projectIntervalsToWindow, subtractInterval } from '../utils/intervals';
import { AvailabilityBand } from './AvailabilityBand';
import { AvailabilityMatrix } from './AvailabilityMatrix';

const AMBER = '#E0A23E';
const GREEN = '#41C08D';
const MUTED = 'rgba(244,245,247,0.52)';

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function clock(iso: string): string {
  const date = new Date(iso);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function sameWindowResponse(
  response: Record<string, TimePlanInterval[]>,
  window: TimePlanWindow,
): TimePlanInterval[] {
  return response[window.id] ?? fullAvailability(window);
}

function responseOf(member: TimePlanMember | undefined): Record<string, TimePlanInterval[]> {
  return member?.responseStatus === 'responded' ? member.responsesByWindow : {};
}

function sameResponses(
  left: Record<string, TimePlanInterval[]>,
  right: Record<string, TimePlanInterval[]>,
  windows: TimePlanWindow[],
): boolean {
  return windows.every((window) => {
    const leftIntervals = left[window.id] ?? [];
    const rightIntervals = right[window.id] ?? [];
    return (
      leftIntervals.length === rightIntervals.length &&
      leftIntervals.every(
        (interval, index) =>
          interval.startsAt === rightIntervals[index]?.startsAt &&
          interval.endsAt === rightIntervals[index]?.endsAt,
      )
    );
  });
}

function isTimePlanResponseOperation(
  operation: SyncOperation,
): operation is Extract<SyncOperation, { kind: 'timePlan.response' }> {
  return operation.kind === 'timePlan.response';
}

export function TimePlanningSheet({
  visible,
  planId,
  promptOnOpen = false,
  onClose,
}: {
  visible: boolean;
  planId?: string;
  /** Only a newly joined person sees the direct, non-destructive welcome question. */
  promptOnOpen?: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { operations: syncOperations } = useSyncOutbox();
  const uid = user?.id;
  const subscriptionRevisionRef = useRef(0);
  const actionRevisionRef = useRef(0);
  const [plan, setPlan] = useState<TimePlan | null>(null);
  const [members, setMembers] = useState<TimePlanMember[]>([]);
  const [draftResponses, setDraftResponses] = useState<Record<string, TimePlanInterval[]>>({});
  const [optimisticResponses, setOptimisticResponses] = useState<Record<
    string,
    TimePlanInterval[]
  > | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(promptOnOpen);
  const [editing, setEditing] = useState(!promptOnOpen);
  const [activeGroupId, setActiveGroupId] = useState<string>();
  const [selectedWindowIds, setSelectedWindowIds] = useState<string[]>([]);
  const reportedFailedResponseRef = useRef<string | undefined>(undefined);
  const responseRequestSettledRef = useRef(true);
  const responseAcknowledgedRef = useRef(false);

  useEffect(() => {
    setShowPrompt(promptOnOpen);
    setEditing(!promptOnOpen);
  }, [planId, promptOnOpen]);

  useEffect(() => {
    if (!visible || !planId || !uid) {
      setPlan(null);
      setMembers([]);
      return;
    }
    const revision = ++subscriptionRevisionRef.current;
    const actor = { uid };
    const stopPlan = timePlanningService.subscribeTimePlan(actor, planId, (next) => {
      if (revision === subscriptionRevisionRef.current) setPlan(next);
    });
    const stopMembers = timePlanningService.subscribeMembers(actor, planId, (next) => {
      if (revision === subscriptionRevisionRef.current) setMembers(next);
    });
    return () => {
      subscriptionRevisionRef.current += 1;
      stopPlan();
      stopMembers();
    };
  }, [planId, uid, visible]);

  const ownMember = useMemo(() => members.find((member) => member.uid === uid), [members, uid]);
  const queuedCreate = useMemo(
    () =>
      syncOperations.find(
        (operation) =>
          operation.kind === 'timePlan.create' &&
          operation.payload.planId === planId &&
          operation.status === 'queued',
      ),
    [planId, syncOperations],
  );
  const failedCreate = useMemo(
    () =>
      syncOperations.find(
        (operation) =>
          operation.kind === 'timePlan.create' &&
          operation.payload.planId === planId &&
          operation.status === 'failed',
      ),
    [planId, syncOperations],
  );
  const timePlanResponses = useMemo(
    () =>
      syncOperations
        .filter(isTimePlanResponseOperation)
        .filter((operation) => operation.payload.planId === planId),
    [planId, syncOperations],
  );
  const queuedResponse = useMemo(
    () => timePlanResponses.find((operation) => operation.status === 'queued'),
    [timePlanResponses],
  );
  const failedResponse = useMemo(
    () => timePlanResponses.find((operation) => operation.status === 'failed'),
    [timePlanResponses],
  );
  const pendingResponses = optimisticResponses ?? queuedResponse?.payload.responsesByWindow;
  const responseSyncing = saving || Boolean(queuedResponse);
  const membersForDisplay = useMemo(() => {
    if (!uid || !pendingResponses) return members;
    return members.map((member) =>
      member.uid === uid
        ? { ...member, responseStatus: 'responded' as const, responsesByWindow: pendingResponses }
        : member,
    );
  }, [members, pendingResponses, uid]);
  const isHost = Boolean(plan && plan.hostId === uid);
  const groups = useMemo(
    () =>
      plan
        ? [...new Set(plan.sourceWindows.map((window) => window.groupId))].map((id) => ({
            id,
            windows: plan.sourceWindows.filter((window) => window.groupId === id),
          }))
        : [],
    [plan],
  );
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  const selectedWindows =
    activeGroup?.windows.filter((window) => selectedWindowIds.includes(window.id)) ?? [];
  const focusWindow = selectedWindows[0] ?? activeGroup?.windows[0];

  useEffect(() => {
    if (!plan || !activeGroup) return;
    setActiveGroupId((current) => current ?? activeGroup.id);
    setSelectedWindowIds((current) =>
      current.length ? current : activeGroup.windows.map((window) => window.id),
    );
  }, [activeGroup, plan]);

  useEffect(() => {
    if (!plan || dirty || pendingResponses) return;
    setDraftResponses(responseOf(ownMember));
  }, [dirty, ownMember, pendingResponses, plan]);

  useEffect(() => {
    if (
      !plan ||
      !pendingResponses ||
      !sameResponses(responseOf(ownMember), pendingResponses, plan.sourceWindows)
    ) {
      return;
    }
    setOptimisticResponses(null);
    responseAcknowledgedRef.current = true;
    if (responseRequestSettledRef.current) setSaving(false);
  }, [ownMember, pendingResponses, plan]);

  useEffect(() => {
    if (!plan || !failedResponse) {
      reportedFailedResponseRef.current = undefined;
      return;
    }
    const failureKey = `${failedResponse.id}:${failedResponse.lastAttemptAt ?? 0}:${failedResponse.lastErrorCode ?? ''}`;
    if (reportedFailedResponseRef.current === failureKey) return;
    reportedFailedResponseRef.current = failureKey;
    setOptimisticResponses(null);
    setDraftResponses(failedResponse.payload.responsesByWindow);
    setDirty(true);
    setEditing(true);
    setSaving(false);
    responseRequestSettledRef.current = true;
    responseAcknowledgedRef.current = false;
    setError(
      'Deine Verfügbarkeit konnte nicht gespeichert werden. Bitte prüfe sie und versuche es erneut.',
    );
    haptics.warning();
  }, [failedResponse, plan]);

  const writeSelected = useCallback(
    (nextForSource: TimePlanInterval[], sourceWindow: TimePlanWindow) => {
      if (!plan || responseSyncing) return;
      const targets = selectedWindows.length ? selectedWindows : [sourceWindow];
      setDraftResponses((current) => {
        const next = { ...current };
        targets.forEach((target) => {
          next[target.id] = projectIntervalsToWindow(nextForSource, sourceWindow, target);
        });
        return next;
      });
      setDirty(true);
      setError(null);
    },
    [plan, responseSyncing, selectedWindows],
  );

  function selectGroup(groupId: string) {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    setActiveGroupId(groupId);
    setSelectedWindowIds(group.windows.map((window) => window.id));
  }

  function selectWindowFromOverview(window: TimePlanWindow) {
    setActiveGroupId(window.groupId);
    setSelectedWindowIds([window.id]);
    if (!isHost && !responseSyncing) setEditing(true);
    haptics.selection();
  }

  function toggleWindow(id: string) {
    setSelectedWindowIds((current) => {
      if (current.includes(id))
        return current.length === 1 ? current : current.filter((item) => item !== id);
      return [...current, id];
    });
  }

  function setAllAvailable() {
    if (!plan || responseSyncing) return;
    setDraftResponses(
      Object.fromEntries(plan.sourceWindows.map((window) => [window.id, fullAvailability(window)])),
    );
    setDirty(true);
    setEditing(true);
    setError(null);
    haptics.selection();
  }

  function save() {
    if (!plan || !uid || isHost || responseSyncing) return;
    const missing = plan.sourceWindows.filter((window) => !(window.id in draftResponses));
    if (missing.length) {
      setError(
        `Beantworte noch ${missing.length} ${missing.length === 1 ? 'Zeitfenster' : 'Zeitfenster'} oder wähle „Alle passen“.`,
      );
      return;
    }
    const revision = ++actionRevisionRef.current;
    const responses = draftResponses;
    setOptimisticResponses(responses);
    setDirty(false);
    setEditing(false);
    setSaving(true);
    responseRequestSettledRef.current = false;
    responseAcknowledgedRef.current = false;
    setError(null);
    haptics.success();
    void timePlanningService
      .respondToTimePlan({ uid }, plan.id, plan.revision, responses)
      .then(() => {
        if (revision !== actionRevisionRef.current) return;
        responseRequestSettledRef.current = true;
        if (responseAcknowledgedRef.current) setSaving(false);
      })
      .catch((cause) => {
        if (revision !== actionRevisionRef.current) return;
        setOptimisticResponses(null);
        setDraftResponses(responses);
        setDirty(true);
        setEditing(true);
        setSaving(false);
        responseRequestSettledRef.current = true;
        responseAcknowledgedRef.current = false;
        setError(
          cause instanceof Error ? cause.message : 'Deine Zeiten konnten nicht gespeichert werden.',
        );
        haptics.warning();
      });
  }

  function close() {
    actionRevisionRef.current += 1;
    onClose();
  }

  const outstanding = plan
    ? plan.sourceWindows.filter((window) => !(window.id in draftResponses)).length
    : 0;

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <View className="flex-1 justify-end bg-black/45">
        <View
          className="overflow-hidden rounded-t-[30px] border border-white/10"
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <View pointerEvents="none" style={styles.topGlow} />
          <View className="flex-row items-center justify-between px-5 pb-3 pt-3">
            <View>
              <Text className="text-xl font-extrabold tracking-[-0.35px] text-white">
                Gemeinsame Zeit finden
              </Text>
              {plan ? (
                <Text className="mt-0.5 text-sm font-medium" style={{ color: MUTED }}>
                  {plan.title}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zeitplanung schließen"
              className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:opacity-70"
              onPress={close}
            >
              <Ionicons name="close" size={22} color="#F4F5F7" />
            </Pressable>
          </View>

          {!plan ? (
            <View className="flex-1 items-center justify-center gap-3 px-8">
              {failedCreate ? (
                <Ionicons name="alert-circle-outline" size={30} color="#F4786F" />
              ) : (
                <ActivityIndicator color={AMBER} />
              )}
              <Text className="text-center text-sm text-white/55">
                {failedCreate
                  ? 'Die Terminfindung konnte nicht angelegt werden. Bitte erstelle sie erneut.'
                  : queuedCreate
                    ? 'Die Terminfindung wird übertragen und erscheint automatisch.'
                    : 'Zeitplanung wird geladen …'}
              </Text>
            </View>
          ) : (
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ gap: 16, paddingHorizontal: 20, paddingBottom: 116 }}
              showsVerticalScrollIndicator={false}
            >
              <Animated.View
                entering={FadeInDown.duration(220)}
                layout={LinearTransition.duration(180)}
              >
                <View
                  className="rounded-3xl border border-white/10 p-4"
                  style={{ backgroundColor: 'rgba(224,162,62,0.075)' }}
                >
                  <View className="flex-row items-center gap-3">
                    <View
                      className="h-11 w-11 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${AMBER}24` }}
                    >
                      <Text className="text-sm font-extrabold" style={{ color: AMBER }}>
                        {plan.hostInitials}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-white">
                        {plan.hostName} sucht eine gemeinsame Zeit
                      </Text>
                      <Text className="mt-0.5 text-sm leading-5 text-white/55">
                        Deine Angaben sind nur für diese gemeinsame Planung sichtbar.
                      </Text>
                    </View>
                  </View>
                </View>
              </Animated.View>

              <View className="gap-2">
                <Text className="px-1 text-xs font-bold uppercase tracking-[1.1px] text-white/45">
                  Zeitfenster
                </Text>
                <View className="flex-row gap-2">
                  {groups.map((group, index) => {
                    const active = group.id === activeGroup?.id;
                    const first = group.windows[0];
                    return (
                      <Pressable
                        key={group.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className="min-h-11 flex-1 items-center justify-center rounded-2xl border px-2 active:opacity-75"
                        style={{
                          backgroundColor: active ? `${AMBER}20` : 'rgba(255,255,255,0.04)',
                          borderColor: active ? `${AMBER}a8` : 'rgba(255,255,255,0.1)',
                        }}
                        onPress={() => selectGroup(group.id)}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: active ? AMBER : MUTED }}
                        >
                          {clock(first.startsAt)}–{clock(first.endsAt)}
                        </Text>
                        <Text className="mt-0.5 text-[10px] font-semibold text-white/40">
                          Fenster {index + 1}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {activeGroup ? (
                <View className="flex-row gap-1.5">
                  {activeGroup.windows.map((window) => {
                    const selected = selectedWindowIds.includes(window.id);
                    return (
                      <Pressable
                        key={window.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        className="min-h-[54px] flex-1 items-center justify-center rounded-2xl border active:opacity-75"
                        style={{
                          backgroundColor: selected ? `${AMBER}1e` : 'rgba(255,255,255,0.035)',
                          borderColor: selected ? `${AMBER}9a` : 'rgba(255,255,255,0.09)',
                        }}
                        onPress={() => toggleWindow(window.id)}
                      >
                        <Text
                          className="text-[11px] font-bold"
                          style={{ color: selected ? AMBER : MUTED }}
                        >
                          {dayLabel(window.startsAt)}
                        </Text>
                        <View
                          className="mt-1 h-3 w-3 items-center justify-center rounded-full"
                          style={{ backgroundColor: selected ? AMBER : 'rgba(255,255,255,0.14)' }}
                        >
                          {selected ? (
                            <Ionicons name="checkmark" size={10} color="#17130D" />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {focusWindow ? (
                <View
                  className="gap-3 rounded-3xl border border-white/10 p-4"
                  style={{ backgroundColor: 'rgba(255,255,255,0.035)' }}
                >
                  <AvailabilityBand
                    window={focusWindow}
                    intervals={sameWindowResponse(draftResponses, focusWindow)}
                    editable={!isHost && editing && !responseSyncing}
                    onCut={(cut) => {
                      const current = sameWindowResponse(draftResponses, focusWindow);
                      writeSelected(subtractInterval(current, cut, focusWindow), focusWindow);
                      haptics.selection();
                    }}
                  />
                  {!isHost ? (
                    <View className="flex-row gap-2">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Ausgewählte Zeitfenster passen komplett"
                        disabled={responseSyncing}
                        className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl active:opacity-75"
                        style={{
                          backgroundColor: `${GREEN}22`,
                          opacity: responseSyncing ? 0.55 : 1,
                        }}
                        onPress={() => {
                          if (responseSyncing) return;
                          writeSelected(fullAvailability(focusWindow), focusWindow);
                          setEditing(true);
                          haptics.selection();
                        }}
                      >
                        <Ionicons name="checkmark" size={17} color={GREEN} />
                        <Text className="text-sm font-bold" style={{ color: GREEN }}>
                          Passt
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Ausgewählte Zeitfenster anpassen"
                        disabled={responseSyncing}
                        className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-white/8 active:opacity-75"
                        style={{ opacity: responseSyncing ? 0.55 : 1 }}
                        onPress={() => {
                          if (responseSyncing) return;
                          setEditing(true);
                          haptics.selection();
                        }}
                      >
                        <Ionicons name="create-outline" size={16} color="#F4F5F7" />
                        <Text className="text-sm font-bold text-white">Anpassen</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Ausgewählte Zeitfenster ablehnen"
                        disabled={responseSyncing}
                        className="min-h-11 w-11 items-center justify-center rounded-2xl active:opacity-75"
                        style={{
                          backgroundColor: 'rgba(244,120,111,0.14)',
                          opacity: responseSyncing ? 0.55 : 1,
                        }}
                        onPress={() => {
                          if (responseSyncing) return;
                          writeSelected([], focusWindow);
                          setEditing(true);
                          haptics.selection();
                        }}
                      >
                        <Ionicons name="close" size={18} color="#F4786F" />
                      </Pressable>
                    </View>
                  ) : null}
                  {!isHost && editing ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Ausgewählte Zeiten zurücksetzen"
                      disabled={responseSyncing}
                      className="self-start py-1 active:opacity-70"
                      onPress={() => writeSelected(fullAvailability(focusWindow), focusWindow)}
                    >
                      <Text className="text-xs font-bold text-white/55">
                        Für diese Auswahl zurücksetzen
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <AvailabilityMatrix
                windows={plan.sourceWindows}
                members={membersForDisplay}
                activeWindowId={focusWindow?.id}
                onSelectWindow={selectWindowFromOverview}
              />
            </ScrollView>
          )}

          {plan && !isHost ? (
            <View
              className="absolute bottom-0 left-0 right-0 border-t border-white/10 px-5 pb-1 pt-3"
              style={styles.footer}
            >
              {error ? (
                <Text className="mb-2 text-sm font-semibold text-[#F4786F]">{error}</Text>
              ) : null}
              {outstanding > 0 && !dirty ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Alle vorgeschlagenen Zeiten passen"
                  className="min-h-[54px] flex-row items-center justify-center gap-2 rounded-2xl active:opacity-80"
                  style={{ backgroundColor: `${GREEN}25` }}
                  onPress={setAllAvailable}
                >
                  <Ionicons name="checkmark-circle" size={19} color={GREEN} />
                  <Text className="text-base font-extrabold" style={{ color: GREEN }}>
                    Alle passen
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Verfügbarkeit übernehmen"
                  disabled={responseSyncing || outstanding > 0}
                  className="min-h-[54px] flex-row items-center justify-center gap-2 rounded-2xl active:opacity-80"
                  style={{
                    backgroundColor:
                      responseSyncing || outstanding > 0 ? 'rgba(65,192,141,0.28)' : GREEN,
                    opacity: responseSyncing || outstanding > 0 ? 0.72 : 1,
                  }}
                  onPress={save}
                >
                  <Ionicons name="checkmark" size={20} color="#13231D" />
                  <Text className="text-base font-extrabold text-[#13231D]">
                    {responseSyncing ? 'Übernommen' : 'Verfügbarkeit übernehmen'}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {plan && showPrompt && !isHost ? (
            <View className="absolute bottom-0 left-0 right-0 top-0 items-center justify-center bg-black/55 px-7">
              <Animated.View
                entering={FadeInDown.duration(240)}
                className="w-full rounded-[28px] border border-white/15 p-5"
                style={{ backgroundColor: '#171B22' }}
              >
                <View
                  className="mb-4 h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${AMBER}22` }}
                >
                  <Ionicons name="calendar-outline" size={23} color={AMBER} />
                </View>
                <Text className="text-xl font-extrabold text-white">Jetzt mitplanen?</Text>
                <Text className="mt-2 text-[15px] leading-6 text-white/60">
                  {plan.hostName} möchte für „{plan.title}“ eine gemeinsame Zeit finden. Du kannst
                  deine Zeiten direkt eintragen oder später über das Postfach zurückkommen.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Jetzt mitplanen"
                  className="mt-5 min-h-[54px] flex-row items-center justify-center gap-2 rounded-2xl active:opacity-80"
                  style={{ backgroundColor: AMBER }}
                  onPress={() => {
                    setShowPrompt(false);
                    setEditing(true);
                    haptics.selection();
                  }}
                >
                  <Ionicons name="time-outline" size={19} color="#211B0F" />
                  <Text className="text-base font-extrabold text-[#211B0F]">Jetzt mitplanen</Text>
                </Pressable>
              </Animated.View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#0E1116',
    height: '90%',
  },
  topGlow: {
    backgroundColor: 'rgba(224,162,62,0.13)',
    height: 150,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  footer: {
    backgroundColor: 'rgba(14,17,22,0.96)',
  },
});
