import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import { FlatList, Keyboard, Platform, Text, View } from 'react-native';

import { useActivityChat } from '../useActivityChat';
import type { ProposalData } from '../types';
import { buildChatRows, type ChatListRow } from '../utils/chatRows';
import { MessageBubble } from './MessageBubble';
import { ProposalCard } from './ProposalCard';

const DEFAULT_ACCENT = '#6E8BF7';

function DaySeparator({ label }: { label: string }) {
  return (
    <View className="my-2.5 flex-row justify-center">
      <View className="rounded-full bg-secondary px-3 py-1">
        <Text className="text-[11px] font-semibold text-muted-foreground">{label}</Text>
      </View>
    </View>
  );
}

/**
 * The message list shared by the inline sheet chat and the full-screen chat:
 * day separators, grouped bubbles, proposal cards, auto-scroll to the newest
 * message, and read-marking. Attaches the room's message listener while
 * mounted — render it only for joined members.
 */
export function ChatThread({
  activityId,
  accent = DEFAULT_ACCENT,
  onCreateActivity,
  contentPaddingHorizontal = 12,
}: {
  activityId: string;
  accent?: string;
  onCreateActivity?: (roomId: string, messageId: string, proposal: ProposalData) => void;
  contentPaddingHorizontal?: number;
}) {
  const { getMessages, markRead, toggleProposalConfirm, retryMessage, openRoom, closeRoom } =
    useActivityChat();
  const listRef = useRef<FlatList<ChatListRow>>(null);
  const messages = getMessages(activityId);

  // Stream this room's messages while the thread is on screen (members only —
  // Firestore rules would reject a non-member listener).
  useEffect(() => {
    openRoom(activityId);
    return () => closeRoom(activityId);
  }, [activityId, openRoom, closeRoom]);

  useEffect(() => {
    markRead(activityId);
  }, [activityId, messages.length, markRead]);

  const rows = useMemo(() => buildChatRows(messages), [messages]);

  useEffect(() => {
    if (rows.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [rows.length]);

  // The platform resizes the list when the keyboard opens — follow it so the
  // newest messages stay in view.
  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(event, () => {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });
    return () => subscription.remove();
  }, []);

  if (rows.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-10 py-8">
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}1A` }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={accent} />
        </View>
        <Text className="text-center text-sm text-muted-foreground">
          Noch keine Nachrichten. Schreib die erste!
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) =>
        item.type === 'day' ? (
          <DaySeparator label={item.label} />
        ) : item.message.kind === 'proposal' ? (
          <ProposalCard
            message={item.message}
            showAuthor={item.showAuthor}
            accent={accent}
            onToggleConfirm={() => toggleProposalConfirm(activityId, item.message.id)}
            onCreateActivity={() =>
              item.message.proposal &&
              onCreateActivity?.(activityId, item.message.id, item.message.proposal)
            }
          />
        ) : (
          <MessageBubble
            message={item.message}
            showAuthor={item.showAuthor}
            isGroupEnd={item.isGroupEnd}
            accent={accent}
            onRetry={
              item.message.failed ? () => retryMessage(activityId, item.message.id) : undefined
            }
          />
        )
      }
      contentContainerStyle={{
        // Bottom-anchored like every messenger: few messages sit just above
        // the composer instead of floating at the top of an empty area.
        flexGrow: 1,
        justifyContent: 'flex-end',
        paddingHorizontal: contentPaddingHorizontal,
        paddingTop: 8,
        paddingBottom: 12,
      }}
      showsVerticalScrollIndicator={false}
      onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      // Deliberately NOT automaticallyAdjustKeyboardInsets: hosts apply their
      // own manual keyboard-height padding (useKeyboardHeight) — stacking
      // both would double-compensate on iOS.
    />
  );
}
