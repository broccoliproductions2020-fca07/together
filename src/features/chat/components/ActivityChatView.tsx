import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActivityChat } from '../useActivityChat';
import type { ProposalData } from '../types';
import { useKeyboardHeight } from '../utils/useKeyboardHeight';
import { useThemeColors } from '@/features/theme';
import { ChatInputBar } from './ChatInputBar';
import { ChatRoomInfoSheet } from './ChatRoomInfoSheet';
import { ChatThread } from './ChatThread';
import { ProposalComposer } from './ProposalComposer';

const ACCENT = '#6E8BF7';

function LockedState({ onBack }: { onBack: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: `${ACCENT}22` }}
      >
        <Ionicons name="lock-closed" size={26} color={ACCENT} />
      </View>
      <Text className="text-center text-lg font-bold text-foreground">Nur für Teilnehmer</Text>
      <Text className="text-center text-sm text-muted-foreground">
        Tritt der Aktivität bei, um den Chat zu sehen.
      </Text>
      <Pressable
        onPress={onBack}
        className="mt-2 rounded-full px-5 py-2.5"
        style={{ backgroundColor: ACCENT }}
      >
        <Text className="font-semibold text-white">Zurück</Text>
      </Pressable>
    </View>
  );
}

export interface ActivityChatViewProps {
  activityId: string;
  title?: string;
  count?: number;
  onBack: () => void;
  /** Turn a proposal into a real activity (opens the composer prefilled). */
  onCreateActivity?: (roomId: string, messageId: string, proposal: ProposalData) => void;
  /** Create an activity straight from the chat (header button), no proposal needed. */
  onCreateActivityDirect?: () => void;
}

/**
 * Full-screen chat surface. Presentational (props-based, no routing) so it can be
 * hosted inside a Modal from anywhere. Marks the room read on open.
 */
export function ActivityChatView({
  activityId,
  title,
  count,
  onBack,
  onCreateActivity,
  onCreateActivityDirect,
}: ActivityChatViewProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const keyboardHeight = useKeyboardHeight();
  const { isJoined, getRoom, sendMessage, sendProposal } = useActivityChat();
  const [infoOpen, setInfoOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);

  const joined = isJoined(activityId);
  const room = getRoom(activityId);
  const memberCount = room?.memberIds.length ?? count;
  // Proposals belong to planning rounds — inside an activity chat the plan
  // already exists, so the entry stays hidden there.
  const isGroup = room?.type === 'group';

  if (!joined) return <LockedState onBack={onBack} />;

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className="flex-row items-center gap-2 border-b border-border bg-background px-3 pb-3"
        style={{ paddingTop: insets.top + 6 }}
      >
        <Pressable
          onPress={onBack}
          accessibilityLabel="Zurück"
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        {/* Tapping the title opens the room info (members, admins) — the standard
            messenger "group info" affordance. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chat-Info öffnen"
          onPress={() => setInfoOpen(true)}
          className="flex-1 flex-row items-center gap-3 active:opacity-70"
        >
          <View
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: `${ACCENT}1E` }}
          >
            <Ionicons name={room?.type === 'group' ? 'people' : 'flash'} size={19} color={ACCENT} />
          </View>
          <View className="flex-1">
            <Text className="text-[16px] font-bold text-foreground" numberOfLines={1}>
              {title ?? room?.title ?? 'Activity-Chat'}
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {memberCount ? `${memberCount} dabei` : 'Teilnehmer-Chat'} · Info
            </Text>
          </View>
        </Pressable>

        {onCreateActivityDirect ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aktivität erstellen"
            onPress={onCreateActivityDirect}
            className="flex-row items-center gap-1.5 rounded-full px-3 py-2 active:opacity-80"
            style={{ backgroundColor: `${ACCENT}22` }}
          >
            <Ionicons name="add-circle-outline" size={16} color={ACCENT} />
            <Text className="text-sm font-bold" style={{ color: ACCENT }}>
              Aktivität
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Manual keyboard offset instead of KeyboardAvoidingView — this Modal's
          own resize behavior for its content is unreliable on Android, and
          the composer would end up hidden behind the keyboard. Plain padding
          based on the real keyboard height always clears it. */}
      <View className="flex-1">
        <ChatThread activityId={activityId} onCreateActivity={onCreateActivity} />
        <View style={{ paddingBottom: Math.max(insets.bottom, keyboardHeight) }}>
          <ChatInputBar
            onSend={(text) => sendMessage(activityId, text)}
            onProposal={isGroup ? () => setProposalOpen(true) : undefined}
          />
        </View>
      </View>

      <ProposalComposer
        visible={proposalOpen}
        onClose={() => setProposalOpen(false)}
        onSubmit={(data) => {
          sendProposal(activityId, data);
          setProposalOpen(false);
        }}
      />

      <ChatRoomInfoSheet
        visible={infoOpen}
        roomId={activityId}
        fallbackTitle={title}
        onClose={() => setInfoOpen(false)}
        onLeave={onBack}
      />
    </View>
  );
}
