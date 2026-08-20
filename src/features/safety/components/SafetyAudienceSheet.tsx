import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFriends, type FriendProfile } from '@/features/friends';
import { PersonAvatar, SearchField, SelectablePersonRow } from '@/shared/components';

import { useSafety } from '../SafetyProvider';
import { STATUS_COLOR } from '../safetyTheme';
import {
  companionAlertConfirmationRemainingMs,
  companionConfirmationRemainingMs,
  isCompanionConfirmationActive,
  isCompanionUnavailable,
  isCompanionWatchingAlert,
} from '../types';

const ACCENT = STATUS_COLOR.blue;
const MAX_COMPANIONS = 25;

type CompanionState = 'watching' | 'reachable' | 'unavailable' | 'expired' | 'pending';

function remainingLabel(remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return `noch ${minutes} Min.`;
}

const STATE_META: Record<
  CompanionState,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  watching: { label: 'Schaut gerade zu', icon: 'eye', color: STATUS_COLOR.blue },
  reachable: { label: 'Erreichbar', icon: 'checkmark-circle', color: ACCENT },
  unavailable: {
    label: 'Gerade nicht erreichbar',
    icon: 'remove-circle-outline',
    color: STATUS_COLOR.orange,
  },
  expired: { label: 'Bestätigung abgelaufen', icon: 'time-outline', color: '#8B929E' },
  pending: { label: 'Noch keine Rückmeldung', icon: 'time-outline', color: '#8B929E' },
};

function CompanionRow({
  friend,
  state,
  confirmationLabel,
  removing,
  canRemove,
  onRemove,
}: {
  friend?: FriendProfile;
  state: CompanionState;
  confirmationLabel?: string;
  removing: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const meta = STATE_META[state];
  return (
    <View className="flex-row items-center gap-3 rounded-2xl px-1 py-2.5">
      <PersonAvatar avatarUrl={friend?.avatarUrl} initials={friend?.initials ?? '?'} />
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-white" numberOfLines={1}>
          {friend?.displayName ?? 'Nicht mehr in deiner Freundesliste'}
        </Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          <Ionicons name={meta.icon} size={13} color={meta.color} />
          <Text className="text-xs font-semibold" style={{ color: meta.color }}>
            {confirmationLabel ? `${meta.label} · ${confirmationLabel}` : meta.label}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Freigabe für ${friend?.displayName ?? 'diese Person'} beenden`}
        accessibilityState={{ disabled: !canRemove || removing, busy: removing }}
        disabled={!canRemove || removing}
        onPress={onRemove}
        className="h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] active:opacity-70"
        style={{ opacity: canRemove ? 1 : 0.3 }}
      >
        <Ionicons
          name={removing ? 'hourglass-outline' : 'person-remove-outline'}
          size={18}
          color="rgba(244,245,247,0.66)"
        />
      </Pressable>
    </View>
  );
}

export function SafetyAudienceManager({
  onClose,
  presentation = 'sheet',
}: {
  onClose: () => void;
  presentation?: 'sheet' | 'screen';
}) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { friends } = useFriends();
  const { session, updateAudience } = useSafety();
  const [mode, setMode] = useState<'overview' | 'add'>('overview');
  const [query, setQuery] = useState('');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [removingUid, setRemovingUid] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const friendByUid = useMemo(
    () => new Map(friends.map((friend) => [friend.uid, friend])),
    [friends],
  );
  const audience = useMemo(() => session?.audienceUids ?? [], [session?.audienceUids]);
  const audienceSet = useMemo(() => new Set(audience), [audience]);
  const alertActive = session?.status === 'orange' || session?.status === 'red';
  const companionRows = useMemo(() => {
    if (!session) return [];
    return audience
      .map((uid) => {
        const confirmation = session.companions?.[uid];
        const watching = isCompanionWatchingAlert(confirmation, session.alert, now);
        const reachable = isCompanionConfirmationActive(confirmation, now);
        const remainingMs = alertActive
          ? companionAlertConfirmationRemainingMs(confirmation, session.alert, now)
          : companionConfirmationRemainingMs(confirmation, now);
        const state: CompanionState = alertActive
          ? watching
            ? 'watching'
            : isCompanionUnavailable(confirmation)
              ? 'unavailable'
              : confirmation
                ? 'expired'
                : 'pending'
          : reachable
            ? 'reachable'
            : isCompanionUnavailable(confirmation)
              ? 'unavailable'
              : confirmation
                ? 'expired'
                : 'pending';
        return {
          uid,
          friend: friendByUid.get(uid),
          state,
          confirmationLabel: remainingMs > 0 ? remainingLabel(remainingMs) : undefined,
        };
      })
      .sort((a, b) => {
        const rank: Record<CompanionState, number> = {
          watching: 0,
          reachable: 0,
          unavailable: 1,
          expired: 2,
          pending: 3,
        };
        return (
          rank[a.state] - rank[b.state] ||
          (a.friend?.displayName ?? '').localeCompare(b.friend?.displayName ?? '', 'de')
        );
      });
  }, [alertActive, audience, friendByUid, now, session]);
  const confirmedCount = companionRows.filter((row) => row.state !== 'pending').length;
  const availableFriends = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de');
    return friends.filter(
      (friend) =>
        !audienceSet.has(friend.uid) &&
        (!needle ||
          `${friend.displayName} ${friend.username ?? ''}`
            .toLocaleLowerCase('de')
            .includes(needle)),
    );
  }, [audienceSet, friends, query]);
  const unsharedFriendCount = friends.filter((friend) => !audienceSet.has(friend.uid)).length;
  const remainingSlots = Math.max(0, MAX_COMPANIONS - audience.length);

  function openAdd() {
    setSelectedUids(new Set());
    setQuery('');
    setMode('add');
  }

  function toggleAdd(uid: string) {
    setSelectedUids((current) => {
      const next = new Set(current);
      if (next.has(uid)) {
        next.delete(uid);
      } else if (next.size < remainingSlots) {
        next.add(uid);
      } else {
        Alert.alert('Maximal 25 Personen', 'Entferne zuerst eine andere Person.');
      }
      return next;
    });
  }

  function requestRemove(uid: string, friend?: FriendProfile) {
    if (audience.length <= 1) {
      Alert.alert(
        'Letzte Person',
        'Mindestens eine Person muss deinen Heimweg sehen. Alternativ kannst du den Heimweg vollständig beenden.',
      );
      return;
    }
    Alert.alert(
      'Freigabe beenden?',
      `${friend?.displayName ?? 'Diese Person'} sieht deinen Live-Standort anschließend nicht mehr.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Freigabe beenden',
          style: 'destructive',
          onPress: () => {
            setRemovingUid(uid);
            void updateAudience([], [uid])
              .catch((error) => {
                Alert.alert(
                  'Freigabe konnte nicht beendet werden',
                  error instanceof Error ? error.message : 'Bitte versuche es erneut.',
                );
              })
              .finally(() => setRemovingUid(undefined));
          },
        },
      ],
    );
  }

  async function addSelected() {
    if (!selectedUids.size || adding) return;
    setAdding(true);
    try {
      await updateAudience([...selectedUids], []);
      setSelectedUids(new Set());
      setQuery('');
      setMode('overview');
    } catch (error) {
      Alert.alert(
        'Begleiter konnten nicht hinzugefügt werden',
        error instanceof Error ? error.message : 'Bitte versuche es erneut.',
      );
    } finally {
      setAdding(false);
    }
  }

  if (!session) return null;

  const close = mode === 'add' ? () => setMode('overview') : onClose;
  return (
    <View
      className="flex-1 bg-[#0E1116] px-5"
      style={{
        paddingTop: presentation === 'screen' ? insets.top + 12 : 8,
        paddingBottom: Math.max(insets.bottom, 16) + 8,
      }}
    >
      {presentation === 'sheet' ? (
        <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-white/20" />
      ) : null}
      <View className="flex-row items-start gap-3">
        {mode === 'add' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zurück zu den Begleitern"
            onPress={close}
            className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:opacity-75"
          >
            <Ionicons name="chevron-back" size={21} color="#F4F5F7" />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Text className="text-xl font-extrabold tracking-[-0.35px] text-white">
            {mode === 'add' ? 'Begleiter hinzufügen' : 'Begleiter'}
          </Text>
          <Text className="mt-1 text-sm leading-5 text-white/50">
            {mode === 'add'
              ? 'Neue Personen erhalten eine eigene Heimweg-Anfrage.'
              : `Mit ${audience.length} ${audience.length === 1 ? 'Person' : 'Personen'} geteilt`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Begleiter schließen"
          onPress={onClose}
          className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:opacity-75"
        >
          <Ionicons name="close" size={21} color="#F4F5F7" />
        </Pressable>
      </View>

      {mode === 'overview' ? (
        <>
          <View className="mt-5 flex-row rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-4">
            <View className="flex-1">
              <Text className="text-2xl font-extrabold text-white">{audience.length}</Text>
              <Text className="mt-0.5 text-xs font-semibold text-white/45">Geteilt</Text>
            </View>
            <View className="mx-4 w-px bg-white/10" />
            <View className="flex-[1.5]">
              <Text
                className="text-2xl font-extrabold"
                style={{ color: STATUS_COLOR[session.status] }}
              >
                {confirmedCount}
              </Text>
              <Text className="mt-0.5 text-xs font-semibold text-white/45">
                {alertActive ? 'Schauen gerade zu' : 'Erreichbar'}
              </Text>
            </View>
          </View>

          <View className="mb-1 mt-5 flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-wide text-white/45">
              Personen
            </Text>
            <Text className="text-xs text-white/35">
              {audience.length} von {MAX_COMPANIONS}
            </Text>
          </View>
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {companionRows.map((row) => (
              <CompanionRow
                key={row.uid}
                friend={row.friend}
                state={row.state}
                confirmationLabel={row.confirmationLabel}
                removing={removingUid === row.uid}
                canRemove={audience.length > 1 && !removingUid}
                onRemove={() => requestRemove(row.uid, row.friend)}
              />
            ))}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Begleiter hinzufügen"
            disabled={!remainingSlots || !unsharedFriendCount}
            onPress={openAdd}
            className="min-h-14 flex-row items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.07] active:opacity-80"
            style={{ opacity: !remainingSlots || !unsharedFriendCount ? 0.4 : 1 }}
          >
            <Ionicons name="person-add-outline" size={19} color="#F4F5F7" />
            <Text className="text-base font-extrabold text-white">Begleiter hinzufügen</Text>
          </Pressable>
        </>
      ) : (
        <>
          <SearchField
            accessibilityLabel="Freunde suchen"
            clearAccessibilityLabel="Suche leeren"
            containerStyle={{ marginTop: 20, minHeight: 48 }}
            inputStyle={{ fontSize: 15 }}
            placeholder="Freunde suchen"
            placeholderTextColor="rgba(244,245,247,0.35)"
            value={query}
            onChangeText={setQuery}
          />
          <View className="mb-1 mt-4 flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-wide text-white/45">
              Verfügbare Freunde
            </Text>
            <Text className="text-xs font-extrabold" style={{ color: ACCENT }}>
              {selectedUids.size} ausgewählt
            </Text>
          </View>
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {availableFriends.map((friend) => (
              <SelectablePersonRow
                key={friend.uid}
                person={friend}
                selected={selectedUids.has(friend.uid)}
                accent={ACCENT}
                onPress={() => toggleAdd(friend.uid)}
                style={{ paddingHorizontal: 4, paddingVertical: 10 }}
              />
            ))}
            {!availableFriends.length ? (
              <View className="items-center px-6 py-12">
                <Ionicons name="people-outline" size={28} color="rgba(244,245,247,0.35)" />
                <Text className="mt-3 text-center text-sm text-white/45">
                  {query
                    ? 'Keine passenden Freunde gefunden.'
                    : 'Alle Freunde sehen deinen Heimweg bereits.'}
                </Text>
              </View>
            ) : null}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${selectedUids.size} Begleiter hinzufügen`}
            accessibilityState={{ disabled: !selectedUids.size || adding, busy: adding }}
            disabled={!selectedUids.size || adding}
            onPress={() => void addSelected()}
            className="min-h-14 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-85"
            style={{
              backgroundColor: ACCENT,
              opacity: !selectedUids.size || adding ? 0.4 : 1,
            }}
          >
            <Ionicons
              name={adding ? 'hourglass-outline' : 'person-add-outline'}
              size={19}
              color="#fff"
            />
            <Text className="text-base font-extrabold text-white">
              {adding ? 'Wird hinzugefügt …' : `Hinzufügen · ${selectedUids.size}`}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function SafetyAudienceSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
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
          className="overflow-hidden rounded-t-[32px] border border-white/10"
          style={{ height: Math.min(height * 0.88, 760) }}
          onPress={(event) => event.stopPropagation()}
        >
          <SafetyAudienceManager onClose={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
