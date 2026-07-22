import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/features/auth';
import { useFriends } from '@/features/friends';
import type { MarkerAvatar } from '@/features/map/types/map.types';

interface ParticipantProfileSheetProps {
  visible: boolean;
  participant: MarkerAvatar | null;
  activityId: string;
  activityTitle: string;
  joined: boolean;
  onClose: () => void;
}

/**
 * Deliberately compact contact card for a person met through an activity.
 * It never fetches a globally visible profile. The server alone decides whether
 * the contextual friendship request is allowed for this exact activity.
 */
export function ParticipantProfileSheet({
  visible,
  participant,
  activityId,
  activityTitle,
  joined,
  onClose,
}: ParticipantProfileSheetProps) {
  const { user } = useAuth();
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    respondToFriendRequest,
    sendActivityFriendRequest,
  } = useFriends();
  const [busy, setBusy] = useState(false);

  const relation = useMemo(() => {
    if (!participant) return 'none' as const;
    if (participant.userId === user?.id) return 'self' as const;
    if (friends.some((friend) => friend.uid === participant.userId)) return 'friends' as const;
    const incoming = incomingRequests.find((request) => request.friend.uid === participant.userId);
    if (incoming) return { type: 'incoming' as const, requestId: incoming.id };
    if (outgoingRequests.some((request) => request.friend.uid === participant.userId)) {
      return 'outgoing' as const;
    }
    return 'none' as const;
  }, [friends, incomingRequests, outgoingRequests, participant, user?.id]);

  if (!participant) return null;
  const participantUid = participant.userId;

  async function requestFriendship() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await sendActivityFriendRequest(participantUid, activityId);
      if (result.state === 'incoming_request') {
        Alert.alert('Anfrage vorhanden', 'Diese Person hat dir bereits eine Anfrage geschickt.');
      }
    } catch (error) {
      Alert.alert(
        'Nicht möglich',
        error instanceof Error
          ? error.message
          : 'Die Freundschaftsanfrage konnte nicht gesendet werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function acceptIncoming(requestId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await respondToFriendRequest(requestId, true);
    } catch (error) {
      Alert.alert(
        'Nicht möglich',
        error instanceof Error ? error.message : 'Die Anfrage konnte nicht bestätigt werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  const cta = (() => {
    if (relation === 'self') return null;
    if (relation === 'friends') {
      return { label: 'Ihr seid Freunde', icon: 'people' as const, disabled: true };
    }
    if (relation === 'outgoing') {
      return { label: 'Anfrage gesendet', icon: 'time-outline' as const, disabled: true };
    }
    if (typeof relation === 'object') {
      return {
        label: 'Anfrage bestätigen',
        icon: 'checkmark' as const,
        onPress: () => void acceptIncoming(relation.requestId),
      };
    }
    if (!joined) return null;
    return {
      label: busy ? 'Wird gesendet …' : 'Freundschaft anfragen',
      icon: 'person-add-outline' as const,
      onPress: () => void requestFriendship(),
      disabled: busy,
    };
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/60 px-6">
        <View className="w-full max-w-[360px] overflow-hidden rounded-[30px] border border-white/10 bg-[#101923] p-6 shadow-2xl">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kontakt schließen"
            className="absolute right-4 top-4 z-10 h-10 w-10 items-center justify-center rounded-full bg-white/10"
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </Pressable>

          <View className="h-16 w-16 items-center justify-center rounded-[24px] bg-[#6E8BF7]/20">
            <Text className="text-xl font-extrabold text-[#C5D0FF]">{participant.initials}</Text>
          </View>
          <Text className="mt-4 pr-10 text-xl font-extrabold text-white">
            {participant.displayName}
          </Text>
          <View className="mt-3 flex-row items-center gap-2 rounded-2xl bg-white/[0.08] px-3 py-2.5">
            <Ionicons name="calendar-outline" size={16} color="#AEBFFF" />
            <Text className="flex-1 text-sm font-semibold text-white/75" numberOfLines={2}>
              Ihr seid beide bei {activityTitle}
            </Text>
          </View>
          <Text className="mt-4 text-sm leading-5 text-white/55">
            Profildetails sind bei Together nur für bestätigte Freunde sichtbar.
          </Text>

          {cta ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: cta.disabled, busy }}
              disabled={cta.disabled}
              className="mt-5 min-h-12 flex-row items-center justify-center gap-2 rounded-[18px] active:opacity-85"
              style={{ backgroundColor: cta.disabled ? 'rgba(255,255,255,0.12)' : '#6E8BF7' }}
              onPress={cta.onPress}
            >
              <Ionicons name={cta.icon} size={18} color="#FFFFFF" />
              <Text className="text-sm font-extrabold text-white">{cta.label}</Text>
            </Pressable>
          ) : (
            <Text className="mt-5 text-sm font-semibold leading-5 text-white/70">
              Tritt der Activity bei, um nach dem gemeinsamen Plan in Kontakt zu bleiben.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
