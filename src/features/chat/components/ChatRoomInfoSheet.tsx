import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useFriends } from '@/features/friends';
import { SafetyActionsSheet } from '@/features/moderation';
import { useThemeColors } from '@/features/theme';
import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import type { RoomMemberProfile } from '../services/chatService.types';
import { useActivityChat } from '../useActivityChat';

type InfoView = { kind: 'members' } | { kind: 'profile'; uid: string } | { kind: 'invite' };

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
  accent,
  size = 'md',
  admin = false,
}: {
  initials: string;
  avatarUrl?: string;
  accent: string;
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
        backgroundColor: `${accent}22`,
        borderWidth: admin ? 1.5 : 0,
        borderColor: `${accent}88`,
      }}
    >
      {avatarUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: avatarUrl }}
          className="h-full w-full"
        />
      ) : (
        <Text
          {...TEXT_CAPPED}
          style={{
            ...(size === 'xl' ? TYPE.display : TYPE.label),
            fontFamily: FONT.bold,
            color: accent,
          }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

function AdminChip({ accent }: { accent: string }) {
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${accent}26` }}>
      <Text
        {...TEXT_CAPPED}
        style={{
          ...TYPE.micro,
          fontFamily: FONT.bold,
          color: accent,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        Admin
      </Text>
    </View>
  );
}

export interface ChatRoomInfoSheetProps {
  visible: boolean;
  roomId: string;
  /** The room's colour. Required — see AGENTS.md → chat colour model. */
  accent: string;
  /** Shown while the room summary hasn't loaded (e.g. right after joining). */
  fallbackTitle?: string;
  onClose: () => void;
  /** Called after the user left the room — the host should also close the chat. */
  onLeave?: () => void;
}

/**
 * Messenger-style room info: member list with admin badges, tappable member
 * profiles, per-person safety actions, and (group rooms, admins only)
 * invite/remove/promote management.
 *
 * Activity chats show members read-only — their membership follows activity
 * participation, never chat-side edits.
 */
export function ChatRoomInfoSheet({
  visible,
  roomId,
  accent,
  fallbackTitle,
  onClose,
  onLeave,
}: ChatRoomInfoSheetProps) {
  const { user } = useAuth();
  const colors = useThemeColors();
  const myUid = user?.id ?? 'u_you';
  const { friends } = useFriends();
  const {
    getRoom,
    getRoomMembers,
    isRoomAdmin,
    removeMember,
    promoteAdmin,
    renameRoom,
    leaveRoom,
    setGroupOpen,
    inviteToGroup,
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
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([]);
  const [safetyTargetUid, setSafetyTargetUid] = useState<string | null>(null);
  const busyRef = useRef(false);
  const membersRequestRevisionRef = useRef(0);

  const memberIdsKey = room?.memberIds.join(',') ?? '';
  const reloadMembers = useCallback(() => {
    if (!visible) return;
    const requestRevision = ++membersRequestRevisionRef.current;
    setLoading(true);
    getRoomMembers(roomId)
      .then((list) => {
        if (requestRevision === membersRequestRevisionRef.current) setMembers(list);
      })
      .catch(() => {
        if (requestRevision === membersRequestRevisionRef.current) setMembers([]);
      })
      .finally(() => {
        if (requestRevision === membersRequestRevisionRef.current) setLoading(false);
      });
    // memberIdsKey re-triggers after a change once the rooms listener catches up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, roomId, memberIdsKey, getRoomMembers]);

  useEffect(reloadMembers, [reloadMembers]);

  useEffect(() => {
    if (!visible) {
      membersRequestRevisionRef.current += 1;
      return;
    }
    setView({ kind: 'members' });
    setTitleDraft(null);
    setSelectedInvitees([]);
    setSafetyTargetUid(null);
  }, [visible, roomId]);

  const run = (action: string, promise: Promise<void>, after?: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    promise
      .then(() => {
        after?.();
        reloadMembers();
      })
      .catch((error) => {
        Alert.alert(action, error?.message ?? 'Bitte versuche es gleich noch einmal.');
      })
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  };

  const selectedProfile =
    view.kind === 'profile' ? members.find((member) => member.uid === view.uid) : undefined;

  // Only people the admin is actually connected to, who are not already in the
  // round. The server re-checks all of this — this list only avoids offering a
  // tap that would be rejected.
  const invitableFriends = useMemo(
    () => friends.filter((friend) => !(room?.memberIds ?? []).includes(friend.uid)),
    [friends, room?.memberIds],
  );

  function sendInvites() {
    if (!selectedInvitees.length || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    inviteToGroup(roomId, selectedInvitees)
      .then((result) => {
        setSelectedInvitees([]);
        setView({ kind: 'members' });
        Alert.alert(
          'Einladung gesendet',
          result.invited === 1
            ? 'Die Person entscheidet selbst, ob sie beitritt.'
            : `${result.invited} Einladungen unterwegs. Alle entscheiden selbst, ob sie beitreten.`,
        );
      })
      .catch((error) =>
        Alert.alert('Einladen nicht möglich', error?.message ?? 'Bitte versuche es noch einmal.'),
      )
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  }

  const headingStyle = { ...TYPE.body, fontFamily: FONT.bold, color: colors.foreground };
  const bodyStyle = { ...TYPE.label, fontFamily: FONT.medium, color: colors.foreground };
  const mutedStyle = { ...TYPE.caption, fontFamily: FONT.medium, color: colors.mutedForeground };
  const sectionStyle = {
    ...TYPE.micro,
    fontFamily: FONT.bold,
    color: colors.mutedForeground,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  };

  return (
    <>
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
              {view.kind !== 'members' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Zurück zu allen Mitgliedern"
                  onPress={() => setView({ kind: 'members' })}
                  className="h-11 w-11 items-center justify-center rounded-full bg-secondary active:opacity-70"
                >
                  <Ionicons name="chevron-back" size={21} color={accent} />
                </Pressable>
              ) : (
                <View className="w-11" />
              )}
              <Text
                {...TEXT_FLEXIBLE}
                numberOfLines={1}
                className="flex-1 px-2 text-center"
                style={{ ...TYPE.display, fontFamily: FONT.bold, color: colors.foreground }}
              >
                {view.kind === 'profile'
                  ? (selectedProfile?.displayName ?? 'Profil')
                  : view.kind === 'invite'
                    ? 'Leute einladen'
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
              contentContainerStyle={{ gap: 16, paddingBottom: 12 }}
            >
              {view.kind === 'members' ? (
                <>
                  {/* Room summary — group admins can rename in place */}
                  <View className="flex-row items-center gap-3 rounded-3xl border border-border bg-secondary p-4">
                    <View
                      className="h-12 w-12 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${accent}22` }}
                    >
                      <Ionicons name={isGroup ? 'people' : 'flash'} size={22} color={accent} />
                    </View>
                    {titleDraft !== null ? (
                      <>
                        <TextInput
                          {...TEXT_FLEXIBLE}
                          className="flex-1 rounded-xl border bg-card px-3 py-2"
                          style={{
                            ...TYPE.label,
                            fontFamily: FONT.semibold,
                            color: colors.foreground,
                            borderColor: `${accent}66`,
                          }}
                          value={titleDraft}
                          onChangeText={setTitleDraft}
                          maxLength={80}
                          autoFocus
                          placeholder="Name der Planung"
                          placeholderTextColor={colors.mutedForeground}
                          onSubmitEditing={() => {
                            const trimmed = titleDraft.trim();
                            if (!trimmed) return;
                            run('Umbenennen', renameRoom(roomId, trimmed), () =>
                              setTitleDraft(null),
                            );
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
                            backgroundColor: accent,
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
                          <Text {...TEXT_FLEXIBLE} numberOfLines={1} style={bodyStyle}>
                            {room?.title ?? fallbackTitle ?? 'Chat'}
                          </Text>
                          <Text {...TEXT_FLEXIBLE} className="mt-0.5" style={mutedStyle}>
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

                  {/* Targeted invitation — the answer to "kann Lisa noch dazu?".
                      Deliberately separate from "Offen für Dazustoßer": that
                      one makes the round findable, this one asks one person. */}
                  {isGroup && iAmAdmin ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Leute in diese Planung einladen"
                      onPress={() => setView({ kind: 'invite' })}
                      className="min-h-13 flex-row items-center gap-3 rounded-2xl border border-border bg-secondary px-4 py-3.5 active:opacity-80"
                    >
                      <Ionicons name="person-add-outline" size={19} color={accent} />
                      <Text {...TEXT_FLEXIBLE} className="flex-1" style={bodyStyle}>
                        Leute einladen
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  ) : null}

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
                        backgroundColor: room?.joinable ? `${accent}14` : colors.secondary,
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      <AnimatedToggleIcon
                        icon="radio"
                        active={Boolean(room?.joinable)}
                        size={19}
                        activeColor={accent}
                        inactiveColor={colors.mutedForeground}
                      />
                      <View className="flex-1">
                        <Text
                          {...TEXT_FLEXIBLE}
                          style={{ ...TYPE.label, fontFamily: FONT.semibold, color: colors.foreground }}
                        >
                          Offen für Dazustoßer
                        </Text>
                        <Text {...TEXT_FLEXIBLE} className="mt-0.5" style={mutedStyle}>
                          {room?.joinable
                            ? 'Deine direkten Freunde sehen die Runde und können dazustoßen'
                            : 'Die Runde ist nur für Beteiligte sichtbar'}
                        </Text>
                      </View>
                      <View pointerEvents="none">
                        <Switch
                          value={room?.joinable === true}
                          trackColor={{ false: colors.border, true: accent }}
                          thumbColor="#ffffff"
                          disabled={busy}
                        />
                      </View>
                    </Pressable>
                  ) : null}

                  {/* Members */}
                  <View className="gap-1">
                    <Text {...TEXT_FLEXIBLE} className="mb-1" style={sectionStyle}>
                      Mitglieder
                    </Text>
                    {loading && members.length === 0 ? (
                      <Text
                        {...TEXT_FLEXIBLE}
                        className="rounded-2xl bg-secondary px-4 py-4"
                        style={mutedStyle}
                      >
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
                              accent={accent}
                              admin={adminUids.includes(member.uid)}
                            />
                            <View className="flex-1">
                              <Text {...TEXT_FLEXIBLE} numberOfLines={1} style={bodyStyle}>
                                {member.displayName}
                                {member.uid === myUid ? '  (Du)' : ''}
                              </Text>
                              {member.username ? (
                                <Text {...TEXT_FLEXIBLE} style={mutedStyle}>
                                  @{member.username}
                                </Text>
                              ) : null}
                            </View>
                            {adminUids.includes(member.uid) ? <AdminChip accent={accent} /> : null}
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
                    <Text {...TEXT_FLEXIBLE} style={mutedStyle}>
                      Wer mitmacht, ist automatisch im Chat — Teilnehmer verwaltest du über die
                      Activity, nicht hier.
                    </Text>
                  ) : null}

                  {/* Chats are ephemeral by design (AGENTS.md TTL) — say so, or
                      the eventual disappearance reads like a bug. */}
                  {room?.expireAt ? (
                    <View className="flex-row items-start gap-2">
                      <Ionicons name="hourglass-outline" size={14} color={colors.mutedForeground} />
                      <Text {...TEXT_FLEXIBLE} className="flex-1" style={mutedStyle}>
                        {isGroup
                          ? `Chats sind hier bewusst temporär: Diese Planung läuft ohne neue Nachrichten am ${formatExpiry(room.expireAt)} ab.`
                          : `Chats sind hier bewusst temporär: Dieser Chat läuft am ${formatExpiry(room.expireAt)} ab.`}
                      </Text>
                    </View>
                  ) : null}

                  {/* Leave — planning-round members only. If the last admin leaves, the
                      server promotes the longest-standing remaining member. */}
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
                      className="min-h-13 flex-row items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 active:opacity-80"
                      style={{
                        borderColor: `${colors.destructive}55`,
                        backgroundColor: `${colors.destructive}14`,
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      <Ionicons name="exit-outline" size={19} color={colors.destructive} />
                      <Text
                        {...TEXT_CAPPED}
                        style={{
                          ...TYPE.label,
                          fontFamily: FONT.semibold,
                          color: colors.destructive,
                        }}
                      >
                        Planung verlassen
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              {view.kind === 'invite' ? (
                <>
                  <Text {...TEXT_FLEXIBLE} style={mutedStyle}>
                    Nur bestätigte Freunde von dir. Eingeladene entscheiden selbst, ob sie
                    beitreten — niemand wird still hinzugefügt.
                  </Text>

                  {invitableFriends.length === 0 ? (
                    <View className="items-center gap-2 rounded-3xl border border-border bg-secondary px-6 py-10">
                      <Ionicons
                        name="people-outline"
                        size={26}
                        color={colors.mutedForeground}
                      />
                      <Text {...TEXT_FLEXIBLE} className="text-center" style={bodyStyle}>
                        Niemand übrig
                      </Text>
                      <Text {...TEXT_FLEXIBLE} className="text-center" style={mutedStyle}>
                        Alle deine Freunde sind schon in dieser Planung.
                      </Text>
                    </View>
                  ) : (
                    <View className="divide-y divide-border rounded-3xl border border-border bg-secondary px-2">
                      {invitableFriends.map((friend) => {
                        const selected = selectedInvitees.includes(friend.uid);
                        return (
                          <Pressable
                            key={friend.uid}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            accessibilityLabel={`${friend.displayName} einladen`}
                            onPress={() =>
                              setSelectedInvitees((current) =>
                                current.includes(friend.uid)
                                  ? current.filter((uid) => uid !== friend.uid)
                                  : [...current, friend.uid],
                              )
                            }
                            className="flex-row items-center gap-3 px-2 py-3 active:opacity-70"
                          >
                            <Avatar
                              initials={friend.initials}
                              avatarUrl={friend.avatarUrl}
                              accent={accent}
                            />
                            <View className="flex-1">
                              <Text {...TEXT_FLEXIBLE} numberOfLines={1} style={bodyStyle}>
                                {friend.displayName}
                              </Text>
                              {friend.username ? (
                                <Text {...TEXT_FLEXIBLE} style={mutedStyle}>
                                  @{friend.username}
                                </Text>
                              ) : null}
                            </View>
                            <AnimatedToggleIcon
                              icon="checkmark-circle"
                              outlineIcon="ellipse-outline"
                              active={selected}
                              size={22}
                              activeColor={accent}
                              inactiveColor={colors.mutedForeground}
                            />
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {invitableFriends.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Einladen (${selectedInvitees.length})`}
                      disabled={busy || selectedInvitees.length === 0}
                      onPress={sendInvites}
                      className="min-h-13 items-center justify-center rounded-2xl py-4 active:opacity-90"
                      style={{
                        backgroundColor: accent,
                        opacity: busy || selectedInvitees.length === 0 ? 0.4 : 1,
                      }}
                    >
                      <Text
                        {...TEXT_CAPPED}
                        style={{ ...TYPE.label, fontFamily: FONT.bold, color: '#ffffff' }}
                      >
                        {selectedInvitees.length > 0
                          ? `Einladen (${selectedInvitees.length})`
                          : 'Einladen'}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              {view.kind === 'profile' && selectedProfile ? (
                <>
                  <View
                    className="items-center gap-3 rounded-3xl border p-6"
                    style={{ borderColor: `${accent}44`, backgroundColor: `${accent}0F` }}
                  >
                    <Avatar
                      initials={selectedProfile.initials}
                      avatarUrl={selectedProfile.avatarUrl}
                      accent={accent}
                      size="xl"
                      admin={adminUids.includes(selectedProfile.uid)}
                    />
                    <View className="items-center">
                      <Text {...TEXT_FLEXIBLE} style={headingStyle}>
                        {selectedProfile.displayName}
                      </Text>
                      {selectedProfile.username ? (
                        <Text {...TEXT_FLEXIBLE} className="mt-0.5" style={mutedStyle}>
                          @{selectedProfile.username}
                        </Text>
                      ) : null}
                    </View>
                    <View className="flex-row items-center gap-2">
                      {adminUids.includes(selectedProfile.uid) ? (
                        <AdminChip accent={accent} />
                      ) : null}
                      {selectedProfile.uid === myUid ? (
                        <View className="rounded-full bg-secondary px-2 py-0.5">
                          <Text
                            {...TEXT_CAPPED}
                            style={{
                              ...TYPE.micro,
                              fontFamily: FONT.bold,
                              color: colors.mutedForeground,
                              letterSpacing: 0.6,
                              textTransform: 'uppercase',
                            }}
                          >
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
                            className="min-h-13 flex-row items-center gap-3 rounded-2xl border border-border bg-secondary px-4 py-3.5 active:opacity-80"
                            style={{ opacity: busy ? 0.6 : 1 }}
                          >
                            <Ionicons name="shield-checkmark-outline" size={19} color={accent} />
                            <Text {...TEXT_FLEXIBLE} className="flex-1" style={bodyStyle}>
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
                            className="min-h-13 flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 active:opacity-80"
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
                              {...TEXT_FLEXIBLE}
                              className="flex-1"
                              style={{ ...bodyStyle, color: colors.destructive }}
                            >
                              Aus Planung entfernen
                            </Text>
                          </Pressable>
                        </>
                      ) : (
                        <Text {...TEXT_FLEXIBLE} style={mutedStyle}>
                          Admins können nicht entfernt werden — sie verlassen die Planung selbst.
                        </Text>
                      )}
                    </View>
                  ) : null}

                  {/* Safety actions for every OTHER person, in both room types.
                      Reporting and blocking must be reachable from the chat
                      itself — a person you can read is a person you can act on. */}
                  {selectedProfile.uid !== myUid ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${selectedProfile.displayName} melden oder blockieren`}
                      onPress={() => setSafetyTargetUid(selectedProfile.uid)}
                      className="min-h-13 flex-row items-center gap-3 rounded-2xl border border-border bg-secondary px-4 py-3.5 active:opacity-80"
                    >
                      <Ionicons
                        name="alert-circle-outline"
                        size={19}
                        color={colors.mutedForeground}
                      />
                      <Text
                        {...TEXT_FLEXIBLE}
                        className="flex-1"
                        style={{ ...bodyStyle, color: colors.mutedForeground }}
                      >
                        Melden oder blockieren
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Rendered outside the info Modal so it is not torn down when blocking
          closes the sheet underneath it. Blocking severs the shared room
          server-side (severBlockedContactSpaces), so the chat behind this must
          close too — onLeave takes the user back to where the chat came from. */}
      <SafetyActionsSheet
        visible={safetyTargetUid !== null}
        targetUid={safetyTargetUid ?? ''}
        targetLabel={
          members.find((member) => member.uid === safetyTargetUid)?.displayName ?? 'Diese Person'
        }
        onClose={() => setSafetyTargetUid(null)}
        onBlocked={() => {
          setSafetyTargetUid(null);
          onClose();
          onLeave?.();
        }}
      />
    </>
  );
}
