import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActivityChat, type GroupMember, type GroupOpening } from '@/features/chat';
import type { NearbyFriend } from '@/features/map/types/map.types';
import { RadiusSlider } from '@/features/settings';
import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';
import { SquircleButton } from '@/shared/components/SquircleButton';
import { openLocationSettings } from '@/shared/utils/locationPermission';

import { OpenStatusCard } from './OpenStatusCard';

const OPEN_COLOR = '#6E8BF7';

function formatDistance(km: number): string {
  if (km < 1) return 'unter 1 km entfernt';
  return `ca. ${Math.max(1, Math.round(km))} km entfernt`;
}

function formatUntil(expiresAt?: number): string | null {
  if (!expiresAt || !Number.isFinite(expiresAt)) return null;
  const date = new Date(expiresAt);
  return `offen bis ${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function InitialsCircle({
  initials,
  avatarUrl,
  large = false,
}: {
  initials: string;
  avatarUrl?: string;
  large?: boolean;
}) {
  return (
    <View
      className={
        large
          ? 'h-14 w-14 items-center justify-center overflow-hidden rounded-full'
          : 'h-10 w-10 items-center justify-center overflow-hidden rounded-full'
      }
      style={{ backgroundColor: `${OPEN_COLOR}22` }}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} className="h-full w-full" />
      ) : (
        <Text
          className={large ? 'text-lg font-extrabold' : 'text-sm font-bold'}
          style={{ color: OPEN_COLOR }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

function SelectCircle({ active }: { active: boolean }) {
  return (
    <View
      className="h-8 w-8 items-center justify-center rounded-full border"
      style={{
        borderColor: active ? OPEN_COLOR : 'rgba(255,255,255,0.22)',
        backgroundColor: active ? OPEN_COLOR : 'rgba(255,255,255,0.04)',
      }}
    >
      <Ionicons
        name={active ? 'checkmark' : 'add'}
        size={17}
        color={active ? '#fff' : OPEN_COLOR}
      />
    </View>
  );
}

function FriendRow({
  friend,
  selected,
  onOpen,
  onToggle,
}: {
  friend: NearbyFriend;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const distanceLabel = friend.distanceKm === undefined ? null : formatDistance(friend.distanceKm);

  return (
    <View className="flex-row items-center gap-3 py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${friend.displayName} ansehen`}
        onPress={onOpen}
        className="flex-1 flex-row items-center gap-3 active:opacity-70"
      >
        <InitialsCircle initials={friend.initials} avatarUrl={friend.avatarUrl} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-white">{friend.displayName}</Text>
          <Text className="mt-0.5 text-sm text-white/55" numberOfLines={1}>
            {friend.activity}
          </Text>
          <Text className="mt-1 text-xs text-white/42">{distanceLabel ?? 'Keine Näheangabe'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color="rgba(244,245,247,0.36)" />
      </Pressable>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={
          selected
            ? `${friend.displayName} aus Auswahl entfernen`
            : `${friend.displayName} auswählen`
        }
        accessibilityState={{ checked: selected }}
        onPress={onToggle}
        hitSlop={6}
      >
        <SelectCircle active={selected} />
      </Pressable>
    </View>
  );
}

function OpenFriendDetail({
  friend,
  selected,
  onBack,
  onToggle,
}: {
  friend: NearbyFriend;
  selected: boolean;
  onBack: () => void;
  onToggle: () => void;
}) {
  const untilLabel = formatUntil(friend.expiresAt);
  const distanceLabel = friend.distanceKm === undefined ? null : formatDistance(friend.distanceKm);

  return (
    <View className="gap-4 py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zurück zu offenen Freunden"
        onPress={onBack}
        className="flex-row items-center gap-1 self-start py-1 active:opacity-70"
      >
        <Ionicons name="arrow-back" size={17} color={OPEN_COLOR} />
        <Text className="text-sm font-bold" style={{ color: OPEN_COLOR }}>
          Alle offenen Freunde
        </Text>
      </Pressable>

      <View
        className="gap-4 rounded-3xl border p-4"
        style={{ borderColor: `${OPEN_COLOR}55`, backgroundColor: `${OPEN_COLOR}12` }}
      >
        <View className="flex-row items-center gap-3">
          <InitialsCircle initials={friend.initials} avatarUrl={friend.avatarUrl} large />
          <View className="flex-1">
            <Text className="text-xl font-extrabold tracking-[-0.25px] text-white">
              {friend.displayName}
            </Text>
          </View>
        </View>

        <View className="gap-2 rounded-2xl bg-black/15 p-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="sparkles-outline" size={16} color={OPEN_COLOR} />
            <Text className="flex-1 text-sm font-semibold text-white">{friend.activity}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Ionicons name="time-outline" size={16} color="rgba(244,245,247,0.58)" />
            <Text className="text-sm text-white/60">{untilLabel ?? 'Gerade verfügbar'}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Ionicons
              name={distanceLabel ? 'locate-outline' : 'locate'}
              size={16}
              color="rgba(244,245,247,0.58)"
            />
            <Text className="text-sm text-white/60">
              {distanceLabel ?? 'Keine Näheangabe geteilt'}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={
            selected
              ? `${friend.displayName} aus Auswahl entfernen`
              : `${friend.displayName} zur Planung auswählen`
          }
          onPress={onToggle}
          className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-85"
          style={{ backgroundColor: selected ? 'rgba(255,255,255,0.1)' : OPEN_COLOR }}
        >
          <AnimatedToggleIcon
            icon="checkmark"
            outlineIcon="add"
            active={selected}
            size={18}
            activeColor="#fff"
            inactiveColor="#fff"
          />
          <Text className="font-bold text-white">
            {selected ? 'Ausgewählt' : 'Zur Planung hinzufügen'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A planning group that opted into "Offen für Dazustoßer" — teaser + join. */
function OpeningRow({
  opening,
  joining,
  onJoin,
}: {
  opening: GroupOpening;
  joining: boolean;
  onJoin: () => void;
}) {
  return (
    <View
      className="gap-3 rounded-3xl border p-4"
      style={{ borderColor: `${OPEN_COLOR}44`, backgroundColor: `${OPEN_COLOR}0F` }}
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-row">
          {opening.memberPreview.slice(0, 4).map((member, index) => (
            <View key={`${member.initials}-${index}`} style={{ marginLeft: index === 0 ? 0 : -10 }}>
              <View
                className="h-10 w-10 items-center justify-center rounded-full border-2 border-[#0B1016]"
                style={{ backgroundColor: `${OPEN_COLOR}30` }}
              >
                <Text className="text-xs font-extrabold" style={{ color: OPEN_COLOR }}>
                  {member.initials}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-white" numberOfLines={1}>
            {opening.title}
          </Text>
          <Text className="mt-0.5 text-xs text-white/50" numberOfLines={1}>
            {opening.memberCount} dabei{opening.vibe ? ` · ${opening.vibe}` : ''} · sucht noch Leute
          </Text>
        </View>
      </View>
      <SquircleButton
        label={joining ? 'Wird beigetreten …' : 'Dazustoßen'}
        color={OPEN_COLOR}
        size="md"
        disabled={joining}
        loading={joining}
        icon="enter-outline"
        fullWidth={false}
        accessibilityLabel={`Bei ${opening.title} dazustoßen`}
        onPress={onJoin}
      />
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-white">
      {children}
    </Text>
  );
}

export interface NearbySheetProps {
  visible: boolean;
  friends: NearbyFriend[];
  friendsWithoutLocation: NearbyFriend[];
  /** Why "In deiner Nähe" is empty — decides which honest hint (and fix) shows.
   * 'quiet' = open friends exist but none has a distance basis; the
   * "Ohne Näheangabe" section right below already explains itself. */
  emptyReason?: 'no-friends' | 'none-open' | 'out-of-range' | 'quiet';
  /** Foreground location permission is denied → distances cannot be computed. */
  locationDenied?: boolean;
  /** Open straight onto this friend's detail — set when the sheet was opened by
   * tapping their open-presence marker on the map, so the tap lands on "… ist
   * offen" instead of the generic list. */
  focusFriendId?: string;
  onAddFriends?: () => void;
  onClose: () => void;
  onStartSpontaneousRound: (members: GroupMember[]) => Promise<boolean>;
  onJoinOpening: (opening: GroupOpening) => Promise<boolean>;
}

export function NearbySheet({
  visible,
  friends,
  friendsWithoutLocation,
  emptyReason = 'out-of-range',
  locationDenied = false,
  focusFriendId,
  onAddFriends,
  onClose,
  onStartSpontaneousRound,
  onJoinOpening,
}: NearbySheetProps) {
  const insets = useSafeAreaInsets();
  const { groupOpenings, setOpeningsActive } = useActivityChat();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailFriend, setDetailFriend] = useState<NearbyFriend | null>(null);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [joiningOpeningId, setJoiningOpeningId] = useState<string | null>(null);
  const joiningOpeningRef = useRef<string | null>(null);
  const interactionRevisionRef = useRef(0);

  // The openings listener runs only while this sheet is visible (listener budget).
  useEffect(() => {
    setOpeningsActive(visible);
    return () => setOpeningsActive(false);
  }, [visible, setOpeningsActive]);

  useEffect(() => {
    if (!visible) {
      interactionRevisionRef.current += 1;
      setSelected(new Set());
      setDetailFriend(null);
      setStarting(false);
      setJoiningOpeningId(null);
      joiningOpeningRef.current = null;
    }
    startingRef.current = false;
  }, [visible]);

  const allFriends = [...friends, ...friendsWithoutLocation];

  // Arriving from a map marker: land on that person. Runs after `allFriends`
  // exists so the lookup can resolve, and only while visible so closing the
  // sheet still clears the detail above.
  useEffect(() => {
    if (!visible || !focusFriendId) return;
    const match = allFriends.find((friend) => friend.id === focusFriendId);
    if (match) setDetailFriend(match);
    // `allFriends` is rebuilt every render; keying the effect on the id list
    // keeps it from re-opening the detail on every presence tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, focusFriendId, allFriends.map((friend) => friend.id).join(',')]);
  const nearbyCount = friends.length;
  const openCount = allFriends.length;
  const count = selected.size;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size >= 20) {
        Alert.alert(
          'Bis zu 20 Personen',
          'Eine spontane Runde kann hoechstens 20 Winks enthalten.',
        );
        return current;
      } else next.add(id);
      return next;
    });
  }

  function dismiss() {
    interactionRevisionRef.current += 1;
    startingRef.current = false;
    setStarting(false);
    setJoiningOpeningId(null);
    joiningOpeningRef.current = null;
    onClose();
  }

  async function handleStartPlanning() {
    if (startingRef.current) return;
    const members: GroupMember[] = allFriends
      .filter((friend) => selected.has(friend.id))
      .map((friend) => ({ id: friend.id, displayName: friend.displayName }));
    if (!members.length) return;
    const interactionRevision = interactionRevisionRef.current;
    startingRef.current = true;
    setStarting(true);
    try {
      const started = await onStartSpontaneousRound(members);
      if (started && interactionRevision === interactionRevisionRef.current) setSelected(new Set());
    } finally {
      if (interactionRevision === interactionRevisionRef.current) {
        startingRef.current = false;
        setStarting(false);
      }
    }
  }

  async function handleJoinOpening(opening: GroupOpening) {
    if (joiningOpeningRef.current) return;
    const interactionRevision = interactionRevisionRef.current;
    joiningOpeningRef.current = opening.id;
    setJoiningOpeningId(opening.id);
    try {
      await onJoinOpening(opening);
    } finally {
      if (interactionRevision === interactionRevisionRef.current) {
        joiningOpeningRef.current = null;
        setJoiningOpeningId(null);
      }
    }
  }

  const footerLabel =
    count === 0 ? 'Freunde auswählen' : count === 1 ? 'Chat öffnen' : `Gemeinsam planen (${count})`;
  const winkFooterLabel = count === 0 ? footerLabel : `Winken senden (${count})`;

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={dismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={dismiss}>
          <Pressable
            className="max-h-[86%] rounded-t-[34px] border border-white/10"
            style={{ backgroundColor: '#0B1016' }}
            onPress={(event) => event.stopPropagation()}
          >
            <View className="items-center pt-3">
              <View className="h-1 w-10 rounded-full bg-white/20" />
            </View>

            <View className="flex-row items-center gap-3 px-5 pb-3 pt-4">
              <View className="h-11 w-11 items-center justify-center rounded-[17px] bg-[#6E8BF7]/15">
                <Ionicons
                  name={detailFriend ? 'person-outline' : 'people-outline'}
                  size={20}
                  color={OPEN_COLOR}
                />
              </View>
              <View className="flex-1">
                <Text className="text-xl font-extrabold tracking-[-0.35px] text-white">
                  {detailFriend
                    ? detailFriend.displayName
                    : `${openCount} ${openCount === 1 ? 'Freund' : 'Freunde'} offen`}
                </Text>
                <Text className="mt-0.5 text-sm text-white/45">
                  {detailFriend
                    ? 'Zur Planung auswählen'
                    : nearbyCount
                      ? `${nearbyCount} im gewählten Umkreis`
                      : 'Sieh, wer gerade Zeit hat'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Offene Freunde schließen"
                className="h-10 w-10 items-center justify-center rounded-full bg-white/8 active:opacity-70"
                onPress={dismiss}
              >
                <Ionicons name="close" size={20} color="rgba(244,245,247,0.8)" />
              </Pressable>
            </View>

            <View className="mx-5 mb-1 mt-1">
              <OpenStatusCard visible={visible} />
            </View>

            <View className="mx-5 mb-2 mt-2">
              <RadiusSlider compact />
            </View>

            {locationDenied ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Standortzugriff in den Einstellungen erlauben"
                onPress={openLocationSettings}
                className="mx-5 mb-2 flex-row items-center gap-2.5 rounded-xl border border-[#E0A23E]/40 bg-[#E0A23E]/10 px-3.5 py-2.5 active:opacity-80"
              >
                <Ionicons name="location-outline" size={16} color="#E0A23E" />
                <Text className="flex-1 text-xs leading-4 text-white/70">
                  Standort ist aus — Entfernungen lassen sich nicht berechnen.{' '}
                  <Text className="font-semibold text-[#E0A23E]">Einstellungen öffnen</Text>
                </Text>
              </Pressable>
            ) : null}

            <ScrollView
              className="px-5"
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Friends' running Heimwege — safety beats every other section. */}

              {detailFriend ? (
                <OpenFriendDetail
                  friend={detailFriend}
                  selected={selected.has(detailFriend.id)}
                  onBack={() => setDetailFriend(null)}
                  onToggle={() => {
                    toggle(detailFriend.id);
                    setDetailFriend(null);
                  }}
                />
              ) : (
                <>
                  {friends.length ? (
                    <>
                      <SectionLabel>In deiner Nähe</SectionLabel>
                      <View className="divide-y divide-white/8">
                        {friends.map((friend) => (
                          <FriendRow
                            key={friend.id}
                            friend={friend}
                            selected={selected.has(friend.id)}
                            onOpen={() => setDetailFriend(friend)}
                            onToggle={() => toggle(friend.id)}
                          />
                        ))}
                      </View>
                    </>
                  ) : emptyReason === 'no-friends' ? (
                    <View className="items-center gap-3 py-6">
                      <Text className="text-center text-sm leading-5 text-white/40">
                        Du hast noch niemanden bei Como. Füge zuerst Freunde hinzu — erst dann
                        siehst du hier, wer offen ist.
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={onAddFriends}
                        className="rounded-full bg-white/10 px-5 py-2.5 active:opacity-80"
                      >
                        <Text className="text-sm font-semibold text-white">Freunde hinzufügen</Text>
                      </Pressable>
                    </View>
                  ) : emptyReason === 'none-open' ? (
                    <Text className="py-6 text-center text-sm text-white/40">
                      Gerade ist niemand offen. Stell dich offen — deine Freunde sehen es sofort.
                    </Text>
                  ) : emptyReason === 'out-of-range' ? (
                    <Text className="py-6 text-center text-sm text-white/40">
                      Niemand offen in diesem Umkreis. Zieh den Nähe-Filter größer.
                    </Text>
                  ) : null}

                  {friendsWithoutLocation.length ? (
                    <>
                      <SectionLabel>Ohne Näheangabe</SectionLabel>
                      <View className="divide-y divide-white/8">
                        {friendsWithoutLocation.map((friend) => (
                          <FriendRow
                            key={friend.id}
                            friend={friend}
                            selected={selected.has(friend.id)}
                            onOpen={() => setDetailFriend(friend)}
                            onToggle={() => toggle(friend.id)}
                          />
                        ))}
                      </View>
                    </>
                  ) : null}

                  {/* Groups that explicitly opted into being joinable — an
                      invitation, never an exclusion display. */}
                  {groupOpenings.length ? (
                    <>
                      <SectionLabel>Am Planen — komm dazu</SectionLabel>
                      <View className="gap-2 pb-2">
                        {groupOpenings.map((opening) => (
                          <OpeningRow
                            key={opening.id}
                            opening={opening}
                            joining={joiningOpeningId === opening.id}
                            onJoin={() => void handleJoinOpening(opening)}
                          />
                        ))}
                      </View>
                    </>
                  ) : null}
                </>
              )}
            </ScrollView>

            <View className="px-5 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
              <SquircleButton
                label={winkFooterLabel}
                color={OPEN_COLOR}
                icon="hand-left-outline"
                disabled={count === 0 || starting}
                loading={starting}
                onPress={handleStartPlanning}
              />
            </View>
          </Pressable>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
