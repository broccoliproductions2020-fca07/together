import { Ionicons } from '@expo/vector-icons';

import { useThemeColors } from '@/features/theme';
import { ActivityChatPreview } from '@/shared/product-ui/ActivityChatPreview';
import { NATIVE_FONTS } from '@/shared/product-ui/nativeFonts';

import { useActivityChat } from '../useActivityChat';

/**
 * Compact chat preview shown inside the activity detail sheet once joined.
 * Shows the last messages with their sender plus an unread badge, and expands
 * into the full chat. Tapping anywhere calls `onExpand`.
 *
 * The presentation itself is shared with the landing page
 * (`shared/product-ui`); this file is only the data adapter.
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
  const unread = getUnreadCount(activityId);

  return (
    <ActivityChatPreview
      messages={messages.map((message) => ({
        id: message.id,
        author: message.authorName,
        text: message.text,
        isMe: message.isMe,
      }))}
      totalMessageCount={messages.length}
      unreadCount={unread}
      onPress={onExpand}
      leading={<Ionicons name="chatbubble-ellipses-outline" size={16} color={accent} />}
      trailing={<Ionicons name="chevron-expand-outline" size={16} color={colors.mutedForeground} />}
      theme={{
        background: colors.secondary,
        border: colors.border,
        text: colors.foreground,
        muted: colors.mutedForeground,
        accent,
        onAccent: '#ffffff',
        fonts: NATIVE_FONTS,
      }}
    />
  );
}
