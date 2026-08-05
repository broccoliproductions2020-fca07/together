import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafetyActionsSheet } from '@/features/moderation';

import { SOCIALIZE_COLOR, useSocialize } from '../SocializeProvider';
import type { DiscoverCard } from '../types/socialize.types';

/**
 * Minimal chat surface for a Socialize match. Deliberately nudges toward a public
 * meeting place — later the "Treffpunkt vorschlagen" action opens the existing
 * location picker and can turn the meetup into a regular Together activity.
 */
export function MatchChatSheet({
  card,
  visible,
  onClose,
}: {
  card: DiscoverCard | null;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { messages, loadMessages, sendMessage } = useSocialize();
  const [draft, setDraft] = useState('');
  const [safetyOpen, setSafetyOpen] = useState(false);

  useEffect(() => {
    if (visible && card) void loadMessages(card.id);
  }, [card, loadMessages, visible]);

  if (!card) return null;
  const thread = messages[card.id] ?? [];

  function submit() {
    if (!card) return;
    sendMessage(card.id, draft);
    setDraft('');
  }

  return (
    <>
      <Modal
        animationType="slide"
        transparent
        visible={visible}
        onRequestClose={onClose}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end bg-black/30"
        >
          <View
            className="h-[86%] overflow-hidden rounded-t-[30px] border border-white/10"
            style={{ backgroundColor: '#0E1116' }}
          >
            {/* Header */}
            <View className="border-b border-white/10 px-5 pb-3 pt-4">
              <View className="mb-1 h-1.5 w-12 self-center rounded-full bg-white/20" />
              <View className="flex-row items-center gap-3">
                <View
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: SOCIALIZE_COLOR }}
                >
                  <Text className="text-sm font-bold text-[#0E1116]">{card.initials}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-white">{card.displayName}</Text>
                  <Text className="text-xs text-white/50">
                    {card.kind === 'group' ? `${card.memberCount} Leute · ` : ''}
                    {card.distanceLabel}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sicherheitsoptionen"
                  className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
                  onPress={() => setSafetyOpen(true)}
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color="#F4F5F7" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Chat schließen"
                  className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
                  onPress={onClose}
                >
                  <Ionicons name="close" size={20} color="#F4F5F7" />
                </Pressable>
              </View>
            </View>

            {/* Safety hint */}
            <View
              className="mx-5 mt-3 flex-row items-center gap-2 rounded-xl px-3 py-2"
              style={{ backgroundColor: `${SOCIALIZE_COLOR}14` }}
            >
              <Ionicons name="shield-checkmark-outline" size={15} color={SOCIALIZE_COLOR} />
              <Text className="flex-1 text-[11px] text-white/55">
                Trefft euch an öffentlichen Orten. Keine Adressen oder Links am Anfang.
              </Text>
            </View>

            {/* Messages */}
            <ScrollView
              className="flex-1 px-5"
              contentContainerStyle={{ paddingVertical: 16, gap: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {thread.length === 0 ? (
                <Text className="mt-6 text-center text-sm text-white/40">
                  Sag hallo — worauf habt ihr beide Lust?
                </Text>
              ) : null}
              {thread.map((message) => (
                <View
                  key={message.id}
                  className="max-w-[80%] rounded-2xl px-3.5 py-2.5"
                  style={{
                    alignSelf: message.fromMe ? 'flex-end' : 'flex-start',
                    backgroundColor: message.fromMe ? SOCIALIZE_COLOR : 'rgba(255,255,255,0.09)',
                  }}
                >
                  <Text
                    className="text-[15px] leading-5"
                    style={{ color: message.fromMe ? '#0E1116' : '#F4F5F7' }}
                  >
                    {message.text}
                  </Text>
                </View>
              ))}
            </ScrollView>

            {/* Input */}
            <View
              className="flex-row items-center gap-2 border-t border-white/10 px-4 pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, 12) }}
            >
              <TextInput
                className="min-h-11 flex-1 rounded-full border border-white/10 px-4 text-[15px] text-white"
                style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
                placeholder="Nachricht schreiben…"
                placeholderTextColor="rgba(244,245,247,0.4)"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={submit}
                returnKeyType="send"
                maxLength={500}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nachricht senden"
                className="h-11 w-11 items-center justify-center rounded-full active:opacity-90"
                style={{ backgroundColor: SOCIALIZE_COLOR }}
                onPress={submit}
              >
                <Ionicons name="arrow-up" size={20} color="#0E1116" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <SafetyActionsSheet
        visible={safetyOpen}
        targetUid={card.id}
        targetLabel={card.displayName}
        onClose={() => setSafetyOpen(false)}
        onBlocked={onClose}
      />
    </>
  );
}
