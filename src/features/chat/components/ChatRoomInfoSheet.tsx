import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth';
import type { RoomMemberProfile } from '../services/chatService.types';
import { useActivityChat } from '../useActivityChat';
import { useThemeColors } from '@/features/theme';

const ACCENT = '#6E8BF7';

type InfoView = { kind: 'members' } | { kind: 'profile'; uid: string };

/** "20. Juli, 23:00" — enough precision to make the TTL feel predictable. */
function formatExpiry(ms: number): string {
  return new Date(ms).toLocaleString('de-DE', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Avatar({
  initials,
  avatarUrl,
  size = 'md',
  admin = false,
}: {
  initials: string;
  avatarUrl?: string;
  size?: 'md' | 'xl';
  admin?: boolean;
}) {
  return (
    <View
      className={
        size === 'xl'
          ? 'h-20 w-20 items-center justify-center overflow-hidden rounded-full'
          : 'h-11 w-11 items-center justify-center overflow-hidden rounded-full'
      }
      style={{
        backgroundColor: `${ACCENT}22`,
        borderWidth: admin ? 1.5 : 0,
        borderColor: `${ACCENT}88`,
      }}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} className="h-full w-full" />
      ) : (
        <Text
          className={size === 'xl' ? 'text-2xl font-extrabold' : 'text-sm font-bold'}
          style={{ color: ACCENT }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

function AdminChip() {
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${ACCENT}26` }}>
      <Text
        className="text-[10px] font-extrabold uppercase tracking-wide"
        style={{ color: ACCENT }}
      >
        Admin
      </Text>
    </View>
  );
}

export interface ChatRoomInfoSheetProps {
  visible: boolean;
  roomId: string;
  /** Shown while the room summary hasn't loaded (e.g. right after joining). */
  fallbackTitle?: string;
  onClose: () => void;
  /** Called after the user left the room — the host should also close the chat. */
  onLeave?: () => void;
}

/**
 * Messenger-style room info: member list with admin badges, tappable member
 * profiles, and (group rooms, admins only) add/remove/promote management.
 * Activity chats show members read-only — their membership follows activity
 * participation, never chat-side edits.
 */
export function ChatRoomInfoSheet({
  visible,
  roomId,
  fallbackTitle,
  onClose,
  onLeave,
}: ChatRoomInfoSheetProps) {
  const { user } = useAuth();
  const colors = useThemeColors();
  const myUid = user?.id ?? 'u_you';
  const {
    getRoom,
    getRoomMembers,
    isRoomAdmin,
    removeMember,
    promoteAdmin,
    renameRoom,
    leaveRoom,
    setGroupOpen,
  } = useActivityChat();
  const room = getRoom(roomId);
  const isGroup = room?.type === 'group';
  const iAmAdmin = isRoomAdmin(roomId);
  const adminUids = useMemo(
    () => (room ? (room.adminUids?.length ? room.adminUids : room.memberIds.slice(0, 1)) : []),
    [room],
  );

  const [view, setView] = useState<InfoView>({ kind: 'members' });
  const [members, setMembers] = useState<RoomMemberProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  // null = not editing; string = draft of the new round name.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  const memberIdsKey = room?.memberIds.join(',') ?? '';
  const reloadMembers = useCallback(() => {
    if (!visible) return;
    setLoading(true);
    getRoomMembers(roomId)
      .then((list) => setMembers(list))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
    // memberIdsKey re-triggers after a change once the rooms listener catches up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, roomId, memberIdsKey, getRoomMembers]);

  useEffect(reloadMembers, [reloadMembers]);

  useEffect(() => {
    if (!visible) return;
    setView({ kind: 'members' });
    setTitleDraft(null);
  }, [visible, roomId]);

  const run = (action: string, promise: Promise<void>, after?: () => void) => {
    setBusy(true);
    promise
      .then(() => {
        after?.();
        reloadMembers();
      })
      .catch((error) => {
        Alert.alert(action, error?.message ?? 'Bitte versuche es gleich noch einmal.');
      })
      .finally(() => setBusy(false));
  };

  const selectedProfile =
    view.kind === 'profile' ? members.find((member) => member.uid === view.uid) : undefined;

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/45">
        <View className="max-h-[88%] rounded-t-[32px] border border-border bg-card px-5 pb-6 pt-3">
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-border" />
          <View className="flex-row items-center justify-between">
            {view.kind === 'profile' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zurück zu allen Mitgliedern"
                onPress={() => setView({ kind: 'members' })}
                className="h-11 w-11 items-center justify-center rounded-full bg-secondary active:opacity-70"
              >
                <Ionicons name="chevron-back" size={21} color={ACCENT} />
              </Pressable>
            ) : (
              <View className="w-11" />
            )}
            <Text
              className="flex-1 px-2 text-center text-2xl font-extrabold text-foreground"
              numberOfLines={1}
            >
              {view.kind === 'profile'
                ? selectedProfile?.displayName ?? 'Profil'
                : isGroup
                  ? 'Planungs-Info'
                  : 'Chat-Info'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Info schließen"
              className="h-11 w-11 items-center justify-center rounded-full bg-secondary"
              onPress={onClose}
            >
              <Ionicons name="close" size={21} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView
            className="mt-4"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 14, paddingBottom: 10 }}
          >
            {view.kind === 'members' ? (
              <>
                {/* Room summary — group admins can rename in place */}
                <View className="flex-row items-center gap-3 rounded-3xl border border-border bg-secondary p-4">
                  <View
                    className="h-12 w-12 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${ACCENT}22` }}
                  >
                    <Ionicons name={isGroup ? 'people' : 'flash'} size={22} color={ACCENT} />
                  </View>
                  {titleDraft !== null ? (
                    <>
                      <TextInput
                        className="flex-1 rounded-xl border bg-card px-3 py-2 text-base font-bold text-foreground"
                        style={{ borderColor: `${ACCENT}66` }}
                        value={titleDraft}
                        onChangeText={setTitleDraft}
                        maxLength={80}
                        autoFocus
                        placeholder="Name der Planung"
                        placeholderTextColor={colors.mutedForeground}
                        onSubmitEditing={() => {
                          const trimmed = titleDraft.trim();
                          if (!trimmed) return;
                          run('Umbenennen', renameRoom(roomId, trimmed), () => setTitleDraft(null));
                        }}
                        returnKeyType="done"
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Neuen Namen speichern"
                        disabled={busy || !titleDraft.trim()}
                        onPress={() =>
                          run('Umbenennen', renameRoom(roomId, titleDraft.trim()), () =>
                            setTitleDraft(null),
                          )
                        }
                        className="h-10 w-10 items-center justify-center rounded-full active:opacity-80"
                        style={{
                          backgroundColor: ACCENT,
                          opacity: busy || !titleDraft.trim() ? 0.4 : 1,
                        }}
                      >
                        <Ionicons name="checkmark" size={19} color="#fff" />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Umbenennen abbrechen"
                        onPress={() => setTitleDraft(null)}
                        className="h-10 w-10 items-center justify-center rounded-full bg-card active:opacity-80"
                      >
                        <Ionicons name="close" size={19} color={colors.foreground} />
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <View className="flex-1">
                        <Text className="text-base font-bold text-foreground" numberOfLines={1}>
                          {room?.title ?? fallbackTitle ?? 'Chat'}
                        </Text>
                        <Text className="mt-0.5 text-sm text-muted-foreground">
                          {isGroup ? 'Planung' : 'Activity-Chat'} ·{' '}
                          {room?.memberIds.length ?? members.length}{' '}
                          {(room?.memberIds.length ?? members.length) === 1
                            ? 'Mitglied'
                            : 'Mitglieder'}
                        </Text>
                      </View>
                      {isGroup && iAmAdmin ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Planung umbenennen"
                          onPress={() => setTitleDraft(room?.title ?? '')}
                          className="h-10 w-10 items-center justify-center rounded-full bg-card active:opacity-80"
                        >
                          <Ionicons name="pencil" size={16} color={colors.foreground} />
                        </Pressable>
                      ) : null}
                    </>
                  )}
                </View>

                {/* Opt-in discoverability — the planning round decides to be findable.
                    Off by default; visible to direct friends via a teaser
                    (title + members, never messages). */}
                {isGroup && iAmAdmin ? (
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: room?.joinable === true }}
                    accessibilityLabel="Offen für Dazustoßer"
                    disabled={busy}
                    onPress={() =>
                      run('Offen für Dazustoßer', setGroupOpen(roomId, !room?.joinable))
                    }
                    className="flex-row items-center gap-3 rounded-3xl border border-border px-4 py-3.5"
                    style={{
                      backgroundColor: room?.joinable ? `${ACCENT}14` : colors.secondary,
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <Ionicons
                      name={room?.joinable ? 'radio' : 'radio-outline'}
                      size={19}
                      color={room?.joinable ? ACCENT : colors.mutedForeground}
                    />
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-foreground">
                        Offen für Dazustoßer
                      </Text>
                      <Text className="mt-0.5 text-xs text-muted-foreground">
                        {room?.joinable
                          ? 'Deine direkten Freunde sehen die Runde und können dazustoßen'
                          : 'Die Runde ist nur für Beteiligte sichtbar'}
                      </Text>
                    </View>
                    <Switch
                      value={room?.joinable === true}
                      onValueChange={(next) =>
                        run('Offen für Dazustoßer', setGroupOpen(roomId, next))
                      }
                      trackColor={{ false: colors.border, true: ACCENT }}
                      thumbColor="#ffffff"
                      disabled={busy}
                    />
                  </Pressable>
                ) : null}

                {/* Members */}
                <View className="gap-1">
                  <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Mitglieder
                  </Text>
                  {loading && members.length === 0 ? (
                    <Text className="rounded-2xl bg-secondary px-4 py-4 text-sm text-muted-foreground">
                      Lade Mitglieder…
                    </Text>
                  ) : (
                    <View className="divide-y divide-border rounded-3xl border border-border bg-secondary px-2">
                      {members.map((member) => (
                        <Pressable
                          key={member.uid}
                          accessibilityRole="button"
                          accessibilityLabel={`Profil von ${member.displayName} öffnen`}
                          onPress={() => setView({ kind: 'profile', uid: member.uid })}
                          className="flex-row items-center gap-3 px-2 py-3 active:opacity-70"
                        >
                          <Avatar
                            initials={member.initials}
                            avatarUrl={member.avatarUrl}
                            admin={adminUids.includes(member.uid)}
                          />
                          <View className="flex-1">
                            <Text
                              className="text-base font-semibold text-foreground"
                              numberOfLines={1}
                            >
                              {member.displayName}
                              {member.uid === myUid ? '  (Du)' : ''}
                            </Text>
                            {member.username ? (
                              <Text className="text-xs text-muted-foreground">
                                @{member.username}
                              </Text>
                            ) : null}
                          </View>
                          {adminUids.includes(member.uid) ? <AdminChip /> : null}
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={colors.mutedForeground}
                          />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                {!isGroup ? (
                  <Text className="text-xs leading-4 text-muted-foreground">
                    Wer mitmacht, ist automatisch im Chat — Teilnehmer verwaltest du über die
                    Activity, nicht hier.
                  </Text>
                ) : null}

                {/* Chats are ephemeral by design (AGENTS.md TTL) — say so, or
                    the eventual disappearance reads like a bug. */}
                {room?.expireAt ? (
                  <View className="flex-row items-start gap-2">
                    <Ionicons name="hourglass-outline" size={14} color={colors.mutedForeground} />
                    <Text className="flex-1 text-xs leading-4 text-muted-foreground">
                      {isGroup
                        ? `Chats sind hier bewusst temporär: Diese Planung läuft ohne neue Nachrichten am ${formatExpiry(room.expireAt)} ab.`
                        : `Chats sind hier bewusst temporär: Dieser Chat läuft am ${formatExpiry(room.expireAt)} ab.`}
                    </Text>
                  </View>
                ) : null}

                {/* Leave — planning-round members only. If the last admin leaves, the
                    longest-standing member inherits admin (server + mock). */}
                {isGroup && room?.memberIds.includes(myUid) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Planung verlassen"
                    disabled={busy}
                    onPress={() =>
                      Alert.alert(
                        'Planung verlassen',
                        'Du verlierst den Zugriff auf diesen Chat.',
                        [
                          { text: 'Abbrechen', style: 'cancel' },
                          {
                            text: 'Verlassen',
                            style: 'destructive',
                            onPress: () => {
                              leaveRoom(roomId);
                              onClose();
                              onLeave?.();
                            },
                          },
                        ],
                      )
                    }
                    className="flex-row items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 active:opacity-80"
                    style={{
                      borderColor: `${colors.destructive}55`,
                      backgroundColor: `${colors.destructive}14`,
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <Ionicons name="exit-outline" size={19} color={colors.destructive} />
                    <Text
                      className="text-base font-semibold"
                      style={{ color: colors.destructive }}
                    >
                      Planung verlassen
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {view.kind === 'profile' && selectedProfile ? (
              <>
                <View
                  className="items-center gap-3 rounded-3xl border p-6"
                  style={{ borderColor: `${ACCENT}44`, backgroundColor: `${ACCENT}0F` }}
                >
                  <Avatar
                    initials={selectedProfile.initials}
                    avatarUrl={selectedProfile.avatarUrl}
                    size="xl"
                    admin={adminUids.includes(selectedProfile.uid)}
                  />
                  <View className="items-center">
                    <Text className="text-xl font-extrabold tracking-[-0.25px] text-foreground">
                      {selectedProfile.displayName}
                    </Text>
                    {selectedProfile.username ? (
                      <Text className="mt-0.5 text-sm text-muted-foreground">
                        @{selectedProfile.username}
                      </Text>
                    ) : null}
                  </View>
                  <View className="flex-row items-center gap-2">
                    {adminUids.includes(selectedProfile.uid) ? <AdminChip /> : null}
                    {selectedProfile.uid === myUid ? (
                      <View className="rounded-full bg-secondary px-2 py-0.5">
                        <Text className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                          Du
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Admin management — planning rounds, other non-admin members only */}
                {isGroup && iAmAdmin && selectedProfile.uid !== myUid ? (
                  <View className="gap-2">
                    {!adminUids.includes(selectedProfile.uid) ? (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${selectedProfile.displayName} zum Admin machen`}
                          disabled={busy}
                          onPress={() =>
                            run('Zum Admin machen', promoteAdmin(roomId, selectedProfile.uid))
                          }
                          className="flex-row items-center gap-3 rounded-2xl border border-border bg-secondary px-4 py-3.5 active:opacity-80"
                          style={{ opacity: busy ? 0.6 : 1 }}
                        >
                          <Ionicons name="shield-checkmark-outline" size={19} color={ACCENT} />
                          <Text className="flex-1 text-base font-semibold text-foreground">
                            Zum Admin machen
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${selectedProfile.displayName} aus der Planung entfernen`}
                          disabled={busy}
                          onPress={() =>
                            Alert.alert(
                              'Aus Planung entfernen',
                              `${selectedProfile.displayName} wird aus der Planung entfernt.`,
                              [
                                { text: 'Abbrechen', style: 'cancel' },
                                {
                                  text: 'Entfernen',
                                  style: 'destructive',
                                  onPress: () =>
                                    run(
                                      'Entfernen',
                                      removeMember(roomId, selectedProfile.uid),
                                      () => setView({ kind: 'members' }),
                                    ),
                                },
                              ],
                            )
                          }
                          className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 active:opacity-80"
                          style={{
                            borderColor: `${colors.destructive}55`,
                            backgroundColor: `${colors.destructive}14`,
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          <Ionicons
                            name="person-remove-outline"
                            size={19}
                            color={colors.destructive}
                          />
                          <Text
                            className="flex-1 text-base font-semibold"
                            style={{ color: colors.destructive }}
                          >
                            Aus Planung entfernen
                          </Text>
                        </Pressable>
                      </>
                    ) : (
                      <Text className="text-xs leading-4 text-muted-foreground">
                        Admins können nicht entfernt werden — sie verlassen die Planung selbst.
                      </Text>
                    )}
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
