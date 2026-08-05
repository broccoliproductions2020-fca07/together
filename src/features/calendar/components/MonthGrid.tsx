import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { dateKey, getDaysInMonth, mondayFirstIndex, MONTHS_FULL } from '../utils/formatPlanTime';

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export interface MonthGridProps {
  year: number;
  month: number; // 0-indexed
  selectedKey: string | null;
  /** Day highlighted by scroll position (distinct from selected). */
  activeKey: string | null;
  /** Set of date keys that have at least one plan. */
  markedKeys: Set<string>;
  onSelect: (key: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function MonthGrid({
  year,
  month,
  selectedKey,
  activeKey,
  markedKeys,
  onSelect,
  onPrev,
  onNext,
}: MonthGridProps) {
  const todayKey = dateKey(new Date());
  const daysInMonth = getDaysInMonth(year, month);
  const startOffset = mondayFirstIndex(new Date(year, month, 1));

  // Fill a 7-column grid: null = padding cell, number = day of month
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array.from({ length: totalCells - startOffset - daysInMonth }, () => null),
  ];

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <View className="px-4">
      {/* Month navigation */}
      <View className="mb-3 flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Vorheriger Monat"
          className="h-9 w-9 items-center justify-center rounded-full bg-card active:opacity-70"
          onPress={onPrev}
        >
          <Ionicons name="chevron-back" size={18} color="var(--color-foreground, #F4F5F7)" />
        </Pressable>
        <Text className="text-base font-bold text-foreground">
          {MONTHS_FULL[month]} {year}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nächster Monat"
          className="h-9 w-9 items-center justify-center rounded-full bg-card active:opacity-70"
          onPress={onNext}
        >
          <Ionicons name="chevron-forward" size={18} color="var(--color-foreground, #F4F5F7)" />
        </Pressable>
      </View>

      {/* Weekday column headers */}
      <View className="mb-1 flex-row">
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} className="flex-1 items-center">
            <Text className="text-[11px] font-semibold text-muted-foreground">{label}</Text>
          </View>
        ))}
      </View>

      {/* Day rows */}
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row">
          {row.map((day, colIndex) => {
            if (!day) return <View key={colIndex} className="flex-1 py-1" />;

            const key = dateKey(new Date(year, month, day));
            const isSelected = key === selectedKey;
            const isActive = !isSelected && key === activeKey;
            const isToday = key === todayKey;
            const hasPlans = markedKeys.has(key);

            return (
              <Pressable
                key={colIndex}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className="flex-1 items-center py-1 active:opacity-70"
                onPress={() => onSelect(key)}
              >
                <View
                  className={`h-8 w-8 items-center justify-center rounded-full ${isSelected ? 'bg-primary' : ''}`}
                  style={isActive ? { backgroundColor: 'rgba(110,139,247,0.18)' } : undefined}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      isSelected
                        ? 'text-primary-foreground'
                        : isToday
                          ? 'text-primary'
                          : 'text-foreground'
                    }`}
                  >
                    {day}
                  </Text>
                </View>
                <View
                  className={`mt-0.5 h-1 w-1 rounded-full ${
                    hasPlans
                      ? isSelected
                        ? 'bg-primary-foreground'
                        : 'bg-primary'
                      : 'bg-transparent'
                  }`}
                />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
