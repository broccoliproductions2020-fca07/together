import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useThemeColors } from '@/features/theme';

const DEFAULT_ACCENT = '#6E8BF7';

export function ChatInputBar({
  onSend,
  onFocus,
  onProposal,
  accent = DEFAULT_ACCENT,
}: {
  onSend: (text: string) => void;
  /** Lets an embedded chat reveal its latest messages as the keyboard opens. */
  onFocus?: () => void;
  /** Shows the "+" proposal entry (planning groups only). */
  onProposal?: () => void;
  /** Lets an activity chat inherit its activity colour. */
  accent?: string;
}) {
  const colors = useThemeColors();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0;

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <View className="flex-row items-end gap-2 border-t border-border px-3 pb-2 pt-2.5">
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
          value={text}
          onChangeText={setText}
          placeholder="Nachricht schreiben"
          placeholderTextColor={colors.mutedForeground}
          multiline
          className="text-[15px] text-foreground"
          style={{ paddingTop: 0, paddingBottom: 0 }}
          onFocus={onFocus}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          blurOnSubmit={false}
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
  );
}
