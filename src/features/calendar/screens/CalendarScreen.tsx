import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActivityEntities } from '@/features/activities';
import { ActivityChatView, useActivityChat } from '@/features/chat';

import { AgendaList } from '../components/AgendaList';
import { CalendarHeader, type CalendarViewMode } from '../components/CalendarHeader';
import { EmptyCalendarState } from '../components/EmptyCalendarState';
import { MonthGrid } from '../components/MonthGrid';
import { WeekStrip } from '../components/WeekStrip';
import type { Plan } from '../types/calendar.types';
import { dateKey, dateKeyFromIso } from '../utils/formatPlanTime';
import { groupPlansByDate } from '../utils/groupPlansByDate';

// How far the user must drag (as fraction of width) to trigger navigation.
const DRAG_RATIO = 0.28;
// How fast a flick must be (px/s) to trigger navigation.
const FLICK_VELOCITY = 550;
// Duration of the settle slide animation.
const EXIT_MS = 240;
// Ease-out with no overshoot — avoids the spring "wobble".
const SETTLE_EASING = Easing.out(Easing.cubic);

function addMonths(base: { year: number; month: number }, delta: number) {
  const total = base.year * 12 + base.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export interface CalendarScreenProps {
  onGoToMap: () => void;
}

export function CalendarScreen({ onGoToMap }: CalendarScreenProps) {
  const { plans, findActivityById } = useActivityEntities();
  const { isJoined } = useActivityChat();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});

  // Drag offset of the 3-panel carousel (0 = current panel centered).
  const translateX = useSharedValue(0);

  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [gridMonth, setGridMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [scrollActiveKey, setScrollActiveKey] = useState<string | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [chatPlan, setChatPlan] = useState<{ id: string; title: string; count: number } | null>(
    null,
  );

  // The calendar is the user's commitment view, not a discovery feed. An
  // activity is visible only after the current user explicitly joined it.
  const acceptedPlans = useMemo(
    () => plans.filter((plan) => isJoined(plan.activityId ?? plan.id)),
    [isJoined, plans],
  );

  const markedKeys = useMemo(
    () => new Set(acceptedPlans.map((p) => dateKeyFromIso(p.startsAt))),
    [acceptedPlans],
  );

  // The agenda ALWAYS shows every plan (chronological, grouped by day) — you
  // scroll through all of them. The week strip's highlight follows the scroll
  // position; tapping a day just scrolls there (no filtering).
  const sections = useMemo(() => groupPlansByDate(acceptedPlans), [acceptedPlans]);
  const highlightKey = scrollActiveKey ?? sections[0]?.key ?? null;

  // Recenter (month carousel): state moves one month so the neighbour becomes the
  // current panel, then translateX resets to 0. Neighbour and new current show
  // identical content, so there is no jump.
  const commit = useCallback(
    (dir: 'next' | 'prev') => {
      setSelectedKey(null);
      setGridMonth((prev) => addMonths(prev, dir === 'next' ? 1 : -1));
      translateX.value = 0;
    },
    [translateX],
  );

  /** Slides the neighbour month fully into view, then recenters. Gesture + arrows. */
  const navigate = useCallback(
    (dir: 'next' | 'prev') => {
      if (reducedMotion) {
        commit(dir);
        return;
      }
      const target = dir === 'next' ? -width : width;
      translateX.value = withTiming(
        target,
        { duration: EXIT_MS, easing: SETTLE_EASING },
        (finished) => {
          if (finished) runOnJS(commit)(dir);
        },
      );
    },
    [commit, reducedMotion, translateX, width],
  );

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        // Kick in after 10px horizontal; fail if >15px vertical (scroll protection).
        .activeOffsetX([-10, 10])
        .failOffsetY([-15, 15])
        .runOnJS(true)
        .onUpdate((event) => {
          translateX.value = event.translationX;
        })
        .onEnd((event) => {
          const threshold = width * DRAG_RATIO;
          const isNext = event.translationX < -threshold || event.velocityX < -FLICK_VELOCITY;
          const isPrev = event.translationX > threshold || event.velocityX > FLICK_VELOCITY;

          if (isNext) {
            navigate('next');
          } else if (isPrev) {
            navigate('prev');
          } else {
            // Not enough drag — ease back to center (no overshoot).
            translateX.value = withTiming(0, { duration: 180, easing: SETTLE_EASING });
          }
        }),
    [translateX, width, navigate],
  );

  // The row holds prev/current/next side by side; -width centers the middle one.
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + translateX.value }],
  }));

  // Initial position: the agenda opens at TODAY (first section on/after it),
  // not at the oldest past plan — nobody wants to land on yesterday.
  const didInitialScroll = useRef(false);

  const handleSectionLayout = useCallback(
    (key: string, y: number) => {
      sectionOffsets.current[key] = y;

      if (didInitialScroll.current) return;
      const todayKey = dateKey(new Date());
      const targetKey = sections.find((s) => s.key >= todayKey)?.key;
      if (!targetKey || sectionOffsets.current[targetKey] === undefined) return;

      didInitialScroll.current = true;
      const targetY = sectionOffsets.current[targetKey];
      if (targetY > 0) {
        setScrollActiveKey(targetKey);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y: Math.max(0, targetY - 8), animated: false });
        });
      }
    },
    [sections],
  );

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollY = e.nativeEvent.contentOffset.y;
    let activeKey: string | null = null;
    let maxY = -Infinity;
    for (const [key, y] of Object.entries(sectionOffsets.current)) {
      if (y <= scrollY + 100 && y > maxY) {
        maxY = y;
        activeKey = key;
      }
    }
    setScrollActiveKey(activeKey);
  }, []);

  // Scroll the agenda to a day. If that exact day has no plans, jump to the first
  // section on/after it (keys are yyyy-mm-dd so string order is chronological).
  const scrollAgendaTo = useCallback(
    (key: string) => {
      const exact = sectionOffsets.current[key];
      const targetKey = exact !== undefined ? key : sections.find((s) => s.key >= key)?.key;
      const y = targetKey ? sectionOffsets.current[targetKey] : undefined;
      if (y !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      }
    },
    [sections],
  );

  // Month grid: tapping a day selects it (visual) and scrolls the agenda there.
  function selectDay(key: string) {
    const next = selectedKey === key ? null : key;
    setSelectedKey(next);
    if (next) scrollAgendaTo(next);
  }

  // Week strip / day tap: scroll the agenda to that day — the highlight then
  // follows via the scroll handler.
  function focusDay(key: string) {
    scrollAgendaTo(key);
  }

  function toggleViewMode() {
    setSelectedKey(null);
    setViewMode((prev) => {
      if (prev === 'week') {
        const now = new Date();
        setGridMonth({ year: now.getFullYear(), month: now.getMonth() });
        return 'month';
      }
      return 'week';
    });
  }

  return (
    <View style={{ flex: 1 }} className="bg-background">
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <Animated.View
          className="flex-1"
          entering={reducedMotion ? undefined : FadeIn.duration(220)}
        >
          <View className="pb-3 pt-3">
            <CalendarHeader viewMode={viewMode} onToggleViewMode={toggleViewMode} />

            {viewMode === 'week' ? (
              // Day-wise horizontal scroller — snaps one day at a time.
              <View className="mt-4 border-y border-border bg-card/45 py-1.5">
                <WeekStrip activeKey={highlightKey} onSelect={focusDay} />
              </View>
            ) : (
              // Month carousel — snaps one month at a time (3-panel, no wobble).
              <View className="mt-3 overflow-hidden">
                <GestureDetector gesture={swipeGesture}>
                  <Animated.View style={[{ flexDirection: 'row', width: width * 3 }, stripStyle]}>
                    {[-1, 0, 1].map((offset) => {
                      const m = addMonths(gridMonth, offset);
                      return (
                        <View key={offset} style={{ width }}>
                          <MonthGrid
                            year={m.year}
                            month={m.month}
                            selectedKey={selectedKey}
                            activeKey={highlightKey}
                            markedKeys={markedKeys}
                            onSelect={selectDay}
                            onPrev={() => navigate('prev')}
                            onNext={() => navigate('next')}
                          />
                        </View>
                      );
                    })}
                  </Animated.View>
                </GestureDetector>
              </View>
            )}
          </View>

          {sections.length === 0 ? (
            <EmptyCalendarState onGoToMap={onGoToMap} />
          ) : (
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              contentContainerStyle={{ paddingBottom: 130 }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={handleScroll}
            >
              <AgendaList
                sections={sections}
                expandedPlanId={expandedPlanId}
                onTogglePlan={(planId) =>
                  setExpandedPlanId((prev) => (prev === planId ? null : planId))
                }
                onOpenChat={(plan: Plan) =>
                  setChatPlan({
                    id: plan.activityId ?? plan.id,
                    title: plan.title,
                    count:
                      findActivityById(plan.activityId ?? plan.id)?.participantCount ??
                      plan.people.length,
                  })
                }
                onSectionLayout={handleSectionLayout}
              />
            </ScrollView>
          )}
        </Animated.View>
      </SafeAreaView>

      <Modal
        visible={chatPlan !== null}
        animationType="slide"
        onRequestClose={() => setChatPlan(null)}
      >
        {chatPlan ? (
          <ActivityChatView
            activityId={chatPlan.id}
            title={chatPlan.title}
            count={chatPlan.count}
            onBack={() => setChatPlan(null)}
          />
        ) : null}
      </Modal>
    </View>
  );
}
