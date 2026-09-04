import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TEXT_CAPPED, TEXT_FLEXIBLE } from '../theme/textScaling';
import { TYPE } from '../theme/typography';

import type { ProductUiFonts } from './types';

export type ActivityChatPreviewTheme = {
  background: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  fonts: ProductUiFonts;
};

export type ActivityChatPreviewMessage = {
  id: string;
  author: string;
  text: string;
  isMe?: boolean;
};

export interface ActivityChatPreviewProps {
  title?: string;
  messages: readonly ActivityChatPreviewMessage[];
  totalMessageCount: number;
  unreadCount: number;
  theme: ActivityChatPreviewTheme;
  onPress?: () => void;
  accessibilityLabel?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  emptyLabel?: string;
  allMessagesLabel?: string;
}

/** Shared activity-chat presentation for React Native and react-native-web. */
export function ActivityChatPreview({
  title = 'Activity-Chat',
  messages,
  totalMessageCount,
  unreadCount,
  theme,
  onPress,
  accessibilityLabel,
  leading,
  trailing,
  emptyLabel = 'Noch keine Nachrichten – tippen zum Schreiben',
  allMessagesLabel,
}: ActivityChatPreviewProps) {
  const last = messages.slice(-2);
  const moreCount = Math.max(0, totalMessageCount - last.length);
  const surface = [styles.root, { backgroundColor: theme.background, borderColor: theme.border }];

  const content = (
    <>
      <View style={styles.header}>
        <View style={styles.headerStart}>
          {leading ? <View style={styles.leading}>{leading}</View> : null}
          <Text {...TEXT_FLEXIBLE} style={[TYPE.label, theme.fonts.semibold, { color: theme.text }]}>
            {title}
          </Text>
          {unreadCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
              <Text {...TEXT_CAPPED} style={[TYPE.micro, theme.fonts.bold, { color: theme.onAccent }]}>
                {unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>

      {last.length === 0 ? (
        <Text {...TEXT_FLEXIBLE} style={[TYPE.label, theme.fonts.body, { color: theme.muted }]}>
          {emptyLabel}
        </Text>
      ) : (
        <View style={styles.messages}>
          {last.map((message) => (
            <Text
              key={message.id}
              {...TEXT_FLEXIBLE}
              numberOfLines={1}
              style={[TYPE.label, theme.fonts.body, { color: theme.text }]}
            >
              <Text style={[theme.fonts.semibold, { color: theme.accent }]}>
                {message.isMe ? 'Du' : message.author}:
              </Text>{' '}
              {message.text}
            </Text>
          ))}
          {moreCount > 0 ? (
            <Text
              {...TEXT_FLEXIBLE}
              style={[TYPE.caption, theme.fonts.body, styles.more, { color: theme.muted }]}
            >
              {allMessagesLabel ?? `Alle ${totalMessageCount} Nachrichten ansehen`}
            </Text>
          ) : null}
        </View>
      )}
    </>
  );

  // Without a handler this is an illustration, not a control. Rendering a
  // Pressable anyway produces a real `<button disabled>` on the web, which a
  // screen reader announces as an unavailable "Chat öffnen, 2 neue Nachrichten".
  if (!onPress) return <View style={surface}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ??
        (unreadCount > 0 ? `Chat öffnen, ${unreadCount} neue Nachrichten` : 'Chat öffnen')
      }
      onPress={onPress}
      style={({ pressed }) => [...surface, pressed ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 16, borderWidth: 1, gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  pressed: { opacity: 0.8 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerStart: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 8 },
  leading: { alignItems: 'center', justifyContent: 'center' },
  trailing: { alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  badge: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  messages: { gap: 4 },
  more: { marginTop: 2 },
});
