import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/features/theme';

export type CalendarViewMode = 'week' | 'month';

export interface CalendarToolbarProps {
  viewMode: CalendarViewMode;
  onToggleViewMode: () => void;
}

/**
 * The one row of controls under the card's header: which period is on screen,
 * and the week/month switch.
 *
 * This used to be the calendar's whole header — a title block plus a "+ Plan"
 * button. Both are gone: `FloatingSheetHeader` says what the card is and holds
 * the close control, and creating an activity belongs to the Core, not to the
 * surface you opened to read your plans.
 *
 * The period is shown in WEEK mode only. `MonthGrid` prints the month itself,
 * between its own two arrows, so repeating it here would be the same words
 * twice in adjacent rows. The switch never moves either way.
 */
export function CalendarToolbar({ viewMode, onToggleViewMode }: CalendarToolbarProps) {
  const colors = useThemeColors();
  const period = new Intl.DateTimeFormat('de-DE', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <View className="h-11 flex-row items-center justify-between px-5">
      {viewMode === 'week' ? (
        <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
          {period}
        </Text>
      ) : (
        <View />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          viewMode === 'week' ? 'Zur Monatsansicht wechseln' : 'Zur Wochenansicht wechseln'
        }
        className="h-9 flex-row items-center gap-2 rounded-[15px] border border-border bg-card px-3 active:opacity-80"
        onPress={onToggleViewMode}
      >
        <Ionicons
          name={viewMode === 'week' ? 'grid-outline' : 'calendar-outline'}
          size={15}
          color={colors.primary}
        />
        <Text className="text-xs font-bold text-foreground">
          {viewMode === 'week' ? 'Monat' : 'Woche'}
        </Text>
      </Pressable>
    </View>
  );
}
