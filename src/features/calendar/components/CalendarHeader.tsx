import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

export type CalendarViewMode = 'week' | 'month';

export interface CalendarHeaderProps {
  viewMode: CalendarViewMode;
  onToggleViewMode: () => void;
}

export function CalendarHeader({ viewMode, onToggleViewMode }: CalendarHeaderProps) {
  const period = new Intl.DateTimeFormat('de-DE', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <View className="flex-row items-center justify-between px-5">
      <View className="flex-1">
        <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
          {period}
        </Text>
        <Text className="mt-1 text-[30px] font-extrabold leading-9 tracking-[-0.8px] text-foreground">
          Deine Pläne
        </Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">
          Nur Aktivitäten, bei denen du dabei bist
        </Text>
      </View>

      <View className="ml-3 items-end gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            viewMode === 'week' ? 'Zur Monatsansicht wechseln' : 'Zur Wochenansicht wechseln'
          }
          className="h-11 flex-row items-center gap-2 rounded-[17px] border border-border bg-card px-3.5 shadow-sm active:opacity-80"
          onPress={onToggleViewMode}
        >
          <Ionicons
            name={viewMode === 'week' ? 'grid-outline' : 'calendar-outline'}
            size={16}
            color="#3B82F6"
          />
          <Text className="text-xs font-bold text-foreground">
            {viewMode === 'week' ? 'Monat' : 'Woche'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
