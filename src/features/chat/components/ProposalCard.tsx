import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/features/auth';

import type { ChatMessage } from '../types';
import { useThemeColors } from '@/features/theme';

const ACCENT = '#6E8BF7';
const PLANNED_COLOR = '#41C08D';
/**
 * Renders a proposal message as a card: what / when / where + "Bin dabei" and
 * "Aktivität" (create a real activity from it). Once created it locks into a
 * confirmed state. This is a structured chat message — no separate proposal screen.
 */
export function ProposalCard({
  message,
  showAuthor,
  accent: activityAccent = ACCENT,
  onToggleConfirm,
  onCreateActivity,
}: {
  message: ChatMessage;
  showAuthor?: boolean;
  accent?: string;
  onToggleConfirm?: () => void;
  onCreateActivity?: () => void;
}) {
  const { user } = useAuth();
  const colors = useThemeColors();
  const currentUid = user?.id ?? 'u_you';
  const proposal = message.proposal;
  if (!proposal) return null;

  const confirmed = proposal.confirmedBy.includes(currentUid);
  const planned = proposal.planned;
  const accent = planned ? PLANNED_COLOR : activityAccent;

  return (
    <View className={`mb-3 ${message.isMe ? 'items-end' : 'items-start'}`}>
      {showAuthor ? (
        <Text
          className={`mb-1 text-xs font-semibold text-muted-foreground ${message.isMe ? 'mr-1' : 'ml-1'}`}
        >
          {message.isMe ? 'Du' : message.authorName}
        </Text>
      ) : null}
      <View
        className="w-[85%] gap-2 rounded-2xl border px-4 py-3"
        style={{ borderColor: `${accent}55`, backgroundColor: `${accent}14` }}
      >
        <View className="flex-row items-center gap-2">
          <Ionicons
            name={planned ? 'checkmark-circle' : 'reader-outline'}
            size={16}
            color={accent}
          />
          <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: accent }}>
            {planned ? 'Plan steht' : 'Vorschlag'}
          </Text>
        </View>

        <Text className="text-lg font-bold text-foreground">{proposal.what || 'Vorschlag'}</Text>

        {proposal.when ? (
          <View className="flex-row items-center gap-2">
            <Ionicons name="time-outline" size={15} color={colors.mutedForeground} />
            <Text className="text-sm text-foreground">{proposal.when}</Text>
          </View>
        ) : null}
        {proposal.where ? (
          <View className="flex-row items-center gap-2">
            <Ionicons name="location-outline" size={15} color={colors.mutedForeground} />
            <Text className="text-sm text-foreground">{proposal.where}</Text>
          </View>
        ) : null}

        <Text className="text-xs text-muted-foreground">{proposal.confirmedBy.length} dabei</Text>

        {planned ? (
          <View className="flex-row items-center gap-1.5 pt-1">
            <Ionicons name="checkmark-circle" size={16} color={PLANNED_COLOR} />
            <Text className="text-sm font-semibold" style={{ color: PLANNED_COLOR }}>
              Aktivität erstellt
            </Text>
          </View>
        ) : (
          <View className="flex-row gap-2 pt-1">
            <Pressable
              onPress={onToggleConfirm}
              className="flex-1 items-center justify-center rounded-xl border py-2 active:opacity-80"
              style={{
                borderColor: accent,
                backgroundColor: confirmed ? accent : 'transparent',
              }}
            >
              <Text className="text-sm font-bold" style={{ color: confirmed ? '#fff' : accent }}>
                {confirmed ? 'Dabei ✓' : 'Bin dabei'}
              </Text>
            </Pressable>
            <Pressable
              onPress={onCreateActivity}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 active:opacity-80"
              style={{ backgroundColor: PLANNED_COLOR }}
            >
              <Ionicons name="add-circle-outline" size={16} color="#fff" />
              <Text className="text-sm font-bold text-white">Aktivität</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
