import { Pressable, Text, View } from 'react-native';

import type { ChatMessage } from '../types';
import { formatTime } from '../utils/chatRows';

const DEFAULT_ACCENT = '#6E8BF7';
const RADIUS = 18;
const RADIUS_GROUPED = 5;

/**
 * A single chat bubble. Own messages are accent-filled and right-aligned;
 * others sit on the secondary surface, left-aligned. The sender label appears
 * at every author change (WhatsApp-style); consecutive messages of one author
 * merge into a visual group — tight spacing, continued corner radius, and the
 * avatar/timestamp only at the group end — so threads stay easy to scan.
 */
export function MessageBubble({
  message,
  showAuthor,
  isGroupEnd = true,
  accent = DEFAULT_ACCENT,
  onRetry,
}: {
  message: ChatMessage;
  showAuthor: boolean;
  /** Last message of an author run — shows avatar + timestamp. */
  isGroupEnd?: boolean;
  accent?: string;
  /** Set for failed optimistic echoes — tapping the bubble re-sends. */
  onRetry?: () => void;
}) {
  const spacing = isGroupEnd ? 'mb-3' : 'mb-[3px]';

  if (message.isMe) {
    const failed = message.failed === true;
    const Bubble = failed && onRetry ? Pressable : View;
    return (
      <View className={`${spacing} items-end`}>
        {showAuthor ? (
          <Text className="mb-1 mr-1 text-xs font-semibold text-muted-foreground">Du</Text>
        ) : null}
        <Bubble
          accessibilityRole={failed && onRetry ? 'button' : undefined}
          accessibilityLabel={
            failed && onRetry ? 'Nachricht nicht gesendet, erneut senden' : undefined
          }
          onPress={failed ? onRetry : undefined}
          className="max-w-[80%] px-3.5 py-2"
          style={{
            backgroundColor: accent,
            // The optimistic echo renders slightly translucent until the
            // server copy replaces it; a failed one stays dimmed.
            opacity: failed ? 0.5 : message.pending ? 0.65 : 1,
            borderRadius: RADIUS,
            borderTopRightRadius: showAuthor ? RADIUS : RADIUS_GROUPED,
            borderBottomRightRadius: RADIUS_GROUPED,
          }}
        >
          <Text className="text-[15px] leading-[21px] text-white">{message.text}</Text>
        </Bubble>
        {failed ? (
          <Text className="mr-1 mt-1 text-[10px] font-semibold text-destructive">
            Nicht gesendet · Tippen zum Wiederholen
          </Text>
        ) : isGroupEnd || message.pending ? (
          <Text className="mr-1 mt-1 text-[10px] text-muted-foreground">
            {message.pending ? 'Senden …' : formatTime(message.createdAt)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View className={`${spacing} flex-row items-end gap-2`}>
      {isGroupEnd ? (
        <View
          className="h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}22` }}
        >
          <Text className="text-[11px] font-bold" style={{ color: accent }}>
            {message.initials}
          </Text>
        </View>
      ) : (
        <View className="w-7" />
      )}
      <View className="max-w-[80%] items-start">
        {showAuthor ? (
          <Text className="mb-1 ml-1 text-xs font-semibold text-muted-foreground">
            {message.authorName}
          </Text>
        ) : null}
        <View
          className="bg-secondary px-3.5 py-2"
          style={{
            borderRadius: RADIUS,
            borderTopLeftRadius: showAuthor ? RADIUS : RADIUS_GROUPED,
            borderBottomLeftRadius: RADIUS_GROUPED,
          }}
        >
          <Text className="text-[15px] leading-[21px] text-foreground">{message.text}</Text>
        </View>
        {isGroupEnd ? (
          <Text className="ml-1 mt-1 text-[10px] text-muted-foreground">
            {formatTime(message.createdAt)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
