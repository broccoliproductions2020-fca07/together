import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useThemeColors } from '@/features/theme';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { useActivityChat } from '../useActivityChat';
import type { ProposalData } from '../types';
import { buildChatRows, type ChatListRow } from '../utils/chatRows';
import { MessageBubble } from './MessageBubble';
import { ProposalCard } from './ProposalCard';

/** Distance from the bottom that still counts as "reading the newest". */
const AT_BOTTOM_THRESHOLD = 80;

function DaySeparator({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View className="my-2.5 flex-row justify-center">
      <View className="rounded-full bg-secondary px-3 py-1">
        <Text
          {...TEXT_CAPPED}
          style={{ ...TYPE.micro, fontFamily: FONT.semibold, color: colors.mutedForeground }}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

/**
 * The message list shared by the inline sheet chat and the full-screen chat:
 * day separators, grouped bubbles, proposal cards, and read-marking. Attaches
 * the room's message listener while mounted — render it only for joined
 * members.
 *
 * Scrolling follows one rule: the thread only jumps to the newest message when
 * the user is ALREADY there, sent something themselves, or opened the
 * keyboard. Reading older messages is never interrupted — a new arrival raises
 * a button instead of yanking the viewport.
 */
export function ChatThread({
  activityId,
  accent,
  onCreateActivity,
  contentPaddingHorizontal = 12,
}: {
  activityId: string;
  /** The room's colour. Required — the thread never invents its own accent. */
  accent: string;
  onCreateActivity?: (roomId: string, messageId: string, proposal: ProposalData) => void;
  contentPaddingHorizontal?: number;
}) {
  const colors = useThemeColors();
  const {
    getMessages,
    markRead,
    toggleProposalConfirm,
    retryMessage,
    openRoom,
    closeRoom,
    loadOlderMessages,
    isLoadingOlder,
    hasMoreHistory,
  } = useActivityChat();
  const listRef = useRef<FlatList<ChatListRow>>(null);
  const messages = getMessages(activityId);
  const atBottomRef = useRef(true);
  const lastCountRef = useRef(messages.length);
  const lastOwnMessageIdRef = useRef<string | undefined>(undefined);
  // Opening a room must land on the newest message even when the first paint
  // already has a full window. This fires ONCE — the old unconditional
  // onContentSizeChange scroll is what pulled the viewport away from someone
  // reading history and fought every "load older" page.
  const initialScrollDoneRef = useRef(false);
  const [showNewMessages, setShowNewMessages] = useState(false);

  const loadingOlder = isLoadingOlder(activityId);
  const canLoadOlder = hasMoreHistory(activityId) && messages.length > 0;

  // Stream this room's messages while the thread is on screen (members only —
  // Firestore rules would reject a non-member listener).
  useEffect(() => {
    // A host can swap the room without remounting (the detail sheet does).
    // Scroll bookkeeping is per room, so reset it with the room.
    atBottomRef.current = true;
    initialScrollDoneRef.current = false;
    lastCountRef.current = 0;
    lastOwnMessageIdRef.current = undefined;
    setShowNewMessages(false);
    openRoom(activityId);
    return () => closeRoom(activityId);
  }, [activityId, openRoom, closeRoom]);

  useEffect(() => {
    markRead(activityId);
  }, [activityId, messages.length, markRead]);

  const rows = useMemo(() => buildChatRows(messages), [messages]);

  const scrollToEnd = useCallback((animated: boolean) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
    setShowNewMessages(false);
    atBottomRef.current = true;
  }, []);

  // Growth handling. Own sends and arrivals-while-at-the-bottom follow; an
  // arrival while the user is reading history raises the button instead.
  useEffect(() => {
    const grew = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    if (!grew) return;

    const newest = messages[messages.length - 1];
    const ownNewSend = newest?.isMe && newest.id !== lastOwnMessageIdRef.current;
    if (newest?.isMe) lastOwnMessageIdRef.current = newest.id;

    if (ownNewSend || atBottomRef.current) scrollToEnd(true);
    else setShowNewMessages(true);
  }, [messages, scrollToEnd]);

  // The platform resizes the list when the keyboard opens. Following it is
  // correct only for someone already reading the newest messages.
  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(event, () => {
      if (atBottomRef.current) scrollToEnd(true);
    });
    return () => subscription.remove();
  }, [scrollToEnd]);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    atBottomRef.current = distanceFromBottom <= AT_BOTTOM_THRESHOLD;
    if (atBottomRef.current && showNewMessages) setShowNewMessages(false);
  }

  if (rows.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-10 py-8">
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}1A` }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={accent} />
        </View>
        <Text
          {...TEXT_FLEXIBLE}
          className="text-center"
          style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.mutedForeground }}
        >
          Noch keine Nachrichten. Schreib die erste!
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          // Explicit, user-driven history. Never an onEndReached-style
          // automatic fetch: reads are only spent when someone asks for them,
          // and the button is also what makes the gap visible instead of
          // silently pretending the thread starts here.
          canLoadOlder ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ältere Nachrichten laden"
              disabled={loadingOlder}
              onPress={() => void loadOlderMessages(activityId)}
              className="mb-2 flex-row items-center justify-center gap-2 self-center rounded-full bg-secondary px-4 py-2 active:opacity-70"
            >
              {loadingOlder ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Ionicons name="arrow-up" size={14} color={accent} />
              )}
              <Text
                {...TEXT_CAPPED}
                style={{ ...TYPE.caption, fontFamily: FONT.semibold, color: accent }}
              >
                {loadingOlder ? 'Wird geladen …' : 'Ältere Nachrichten laden'}
              </Text>
            </Pressable>
          ) : null
        }
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
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (initialScrollDoneRef.current || rows.length === 0) return;
          initialScrollDoneRef.current = true;
          listRef.current?.scrollToEnd({ animated: false });
        }}
        // Deliberately NOT scrollToEnd on every content-size change: that is
        // what pulled the viewport away from someone reading history, and it
        // fought the "load older" button by jumping back down after each page.
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        // Deliberately NOT automaticallyAdjustKeyboardInsets: hosts apply their
        // own manual keyboard-height padding (useKeyboardHeight) — stacking
        // both would double-compensate on iOS.
      />

      {showNewMessages ? (
        <View pointerEvents="box-none" className="absolute bottom-3 left-0 right-0 items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zu den neuen Nachrichten springen"
            onPress={() => scrollToEnd(true)}
            className="flex-row items-center gap-1.5 rounded-full px-3.5 py-2 active:opacity-80"
            style={{
              backgroundColor: accent,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.28,
              shadowRadius: 10,
              elevation: 5,
            }}
          >
            <Text
              {...TEXT_CAPPED}
              style={{ ...TYPE.caption, fontFamily: FONT.semibold, color: '#ffffff' }}
            >
              Neue Nachrichten
            </Text>
            <Ionicons name="arrow-down" size={13} color="#ffffff" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
