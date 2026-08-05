import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { useActivityEntities } from '@/features/activities';
import { useFriends } from '@/features/friends';
import type { MarkerAvatar } from '@/features/map/types/map.types';

import { ParticipantListRow } from './ParticipantListRow';
import type { ActivitySelection } from './types';

/**
 * Content-sized participant list: the sheet wraps however many rows there are,
 * capped so long lists scroll — no fixed tall sheet with dead space below a
 * handful of names. When the host allows guest invites, joined participants
 * additionally get a collapsed "Freund:in einladen" section: their own
 * confirmed friends, one tap per invite (server re-checks everything).
 */
export function ActivityParticipantsContent({
  selection,
  currentUid,
  joined,
  onOpenProfile,
}: {
  selection: ActivitySelection;
  currentUid?: string;
  joined: boolean;
  onOpenProfile: (participant: MarkerAvatar) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const { friends } = useFriends();
  const { inviteFriendToActivity } = useActivityEntities();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitedUids, setInvitedUids] = useState<Set<string>>(() => new Set());
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const canInvite = joined && selection.guestInvitesEnabled === true;
  const invitableFriends = useMemo(() => {
    if (!canInvite) return [];
    const participantUids = new Set(selection.participants.map((p) => p.userId));
    return friends.filter((friend) => !participantUids.has(friend.uid));
  }, [canInvite, friends, selection.participants]);

  async function invite(uid: string) {
    if (busyUid) return;
    setBusyUid(uid);
    setInviteError(null);
    try {
      await inviteFriendToActivity(selection.id, uid);
      setInvitedUids((current) => new Set(current).add(uid));
    } catch (error) {
      setInviteError(
        error instanceof Error && error.message
          ? error.message
          : 'Die Einladung konnte nicht gesendet werden.',
      );
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <ScrollView
      style={{ maxHeight: windowHeight * 0.6 }}
      showsVerticalScrollIndicator={selection.participants.length > 6}
      contentContainerStyle={{ paddingBottom: 8 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="divide-y divide-border rounded-3xl border border-border bg-secondary px-3">
        {selection.participants.map((participant) => (
          <ParticipantListRow
            key={participant.userId}
            participant={participant}
            isSelf={participant.userId === currentUid}
            onPress={
              joined && participant.userId !== currentUid
                ? () => onOpenProfile(participant)
                : undefined
            }
          />
        ))}
      </View>

      {canInvite && invitableFriends.length ? (
        <View className="mt-3 rounded-3xl border border-border bg-secondary px-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: inviteOpen }}
            accessibilityLabel="Eigene Freunde einladen"
            className="flex-row items-center gap-2.5 py-3 active:opacity-80"
            onPress={() => setInviteOpen((open) => !open)}
          >
            <Ionicons name="person-add-outline" size={17} color="#6E8BF7" />
            <Text className="flex-1 text-sm font-semibold text-foreground">
              Freund:in einladen
            </Text>
            <Ionicons
              name={inviteOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="rgba(150,155,165,0.9)"
            />
          </Pressable>
          {inviteOpen ? (
            <View className="divide-y divide-border border-t border-border">
              {inviteError ? (
                <Text className="py-2 text-xs text-destructive">{inviteError}</Text>
              ) : null}
              {invitableFriends.map((friend) => {
                const invited = invitedUids.has(friend.uid);
                return (
                  <View key={friend.uid} className="flex-row items-center gap-3 py-2.5">
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-[#6E8BF7]/20">
                      <Text className="text-xs font-bold text-[#6E8BF7]">{friend.initials}</Text>
                    </View>
                    <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                      {friend.displayName}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        invited
                          ? `${friend.displayName} wurde eingeladen`
                          : `${friend.displayName} einladen`
                      }
                      disabled={invited || busyUid !== null}
                      className={`min-h-[36px] flex-row items-center justify-center rounded-full px-4 ${
                        invited ? 'bg-transparent' : 'bg-[#6E8BF7] active:opacity-85'
                      }`}
                      onPress={() => void invite(friend.uid)}
                    >
                      {invited ? (
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="checkmark" size={14} color="#41C08D" />
                          <Text className="text-xs font-semibold text-[#41C08D]">Eingeladen</Text>
                        </View>
                      ) : (
                        <Text className="text-xs font-bold text-white">
                          {busyUid === friend.uid ? '…' : 'Einladen'}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}
