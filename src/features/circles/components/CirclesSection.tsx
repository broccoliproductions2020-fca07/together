import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useFriends, type FriendProfile } from '@/features/friends';
import { AppButton, AppText } from '@/shared/components';
import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { useCircles } from '../CirclesProvider';
import type { CircleDoc } from '../services/circleService.types';

const ACCENT = '#3B82F6';

/** See FriendsScreen: weight classes without a family render the system font. */
const TEXT = {
  sheetTitle: { ...TYPE.body, fontFamily: FONT.bold },
  cardTitle: { ...TYPE.body, fontFamily: FONT.semibold },
  body: { ...TYPE.label, fontFamily: FONT.medium },
  note: { ...TYPE.label, fontFamily: FONT.semibold },
  fine: { ...TYPE.caption, fontFamily: FONT.medium },
  finePill: { ...TYPE.caption, fontFamily: FONT.semibold },
  action: { ...TYPE.label, fontFamily: FONT.bold },
  input: { ...TYPE.body, fontFamily: FONT.medium },
  inputCompact: { ...TYPE.label, fontFamily: FONT.medium },
};

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
  const mutationInFlightRef = useRef(false);
  const sessionRevisionRef = useRef(0);
  const mutationRevisionRef = useRef(0);

  const open = () => {
    sessionRevisionRef.current += 1;
    mutationRevisionRef.current += 1;
    mutationInFlightRef.current = false;
    setBusy(false);
    setSelected(circle?.friendUids ?? []);
    setQuery('');
  };

  function dismiss() {
    sessionRevisionRef.current += 1;
    onClose();
  }
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
    if (!circle || busy || mutationInFlightRef.current) return;
    const sessionRevision = sessionRevisionRef.current;
    const mutationRevision = ++mutationRevisionRef.current;
    const selectedUids = [...selected];
    mutationInFlightRef.current = true;
    setBusy(true);
    try {
      await setCircleFriends(circle.id, selectedUids);
      if (sessionRevision !== sessionRevisionRef.current) return;
      dismiss();
    } catch (error) {
      if (sessionRevision !== sessionRevisionRef.current) return;
      Alert.alert(
        'Gruppe konnte nicht gespeichert werden',
        error instanceof Error ? error.message : 'Bitte versuche es erneut.',
      );
    } finally {
      if (mutationRevision !== mutationRevisionRef.current) return;
      mutationInFlightRef.current = false;
      if (sessionRevision === sessionRevisionRef.current) setBusy(false);
    }
  }

  function remove() {
    if (!circle || busy || mutationInFlightRef.current) return;
    Alert.alert(
      'Gruppe löschen?',
      `„${circle.name}“ wird nur aus deinen privaten Listen entfernt.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            if (mutationInFlightRef.current) return;
            const sessionRevision = sessionRevisionRef.current;
            const mutationRevision = ++mutationRevisionRef.current;
            mutationInFlightRef.current = true;
            setBusy(true);
            void deleteCircle(circle.id)
              .then(() => {
                if (sessionRevision === sessionRevisionRef.current) dismiss();
              })
              .catch((error) => {
                if (sessionRevision !== sessionRevisionRef.current) return;
                Alert.alert(
                  'Gruppe konnte nicht gel\u00f6scht werden',
                  error instanceof Error ? error.message : 'Bitte versuche es erneut.',
                );
              })
              .finally(() => {
                if (mutationRevision !== mutationRevisionRef.current) return;
                mutationInFlightRef.current = false;
                if (sessionRevision === sessionRevisionRef.current) setBusy(false);
              });
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
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/45">
        <View className="max-h-[88%] rounded-t-[32px] border border-white/10 bg-[#10141B] px-5 pb-5 pt-3">
          <View className="mb-4 h-1.5 w-11 self-center rounded-full bg-white/20" />
          <View className="flex-row items-center justify-between">
            <View className="w-10" />
            <Text {...TEXT_FLEXIBLE} className="text-white" style={TEXT.sheetTitle}>
              {circle?.emoji ? `${circle.emoji} ` : ''}
              {circle?.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gruppe schließen"
              onPress={dismiss}
              className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
            >
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
          </View>
          <Text {...TEXT_FLEXIBLE} className="mt-2 text-center text-white/55" style={TEXT.body}>
            Nur du siehst diese Liste. Personen werden dadurch weder benachrichtigt noch miteinander
            verbunden.
          </Text>

          <TextInput
            className="mt-5 min-h-12 rounded-2xl border border-white/10 bg-white/[0.07] px-4 text-white"
            style={TEXT.input}
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
                  accessibilityState={{ checked, disabled: busy }}
                  disabled={busy}
                  className="flex-row items-center gap-3 rounded-2xl border px-3 py-2.5 active:opacity-75"
                  style={{
                    backgroundColor: checked ? `${ACCENT}1D` : 'rgba(255,255,255,0.055)',
                    borderColor: checked ? ACCENT : 'rgba(255,255,255,0.1)',
                  }}
                  onPress={() => toggle(friend.uid)}
                >
                  <Avatar friend={friend} />
                  <Text {...TEXT_FLEXIBLE} className="flex-1 text-white" style={TEXT.cardTitle}>
                    {friend.displayName}
                  </Text>
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
                <Text {...TEXT_FLEXIBLE} className="text-white/60" style={TEXT.body}>
                  Füge zuerst bestätigte Freunde hinzu. Erst dann kannst du sie in private Gruppen
                  einsortieren.
                </Text>
              </View>
            ) : null}
          </ScrollView>
          <View className="mt-2 gap-3">
            <Text {...TEXT_FLEXIBLE} className="text-center text-white/55" style={TEXT.note}>
              {selected.length} ausgewählt
            </Text>
            <AppButton label="Gruppe speichern" disabled={busy} onPress={() => void save()} />
            <Pressable
              accessibilityRole="button"
              className="min-h-11 items-center justify-center"
              onPress={remove}
            >
              <Text {...TEXT_CAPPED} className="text-[#F28888]" style={TEXT.action}>
                Gruppe löschen
              </Text>
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
          <Text {...TEXT_FLEXIBLE} className="text-foreground" style={TEXT.cardTitle}>
            {circle.name}
          </Text>
          <Text {...TEXT_FLEXIBLE} className="mt-0.5 text-muted-foreground" style={TEXT.body}>
            {members.length === 1 ? '1 Freund:in' : `${members.length} Freunde`}
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
            <Text {...TEXT_CAPPED} className="ml-2 text-muted-foreground" style={TEXT.finePill}>
              +{members.length - 5}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text {...TEXT_FLEXIBLE} className="mt-3 text-muted-foreground" style={TEXT.fine}>
          Noch leer – Freunde hinzufügen
        </Text>
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
  const createInFlightRef = useRef(false);

  useEffect(() => {
    void refreshCircles();
  }, [refreshCircles]);

  async function handleCreate() {
    const value = name.trim();
    if (!value || busy || createInFlightRef.current) return;
    createInFlightRef.current = true;
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
    } catch (error) {
      Alert.alert(
        'Gruppe konnte nicht erstellt werden',
        error instanceof Error ? error.message : 'Bitte versuche es erneut.',
      );
    } finally {
      createInFlightRef.current = false;
      setBusy(false);
    }
  }

  return (
    <View className="gap-3">
      <View>
        <AppText variant="label">Private Gruppen</AppText>
        <Text {...TEXT_FLEXIBLE} className="mt-1 text-muted-foreground" style={TEXT.body}>
          Deine persönlichen Sichtbarkeitsräume für Activities. Nur du siehst diese Listen.
        </Text>
      </View>
      <View className="flex-row items-center gap-2 rounded-[22px] border border-border bg-card p-2">
        <TextInput
          className="min-h-11 flex-1 px-2 text-foreground"
          style={TEXT.inputCompact}
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
        <Text
          {...TEXT_FLEXIBLE}
          className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-center text-muted-foreground"
          style={TEXT.body}
        >
          Lege eine Gruppe an, wenn du bestimmte Freunde öfter gemeinsam einlädst.
        </Text>
      ) : null}
      <CircleEditor circle={editing} visible={editing !== null} onClose={() => setEditing(null)} />
    </View>
  );
}
