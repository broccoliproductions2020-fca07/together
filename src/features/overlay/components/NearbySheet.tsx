import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActivityChat, type GroupMember, type GroupOpening } from '@/features/chat';
import type { NearbyFriend } from '@/features/map/types/map.types';
import { RadiusSlider } from '@/features/settings';

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
          <Ionicons name={selected ? 'checkmark' : 'add'} size={18} color="#fff" />
          <Text className="font-bold text-white">
            {selected ? 'Ausgewählt' : 'Zur Planung hinzufügen'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A planning group that opted into "Offen für Dazustoßer" — teaser + join. */
function OpeningRow({ opening, onJoin }: { opening: GroupOpening; onJoin: () => void }) {
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Bei ${opening.title} dazustoßen`}
        onPress={onJoin}
        className="min-h-11 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-85"
        style={{ backgroundColor: OPEN_COLOR }}
      >
        <Ionicons name="enter-outline" size={17} color="#fff" />
        <Text className="text-sm font-bold text-white">Dazustoßen</Text>
      </Pressable>
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
  onClose: () => void;
  onStartPlanning: (members: GroupMember[]) => void;
  onJoinOpening: (opening: GroupOpening) => void;
}

export function NearbySheet({
  visible,
  friends,
  friendsWithoutLocation,
  onClose,
  onStartPlanning,
  onJoinOpening,
}: NearbySheetProps) {
  const insets = useSafeAreaInsets();
  const { groupOpenings, setOpeningsActive } = useActivityChat();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailFriend, setDetailFriend] = useState<NearbyFriend | null>(null);
  const startingRef = useRef(false);

  // The openings listener runs only while this sheet is visible (listener budget).
  useEffect(() => {
    setOpeningsActive(visible);
    return () => setOpeningsActive(false);
  }, [visible, setOpeningsActive]);

  useEffect(() => {
    if (!visible) {
      setSelected(new Set());
      setDetailFriend(null);
    }
    startingRef.current = false;
  }, [visible]);

  const allFriends = [...friends, ...friendsWithoutLocation];
  const nearbyCount = friends.length;
  const openCount = allFriends.length;
  const count = selected.size;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleStartPlanning() {
    if (startingRef.current) return;
    const members: GroupMember[] = allFriends
      .filter((friend) => selected.has(friend.id))
      .map((friend) => ({ id: friend.id, displayName: friend.displayName }));
    if (!members.length) return;
    startingRef.current = true;
    setSelected(new Set());
    onStartPlanning(members);
  }

  const footerLabel =
    count === 0 ? 'Freunde auswählen' : count === 1 ? 'Chat öffnen' : `Gemeinsam planen (${count})`;

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
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
                onPress={onClose}
              >
                <Ionicons name="close" size={20} color="rgba(244,245,247,0.8)" />
              </Pressable>
            </View>

            <View className="mx-5 mb-1 mt-1">
              <OpenStatusCard />
            </View>

            <View className="mx-5 mb-2 mt-2">
              <RadiusSlider compact />
            </View>

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
                  ) : (
                    <Text className="py-6 text-center text-sm text-white/40">
                      Niemand offen in diesem Umkreis. Zieh den Nähe-Filter größer.
                    </Text>
                  )}

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
                            onJoin={() => onJoinOpening(opening)}
                          />
                        ))}
                      </View>
                    </>
                  ) : null}
                </>
              )}
            </ScrollView>

            <View
              className="border-t border-white/8 px-5 pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, 12) }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={footerLabel}
                disabled={count === 0}
                onPress={handleStartPlanning}
                className="flex-row items-center justify-center gap-2 rounded-2xl py-4 active:opacity-90"
                style={{ backgroundColor: count === 0 ? 'rgba(110,139,247,0.3)' : OPEN_COLOR }}
              >
                <Ionicons
                  name={count === 1 ? 'chatbubble-outline' : 'people'}
                  size={18}
                  color="#fff"
                />
                <Text className="text-base font-bold text-white">{footerLabel}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
