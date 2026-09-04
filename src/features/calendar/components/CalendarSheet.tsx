import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useActivityEntities } from '@/features/activities';
import { activityChatAccent, GROUP_CHAT_ACCENT, useActivityChat } from '@/features/chat';
import { colorWithAlpha } from '@/features/map/utils/markerStyles';
import {
  FloatingSheet,
  type SheetOriginResolver,
} from '@/features/overlay/components/FloatingSheet';
import { FloatingSheetHeader } from '@/features/overlay/components/FloatingSheetHeader';
import { useThemeColors } from '@/features/theme';
import { FLOATING_SHEET } from '@/shared/theme';

import type { Plan } from '../types/calendar.types';
import { dateKey, dateKeyFromIso } from '../utils/formatPlanTime';
import { groupPlansByDate } from '../utils/groupPlansByDate';
import { AgendaList } from './AgendaList';
import { CalendarToolbar, type CalendarViewMode } from './CalendarToolbar';
import { EmptyCalendarState } from './EmptyCalendarState';
import { MonthGrid } from './MonthGrid';
import { WeekStrip } from './WeekStrip';

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

export interface CalendarChatTarget {
  id: string;
  title: string;
  accent: string;
  kind: 'activity';
  memberCount: number;
}

export interface CalendarSheetProps {
  visible: boolean;
  onClose: () => void;
  onEditActivity: (activityId: string) => void;
  /** Chat opens in the host's ONE chat surface, never in a second modal here. */
  onOpenChat: (target: CalendarChatTarget) => void;
  /**
   * The control this was opened from — the top-bar button or the Core. The card
   * grows out of it and flies back into it; without one it grows from its own
   * bottom edge, which is only right for a control that happens to sit there.
   */
  resolveOrigin?: SheetOriginResolver;
}

/**
 * Your plans, as a floating card over the map — the same shell an activity
 * overview uses, not a screen of its own.
 *
 * It used to be a second main "mode" that took the whole display and needed a
 * bottom control to get back out of. Being a card is what removes that control:
 * the map stays visible all around it, the close button in the header is the
 * way out, and it grows out of the Core like every other Core target.
 *
 * Deliberately NO create action. The calendar answers "what have I got on",
 * and starting something is what the Core is for — a second entry point here
 * was two buttons for one job, one of them on a surface you opened to READ.
 */
export function CalendarSheet({
  visible,
  onClose,
  onEditActivity,
  onOpenChat,
  resolveOrigin,
}: CalendarSheetProps) {
  const { plans, findActivityById } = useActivityEntities();
  const { isJoined } = useActivityChat();
  const reducedMotion = useReducedMotion();
  const themeColors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});

  /**
   * The week wheel and the month carousel both snap by the page, and their page
   * is the width of the SHEET, not of the screen — inside a floating card the
   * two differ by the frame on either side, so the window width pushed the last
   * day of every week past the right edge.
   *
   * Derived from the same constant FloatingSheet measures its own geometry
   * from, so the two cannot drift apart.
   */
  const contentWidth = Math.max(0, windowWidth - FLOATING_SHEET.inset * 2);

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
      const target = dir === 'next' ? -contentWidth : contentWidth;
      translateX.value = withTiming(
        target,
        { duration: EXIT_MS, easing: SETTLE_EASING },
        (finished) => {
          if (finished) runOnJS(commit)(dir);
        },
      );
    },
    [commit, contentWidth, reducedMotion, translateX],
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
          const threshold = contentWidth * DRAG_RATIO;
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
    [contentWidth, navigate, translateX],
  );

  // The row holds prev/current/next side by side; -contentWidth centers the middle one.
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -contentWidth + translateX.value }],
  }));

  // Initial position: the agenda opens at TODAY (first section on/after it),
  // not at the oldest past plan — nobody wants to land on yesterday.
  const didInitialScroll = useRef(false);

  /**
   * A card unmounts its content when it closes, unlike the always-mounted mode
   * layer this replaced. So the agenda's scroll offset is gone by the next open
   * while the "scroll to today" guard would still be spent — the reopened card
   * would land on the oldest past plan. Arming it again is also the behaviour
   * you want: your plans open at today, every time.
   */
  useEffect(() => {
    if (visible) return;
    didInitialScroll.current = false;
    sectionOffsets.current = {};
    setScrollActiveKey(null);
    setExpandedPlanId(null);
  }, [visible]);

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

  function openChat(plan: Plan) {
    const roomId = plan.activityId ?? plan.id;
    const activity = findActivityById(roomId);
    onOpenChat({
      id: roomId,
      title: plan.title,
      // Same room, same colour as on the map and in the Postfach.
      accent: activity ? activityChatAccent(activity.mode) : GROUP_CHAT_ACCENT,
      kind: 'activity',
      memberCount: activity?.participantCount ?? plan.people.length,
    });
  }

  return (
    <FloatingSheet
      visible={visible}
      onRequestClose={onClose}
      resolveOrigin={resolveOrigin}
      surfaceColor={themeColors.card}
      borderColor={themeColors.border}
      grabberColor={colorWithAlpha(themeColors.foreground, 0.22)}
      originColor={colorWithAlpha(themeColors.primary, 0.16)}
      originBorderColor={colorWithAlpha(themeColors.primary, 0.72)}
      accessibilityLabel="Deine Pläne"
    >
      {/* No `flex-1` down this column — FloatingSheet is as tall as its content
          and a flex child would claim the ceiling on every open. `flexShrink`
          runs unbroken from here to the agenda, which is the part that gives
          way and scrolls once the card reaches its cap. */}
      <View style={styles.body}>
        <FloatingSheetHeader
          icon="calendar-outline"
          /* The app's own ink, deliberately not a mode colour: the card holds
             both `soon` and `now` plans, so claiming either would be a lie
             about half of them. */
          accent={themeColors.primary}
          surface={themeColors.card}
          title="Deine Pläne"
          subtitle="Nur Aktivitäten, bei denen du dabei bist"
          closeLabel="Pläne schließen"
          onClose={onClose}
        />

        <CalendarToolbar viewMode={viewMode} onToggleViewMode={toggleViewMode} />

        {viewMode === 'week' ? (
          // Day-wise horizontal scroller — snaps one day at a time.
          <View className="mt-2 border-y border-border bg-card/45 py-1.5">
            <WeekStrip width={contentWidth} activeKey={highlightKey} onSelect={focusDay} />
          </View>
        ) : (
          // Month carousel — snaps one month at a time (3-panel, no wobble).
          <View className="mt-1 overflow-hidden">
            <GestureDetector gesture={swipeGesture}>
              <Animated.View
                style={[{ flexDirection: 'row', width: contentWidth * 3 }, stripStyle]}
              >
                {[-1, 0, 1].map((offset) => {
                  const m = addMonths(gridMonth, offset);
                  return (
                    <View key={offset} style={{ width: contentWidth }}>
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

        {sections.length === 0 ? (
          <EmptyCalendarState />
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
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
              onOpenChat={openChat}
              onEditActivity={(plan) => onEditActivity(plan.activityId ?? plan.id)}
              onSectionLayout={handleSectionLayout}
            />
          </ScrollView>
        )}
      </View>
    </FloatingSheet>
  );
}

const styles = StyleSheet.create({
  body: { flexShrink: 1 },
  /** `flexShrink: 1`, never `flex: 1`: the card must stay free to be short when
   * you have two plans, and to give way here when you have thirty. */
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 8, paddingTop: 4 },
});
