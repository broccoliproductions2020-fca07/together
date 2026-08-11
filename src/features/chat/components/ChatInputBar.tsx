import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useThemeColors } from '@/features/theme';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { MESSAGE_MAX_LENGTH } from '../types';

/** Only worth showing near the ceiling — a counter on every message is noise. */
const COUNTER_VISIBLE_FROM = 1800;

export function ChatInputBar({
  accent,
  onSend,
  onFocus,
  onProposal,
}: {
  /** The room's colour. Required — a chat never invents its own accent. */
  accent: string;
  onSend: (text: string) => void;
  /** Lets an embedded chat reveal its latest messages as the keyboard opens. */
  onFocus?: () => void;
  /** Shows the "+" proposal entry (planning groups only). */
  onProposal?: () => void;
}) {
  const colors = useThemeColors();
  const [text, setText] = useState('');
  // State disables the control on the next render. This tiny synchronous gate
  // closes the one-frame gap in which two physical taps could otherwise send
  // the exact same message twice.
  const sendInFlightRef = useRef(false);
  const canSend = text.trim().length > 0;
  const showCounter = text.length >= COUNTER_VISIBLE_FROM;
  const atLimit = text.length >= MESSAGE_MAX_LENGTH;

  function handleSend() {
    if (sendInFlightRef.current) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    sendInFlightRef.current = true;
    onSend(trimmed);
    setText('');
    requestAnimationFrame(() => {
      sendInFlightRef.current = false;
    });
  }

  return (
    <View className="border-t border-border px-3 pb-2 pt-2.5">
      {showCounter ? (
        <Text
          {...TEXT_CAPPED}
          className="mb-1 self-end"
          style={{
            ...TYPE.micro,
            fontFamily: FONT.semibold,
            color: atLimit ? colors.destructive : colors.mutedForeground,
          }}
        >
          {text.length} / {MESSAGE_MAX_LENGTH}
        </Text>
      ) : null}
      <View className="flex-row items-end gap-2">
        {onProposal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Vorschlag machen"
            onPress={onProposal}
            className="h-11 w-11 items-center justify-center rounded-full bg-secondary active:opacity-70"
          >
            <Ionicons name="add" size={24} color={accent} />
          </Pressable>
        ) : null}
        <View className="max-h-28 min-h-[44px] flex-1 justify-center rounded-3xl border border-border bg-secondary px-4 py-2">
          <TextInput
            {...TEXT_FLEXIBLE}
            value={text}
            onChangeText={setText}
            placeholder="Nachricht schreiben"
            placeholderTextColor={colors.mutedForeground}
            multiline
            // The server rejects anything longer (createChatMessage). Capping
            // here means an over-long message cannot be composed at all,
            // instead of failing after the round-trip with a dead retry.
            maxLength={MESSAGE_MAX_LENGTH}
            style={{
              ...TYPE.body,
              fontFamily: FONT.medium,
              color: colors.foreground,
              paddingTop: 0,
              paddingBottom: 0,
            }}
            onFocus={onFocus}
            // Deliberately NO onSubmitEditing/returnKeyType="send": on a
            // multiline Android input the return key inserts a newline no
            // matter what the prop claims, so promising "send" there was a lie.
            // The arrow button is the only send affordance, on both platforms.
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Senden"
          onPress={handleSend}
          disabled={!canSend}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
          style={{ backgroundColor: canSend ? accent : colors.secondary }}
        >
          <Ionicons name="arrow-up" size={22} color={canSend ? '#ffffff' : colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}
