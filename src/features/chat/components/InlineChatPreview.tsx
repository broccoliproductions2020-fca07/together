import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useActivityChat } from '../useActivityChat';
import { useThemeColors } from '@/features/theme';

const ACCENT = '#6E8BF7';

/**
 * Compact chat preview shown inside the activity detail sheet once joined.
 * Shows the last messages with their sender plus an unread badge, and expands
 * into the full chat. Tapping anywhere calls `onExpand`.
 */
export function InlineChatPreview({
  activityId,
  accent = ACCENT,
  onExpand,
}: {
  activityId: string;
  accent?: string;
  onExpand: () => void;
}) {
  const colors = useThemeColors();
  const { getMessages, getUnreadCount } = useActivityChat();
  const messages = getMessages(activityId);
  const last = messages.slice(-2);
  const unread = getUnreadCount(activityId);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Chat öffnen, ${unread} neue Nachrichten` : 'Chat öffnen'}
      onPress={onExpand}
      className="gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 active:opacity-80"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={accent} />
          <Text className="text-sm font-bold text-foreground">Activity-Chat</Text>
          {unread > 0 ? (
            <View
              className="min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5"
              style={{ backgroundColor: accent }}
            >
              <Text className="text-[10px] font-bold text-white">{unread}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-expand-outline" size={16} color={colors.mutedForeground} />
      </View>

      {last.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          Noch keine Nachrichten – tippen zum Schreiben
        </Text>
      ) : (
        <View className="gap-1">
          {last.map((m) => (
            <Text key={m.id} className="text-sm text-foreground" numberOfLines={1}>
              <Text className="font-semibold" style={{ color: accent }}>
                {m.isMe ? 'Du' : m.authorName}:
              </Text>{' '}
              {m.text}
            </Text>
          ))}
          {messages.length > last.length ? (
            <Text className="mt-0.5 text-xs text-muted-foreground">
              Alle {messages.length} Nachrichten ansehen
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
