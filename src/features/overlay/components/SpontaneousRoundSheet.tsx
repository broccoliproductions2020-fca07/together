import { Ionicons } from '@expo/vector-icons';
import { Alert, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SpontaneousRound } from '@/features/chat';
import { useThemeColors } from '@/features/theme';
import { SquircleButton } from '@/shared/components/SquircleButton';
import { TEXT_CAPPED } from '@/shared/theme';

const OPEN_COLOR = '#6E8BF7';

function untilLabel(expiresAt: number) {
  const date = new Date(expiresAt);
  return `bis ${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function MemberRow({
  member,
  host,
}: {
  member: SpontaneousRound['memberPreview'][number];
  host: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <View
        className="h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2"
        style={{ backgroundColor: `${OPEN_COLOR}16`, borderColor: host ? OPEN_COLOR : colors.border }}
      >
        {member.avatarUrl ? (
          <Image source={{ uri: member.avatarUrl }} className="h-full w-full" />
        ) : (
          <Text className="text-sm font-extrabold" style={{ color: OPEN_COLOR }}>
            {member.initials}
          </Text>
        )}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-extrabold text-foreground" numberOfLines={1}>
          {member.displayName}
        </Text>
        <Text className="mt-0.5 text-xs text-muted-foreground">
          {host ? 'hat die Runde gestartet' : 'ist dabei'}
        </Text>
      </View>
      {host ? <Ionicons name="sparkles-outline" size={17} color={OPEN_COLOR} /> : null}
    </View>
  );
}

export function SpontaneousRoundSheet({
  visible,
  round,
  currentUid,
  unreadCount,
  onClose,
  onOpenChat,
  onPlanNow,
  onPlanSoon,
  onLeave,
}: {
  visible: boolean;
  round: SpontaneousRound | null;
  currentUid: string;
  unreadCount: number;
  onClose: () => void;
  onOpenChat: () => void;
  onPlanNow: () => void;
  onPlanSoon: () => void;
  onLeave: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  if (!round) return null;

  const isHost = round.hostUid === currentUid;
  const acceptedCount = Math.max(0, round.memberIds.length - 1);
  const canChat = round.memberIds.length >= 2;
  const leaveLabel = isHost ? 'Runde abbrechen' : 'Runde verlassen';

  async function confirmLeave() {
    Alert.alert(
      isHost ? 'Runde abbrechen?' : 'Runde verlassen?',
      isHost
        ? 'Die offenen Winks und der vorlaeufige Chat enden fuer alle sofort.'
        : 'Du kannst spaeter nur mit einer neuen Einladung wieder beitreten.',
      [
        { text: 'Zurueck', style: 'cancel' },
        {
          text: leaveLabel,
          style: 'destructive',
          onPress: () => {
            void onLeave().then(onClose).catch(() => {});
          },
        },
      ],
    );
  }

  return (
    <Modal
      transparent
      animationType={reducedMotion ? 'none' : 'slide'}
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" accessibilityLabel="Runde schliessen" onPress={onClose} />
        <Animated.View
          entering={reducedMotion ? undefined : FadeInDown.duration(210)}
          className="max-h-[82%] rounded-t-[34px] border border-border bg-card"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="items-center pt-3">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>
          <View className="flex-row items-start gap-3 px-5 pb-4 pt-4">
            <View
              className="h-12 w-12 items-center justify-center rounded-[18px]"
              style={{ backgroundColor: `${OPEN_COLOR}1C` }}
            >
              <Ionicons name="sparkles-outline" size={23} color={OPEN_COLOR} />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-extrabold tracking-[-0.35px] text-foreground">
                Spontane Runde
              </Text>
              <Text className="mt-0.5 text-sm text-muted-foreground">
                {acceptedCount === 0
                  ? `Winks gesendet · ${untilLabel(round.expiresAt)}`
                  : `${round.memberIds.length} dabei · ${untilLabel(round.expiresAt)}`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Runde schliessen"
              onPress={onClose}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
              style={{ backgroundColor: colors.secondary }}
            >
              <Ionicons name="close" size={20} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 12 }}>
            <View className="rounded-2xl border px-3" style={{ borderColor: colors.border }}>
              {round.memberPreview.map((member) => (
                <MemberRow key={member.uid} member={member} host={member.uid === round.hostUid} />
              ))}
            </View>

            {acceptedCount === 0 ? (
              <View className="mt-5 flex-row gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: `${OPEN_COLOR}10` }}>
                <Ionicons name="hand-left-outline" size={19} color={OPEN_COLOR} />
                <Text className="flex-1 text-sm leading-5 text-muted-foreground">
                  Deine Freunde entscheiden selbst. Erst wenn jemand zurueckwinkt, entsteht der
                  gemeinsame Chat.
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View className="gap-2 border-t border-border px-5 pt-3">
            {canChat ? (
              <SquircleButton
                label={unreadCount > 0 ? `Chat oeffnen · ${unreadCount} neu` : 'Chat oeffnen'}
                color={OPEN_COLOR}
                icon="chatbubble-outline"
                onPress={onOpenChat}
              />
            ) : null}
            {canChat ? (
              <View className="flex-row gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Aktivitaet fuer jetzt planen"
                  onPress={onPlanNow}
                  className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl active:opacity-80"
                  style={{ backgroundColor: '#41C08D' }}
                >
                  <Ionicons name="flash-outline" size={16} color="#fff" />
                  <Text {...TEXT_CAPPED} style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>Jetzt</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Aktivitaet fuer spaeter planen"
                  onPress={onPlanSoon}
                  className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl active:opacity-80"
                  style={{ backgroundColor: '#E0A23E' }}
                >
                  <Ionicons name="time-outline" size={16} color="#fff" />
                  <Text {...TEXT_CAPPED} style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>Spaeter</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={leaveLabel}
              onPress={confirmLeave}
              className="min-h-11 items-center justify-center rounded-xl active:opacity-70"
            >
              <Text {...TEXT_CAPPED} style={{ color: '#E85C5C', fontSize: 14, fontWeight: '800' }}>
                {leaveLabel}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
