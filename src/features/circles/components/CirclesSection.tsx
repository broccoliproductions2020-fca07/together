import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useFriends, type FriendProfile } from '@/features/friends';
import { AppButton, AppText } from '@/shared/components';
import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';

import { useCircles } from '../CirclesProvider';
import type { CircleDoc } from '../services/circleService.types';

const ACCENT = '#6E8BF7';

function Avatar({ friend, small = false }: { friend: FriendProfile; small?: boolean }) {
  const size = small ? 'h-8 w-8' : 'h-10 w-10';
  return (
    <View
      className={`${size} items-center justify-center rounded-full`}
      style={{ backgroundColor: `${ACCENT}1F` }}
    >
      <Text
        className={small ? 'text-[11px] font-extrabold' : 'text-sm font-extrabold'}
        style={{ color: ACCENT }}
      >
        {friend.initials}
      </Text>
    </View>
  );
}

function CircleEditor({
  circle,
  visible,
  onClose,
}: {
  circle: CircleDoc | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { friends } = useFriends();
  const { setCircleFriends, deleteCircle } = useCircles();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const open = () => {
    setSelected(circle?.friendUids ?? []);
    setQuery('');
  };
  const filteredFriends = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return friends;
    return friends.filter(
      (friend) =>
        friend.displayName.toLowerCase().includes(needle) ||
        (friend.username?.toLowerCase().includes(needle) ?? false),
    );
  }, [friends, query]);

  function toggle(uid: string) {
    setSelected((current) =>
      current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid],
    );
  }

  async function save() {
    if (!circle || busy) return;
    setBusy(true);
    try {
      await setCircleFriends(circle.id, selected);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!circle) return;
    Alert.alert(
      'Gruppe löschen?',
      `„${circle.name}“ wird nur aus deinen privaten Listen entfernt.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            void deleteCircle(circle.id).then(onClose);
          },
        },
      ],
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={open}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/45">
        <View className="max-h-[88%] rounded-t-[32px] border border-white/10 bg-[#10141B] px-5 pb-5 pt-3">
          <View className="mb-4 h-1.5 w-11 self-center rounded-full bg-white/20" />
          <View className="flex-row items-center justify-between">
            <View className="w-10" />
            <Text className="text-lg font-extrabold text-white">
              {circle?.emoji ? `${circle.emoji} ` : ''}
              {circle?.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gruppe schließen"
              onPress={onClose}
              className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
            >
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
          </View>
          <Text className="mt-2 text-center text-sm leading-5 text-white/55">
            Nur du siehst diese Liste. Personen werden dadurch weder benachrichtigt noch miteinander
            verbunden.
          </Text>

          <TextInput
            className="mt-5 min-h-12 rounded-2xl border border-white/10 bg-white/[0.07] px-4 text-base text-white"
            placeholder="Freunde durchsuchen"
            placeholderTextColor="rgba(255,255,255,0.45)"
            value={query}
            onChangeText={setQuery}
          />
          <ScrollView
            className="mt-3"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
          >
            {filteredFriends.map((friend) => {
              const checked = selected.includes(friend.uid);
              return (
                <Pressable
                  key={friend.uid}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  className="flex-row items-center gap-3 rounded-2xl border px-3 py-2.5 active:opacity-75"
                  style={{
                    backgroundColor: checked ? `${ACCENT}1D` : 'rgba(255,255,255,0.055)',
                    borderColor: checked ? ACCENT : 'rgba(255,255,255,0.1)',
                  }}
                  onPress={() => toggle(friend.uid)}
                >
                  <Avatar friend={friend} />
                  <Text className="flex-1 font-bold text-white">{friend.displayName}</Text>
                  <AnimatedToggleIcon
                    icon="checkmark-circle"
                    outlineIcon="ellipse-outline"
                    active={checked}
                    size={22}
                    activeColor={ACCENT}
                    inactiveColor="rgba(255,255,255,0.35)"
                  />
                </Pressable>
              );
            })}
            {friends.length === 0 ? (
              <View className="rounded-2xl bg-white/[0.06] p-4">
                <Text className="text-sm leading-5 text-white/60">
                  Füge zuerst bestätigte Freunde hinzu. Erst dann kannst du sie in private Gruppen
                  einsortieren.
                </Text>
              </View>
            ) : null}
          </ScrollView>
          <View className="mt-2 gap-3">
            <Text className="text-center text-sm font-semibold text-white/55">
              {selected.length} ausgewählt
            </Text>
            <AppButton label="Gruppe speichern" disabled={busy} onPress={() => void save()} />
            <Pressable
              accessibilityRole="button"
              className="min-h-11 items-center justify-center"
              onPress={remove}
            >
              <Text className="text-sm font-bold text-[#F28888]">Gruppe löschen</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CircleCard({ circle, onEdit }: { circle: CircleDoc; onEdit: () => void }) {
  const { friends } = useFriends();
  const members = friends.filter((friend) => circle.friendUids.includes(friend.uid));
  return (
    <Pressable
      accessibilityRole="button"
      className="rounded-[24px] border border-border bg-card p-4 shadow-sm active:opacity-75"
      onPress={onEdit}
    >
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
          <Text className="text-xl">{circle.emoji ?? '◌'}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-extrabold text-foreground">{circle.name}</Text>
          <Text className="mt-0.5 text-sm text-muted-foreground">
            {members.length === 1 ? '1 Freund' : `${members.length} Freunde`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94949D" />
      </View>
      {members.length ? (
        <View className="mt-3 flex-row items-center">
          {members.slice(0, 5).map((friend, index) => (
            <View
              key={friend.uid}
              style={{ marginLeft: index ? -7 : 0 }}
              className="rounded-full border-2 border-card"
            >
              <Avatar friend={friend} small />
            </View>
          ))}
          {members.length > 5 ? (
            <Text className="ml-2 text-xs font-bold text-muted-foreground">
              +{members.length - 5}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text className="mt-3 text-xs text-muted-foreground">Noch leer – Freunde hinzufügen</Text>
      )}
    </Pressable>
  );
}

/** Personal, owner-only shortcuts for the audience picker – never a group system. */
export function CirclesSection() {
  const { circles, createCircle, refreshCircles } = useCircles();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CircleDoc | null>(null);

  useEffect(() => {
    void refreshCircles();
  }, [refreshCircles]);

  async function handleCreate() {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const id = await createCircle(value);
      setName('');
      setEditing(
        circles.find((circle) => circle.id === id) ?? {
          id,
          name: value,
          friendUids: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-3">
      <View>
        <AppText variant="label">Private Gruppen</AppText>
        <Text className="mt-1 text-sm leading-5 text-muted-foreground">
          Deine persönlichen Sichtbarkeitsräume für Activities. Nur du siehst diese Listen.
        </Text>
      </View>
      <View className="flex-row items-center gap-2 rounded-[22px] border border-border bg-card p-2">
        <TextInput
          className="min-h-11 flex-1 px-2 text-sm text-foreground"
          placeholder="Neue Gruppe, z. B. Sport"
          placeholderTextColor="rgba(150,150,160,0.75)"
          maxLength={40}
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => void handleCreate()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Gruppe erstellen"
          disabled={busy || !name.trim()}
          className="h-11 w-11 items-center justify-center rounded-[16px]"
          style={{ backgroundColor: name.trim() ? ACCENT : `${ACCENT}40` }}
          onPress={() => void handleCreate()}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>
      {circles.map((circle) => (
        <CircleCard key={circle.id} circle={circle} onEdit={() => setEditing(circle)} />
      ))}
      {circles.length === 0 ? (
        <Text className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-center text-sm leading-5 text-muted-foreground">
          Lege eine Gruppe an, wenn du bestimmte Freunde öfter gemeinsam einlädst.
        </Text>
      ) : null}
      <CircleEditor circle={editing} visible={editing !== null} onClose={() => setEditing(null)} />
    </View>
  );
}
