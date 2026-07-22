import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActivityEntities, type ActivityInfo } from '@/features/activities';
import { useAuth } from '@/features/auth';
import { formatListTimestamp, useActivityChat } from '@/features/chat';
import { colorWithAlpha, markerModeStyles } from '@/features/map/utils/markerStyles';
import { useThemeColors } from '@/features/theme';

const ACCENT = '#6E8BF7';

function ActivityRow({
  activity,
  onPress,
}: {
  activity: ActivityInfo;
  onPress: (activity: ActivityInfo) => void;
}) {
  const colors = useThemeColors();
  const { getMessages, getUnreadCount, getRoom } = useActivityChat();
  const accent = markerModeStyles[activity.mode].color;
  const messages = getMessages(activity.id);
  const last = messages[messages.length - 1];
  const unread = getUnreadCount(activity.id);
  const room = getRoom(activity.id);
  const isGroup = room?.type === 'group';
  const lastAt = room?.lastMessage?.at ?? last?.createdAt;
  const lead = activity.participants[0];

  return (
    <Pressable
      onPress={() => onPress(activity)}
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0 ? `${activity.title}, ${unread} ungelesene Nachrichten` : activity.title
      }
      className="min-h-[72px] flex-row items-center gap-3 rounded-2xl px-2.5 py-3 active:bg-secondary"
    >
      {/* Lead visual: participant avatar with the mode ring (same language as
          the map markers); groups without participant data get the icon disc. */}
      {lead ? (
        <View
          className="h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2"
          style={{ borderColor: accent, backgroundColor: colors.secondary }}
        >
          {lead.avatarUrl ? (
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: lead.avatarUrl }}
              className="h-full w-full"
            />
          ) : (
            <Text className="text-sm font-bold text-foreground">{lead.initials}</Text>
          )}
        </View>
      ) : (
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: colorWithAlpha(accent, 0.16) }}
        >
          <Ionicons
            name={isGroup ? 'people' : 'chatbubble-ellipses-outline'}
            size={20}
            color={accent}
          />
        </View>
      )}

      <View className="flex-1">
        <Text
          className={`text-base text-foreground ${unread > 0 ? 'font-bold' : 'font-semibold'}`}
          numberOfLines={1}
        >
          {activity.title}
        </Text>
        <Text
          className={`mt-0.5 text-sm ${
            unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
          }`}
          numberOfLines={1}
        >
          {last ? `${last.isMe ? 'Du' : last.authorName}: ${last.text}` : 'Noch keine Nachrichten'}
        </Text>
      </View>

      <View className="items-end gap-1.5 self-stretch py-0.5">
        {lastAt ? (
          <Text
            className="text-[11px] font-semibold"
            style={{ color: unread > 0 ? accent : colors.mutedForeground }}
          >
            {formatListTimestamp(lastAt)}
          </Text>
        ) : null}
        {unread > 0 ? (
          <View
            className="h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5"
            style={{ backgroundColor: accent }}
          >
            <Text className="text-xs font-bold text-white">{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export interface ActivitiesSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenChat: (activity: ActivityInfo) => void;
}

export function ActivitiesSheet({ visible, onClose, onOpenChat }: ActivitiesSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuth();
  const currentUid = user?.id ?? 'u_you';
  const { joinedIds, getGroup, getRoom, setRoomsListActive } = useActivityChat();
  const { findActivityById } = useActivityEntities();

  // Live room summaries are useful while this list is visible; everywhere
  // else the cached summaries plus push/foreground reconciliation are enough.
  useEffect(() => {
    setRoomsListActive(visible);
    return () => setRoomsListActive(false);
  }, [setRoomsListActive, visible]);

  // Messenger convention: the room with the newest message sits on top —
  // never the creation order the rooms query delivers.
  const lastActivityAt = (id: string) => {
    const room = getRoom(id);
    return room?.lastMessage?.at ?? room?.createdAt ?? 0;
  };

  const activities = joinedIds
    .map((id): ActivityInfo | null => {
      const activity = findActivityById(id);
      if (activity) {
        const includesCurrentUser = activity.participants.some(
          (participant) => participant.userId === currentUid,
        );
        return {
          ...activity,
          participantCount: activity.participantCount + (includesCurrentUser ? 0 : 1),
        };
      }

      const group = getGroup(id);
      if (group) {
        return {
          id,
          title: group.title,
          mode: 'open',
          participantCount: group.memberIds.length,
          participants: [],
        };
      }
      return null;
    })
    .filter((activity): activity is ActivityInfo => activity !== null)
    .sort((a, b) => lastActivityAt(b.id) - lastActivityAt(a.id));

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable className="flex-1 justify-end bg-black/45" onPress={onClose}>
        <Pressable
          className="max-h-[84%] rounded-t-[34px] border border-border bg-card"
          onPress={(event) => event.stopPropagation()}
        >
          <View className="items-center pt-3">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>

          <View className="flex-row items-center gap-3 px-5 pb-3 pt-4">
            <View
              className="h-11 w-11 items-center justify-center rounded-[17px]"
              style={{ backgroundColor: `${ACCENT}1E` }}
            >
              <Ionicons name="chatbubbles-outline" size={20} color={ACCENT} />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-extrabold tracking-[-0.35px] text-foreground">
                Deine Aktivitäten
              </Text>
              <Text className="mt-0.5 text-sm text-muted-foreground">Pläne und Chats</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Aktivitäten schließen"
              className="h-10 w-10 items-center justify-center rounded-full bg-secondary active:opacity-70"
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView
            className="px-3"
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 12 }}
            showsVerticalScrollIndicator={false}
          >
            {activities.length === 0 ? (
              <View className="items-center px-6 py-12">
                <View
                  className="mb-4 h-16 w-16 items-center justify-center rounded-[24px]"
                  style={{ backgroundColor: `${ACCENT}14` }}
                >
                  <Ionicons name="compass-outline" size={27} color={ACCENT} />
                </View>
                <Text className="text-center text-base font-extrabold text-foreground">
                  Noch keine Aktivitäten
                </Text>
                <Text className="mt-2 max-w-[280px] text-center text-sm leading-5 text-muted-foreground">
                  Entdecke einen Pin auf der Karte und tritt bei. Der Chat erscheint danach hier.
                </Text>
              </View>
            ) : (
              <View className="gap-0.5">
                {activities.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} onPress={onOpenChat} />
                ))}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
