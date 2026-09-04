import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { ActivityStackItem } from '@/features/map/types/map.types';
import { colorWithAlpha, markerModeStyles } from '@/features/map/utils/markerStyles';
import { PressableScale } from '@/shared/components/PressableScale';

export function ActivityStackContent({
  activities,
  onSelect,
}: {
  activities: ActivityStackItem[];
  onSelect?: (id: string, planning: boolean) => void;
}) {
  return (
    <View>
      <Text className="pr-12 text-2xl font-bold text-foreground">Mehrere Pläne hier</Text>
      <Text className="mt-1 pr-12 text-base text-muted-foreground">
        Wähle, welche Activity du öffnen möchtest.
      </Text>

      <View style={styles.list}>
        {activities.map((activity) => {
          const accent = markerModeStyles[activity.mode].color;
          const timing = activity.planning
            ? 'Zeit wird noch gesucht'
            : (activity.timeLabel ?? (activity.mode === 'now' ? 'Läuft jetzt' : 'Beginnt bald'));
          const capacity = activity.maxParticipants
            ? `${activity.participantCount}/${activity.maxParticipants} dabei`
            : `${activity.participantCount} dabei`;
          return (
            <PressableScale
              key={activity.id}
              accessibilityRole="button"
              accessibilityLabel={`${activity.title}, ${timing}, ${capacity}`}
              className="flex-row items-center border"
              haptic={false}
              onPress={() => onSelect?.(activity.id, activity.planning === true)}
              style={[
                styles.row,
                {
                  backgroundColor: colorWithAlpha(accent, 0.07),
                  borderColor: colorWithAlpha(accent, 0.22),
                },
              ]}
            >
              <View
                className="items-center justify-center"
                style={[styles.icon, { backgroundColor: colorWithAlpha(accent, 0.16) }]}
              >
                <Ionicons
                  name={activity.planning ? 'calendar-outline' : 'people-outline'}
                  size={21}
                  color={accent}
                />
              </View>
              <View className="flex-1">
                <Text numberOfLines={2} className="text-base font-bold text-foreground">
                  {activity.title}
                </Text>
                <Text numberOfLines={1} className="mt-0.5 text-sm text-muted-foreground">
                  {timing} · {capacity}
                </Text>
                {activity.placeLabel ? (
                  <Text numberOfLines={1} className="mt-0.5 text-sm text-muted-foreground">
                    {activity.placeLabel}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={19} color={accent} />
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    borderRadius: 12,
    height: 44,
    width: 44,
  },
  list: {
    gap: 12,
    marginTop: 20,
  },
  row: {
    borderRadius: 16,
    gap: 12,
    minHeight: 56,
    padding: 12,
  },
});
