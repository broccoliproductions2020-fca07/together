import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/features/theme';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { useActivityChat } from '../useActivityChat';

/**
 * Compact chat preview shown inside the activity detail sheet once joined.
 * Shows the last messages with their sender plus an unread badge, and expands
 * into the full chat. Tapping anywhere calls `onExpand`.
 */
export function InlineChatPreview({
  activityId,
  accent,
  onExpand,
}: {
  activityId: string;
  /** The room's colour. Required — see AGENTS.md → chat colour model. */
  accent: string;
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
          <Text
            {...TEXT_FLEXIBLE}
            style={{ ...TYPE.label, fontFamily: FONT.semibold, color: colors.foreground }}
          >
            Activity-Chat
          </Text>
          {unread > 0 ? (
            <View
              className="min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5"
              style={{ backgroundColor: accent }}
            >
              <Text
                {...TEXT_CAPPED}
                style={{ ...TYPE.micro, fontFamily: FONT.bold, color: '#ffffff' }}
              >
                {unread}
              </Text>
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-expand-outline" size={16} color={colors.mutedForeground} />
      </View>

      {last.length === 0 ? (
        <Text
          {...TEXT_FLEXIBLE}
          style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.mutedForeground }}
        >
          Noch keine Nachrichten – tippen zum Schreiben
        </Text>
      ) : (
        <View className="gap-1">
          {last.map((m) => (
            <Text
              key={m.id}
              {...TEXT_FLEXIBLE}
              numberOfLines={1}
              style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.foreground }}
            >
              <Text style={{ fontFamily: FONT.semibold, color: accent }}>
                {m.isMe ? 'Du' : m.authorName}:
              </Text>{' '}
              {m.text}
            </Text>
          ))}
          {messages.length > last.length ? (
            <Text
              {...TEXT_FLEXIBLE}
              className="mt-0.5"
              style={{ ...TYPE.caption, fontFamily: FONT.medium, color: colors.mutedForeground }}
            >
              Alle {messages.length} Nachrichten ansehen
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
