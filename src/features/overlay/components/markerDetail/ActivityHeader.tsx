import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/features/auth';
import { activityPhaseLabel } from '@/features/activities/utils/activityTiming';
import { colorWithAlpha } from '@/features/map/utils/markerStyles';

import { InfoRow } from './InfoRow';
import type { ActivitySelection } from './types';

/** Shared header block: name → time → place. */
export function ActivityHeader({
  selection,
  accent,
  joined,
  canEdit,
  onEdit,
}: {
  selection: ActivitySelection;
  accent: string;
  joined: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  const { user } = useAuth();
  const currentUid = user?.id ?? 'u_you';
  const includesCurrentUser = selection.participants.some(
    (participant) => participant.userId === currentUid,
  );
  const count = selection.participantCount + (joined && !includesCurrentUser ? 1 : 0);

  return (
    <>
      {/* 1. Activity name */}
      <Text className="pr-10 text-2xl font-bold leading-tight text-foreground">
        {selection.title}
      </Text>

      {/* 2. Mode + count (+ edit, host-only) */}
      <View className="mt-3 flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
        <Text className="flex-1 text-sm font-semibold text-muted-foreground">
          {activityPhaseLabel(selection.mode, selection.startsAt)} · {count}
          {selection.maxParticipants ? `/${selection.maxParticipants}` : ''} dabei
          {joined ? ' · Du bist dabei' : ''}
        </Text>
        {canEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aktivität bearbeiten"
            className="flex-row items-center gap-1 rounded-full px-2.5 py-1 active:opacity-70"
            style={{ backgroundColor: colorWithAlpha(accent, 0.14) }}
            onPress={onEdit}
          >
            <Ionicons name="pencil" size={13} color={accent} />
            <Text className="text-xs font-bold" style={{ color: accent }}>
              Bearbeiten
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* 3. Time + 4. Place */}
      <View className="mt-4 gap-2">
        {selection.timeLabel ? (
          <InfoRow icon="time-outline" text={selection.timeLabel} accent={accent} />
        ) : null}
        {selection.placeLabel ? (
          <InfoRow icon="location-outline" text={selection.placeLabel} accent={accent} />
        ) : null}
      </View>
    </>
  );
}
