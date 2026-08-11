import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/features/theme';
import { FONT, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { isRetryableFailure, SEND_FAILURE_TEXT, type ChatMessage } from '../types';
import { formatTime } from '../utils/chatRows';

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
  accent,
  onRetry,
}: {
  message: ChatMessage;
  showAuthor: boolean;
  /** Last message of an author run — shows avatar + timestamp. */
  isGroupEnd?: boolean;
  /** The room's colour. Required — a bubble never invents its own accent. */
  accent: string;
  /** Set only for retryable failures; permanent rejections get no retry. */
  onRetry?: () => void;
}) {
  const colors = useThemeColors();
  const spacing = isGroupEnd ? 'mb-3' : 'mb-[3px]';
  const metaStyle = { ...TYPE.micro, fontFamily: FONT.medium, color: colors.mutedForeground };
  const authorStyle = { ...TYPE.caption, fontFamily: FONT.semibold, color: colors.mutedForeground };
  const bodyStyle = { ...TYPE.body, fontFamily: FONT.medium };

  if (message.isMe) {
    const failed = message.failed === true;
    const retryable = failed && isRetryableFailure(message.failureReason) && Boolean(onRetry);
    const Bubble = retryable ? Pressable : View;
    return (
      <View className={`${spacing} items-end`}>
        {showAuthor ? (
          <Text {...TEXT_FLEXIBLE} className="mb-1 mr-1" style={authorStyle}>
            Du
          </Text>
        ) : null}
        <Bubble
          accessibilityRole={retryable ? 'button' : undefined}
          accessibilityLabel={retryable ? 'Nachricht nicht gesendet, erneut senden' : undefined}
          onPress={retryable ? onRetry : undefined}
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
          <Text {...TEXT_FLEXIBLE} style={{ ...bodyStyle, color: '#ffffff' }}>
            {message.text}
          </Text>
        </Bubble>
        {failed ? (
          // The reason, not a generic apology. Only a transient failure invites
          // a retry — telling someone to tap again on a 2001-character message
          // is an instruction that can never succeed.
          <Text
            {...TEXT_FLEXIBLE}
            className="mr-1 mt-1"
            style={{ ...TYPE.micro, fontFamily: FONT.semibold, color: colors.destructive }}
          >
            {SEND_FAILURE_TEXT[message.failureReason ?? 'unknown']}
          </Text>
        ) : isGroupEnd || message.pending ? (
          <Text {...TEXT_FLEXIBLE} className="mr-1 mt-1" style={metaStyle}>
            {message.pending
              ? message.queuedForSync
                ? 'Wartet auf Verbindung'
                : 'Senden …'
              : formatTime(message.createdAt)}
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
          <Text {...TEXT_FLEXIBLE} style={{ ...TYPE.micro, fontFamily: FONT.bold, color: accent }}>
            {message.initials}
          </Text>
        </View>
      ) : (
        <View className="w-7" />
      )}
      <View className="max-w-[80%] items-start">
        {showAuthor ? (
          <Text {...TEXT_FLEXIBLE} className="mb-1 ml-1" style={authorStyle}>
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
          <Text {...TEXT_FLEXIBLE} style={{ ...bodyStyle, color: colors.foreground }}>
            {message.text}
          </Text>
        </View>
        {isGroupEnd ? (
          <Text {...TEXT_FLEXIBLE} className="ml-1 mt-1" style={metaStyle}>
            {formatTime(message.createdAt)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
