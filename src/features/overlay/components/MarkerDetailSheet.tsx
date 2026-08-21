import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Extrapolation,
  LinearTransition,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ProposalData } from '@/features/chat';
import { useAuth } from '@/features/auth';
import type { MapSelection, MarkerAvatar } from '@/features/map/types/map.types';
import { markerModeStyles } from '@/features/map/utils/markerStyles';
import { PressableScale } from '@/shared/components/PressableScale';

import { ActivityContent } from './markerDetail/ActivityContent';
import { ActivityParticipantsContent } from './markerDetail/ActivityParticipantsContent';
import { PlaceContent } from './markerDetail/PlaceContent';
import { PlanningContent } from './markerDetail/PlanningContent';
import { ParticipantProfileSheet } from './markerDetail/ParticipantProfileSheet';
import { isActivitySelection } from './markerDetail/types';
import { useKeyboardPadding } from '@/features/chat/utils/useKeyboardHeight';

// Chat-sheet snap points as % of the keyboard-aware container. Dragging below
// the release threshold collapses back to the activity details.
const CHAT_SNAP_LOW = 60;
const CHAT_SNAP_HIGH = 92;
const CHAT_DISMISS_BELOW = CHAT_SNAP_LOW - 12;
const CHAT_SPRING = { damping: 26, stiffness: 300, mass: 1 };

export interface MarkerDetailSheetProps {
  visible: boolean;
  selection: MapSelection | null;
  joined?: boolean;
  joining?: boolean;
  /** True when the current user hosts this activity — shows the edit affordance. */
  canEdit?: boolean;
  onJoin?: () => void;
  onEdit?: () => void;
  onCreateAtSelection?: () => void;
  onOpenInMaps?: () => void;
  /** Route to the shown target — a Place's coordinate or an Activity's pin. */
  onStartRoute?: () => void;
  onFocusJourney?: (participantId?: string) => void;
  onCreateActivity?: (roomId: string, messageId: string, proposal: ProposalData) => void;
  onLeave?: () => void;
  onCancel?: () => void;
  /** Skip the close transition when its marker must immediately play a pop-off. */
  instantClose?: boolean;
  /** How much of the map this sheet currently covers, in px. The camera needs
   * it to centre a selection in the VISIBLE map, not behind the sheet. */
  onHeightChange?: (height: number) => void;
  onClose: () => void;
  /** A round that just became a real Activity — open it. */
  onOpenPlannedActivity?: (activityId: string) => void;
}

export function MarkerDetailSheet({
  visible,
  selection,
  joined = false,
  joining = false,
  canEdit = false,
  onJoin,
  onEdit,
  onCreateAtSelection,
  onOpenInMaps,
  onStartRoute,
  onFocusJourney,
  onCreateActivity,
  onLeave,
  onCancel,
  instantClose = false,
  onHeightChange,
  onClose,
  onOpenPlannedActivity,
}: MarkerDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [shownSelection, setShownSelection] = useState<MapSelection | null>(selection);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [activityView, setActivityView] = useState<'detail' | 'participants'>('detail');
  const [planningView, setPlanningView] = useState<'summary' | 'full' | 'members'>('summary');
  const [selectedParticipant, setSelectedParticipant] = useState<MarkerAvatar | null>(null);
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(visible ? 1 : 0);
  // Live-resizable chat height (% of the keyboard-aware container), driven by
  // the pan gesture on the handle and the size toggle. Percent (not px) so the
  // sheet keeps shrinking with the keyboard exactly like the old fixed values.
  const chatPct = useSharedValue(CHAT_SNAP_LOW);
  const dragStartPct = useSharedValue(CHAT_SNAP_LOW);
  const parentHeight = useSharedValue(0);
  const sheetHeight = useSharedValue(0);

  useEffect(() => {
    if (selection) setShownSelection(selection);
  }, [selection]);

  // Reset the chat expansion whenever a different activity is shown or the sheet closes.
  const selectionKey = selection && 'id' in selection ? selection.id : null;
  useEffect(() => {
    setChatExpanded(false);
    setChatFullscreen(false);
    setActivityView('detail');
    setSelectedParticipant(null);
  }, [selectionKey, visible]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: reducedMotion ? 0 : 260 });
      return;
    }

    if (instantClose) {
      progress.value = 0;
      setMounted(false);
      return;
    }

    progress.value = withTiming(0, { duration: reducedMotion ? 0 : 210 }, (finished) => {
      if (finished) {
        runOnJS(setMounted)(false);
      }
    });
  }, [instantClose, progress, reducedMotion, visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [32, 0], Extrapolation.CLAMP) }],
  }));

  const chatHeightStyle = useAnimatedStyle(() => ({
    height: `${chatPct.value}%` as const,
  }));

  // Derived BEFORE the early return: `useKeyboardPadding` is a hook and must run
  // on every render, so nothing it depends on may sit behind a conditional exit.
  const activitySelection = shownSelection ? isActivitySelection(shownSelection) : null;
  const participantView = Boolean(activitySelection) && activityView === 'participants';
  const planningId = shownSelection?.type === 'Planning' ? shownSelection.planId : null;
  const planningDrillIn = planningId !== null && planningView !== 'summary';
  // When joined AND the chat is expanded, the sheet becomes a tall chat surface.
  const chatMode = Boolean(activitySelection) && joined && chatExpanded && !participantView;
  const keyboardPadding = useKeyboardPadding(0, chatMode);

  // Sits with the other pre-return derivations: a drill-in left open must not
  // survive onto the next round the user taps.
  useEffect(() => {
    setPlanningView('summary');
  }, [planningId]);

  if (!mounted || !shownSelection) return null;

  const closeIconColor = activitySelection
    ? markerModeStyles[activitySelection.mode].color
    : markerModeStyles.now.color;

  const expandChat = () => {
    // Start the height animation from the sheet's measured detail height so
    // opening the chat grows smoothly instead of jumping to the snap point.
    if (parentHeight.value > 0 && sheetHeight.value > 0) {
      chatPct.value = Math.min(CHAT_SNAP_HIGH, (sheetHeight.value / parentHeight.value) * 100);
    }
    chatPct.value = reducedMotion ? CHAT_SNAP_LOW : withSpring(CHAT_SNAP_LOW, CHAT_SPRING);
    setChatFullscreen(false);
    setChatExpanded(true);
  };

  const collapseChat = () => {
    setChatFullscreen(false);
    setChatExpanded(false);
  };

  const setChatSize = (full: boolean) => {
    const target = full ? CHAT_SNAP_HIGH : CHAT_SNAP_LOW;
    chatPct.value = reducedMotion ? target : withSpring(target, CHAT_SPRING);
    setChatFullscreen(full);
  };

  // Drag the handle to resize the chat freely between the snap points; a
  // decisive drag below the low snap returns to the activity details.
  const chatDragGesture = Gesture.Pan()
    .enabled(chatMode)
    .activeOffsetY([-8, 8])
    .onStart(() => {
      dragStartPct.value = chatPct.value;
    })
    .onUpdate((event) => {
      const parent = parentHeight.value || 1;
      const next = dragStartPct.value - (event.translationY / parent) * 100;
      chatPct.value = Math.max(30, Math.min(CHAT_SNAP_HIGH, next));
    })
    .onEnd((event) => {
      const parent = parentHeight.value || 1;
      // Project a moment ahead so a flick settles where the motion points.
      const projected = chatPct.value - (event.velocityY / parent) * 100 * 0.12;
      if (projected < CHAT_DISMISS_BELOW) {
        runOnJS(collapseChat)();
        return;
      }
      const target =
        projected > (CHAT_SNAP_LOW + CHAT_SNAP_HIGH) / 2 ? CHAT_SNAP_HIGH : CHAT_SNAP_LOW;
      chatPct.value = reducedMotion ? target : withSpring(target, CHAT_SPRING);
      runOnJS(setChatFullscreen)(target === CHAT_SNAP_HIGH);
    });

  return (
    <GestureHandlerRootView
      pointerEvents="box-none"
      style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
    >
      <Animated.View
        // Keyboard padding instead of KeyboardAvoidingView: this sheet is an
        // absolutely-positioned overlay (not a native Modal window), where
        // KeyboardAvoidingView's auto-resize is unreliable on Android. Padding
        // the bottom-anchored ("justify-end") content by the live keyboard
        // frame clears it regardless of window resize behavior — and because
        // the value comes from the UI thread, it tracks the keyboard instead
        // of jumping to its final position.
        className="flex-1 justify-end"
        style={keyboardPadding}
        pointerEvents="box-none"
        onLayout={(event) => {
          parentHeight.value = event.nativeEvent.layout.height;
        }}
      >
        <Animated.View
          layout={reducedMotion ? undefined : LinearTransition.duration(240)}
          className="rounded-t-[30px] border border-border bg-card px-5 pt-3 shadow-xl"
          onLayout={(event) => {
            // Tracks the detail height so expanding the chat can animate from it.
            if (!chatMode) sheetHeight.value = event.nativeEvent.layout.height;
            // Same number, second consumer: the map camera centres a selection
            // in the strip of map this sheet leaves visible.
            //
            // Chat mode is deliberately excluded. Its height is an ANIMATED
            // layout property (`chatHeightStyle` sets `height: %`), so every
            // frame of a drag or spring fires onLayout — and the camera effect
            // that depends on this value would answer each one with its own
            // 300 ms animation. Dragging the chat handle turned into a stream
            // of camera moves under the sheet. Chat mode also covers 60–92%,
            // past the 80% cap where there is no map strip left to centre in,
            // so the number carries no information there anyway.
            if (!chatMode) onHeightChange?.(event.nativeEvent.layout.height);
          }}
          style={[
            sheetStyle,
            chatMode ? chatHeightStyle : null,
            // Participants size to their content (capped inside the list) — a
            // fixed tall sheet left odd empty space for small activities.
            chatMode ? { paddingBottom: insets.bottom } : { paddingBottom: insets.bottom + 18 },
          ]}
          pointerEvents={visible ? 'auto' : 'none'}
        >
          {/* Soft mode tint fading from the top edge — a gradient instead of a
              hard-edged color block, so the tint never cuts across content. */}
          {activitySelection ? (
            <View
              pointerEvents="none"
              style={{
                borderTopLeftRadius: 30,
                borderTopRightRadius: 30,
                height: 110,
                left: 0,
                overflow: 'hidden',
                position: 'absolute',
                right: 0,
                top: 0,
              }}
            >
              <Svg width="100%" height="100%">
                <Defs>
                  <LinearGradient id="sheet-mode-wash" x1="0" y1="0" x2="0" y2="1">
                    <Stop
                      offset="0"
                      stopColor={markerModeStyles[activitySelection.mode].color}
                      stopOpacity={0.1}
                    />
                    <Stop
                      offset="1"
                      stopColor={markerModeStyles[activitySelection.mode].color}
                      stopOpacity={0}
                    />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#sheet-mode-wash)" />
              </Svg>
            </View>
          ) : null}

          {/* Drag zone: generous hit area around the handle. In chat mode it
              resizes the sheet between the snap points; a decisive downward
              drag returns to the details. Screen-reader users resize via the
              adjustable actions instead of the gesture. */}
          <GestureDetector gesture={chatDragGesture}>
            <View
              collapsable={false}
              className="-mx-5 items-center pb-3 pt-1"
              accessible={chatMode}
              accessibilityRole={chatMode ? 'adjustable' : undefined}
              accessibilityLabel={chatMode ? 'Chat-Größe' : undefined}
              accessibilityValue={
                chatMode ? { text: chatFullscreen ? 'Groß' : 'Kompakt' } : undefined
              }
              accessibilityActions={
                chatMode
                  ? [
                      { name: 'increment', label: 'Chat vergrößern' },
                      { name: 'decrement', label: 'Chat verkleinern' },
                    ]
                  : undefined
              }
              onAccessibilityAction={(event) => {
                if (!chatMode) return;
                if (event.nativeEvent.actionName === 'increment') setChatSize(true);
                if (event.nativeEvent.actionName === 'decrement') setChatSize(false);
              }}
            >
              <View className="h-1.5 w-12 rounded-full bg-border" />
            </View>
          </GestureDetector>

          {planningDrillIn ? (
            <View className="mb-3 flex-row items-center gap-3 pr-12">
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Zurück zur Übersicht"
                className="h-10 w-10 items-center justify-center rounded-full bg-secondary/80"
                haptic={false}
                onPress={() => setPlanningView('summary')}
              >
                <Ionicons name="chevron-back" size={22} color={closeIconColor} />
              </PressableScale>
              <View className="flex-1">
                <Text className="text-xl font-bold text-foreground">
                  {planningView === 'members' ? 'Teilnehmer' : 'Terminfindung'}
                </Text>
              </View>
            </View>
          ) : null}

          {participantView ? (
            <View className="mb-3 flex-row items-center gap-3 pr-12">
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Zurück zu den Activity-Details"
                className="h-10 w-10 items-center justify-center rounded-full bg-secondary/80"
                haptic={false}
                onPress={() => setActivityView('detail')}
              >
                <Ionicons name="chevron-back" size={22} color={closeIconColor} />
              </PressableScale>
              <View className="flex-1">
                <Text className="text-xl font-bold text-foreground">Teilnehmer</Text>
                <Text className="mt-0.5 text-sm text-muted-foreground">
                  {activitySelection?.participantCount}
                  {activitySelection?.maxParticipants
                    ? ` von ${activitySelection.maxParticipants}`
                    : ''}{' '}
                  dabei
                </Text>
              </View>
            </View>
          ) : null}

          {/* Chat mode drops the floating close: back leads to the details and a
              backdrop tap still closes everything — one control per intention. */}
          {!chatMode ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Detail schließen"
              className="absolute right-5 top-4 z-10 h-10 w-10 items-center justify-center rounded-full bg-secondary/80"
              haptic={false}
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color={closeIconColor} />
            </PressableScale>
          ) : null}

          {(() => {
            const content =
              participantView && activitySelection ? (
                <ActivityParticipantsContent
                  selection={activitySelection}
                  currentUid={user?.id}
                  joined={joined}
                  onOpenProfile={setSelectedParticipant}
                />
              ) : activitySelection ? (
                <ActivityContent
                  selection={activitySelection}
                  joined={joined}
                  joining={joining}
                  chatExpanded={chatExpanded}
                  canEdit={canEdit}
                  onJoin={onJoin}
                  onEdit={onEdit}
                  onStartRoute={onStartRoute}
                  onExpandChat={expandChat}
                  onCollapseChat={collapseChat}
                  onOpenParticipants={() => setActivityView('participants')}
                  onFocusJourney={onFocusJourney}
                  onCreateActivity={onCreateActivity}
                  onLeave={onLeave}
                  onCancel={onCancel}
                />
              ) : shownSelection.type === 'Planning' ? (
                <PlanningContent
                  selection={shownSelection}
                  onOpenActivity={onOpenPlannedActivity}
                  onClose={onClose}
                  view={planningView}
                  onOpenMembers={() => setPlanningView('members')}
                  onOpenMatching={() => setPlanningView('full')}
                />
              ) : shownSelection.type === 'Place' ? (
                <PlaceContent
                  selection={shownSelection}
                  onCreateAtSelection={onCreateAtSelection}
                  onOpenInMaps={onOpenInMaps}
                  onStartRoute={onStartRoute}
                />
              ) : (
                <>
                  <Text className="text-2xl font-bold text-foreground">{shownSelection.title}</Text>
                  {/* Only when there IS an address — an empty line still carries
                      its top margin and leaves a gap under the name. */}
                  {shownSelection.subtitle ? (
                    <Text className="mt-2 text-base text-muted-foreground">
                      {shownSelection.subtitle}
                    </Text>
                  ) : null}
                </>
              );

            // Chat mode manages its own height + inner scroll. The participant
            // list scrolls itself (content-sized, capped). Everything else is
            // capped here so long content scrolls instead of clipping.
            if (chatMode) return <View className="flex-1">{content}</View>;
            if (participantView) return content;
            return (
              <ScrollView
                style={{ maxHeight: windowHeight * 0.72 }}
                contentContainerStyle={{ paddingBottom: 4 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {content}
              </ScrollView>
            );
          })()}
          {activitySelection ? (
            <ParticipantProfileSheet
              visible={selectedParticipant != null}
              participant={selectedParticipant}
              activityId={activitySelection.id}
              activityTitle={activitySelection.title}
              joined={joined}
              onClose={() => setSelectedParticipant(null)}
            />
          ) : null}
        </Animated.View>
      </Animated.View>
    </GestureHandlerRootView>
  );
}
