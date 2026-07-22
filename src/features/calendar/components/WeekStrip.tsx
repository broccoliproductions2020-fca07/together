import { useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  addDays,
  dateFromKey,
  dateKey,
  mondayFirstIndex,
  startOfDay,
  weekdayShort,
} from '../utils/formatPlanTime';

// How many full weeks sit before/after the current week in the scrollable range.
const WEEKS_BEFORE = 8;
const WEEKS_AFTER = 18;
const VISIBLE = 7;
const INITIAL_DAY_INDEX = WEEKS_BEFORE * VISIBLE;

export interface WeekStripProps {
  /** The day the agenda is currently scrolled to — highlighted, and the strip
   * auto-scrolls to its week (so it "jumps" as the agenda crosses weeks). */
  activeKey: string | null;
  /** Tap a day → parent scrolls the agenda to it. */
  onSelect: (key: string) => void;
}

/**
 * Horizontal, spinnable week wheel (week-snapping). You can freely swipe through
 * weeks; tapping a day scrolls the agenda there. It ALSO follows the agenda: when
 * `activeKey` moves into another week, the wheel scrolls to that week. Manual
 * swiping is pure browsing (it doesn't move the agenda) so the two never fight.
 */
export function WeekStrip({ activeKey, onSelect }: WeekStripProps) {
  const { width } = useWindowDimensions();
  const cellWidth = width / VISIBLE;
  const todayKey = dateKey(new Date());

  const days = useMemo(() => {
    const today = startOfDay(new Date());
    const currentWeekStart = addDays(today, -mondayFirstIndex(today));
    return Array.from({ length: (WEEKS_BEFORE + WEEKS_AFTER + 1) * VISIBLE }, (_, index) =>
      addDays(currentWeekStart, index - INITIAL_DAY_INDEX),
    );
  }, []);

  const listRef = useRef<FlatList<Date>>(null);
  // The week (as a day index of its Monday) the wheel is currently showing —
  // updated by both manual swipes and programmatic follow-scrolls.
  const currentWeekDayIndex = useRef(INITIAL_DAY_INDEX);

  const weekDayIndexForKey = useMemo(() => {
    const firstMs = startOfDay(days[0]).getTime();
    return (key: string) => {
      const day = startOfDay(dateFromKey(key));
      const monday = addDays(day, -mondayFirstIndex(day));
      const idx = Math.round((monday.getTime() - firstMs) / 86_400_000);
      return Math.max(0, Math.min(days.length - 1, idx));
    };
  }, [days]);

  // Follow the agenda: scroll the wheel to the week of the active day.
  useEffect(() => {
    if (!activeKey) return;
    const idx = weekDayIndexForKey(activeKey);
    if (idx === currentWeekDayIndex.current) return;
    currentWeekDayIndex.current = idx;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: idx, animated: true });
    });
  }, [activeKey, weekDayIndexForKey]);

  function handleMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const weekPage = Math.round(e.nativeEvent.contentOffset.x / width);
    currentWeekDayIndex.current = Math.max(0, Math.min(days.length - 1, weekPage * VISIBLE));
  }

  return (
    <FlatList
      ref={listRef}
      data={days}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(day) => dateKey(day)}
      initialScrollIndex={INITIAL_DAY_INDEX}
      getItemLayout={(_, index) => ({ length: cellWidth, offset: cellWidth * index, index })}
      onScrollToIndexFailed={({ index }) => {
        listRef.current?.scrollToOffset({ offset: index * cellWidth, animated: true });
      }}
      snapToInterval={width}
      decelerationRate="fast"
      disableIntervalMomentum
      onMomentumScrollEnd={handleMomentumEnd}
      renderItem={({ item: day }) => {
        const key = dateKey(day);
        const isToday = key === todayKey;
        const isActive = key === activeKey;

        return (
          <View style={{ width: cellWidth }} className="px-0.5">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              className={`mx-0.5 items-center gap-1 rounded-[18px] py-2.5 active:opacity-75 ${
                isActive ? 'bg-primary shadow-sm' : 'bg-transparent'
              }`}
              onPress={() => onSelect(key)}
            >
              <Text
                className={`text-[11px] font-semibold ${
                  isActive ? 'text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {weekdayShort(day)}
              </Text>
              <Text
                className={`text-base font-bold ${
                  isActive
                    ? 'text-primary-foreground'
                    : isToday
                      ? 'text-primary'
                      : 'text-foreground'
                }`}
              >
                {day.getDate()}
              </Text>
              <View
                className={`h-1 w-1 rounded-full ${
                  isToday ? (isActive ? 'bg-primary-foreground' : 'bg-primary') : 'bg-transparent'
                }`}
              />
            </Pressable>
          </View>
        );
      }}
    />
  );
}
