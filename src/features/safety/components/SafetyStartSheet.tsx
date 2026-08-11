import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActivityEntities } from '@/features/activities';
import { useActivityChat } from '@/features/chat';
import { useCircles } from '@/features/circles';
import { useFriends, type FriendProfile } from '@/features/friends';

import { useSafety } from '../SafetyProvider';
import { STATUS_COLOR } from '../safetyTheme';

const SAFETY_COLOR = STATUS_COLOR.blue;
const INTRO_SEEN_KEY = 'together.safety.introSeen.v1';

type QuickChoice = {
  id: string;
  label: string;
  uids: string[];
  kind?: 'activity';
};

/** Three rows: the promise (green — arrival + deletion live inside the
 * Live-Standort text) and the two escalation modes in their real console
 * colors, titled in the first person like the actual buttons. Wording rule
 * (docs/safety-mode.md): describe what the person does and what friends can
 * see — never how fast or loud recipient devices react. */
const FEATURE_POINTS: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  text: string;
}[] = [
  {
    icon: 'locate-outline',
    color: STATUS_COLOR.blue,
    title: 'Live-Standort',
    text: 'Nur die Freunde, die du auswählst, sehen deinen aktuellen Standort — und nur so lange, bis du sicher zu Hause bist. Danach wird er gelöscht.',
  },
  {
    icon: 'alert-circle-outline',
    color: STATUS_COLOR.orange,
    title: 'Ich fühle mich unsicher',
    text: 'Deine Freunde werden benachrichtigt und gebeten, deinen Heimweg aktiv im Blick zu behalten, damit sie bei Bedarf schnell reagieren können. Dein Standort wird häufiger aktualisiert.',
  },
  {
    icon: 'warning-outline',
    color: STATUS_COLOR.red,
    title: 'Ich bin in Gefahr',
    // "alarmiert" = our dispatch act (allowed); "sofort"/"laut" = recipient
    // device behavior (banned — the OS owns delivery timing and sound).
    text: 'Deine Freunde werden alarmiert, damit sie dich kontaktieren oder schnell Hilfe rufen können. Du kannst direkt 112 anrufen.',
  },
];

function StepDots({ active }: { active: 0 | 1 }) {
  return (
    <View className="mb-2 mt-4 flex-row justify-center gap-1.5">
      {([0, 1] as const).map((index) => (
        <View
          key={index}
          className="h-1.5 rounded-full"
          style={{
            width: index === active ? 18 : 6,
            backgroundColor: index === active ? SAFETY_COLOR : 'rgba(255,255,255,0.18)',
          }}
        />
      ))}
    </View>
  );
}

/** Step 1 of 2 — a calm overview of what the mode does, before anything is
 * asked of the user. "Weiter" leads to the person selection. */
function IntroStep({ onNext, onClose }: { onNext: () => void; onClose: () => void }) {
  return (
    <>
      <View className="flex-row justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Heimweg-Start schließen"
          className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
          onPress={onClose}
        >
          <Ionicons name="close" size={21} color="#F4F5F7" />
        </Pressable>
      </View>

      <View className="items-center px-2">
        <View
          className="h-16 w-16 items-center justify-center rounded-full"
          style={{
            backgroundColor: `${SAFETY_COLOR}1F`,
            borderWidth: 1,
            borderColor: `${SAFETY_COLOR}55`,
          }}
        >
          <Ionicons name="shield-checkmark-outline" size={30} color={SAFETY_COLOR} />
        </View>
        <Text className="mt-4 text-2xl font-extrabold tracking-[-0.4px] text-white">
          Sicher nach Hause
        </Text>
        <Text className="mt-1.5 text-center text-sm leading-5 text-white/55">
          Ausgewählte Freunde sehen deinen Live-Standort, bis du angekommen bist.
        </Text>
      </View>

      <View className="mt-5 gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
        {FEATURE_POINTS.map((point) => (
          <View key={point.title} className="flex-row items-start gap-3">
            <View
              className="h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${point.color}1C` }}
            >
              <Ionicons name={point.icon} size={17} color={point.color} />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-white">{point.title}</Text>
              <Text className="mt-0.5 text-xs leading-4 text-white/55">{point.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="mt-3 flex-row items-start gap-2 rounded-2xl bg-white/[0.04] px-3.5 py-3">
        <Ionicons name="call-outline" size={16} color={STATUS_COLOR.red} />
        <Text className="flex-1 text-xs leading-4 text-white/55">
          Como ist kein Notrufdienst. Die Zustellung von Benachrichtigungen und eine Reaktion deiner
          Begleiter können nicht garantiert werden. Bei Gefahr rufe direkt 112.
        </Text>
      </View>

      <StepDots active={0} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Weiter zur Auswahl"
        onPress={onNext}
        className="min-h-14 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-85"
        style={{ backgroundColor: SAFETY_COLOR }}
      >
        <Text className="text-base font-extrabold text-white">Weiter</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </Pressable>
    </>
  );
}

export interface SafetyStartSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Called immediately after the explicit start request. Hosts on pushed
   * routes (e.g. the profile) navigate back now so the pending Safety screen
   * is visible while permissions/backend/native setup continue.
   */
  onStartRequested?: () => void;
}

function FriendRow({
  friend,
  selected,
  onToggle,
}: {
  friend: FriendProfile;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${friend.displayName} ${selected ? 'abwählen' : 'auswählen'}`}
      className="flex-row items-center gap-3 rounded-2xl px-2 py-2 active:bg-white/[0.05]"
      onPress={onToggle}
    >
      {friend.avatarUrl ? (
        <Image source={{ uri: friend.avatarUrl }} className="h-11 w-11 rounded-full" />
      ) : (
        <View className="h-11 w-11 items-center justify-center rounded-full bg-white/10">
          <Text className="text-sm font-extrabold text-white">{friend.initials}</Text>
        </View>
      )}
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-white">{friend.displayName}</Text>
        {friend.username ? (
          <Text className="mt-0.5 text-xs text-white/45">@{friend.username}</Text>
        ) : null}
      </View>
      <View
        className="h-6 w-6 items-center justify-center rounded-full border"
        style={{
          borderColor: selected ? SAFETY_COLOR : 'rgba(255,255,255,0.22)',
          backgroundColor: selected ? SAFETY_COLOR : 'transparent',
        }}
      >
        {selected ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
      </View>
    </Pressable>
  );
}

/**
 * Explicit two-step safety start: first choose the exact trusted people, then
 * deliberately start sharing. Groups are shortcuts only; the concrete initial
 * audience is always visible and individually editable before the start.
 */
export function SafetyStartSheet({ visible, onClose, onStartRequested }: SafetyStartSheetProps) {
  const insets = useSafeAreaInsets();
  const { friends, closeFriends, heimwegGroup, setHeimwegGroup } = useFriends();
  const { circles, refreshCircles } = useCircles();
  const { joinedIds } = useActivityChat();
  const { findActivityById } = useActivityEntities();
  const { startHeimweg, setConsoleMinimized } = useSafety();
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  // Revision August 2026 (replaces "overview on EVERY open"): the trust
  // overview shows on the FIRST open only — a returning user at night wants
  // the fewest possible taps to start sharing. The select step's back arrow
  // keeps the overview one tap away for re-reading; a storage error safely
  // falls back to showing it.
  const [step, setStep] = useState<'intro' | 'select'>('intro');
  // Revision August 2026 — the Heimweg group. Preselection order is
  // deliberate: the saved group, else close friends, else ALL friends. The
  // last fallback exists because the primary button used to arrive DISABLED
  // for anyone who had never marked a close friend — i.e. every new user, at
  // night, in the one moment they must not have to think. Nothing is ever
  // shared silently: the audience stays listed and editable above the button.
  const [rememberGroup, setRememberGroup] = useState(true);
  const seededRef = useRef(false);

  const activeActivityChoices = useMemo<QuickChoice[]>(() => {
    const now = Date.now();
    const friendUids = new Set(friends.map((friend) => friend.uid));

    return joinedIds.flatMap((activityId) => {
      const activity = findActivityById(activityId);
      if (!activity || activity.mode !== 'now') return [];

      const endsAt = activity.endsAt ? Date.parse(activity.endsAt) : Number.NaN;
      if (Number.isFinite(endsAt) && endsAt <= now) return [];

      const participantUids = [
        ...new Set(
          activity.participants
            .map((participant) => participant.userId)
            .filter((uid) => friendUids.has(uid)),
        ),
      ];
      if (!participantUids.length) return [];

      return [
        {
          id: `activity:${activity.id}`,
          label: activity.title,
          uids: participantUids,
          kind: 'activity' as const,
        },
      ];
    });
  }, [findActivityById, friends, joinedIds]);

  const quickChoices = useMemo<QuickChoice[]>(() => {
    const friendUids = friends.map((friend) => friend.uid);
    const choices: QuickChoice[] = [...activeActivityChoices];
    if (closeFriends.length) {
      choices.push({
        id: 'close',
        label: 'Enge Freunde',
        uids: closeFriends.map((friend) => friend.uid),
      });
    }
    circles.forEach((circle) => {
      const uids = circle.friendUids.filter((uid) => friendUids.includes(uid));
      if (uids.length) choices.push({ id: circle.id, label: circle.name, uids });
    });
    if (friends.length) choices.push({ id: 'all', label: 'Alle Freunde', uids: friendUids });
    return choices;
  }, [activeActivityChoices, circles, closeFriends, friends]);

  useEffect(() => {
    if (!visible) {
      seededRef.current = false;
      return;
    }
    // Seed ONCE per open. The friend list arrives from a live listener, so
    // re-running on every snapshot would silently wipe a selection the user is
    // in the middle of making.
    if (seededRef.current) return;
    seededRef.current = true;
    void refreshCircles();
    const initial = heimwegGroup.length
      ? heimwegGroup
      : closeFriends.length
        ? closeFriends
        : friends;
    setSelectedUids(new Set(initial.map((friend) => friend.uid)));
    setQuery('');
    setBusy(false);
    setStep('intro');
    setRememberGroup(true);
    let active = true;
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then((seen) => {
        if (active && seen) setStep('select');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [closeFriends, friends, heimwegGroup, refreshCircles, visible]);

  const visibleFriends = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('de');
    if (!normalized) return friends;
    return friends.filter((friend) =>
      `${friend.displayName} ${friend.username ?? ''}`.toLocaleLowerCase('de').includes(normalized),
    );
  }, [friends, query]);

  const selectedCount = selectedUids.size;
  const groupMatchesSelection =
    heimwegGroup.length === selectedCount &&
    heimwegGroup.every((friend) => selectedUids.has(friend.uid));

  function chooseQuick(choice: QuickChoice) {
    setSelectedUids(new Set(choice.uids));
  }

  function toggleFriend(uid: string) {
    setSelectedUids((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function start() {
    if (!selectedCount || busy) return;
    setBusy(true);
    const audience = [...selectedUids];
    // The group is saved as a BYPRODUCT of a real start — never as a setup
    // step. Fire-and-forget on purpose: remembering a preference must never
    // delay or fail the safety action it belongs to.
    if (rememberGroup && !groupMatchesSelection) {
      void setHeimwegGroup(audience).catch(() => {});
    }
    // Calling the async provider first sets its pending state synchronously.
    // The sheet then dismisses and reveals the honest operation screen while
    // backend/permission/native work continues.
    const activation = startHeimweg(audience);
    onClose();
    onStartRequested?.();
    InteractionManager.runAfterInteractions(() => setConsoleMinimized(false));
    try {
      await activation;
    } catch (error) {
      Alert.alert(
        'Heimweg konnte nicht gestartet werden',
        error instanceof Error ? error.message : 'Bitte versuche es erneut.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable className="flex-1 justify-end bg-black/55" onPress={onClose}>
        <Pressable
          className="max-h-[92%] rounded-t-[32px] border border-white/10 bg-[#0E1116] px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
          onPress={(event) => event.stopPropagation()}
        >
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-white/20" />
          {step === 'intro' ? (
            <IntroStep
              onNext={() => {
                setStep('select');
                AsyncStorage.setItem(INTRO_SEEN_KEY, '1').catch(() => {});
              }}
              onClose={onClose}
            />
          ) : (
            <>
              <View className="flex-row items-start justify-between gap-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Zurück zur Übersicht"
                  className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
                  onPress={() => setStep('intro')}
                >
                  <Ionicons name="chevron-back" size={21} color="#F4F5F7" />
                </Pressable>
                <View className="flex-1">
                  <Text className="text-xl font-extrabold tracking-[-0.4px] text-white">
                    Wer sieht deinen Heimweg?
                  </Text>
                  <Text className="mt-1 text-sm leading-5 text-white/55">
                    Nur diese Personen erhalten deinen Live-Standort.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Heimweg-Start schließen"
                  className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
                  onPress={onClose}
                >
                  <Ionicons name="close" size={21} color="#F4F5F7" />
                </Pressable>
              </View>

              {friends.length ? (
                <>
                  {quickChoices.length ? (
                    <View className="mt-5">
                      <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-white/45">
                        Schnellauswahl
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View className="flex-row gap-2 pr-4">
                          {quickChoices.map((choice) => {
                            const active =
                              choice.uids.length === selectedCount &&
                              choice.uids.every((uid) => selectedUids.has(uid));
                            return (
                              <Pressable
                                key={choice.id}
                                accessibilityRole="button"
                                accessibilityLabel={
                                  choice.kind === 'activity'
                                    ? `Teilnehmer von ${choice.label}, ${choice.uids.length} Freunde`
                                    : `${choice.label}, ${choice.uids.length} Freunde`
                                }
                                accessibilityState={{ selected: active }}
                                className="flex-row items-center gap-1.5 rounded-full border px-4 py-2.5 active:opacity-80"
                                style={{
                                  borderColor: active ? SAFETY_COLOR : 'rgba(255,255,255,0.14)',
                                  backgroundColor: active
                                    ? `${SAFETY_COLOR}25`
                                    : 'rgba(255,255,255,0.04)',
                                }}
                                onPress={() => chooseQuick(choice)}
                              >
                                {choice.kind === 'activity' ? (
                                  <Text
                                    className="text-xs font-extrabold"
                                    style={{ color: STATUS_COLOR.blue }}
                                  >
                                    Jetzt
                                  </Text>
                                ) : null}
                                <Text className="text-sm font-bold text-white/85">
                                  {choice.label} · {choice.uids.length}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  ) : null}

                  <View className="mt-4 flex-row items-center rounded-2xl border border-white/10 bg-white/[0.05] px-3.5">
                    <Ionicons name="search" size={17} color="rgba(244,245,247,0.45)" />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Freunde suchen"
                      placeholderTextColor="rgba(244,245,247,0.35)"
                      className="h-12 flex-1 px-2.5 text-[15px] text-white"
                      autoCapitalize="none"
                      returnKeyType="search"
                    />
                    {query ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Suche leeren"
                        hitSlop={8}
                        onPress={() => setQuery('')}
                      >
                        <Ionicons name="close-circle" size={18} color="rgba(244,245,247,0.4)" />
                      </Pressable>
                    ) : null}
                  </View>

                  <View className="mt-4 flex-row items-center justify-between">
                    <Text className="text-xs font-bold uppercase tracking-wide text-white/45">
                      Personen
                    </Text>
                    <Text className="text-xs font-extrabold" style={{ color: SAFETY_COLOR }}>
                      {selectedCount} ausgewählt
                    </Text>
                  </View>
                  <ScrollView
                    className="mt-1 max-h-[290px]"
                    contentContainerStyle={{ paddingBottom: 8 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    {visibleFriends.map((friend) => (
                      <FriendRow
                        key={friend.uid}
                        friend={friend}
                        selected={selectedUids.has(friend.uid)}
                        onToggle={() => toggleFriend(friend.uid)}
                      />
                    ))}
                    {!visibleFriends.length ? (
                      <Text className="py-8 text-center text-sm text-white/45">
                        Keine passenden Freunde gefunden.
                      </Text>
                    ) : null}
                  </ScrollView>
                </>
              ) : (
                <View className="mt-6 items-center rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-9">
                  <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                    <Ionicons name="people-outline" size={25} color="rgba(244,245,247,0.7)" />
                  </View>
                  <Text className="mt-4 text-base font-bold text-white">Noch keine Freunde</Text>
                  <Text className="mt-1.5 text-center text-sm leading-5 text-white/50">
                    Du kannst deinen Heimweg mit bestätigten Freunden teilen.
                  </Text>
                </View>
              )}

              <View className="mt-3 flex-row items-start gap-2 rounded-2xl bg-white/[0.04] px-3.5 py-3">
                <Ionicons name="notifications-outline" size={16} color={SAFETY_COLOR} />
                <Text className="flex-1 text-xs leading-4 text-white/55">
                  Ausgewählte Personen erhalten eine Anfrage. Erst ihre Bestätigung zeigt dir, wer
                  erreichbar ist. Como ist kein Notrufdienst. Die Zustellung von Benachrichtigungen
                  und eine Reaktion deiner Begleiter können nicht garantiert werden. Bei Gefahr rufe
                  direkt 112.
                </Text>
              </View>

              {/* Offered only when it would actually change something, so a
                  returning user with an unchanged group sees one button and
                  nothing else. */}
              {friends.length && selectedCount && !groupMatchesSelection ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: rememberGroup }}
                  accessibilityLabel="Diese Auswahl als Heimweg-Gruppe merken"
                  className="mt-3 flex-row items-center gap-3 rounded-2xl bg-white/[0.04] px-3.5 py-3 active:opacity-80"
                  onPress={() => setRememberGroup((current) => !current)}
                >
                  <View
                    className="h-6 w-6 items-center justify-center rounded-lg border"
                    style={{
                      borderColor: rememberGroup ? SAFETY_COLOR : 'rgba(255,255,255,0.22)',
                      backgroundColor: rememberGroup ? SAFETY_COLOR : 'transparent',
                    }}
                  >
                    {rememberGroup ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-bold text-white">
                      Als Heimweg-Gruppe merken
                    </Text>
                    <Text className="mt-0.5 text-xs leading-4 text-white/50">
                      Beim nächsten Mal ist diese Auswahl schon gesetzt — ein Tipp und los.
                    </Text>
                  </View>
                </Pressable>
              ) : null}

              <StepDots active={1} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Heimweg mit ${selectedCount} Personen starten`}
                disabled={busy || !selectedCount}
                onPress={() => void start()}
                className="min-h-14 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-85"
                style={{
                  backgroundColor: SAFETY_COLOR,
                  opacity: busy || !selectedCount ? 0.4 : 1,
                }}
              >
                <Ionicons name="shield-checkmark-outline" size={19} color="#fff" />
                <Text className="text-base font-extrabold text-white">
                  {busy ? 'Wird gestartet …' : `Heimweg starten · ${selectedCount}`}
                </Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
