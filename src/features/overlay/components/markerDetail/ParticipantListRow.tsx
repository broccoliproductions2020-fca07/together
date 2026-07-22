import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, Text, View } from 'react-native';

import type { MarkerAvatar } from '@/features/map/types/map.types';
import { useThemeColors } from '@/features/theme';

export function ParticipantListRow({
  participant,
  isSelf = false,
  onPress,
}: {
  participant: MarkerAvatar;
  /** Marks the current user's own row ("(Du)"). */
  isSelf?: boolean;
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  const Container = onPress ? Pressable : View;
  return (
    <Container
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${participant.displayName} anzeigen` : undefined}
      className="min-h-12 flex-row items-center gap-3 py-2 active:opacity-70"
      onPress={onPress}
    >
      <View className="h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-card">
        {participant.avatarUrl ? (
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: participant.avatarUrl }}
            className="h-full w-full rounded-full"
          />
        ) : (
          <Text className="text-sm font-bold text-foreground">{participant.initials}</Text>
        )}
      </View>
      <View className="flex-1">
        <Text className="text-base font-medium text-foreground" numberOfLines={1}>
          {participant.displayName}
          {isSelf ? '  (Du)' : ''}
        </Text>
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      ) : null}
    </Container>
  );
}
