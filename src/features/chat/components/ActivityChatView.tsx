import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@/features/theme';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { useActivityChat } from '../useActivityChat';
import type { ProposalData } from '../types';
import { useKeyboardPadding } from '../utils/useKeyboardHeight';
import { ChatInputBar } from './ChatInputBar';
import { ChatRoomInfoSheet } from './ChatRoomInfoSheet';
import { ChatThread } from './ChatThread';
import { ProposalComposer } from './ProposalComposer';

function LockedState({ accent, onBack }: { accent: string; onBack: () => void }) {
  const colors = useThemeColors();
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: `${accent}22` }}
      >
        <Ionicons name="lock-closed" size={26} color={accent} />
      </View>
      <Text
        {...TEXT_FLEXIBLE}
        className="text-center"
        style={{ ...TYPE.body, fontFamily: FONT.bold, color: colors.foreground }}
      >
        Nur für Teilnehmer
      </Text>
      <Text
        {...TEXT_FLEXIBLE}
        className="text-center"
        style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.mutedForeground }}
      >
        Tritt der Aktivität bei, um den Chat zu sehen.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zurück"
        onPress={onBack}
        className="mt-2 min-h-11 justify-center rounded-full px-5 py-2.5"
        style={{ backgroundColor: accent }}
      >
        <Text {...TEXT_CAPPED} style={{ ...TYPE.label, fontFamily: FONT.semibold, color: '#fff' }}>
          Zurück
        </Text>
      </Pressable>
    </View>
  );
}

export interface ActivityChatViewProps {
  activityId: string;
  /**
   * The room's colour, resolved by the host: the activity's mode colour for an
   * activity chat, SEMANTIC_COLOR.action for a planning round. Required, so
   * the same room can never render blue here and green in the detail sheet.
   */
  accent: string;
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
  accent,
  title,
  count,
  onBack,
  onCreateActivity,
  onCreateActivityDirect,
}: ActivityChatViewProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const keyboardPadding = useKeyboardPadding(insets.bottom);
  const { isJoined, getRoom, sendMessage, sendProposal } = useActivityChat();
  const [infoOpen, setInfoOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);

  const joined = isJoined(activityId);
  const room = getRoom(activityId);
  const memberCount = room?.memberIds.length ?? count;
  // Proposals belong to planning rounds — inside an activity chat the plan
  // already exists, so the entry stays hidden there.
  const isGroup = room?.type === 'group';

  if (!joined) return <LockedState accent={accent} onBack={onBack} />;

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className="flex-row items-center gap-2 border-b border-border bg-background px-3 pb-3"
        style={{ paddingTop: insets.top + 6 }}
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
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
            style={{ backgroundColor: `${accent}1E` }}
          >
            <Ionicons name={isGroup ? 'people' : 'flash'} size={19} color={accent} />
          </View>
          <View className="flex-1">
            <Text
              {...TEXT_FLEXIBLE}
              numberOfLines={1}
              style={{ ...TYPE.body, fontFamily: FONT.bold, color: colors.foreground }}
            >
              {title ?? room?.title ?? 'Activity-Chat'}
            </Text>
            <Text
              {...TEXT_FLEXIBLE}
              className="mt-0.5"
              style={{ ...TYPE.caption, fontFamily: FONT.medium, color: colors.mutedForeground }}
            >
              {memberCount ? `${memberCount} dabei` : 'Teilnehmer-Chat'} · Info
            </Text>
          </View>
        </Pressable>

        {onCreateActivityDirect ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aktivität erstellen"
            onPress={onCreateActivityDirect}
            className="min-h-11 flex-row items-center gap-1.5 rounded-full px-3 py-2 active:opacity-80"
            style={{ backgroundColor: `${accent}22` }}
          >
            <Ionicons name="add-circle-outline" size={16} color={accent} />
            <Text {...TEXT_CAPPED} style={{ ...TYPE.label, fontFamily: FONT.bold, color: accent }}>
              Aktivität
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Keyboard padding instead of KeyboardAvoidingView — this Modal's own
          resize behavior is unreliable on Android and would hide the composer.
          The padding is driven by the live keyboard frame (UI thread), so the
          composer travels with the keyboard rather than snapping. */}
      <View className="flex-1">
        <ChatThread
          activityId={activityId}
          accent={accent}
          onCreateActivity={onCreateActivity}
        />
        <Animated.View style={keyboardPadding}>
          <ChatInputBar
            accent={accent}
            onSend={(text) => sendMessage(activityId, text)}
            onProposal={isGroup ? () => setProposalOpen(true) : undefined}
          />
        </Animated.View>
      </View>

      <ProposalComposer
        visible={proposalOpen}
        accent={accent}
        onClose={() => setProposalOpen(false)}
        onSubmit={(data) => {
          sendProposal(activityId, data);
          setProposalOpen(false);
        }}
      />

      <ChatRoomInfoSheet
        visible={infoOpen}
        roomId={activityId}
        accent={accent}
        fallbackTitle={title}
        onClose={() => setInfoOpen(false)}
        onLeave={onBack}
      />
    </View>
  );
}
