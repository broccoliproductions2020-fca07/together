import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/features/auth';
import { useThemeColors } from '@/features/theme';
import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { isRetryableFailure, SEND_FAILURE_TEXT, type ChatMessage } from '../types';

/** "Plan steht" is a state change, not a room colour — it keeps the now-green. */
const PLANNED_COLOR = '#41C08D';

/**
 * Renders a proposal message as a card: what / when / where + "Bin dabei" and
 * "Aktivität" (create a real activity from it). Once created it locks into a
 * confirmed state. This is a structured chat message — no separate proposal screen.
 */
export function ProposalCard({
  message,
  showAuthor,
  accent: roomAccent,
  onToggleConfirm,
  onCreateActivity,
  onRetry,
}: {
  message: ChatMessage;
  showAuthor?: boolean;
  /** The room's colour. Required — the card never invents its own accent. */
  accent: string;
  onToggleConfirm?: () => void;
  onCreateActivity?: () => void;
  onRetry?: () => void;
}) {
  const { user } = useAuth();
  const colors = useThemeColors();
  const currentUid = user?.id ?? 'u_you';
  const proposal = message.proposal;
  if (!proposal) return null;

  const confirmed = proposal.confirmedBy.includes(currentUid);
  const planned = proposal.planned;
  const accent = planned ? PLANNED_COLOR : roomAccent;

  return (
    <View className={`mb-3 ${message.isMe ? 'items-end' : 'items-start'}`}>
      {showAuthor ? (
        <Text
          {...TEXT_FLEXIBLE}
          className={`mb-1 ${message.isMe ? 'mr-1' : 'ml-1'}`}
          style={{ ...TYPE.caption, fontFamily: FONT.semibold, color: colors.mutedForeground }}
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
          <Text
            {...TEXT_FLEXIBLE}
            style={{
              ...TYPE.micro,
              fontFamily: FONT.bold,
              color: accent,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            {planned ? 'Plan steht' : 'Vorschlag'}
          </Text>
        </View>

        <Text
          {...TEXT_FLEXIBLE}
          style={{ ...TYPE.body, fontFamily: FONT.bold, color: colors.foreground }}
        >
          {proposal.what || 'Vorschlag'}
        </Text>

        {proposal.when ? (
          <View className="flex-row items-center gap-2">
            <Ionicons name="time-outline" size={15} color={colors.mutedForeground} />
            <Text
              {...TEXT_FLEXIBLE}
              style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.foreground }}
            >
              {proposal.when}
            </Text>
          </View>
        ) : null}
        {proposal.where ? (
          <View className="flex-row items-center gap-2">
            <Ionicons name="location-outline" size={15} color={colors.mutedForeground} />
            <Text
              {...TEXT_FLEXIBLE}
              style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.foreground }}
            >
              {proposal.where}
            </Text>
          </View>
        ) : null}

        <Text
          {...TEXT_FLEXIBLE}
          style={{ ...TYPE.caption, fontFamily: FONT.medium, color: colors.mutedForeground }}
        >
          {proposal.confirmedBy.length} dabei
        </Text>

        {message.pending ? (
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="cloud-upload-outline" size={15} color={colors.mutedForeground} />
            <Text
              {...TEXT_FLEXIBLE}
              style={{ ...TYPE.caption, fontFamily: FONT.medium, color: colors.mutedForeground }}
            >
              Wird gesendet …
            </Text>
          </View>
        ) : null}

        {message.failed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Vorschlag erneut senden"
            disabled={!isRetryableFailure(message.failureReason)}
            onPress={onRetry}
            className="flex-row items-center gap-1.5 self-start active:opacity-70"
          >
            <Ionicons name="alert-circle-outline" size={15} color="#D9534F" />
            <Text
              {...TEXT_FLEXIBLE}
              style={{ ...TYPE.caption, fontFamily: FONT.semibold, color: '#D9534F' }}
            >
              {SEND_FAILURE_TEXT[message.failureReason ?? 'unknown']}
            </Text>
          </Pressable>
        ) : null}

        {message.proposalError ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Vorschlagsänderung erneut versuchen"
            onPress={onRetry}
            className="flex-row items-center gap-1.5 self-start active:opacity-70"
          >
            <Ionicons name="alert-circle-outline" size={15} color="#D9534F" />
            <Text
              {...TEXT_FLEXIBLE}
              style={{ ...TYPE.caption, fontFamily: FONT.semibold, color: '#D9534F' }}
            >
              {message.proposalError} Erneut versuchen
            </Text>
          </Pressable>
        ) : null}

        {planned ? (
          <View className="flex-row items-center gap-1.5 pt-1">
            <Ionicons name="checkmark-circle" size={16} color={PLANNED_COLOR} />
            <Text
              {...TEXT_FLEXIBLE}
              style={{ ...TYPE.label, fontFamily: FONT.semibold, color: PLANNED_COLOR }}
            >
              Aktivität erstellt
            </Text>
          </View>
        ) : (
          <View className="flex-row gap-2 pt-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmed ? 'Zusage zurückziehen' : 'Zusagen'}
              onPress={onToggleConfirm}
              disabled={message.pending || message.proposalPending === 'confirm'}
              className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border py-2 active:opacity-80"
              style={{
                borderColor: accent,
                backgroundColor: confirmed ? accent : 'transparent',
              }}
            >
              <AnimatedToggleIcon
                icon="checkmark-circle"
                outlineIcon="ellipse-outline"
                active={confirmed}
                size={15}
                activeColor="#fff"
                inactiveColor={accent}
              />
              <Text
                {...TEXT_CAPPED}
                style={{
                  ...TYPE.label,
                  fontFamily: FONT.bold,
                  color: confirmed ? '#fff' : accent,
                }}
              >
                {message.proposalPending === 'confirm'
                  ? 'Speichert …'
                  : confirmed
                    ? 'Dabei'
                    : 'Bin dabei'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Aktivität aus diesem Vorschlag erstellen"
              onPress={onCreateActivity}
              disabled={message.pending || message.proposalPending === 'plan'}
              className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 active:opacity-80"
              style={{ backgroundColor: PLANNED_COLOR }}
            >
              <Ionicons name="add-circle-outline" size={16} color="#fff" />
              <Text
                {...TEXT_CAPPED}
                style={{ ...TYPE.label, fontFamily: FONT.bold, color: '#ffffff' }}
              >
                {message.proposalPending === 'plan' ? 'Speichert …' : 'Aktivität'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
