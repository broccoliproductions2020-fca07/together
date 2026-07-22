import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useCircles, type CircleDoc } from '@/features/circles';
import { useFriends, type FriendProfile } from '@/features/friends';

import type { ActivityDraft, ActivityVisibility } from '../types';

const ACCENT = '#6E8BF7';

function ContextChip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className="h-10 flex-row items-center gap-1.5 rounded-full border px-3.5 active:opacity-75"
      style={{
        backgroundColor: selected ? `${ACCENT}22` : 'rgba(255,255,255,0.055)',
        borderColor: selected ? ACCENT : 'rgba(255,255,255,0.14)',
      }}
    >
      {icon ? (
        <Ionicons name={icon} size={15} color={selected ? ACCENT : 'rgba(244,245,247,0.68)'} />
      ) : null}
      <Text className="text-sm font-semibold" style={{ color: selected ? '#F4F5F7' : '#D5D7DD' }}>
        {label}
      </Text>
      {selected ? <Ionicons name="checkmark" size={15} color={ACCENT} /> : null}
    </Pressable>
  );
}

function FriendChoiceRow({
  friend,
  selected,
  onPress,
}: {
  friend: FriendProfile;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={friend.displayName}
      onPress={onPress}
      className="flex-row items-center gap-3 px-2 py-3 active:opacity-70"
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: selected ? ACCENT : 'rgba(255,255,255,0.11)' }}
      >
        <Text className="text-sm font-bold" style={{ color: selected ? '#fff' : '#F4F5F7' }}>
          {friend.initials}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-white">{friend.displayName}</Text>
        {friend.username ? <Text className="text-xs text-white/45">@{friend.username}</Text> : null}
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? ACCENT : 'rgba(244,245,247,0.3)'}
      />
    </Pressable>
  );
}

type GroupSheetView = 'choose' | 'create' | 'edit';

export interface VisibilityPickerProps {
  draft: ActivityDraft;
  onChange: (draft: ActivityDraft) => void;
}

/**
 * A context picker, not a recipient picker. Activities are passively visible
 * to exactly one context: all direct friends, close friends, or one private
 * group. People are only ever selected while maintaining a group itself.
 */
export function VisibilityPicker({ draft, onChange }: VisibilityPickerProps) {
  const { circles, createCircle, refreshCircles, setCircleFriends } = useCircles();
  const { friends, closeFriends } = useFriends();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<GroupSheetView>('choose');
  const [editingGroup, setEditingGroup] = useState<CircleDoc | null>(null);
  const [groupName, setGroupName] = useState('');
  const [memberIds, setMemberIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedGroupId = draft.visibility.kind === 'group' ? draft.visibility.groupId : undefined;

  const selectedGroup = useMemo(
    () => circles.find((group) => group.id === selectedGroupId),
    [circles, selectedGroupId],
  );
  const filteredFriends = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de');
    if (!needle) return friends;
    return friends.filter(
      (friend) =>
        friend.displayName.toLocaleLowerCase('de').includes(needle) ||
        (friend.username?.toLocaleLowerCase('de').includes(needle) ?? false),
    );
  }, [friends, query]);

  function selectContext(context: ActivityVisibility) {
    onChange({ ...draft, visibility: context });
  }

  function closeSheet() {
    if (busy) return;
    setSheetOpen(false);
    setSheetView('choose');
    setEditingGroup(null);
    setGroupName('');
    setMemberIds(new Set());
    setQuery('');
  }

  function openGroupChooser() {
    void refreshCircles();
    setSheetView('choose');
    setEditingGroup(null);
    setGroupName('');
    setMemberIds(new Set());
    setQuery('');
    setSheetOpen(true);
  }

  function openCreateGroup() {
    setEditingGroup(null);
    setGroupName('');
    setMemberIds(new Set());
    setQuery('');
    setSheetView('create');
  }

  function openEditGroup(group: CircleDoc) {
    setEditingGroup(group);
    setGroupName(group.name);
    setMemberIds(new Set(group.friendUids));
    setQuery('');
    setSheetView('edit');
    setSheetOpen(true);
  }

  function toggleMember(uid: string) {
    setMemberIds((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function saveGroup() {
    const name = groupName.trim();
    if (busy || memberIds.size === 0 || (sheetView === 'create' && !name)) return;
    setBusy(true);
    try {
      if (sheetView === 'edit' && editingGroup) {
        await setCircleFriends(editingGroup.id, [...memberIds]);
        closeSheet();
        return;
      }

      const groupId = await createCircle(name);
      await setCircleFriends(groupId, [...memberIds]);
      selectContext({ kind: 'group', groupId });
      closeSheet();
    } finally {
      setBusy(false);
    }
  }

  const contextLabel =
    draft.visibility.kind === 'all_friends'
      ? 'Alle Freunde'
      : draft.visibility.kind === 'close_friends'
        ? 'Enge Freunde'
        : (selectedGroup?.name ?? 'Private Gruppe');

  return (
    <View className="gap-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', gap: 8, paddingRight: 4 }}
      >
        <ContextChip
          label="Alle Freunde"
          icon="people-outline"
          selected={draft.visibility.kind === 'all_friends'}
          onPress={() => selectContext({ kind: 'all_friends' })}
        />
        {closeFriends.length ? (
          <ContextChip
            label="Enge Freunde"
            icon="star-outline"
            selected={draft.visibility.kind === 'close_friends'}
            onPress={() => selectContext({ kind: 'close_friends' })}
          />
        ) : null}
        {circles.map((group) => (
          <ContextChip
            key={group.id}
            label={`${group.emoji ? `${group.emoji} ` : ''}${group.name}`}
            selected={draft.visibility.kind === 'group' && draft.visibility.groupId === group.id}
            onPress={() => selectContext({ kind: 'group', groupId: group.id })}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Gruppe wählen oder erstellen"
          onPress={openGroupChooser}
          className="h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.055] active:opacity-75"
        >
          <Ionicons name="add" size={20} color="rgba(244,245,247,0.82)" />
        </Pressable>
      </ScrollView>

      <View className="flex-row items-center gap-2">
        <Ionicons name="eye-outline" size={15} color="rgba(244,245,247,0.52)" />
        <Text className="flex-1 text-xs leading-4 text-white/50">Sichtbar für {contextLabel}</Text>
        {selectedGroup ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${selectedGroup.name} bearbeiten`}
            onPress={() => openEditGroup(selectedGroup)}
            className="flex-row items-center gap-1 py-1 active:opacity-70"
          >
            <Ionicons name="pencil-outline" size={14} color={ACCENT} />
            <Text className="text-xs font-semibold" style={{ color: ACCENT }}>
              Bearbeiten
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View className="flex-1 justify-end bg-black/45">
          <View className="max-h-[88%] rounded-t-[32px] border border-white/10 bg-[#0E1116] px-5 pb-5 pt-3">
            <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-white/20" />
            <View className="flex-row items-center justify-between">
              {sheetView === 'choose' ? (
                <View className="w-11" />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Zurück zu Gruppen"
                  onPress={() => setSheetView('choose')}
                  className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:opacity-70"
                >
                  <Ionicons name="arrow-back" size={19} color="#F4F5F7" />
                </Pressable>
              )}
              <Text className="text-center text-xl font-extrabold text-white">
                {sheetView === 'choose'
                  ? 'Gruppe wählen'
                  : sheetView === 'create'
                    ? 'Neue Gruppe'
                    : 'Gruppe bearbeiten'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Schließen"
                onPress={closeSheet}
                className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:opacity-70"
              >
                <Ionicons name="close" size={20} color="#F4F5F7" />
              </Pressable>
            </View>

            {sheetView === 'choose' ? (
              <>
                <Text className="mt-2 text-center text-sm leading-5 text-white/55">
                  Gruppen sind deine privaten Freundeslisten. Niemand wird dadurch benachrichtigt.
                </Text>
                <ScrollView className="mt-5" contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
                  {circles.map((group) => (
                    <Pressable
                      key={group.id}
                      accessibilityRole="button"
                      accessibilityLabel={group.name}
                      onPress={() => {
                        selectContext({ kind: 'group', groupId: group.id });
                        closeSheet();
                      }}
                      className="flex-row items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3.5 active:opacity-75"
                    >
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
                        <Text className="text-lg">{group.emoji ?? '◌'}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-base font-bold text-white">{group.name}</Text>
                        <Text className="mt-0.5 text-sm text-white/50">
                          {group.friendUids.length}{' '}
                          {group.friendUids.length === 1 ? 'Freund' : 'Freunde'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="rgba(244,245,247,0.45)" />
                    </Pressable>
                  ))}
                  {circles.length === 0 ? (
                    <Text className="rounded-2xl bg-white/[0.055] px-4 py-5 text-center text-sm leading-5 text-white/55">
                      Keine Gruppen vorhanden
                    </Text>
                  ) : null}
                </ScrollView>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Neue Gruppe erstellen"
                  onPress={openCreateGroup}
                  className="mt-2 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-85"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Ionicons name="add" size={19} color="#fff" />
                  <Text className="text-base font-bold text-white">Neue Gruppe</Text>
                </Pressable>
              </>
            ) : (
              <>
                {sheetView === 'create' ? (
                  <TextInput
                    className="mt-5 min-h-12 rounded-2xl border border-white/10 bg-white/[0.07] px-4 text-base font-semibold text-white"
                    placeholder="Name der Gruppe, z. B. Mädels"
                    placeholderTextColor="rgba(244,245,247,0.45)"
                    value={groupName}
                    onChangeText={setGroupName}
                    maxLength={40}
                    autoFocus
                  />
                ) : (
                  <Text className="mt-3 text-center text-sm text-white/55">
                    {editingGroup?.name}
                  </Text>
                )}
                <TextInput
                  className="mt-3 min-h-12 rounded-2xl border border-white/10 bg-white/[0.07] px-4 text-base text-white"
                  placeholder="Freunde durchsuchen"
                  placeholderTextColor="rgba(244,245,247,0.45)"
                  value={query}
                  onChangeText={setQuery}
                />
                <ScrollView
                  className="mt-3"
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 12 }}
                >
                  <View className="divide-y divide-white/8 rounded-3xl border border-white/10 bg-white/[0.04] px-2">
                    {filteredFriends.map((friend) => (
                      <FriendChoiceRow
                        key={friend.uid}
                        friend={friend}
                        selected={memberIds.has(friend.uid)}
                        onPress={() => toggleMember(friend.uid)}
                      />
                    ))}
                  </View>
                  {friends.length === 0 ? (
                    <Text className="rounded-2xl bg-white/[0.055] px-4 py-5 text-center text-sm leading-5 text-white/55">
                      Füge zuerst bestätigte Freunde hinzu.
                    </Text>
                  ) : null}
                </ScrollView>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    sheetView === 'create' ? 'Gruppe erstellen' : 'Gruppe speichern'
                  }
                  disabled={
                    busy || memberIds.size === 0 || (sheetView === 'create' && !groupName.trim())
                  }
                  onPress={() => void saveGroup()}
                  className="mt-2 min-h-12 items-center justify-center rounded-2xl active:opacity-85"
                  style={{
                    backgroundColor: ACCENT,
                    opacity:
                      busy || memberIds.size === 0 || (sheetView === 'create' && !groupName.trim())
                        ? 0.42
                        : 1,
                  }}
                >
                  <Text className="text-base font-bold text-white">
                    {sheetView === 'create'
                      ? `Gruppe erstellen${memberIds.size ? ` (${memberIds.size})` : ''}`
                      : `Änderungen speichern${memberIds.size ? ` (${memberIds.size})` : ''}`}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
