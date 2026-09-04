import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Extrapolation,
  LinearTransition,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ProposalData } from '@/features/chat';
import { useAuth } from '@/features/auth';
import { useThemeColors } from '@/features/theme';
import {
  ACTIVITY_MARKER_VISIBLE_ABOVE_ANCHOR,
  ACTIVITY_MARKER_VISIBLE_BELOW_ANCHOR,
} from '@/features/map/components/activityMarkerLayout';
import type { MapCoordinate, MapSelection, MarkerAvatar } from '@/features/map/types/map.types';
import { maximumFocusBottomCoveredHeight } from '@/features/map/utils/focusFraming';
import { colorWithAlpha, markerModeStyles } from '@/features/map/utils/markerStyles';
import { PressableScale } from '@/shared/components/PressableScale';
import { concentricRadius, FLOATING_SHEET } from '@/shared/theme';

import { FloatingSheet } from './FloatingSheet';
import { ActivityContent } from './markerDetail/ActivityContent';
import { ActivityParticipantsContent } from './markerDetail/ActivityParticipantsContent';
import { ActivityStackContent } from './markerDetail/ActivityStackContent';
import { PlaceContent } from './markerDetail/PlaceContent';
import { PlanningContent } from './markerDetail/PlanningContent';
import { ParticipantProfileSheet } from './markerDetail/ParticipantProfileSheet';
import { isActivitySelection } from './markerDetail/types';
import { useKeyboardHeight } from '@/features/chat/utils/useKeyboardHeight';

// Chat-sheet snap points as % of the keyboard-aware container. Dragging below
// the release threshold collapses back to the activity details.
const CHAT_SNAP_LOW = 60;
const CHAT_SNAP_HIGH = 92;
const CHAT_DISMISS_BELOW = CHAT_SNAP_LOW - 12;
/** Critically damped (critical is ~34.6 here) and overshoot-clamped: a snap
 * point the sheet springs PAST and returns to reads as the chat wobbling, not
 * as it settling. The spring stays because a flick has to be catchable
 * mid-flight. */
const CHAT_SPRING = { damping: 35, stiffness: 300, mass: 1, overshootClamping: true };
const ACTIVITY_FOCUS_INSETS = {
  above: ACTIVITY_MARKER_VISIBLE_ABOVE_ANCHOR,
  below: ACTIVITY_MARKER_VISIBLE_BELOW_ANCHOR,
} as const;

function detailSelectionKey(selection: MapSelection | null) {
  if (!selection) return 'none';
  switch (selection.type) {
    case 'Planning':
      return `planning:${selection.planId}`;
    case 'Avatar':
    case 'Cluster':
    case 'ActivityStack':
      return `${selection.type}:${selection.id}`;
    case 'Place':
      return `place:${selection.placeId ?? `${selection.coordinate.latitude}:${selection.coordinate.longitude}`}`;
    case 'Action':
      return `action:${selection.title}:${selection.subtitle}`;
  }
}

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
  /**
   * Where the shown marker currently sits on screen, so the card can grow out
   * of it and shrink back into it. Supplied by the map, which is the only
   * thing that can answer it — a marker is a native image, not a node to
   * measure. Absent (or answering `null`) simply means the card grows from its
   * own base, which is what the browser preview and every selection without a
   * pin get.
   */
  projectCoordinate?: (coordinate: MapCoordinate) => Promise<{ x: number; y: number } | null>;
  /** How much of the map this sheet currently covers, in px. The camera needs
   * it to centre a selection in the VISIBLE map, not behind the sheet. */
  onHeightChange?: (height: number) => void;
  /** Bottom edge of persistent map controls, measured from the screen top. */
  topMapOcclusionHeight?: number;
  onClose: () => void;
  /** A round that just became a real Activity — open it. */
  onOpenPlannedActivity?: (activityId: string) => void;
  onOpenStackItem?: (id: string, planning: boolean) => void;
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
  projectCoordinate,
  onHeightChange,
  topMapOcclusionHeight = 0,
  onClose,
  onOpenPlannedActivity,
  onOpenStackItem,
}: MarkerDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [shownSelection, setShownSelection] = useState<MapSelection | null>(selection);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [activityView, setActivityView] = useState<'detail' | 'participants'>('detail');
  const [planningView, setPlanningView] = useState<'summary' | 'full' | 'members'>('summary');
  const [planningViewSelection, setPlanningViewSelection] = useState<Extract<
    MapSelection,
    { type: 'Planning' }
  > | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<MarkerAvatar | null>(null);
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(visible ? 1 : 0);
  // Live-resizable chat height (% of the keyboard-aware container), driven by
  // the pan gesture on the handle and the size toggle. Percent (not px) so the
  // sheet keeps shrinking with the keyboard exactly like the old fixed values.
  const chatPct = useSharedValue(CHAT_SNAP_LOW);
  const dragStartPct = useSharedValue(CHAT_SNAP_LOW);
  const keyboardHeight = useKeyboardHeight();
  const containerHeight = useSharedValue(0);
  /**
   * The room the sheet may actually occupy — the container MINUS its live
   * bottom padding, which is the frame inset at rest and the keyboard height
   * while it is up. The snap points are a percentage of this, and Yoga
   * resolves the sheet's `height: %` against the same content box.
   *
   * Derived rather than measured: `onLayout` reports the border box and does
   * not fire again when the keyboard moves, so the drag maths used the full
   * screen height while a ~1000 px keyboard was open and converted finger
   * travel at roughly 1.7× — the handle felt sluggish exactly when the
   * composer was in use.
   */
  const parentHeight = useDerivedValue(() =>
    Math.max(1, containerHeight.value - FLOATING_SHEET.inset - Math.abs(keyboardHeight.value)),
  );
  const sheetHeight = useSharedValue(0);
  const keepsActivityMarkerVisible = Boolean(
    shownSelection && shownSelection.type !== 'Place' && shownSelection.type !== 'Action',
  );
  const maximumDetailCoveredHeight = maximumFocusBottomCoveredHeight(
    topMapOcclusionHeight,
    windowHeight,
    keepsActivityMarkerVisible ? ACTIVITY_FOCUS_INSETS : undefined,
  );
  const detailMaxHeightFraction = Math.min(
    FLOATING_SHEET.maxHeightFraction,
    Math.max(0, maximumDetailCoveredHeight - FLOATING_SHEET.inset) /
      Math.max(1, windowHeight - FLOATING_SHEET.inset * 2),
  );

  // This must run before paint. A normal effect lets a previously opened
  // matching drill-in render for one frame before the compact summary resets.
  useLayoutEffect(() => {
    if (!selection) return;
    setShownSelection(selection);
    setPlanningView('summary');
    setPlanningViewSelection(null);
  }, [selection]);

  // Reset the chat expansion whenever a different activity is shown or the sheet closes.
  const selectionKey = detailSelectionKey(selection);
  useEffect(() => {
    setChatExpanded(false);
    setChatFullscreen(false);
    setActivityView('detail');
    setSelectedParticipant(null);
  }, [selectionKey, visible]);

  useEffect(() => {
    if (visible) {
      setPlanningView('summary');
      setPlanningViewSelection(null);
      setMounted(true);
      progress.value = withTiming(1, { duration: reducedMotion ? 0 : 260 });
      return;
    }

    setPlanningView('summary');
    setPlanningViewSelection(null);

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

  // Derived BEFORE the early return: the keyboard style is a hook and must run
  // on every render, so nothing it depends on may sit behind a conditional exit.
  const activitySelection = shownSelection ? isActivitySelection(shownSelection) : null;
  const participantView = Boolean(activitySelection) && activityView === 'participants';
  const selectedPlanning = selection?.type === 'Planning' ? selection : null;
  const effectivePlanningView =
    selectedPlanning !== null && planningViewSelection === selectedPlanning
      ? planningView
      : 'summary';
  const planningDrillIn = selectedPlanning !== null && effectivePlanningView !== 'summary';
  // When joined AND the chat is expanded, the sheet becomes a tall chat surface.
  const chatMode = Boolean(activitySelection) && joined && chatExpanded && !participantView;
  /**
   * Bottom padding = the frame inset PLUS the keyboard, not the larger of the
   * two. `useKeyboardPadding` takes the maximum, which is right for a grounded
   * sheet whose resting inset is the home indicator — the keyboard covers that
   * area anyway. This sheet floats, so its 8 dp is a visible frame on all four
   * sides: taking the maximum let the keyboard swallow the bottom edge and the
   * sheet sat flush on it, framed on three sides only.
   *
   * Written here rather than in the shared hook because the other two chat
   * surfaces are grounded and want the maximum.
   */
  const keyboardPadding = useAnimatedStyle(() => ({
    paddingBottom: FLOATING_SHEET.inset + (chatMode ? Math.abs(keyboardHeight.value) : 0),
  }));

  /**
   * Roughly a marker's own footprint. The card starts at that size and with a
   * matching corner radius, so the first frames read as the marker growing
   * rather than as a rectangle appearing on top of it.
   */
  const MARKER_ORIGIN = 56;
  const originCoordinate =
    shownSelection && 'targetCoordinate' in shownSelection
      ? shownSelection.targetCoordinate
      : shownSelection && 'coordinate' in shownSelection
        ? shownSelection.coordinate
        : undefined;
  const originLat = originCoordinate?.latitude;
  const originLng = originCoordinate?.longitude;
  /**
   * Asked fresh on the way in AND on the way out — never cached. Between the
   * two the user may have panned, and a card shrinking into the spot the
   * marker USED to occupy is worse than one that simply settles.
   */
  const resolveOrigin = useCallback(async () => {
    if (!projectCoordinate || originLat == null || originLng == null) return null;
    const point = await projectCoordinate({ latitude: originLat, longitude: originLng });
    if (!point) return null;
    // A marker off the visible map is no origin: the card would fly in from
    // beyond the edge, which reads as an object entering from nowhere rather
    // than as this marker opening. Growing from its own base is the honest
    // answer — the same one a selection without a pin gets.
    const onScreen =
      point.x >= -MARKER_ORIGIN &&
      point.y >= -MARKER_ORIGIN &&
      point.x <= windowWidth + MARKER_ORIGIN &&
      point.y <= windowHeight + MARKER_ORIGIN;
    if (!onScreen) return null;
    return {
      x: point.x - MARKER_ORIGIN / 2,
      y: point.y - MARKER_ORIGIN / 2,
      width: MARKER_ORIGIN,
      height: MARKER_ORIGIN,
    };
  }, [originLat, originLng, projectCoordinate, windowHeight, windowWidth]);

  if (!mounted || !shownSelection) return null;

  const closeDetail = () => {
    setPlanningView('summary');
    setPlanningViewSelection(null);
    onClose();
  };

  const stackSelection = shownSelection.type === 'ActivityStack' ? shownSelection : null;
  /** Mode colour of the shown activity — the seed the sheet morphs out of, so
   * it must keep matching the marker it grew from. */
  const originAccent = activitySelection
    ? markerModeStyles[activitySelection.mode].color
    : stackSelection?.activities[0]
      ? markerModeStyles[stackSelection.activities[0].mode].color
      : markerModeStyles.now.color;
  /* Chrome icons are neutral ink, never the mode accent. A green X reads as a
     state ("this is a now activity") on a control that only ever does one
     thing, and the same glyph then changed colour between two sheets that
     close identically. Colour on this surface belongs to the mode dot, the
     wash and the CTA. */
  const chromeIconColor = themeColors.foreground;

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

  const sheetSurface = themeColors.card;
  const sheetBorder = themeColors.border;
  /** Reads against the card, which is near-white in light mode — the sheet's
   * default grabber is tuned for the dark composer and vanishes there. */
  const sheetGrabber = colorWithAlpha(themeColors.foreground, 0.22);
  /* The chat keeps its OWN shell (drag snap points on the very grabber
     `FloatingSheet` claims for dismissal) but not its own LOOK: same frame
     inset, same concentric corners, same hairline, same grabber. Crossing from
     the card into the chat is one object changing size, and an edge-to-edge
     surface with different corners made it read as a second sheet arriving
     from somewhere else. */
  const chatInset = FLOATING_SHEET.inset;
  const chatRadius = concentricRadius(FLOATING_SHEET.screenRadius, chatInset);
  /* The frame is measured from the SCREEN edge, so the home indicator's own
     inset is only worth the part that clears the frame. */
  const chatInsetBottom = Math.max(0, insets.bottom - chatInset);

  /* Soft mode tint fading from the top edge — a gradient, never a hard
     edged block, so the tint cannot cut across content. Handed to the
     sheet as its surface layer so it also covers the grabber strip and
     the bottom inset, not just the content. */
  const modeWash = activitySelection ? (
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
  ) : null;

  const body = (
    <>
      {planningDrillIn ? (
        <View className="mb-3 flex-row items-center gap-3 pr-12">
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Zurück zur Übersicht"
            className="h-10 w-10 items-center justify-center rounded-full bg-secondary/80"
            haptic={false}
            onPress={() => {
              setPlanningView('summary');
              setPlanningViewSelection(null);
            }}
          >
            <Ionicons name="chevron-back" size={22} color={chromeIconColor} />
          </PressableScale>
          <View className="flex-1">
            <Text className="text-xl font-bold text-foreground">
              {effectivePlanningView === 'members' ? 'Teilnehmer' : 'Terminfindung'}
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
            <Ionicons name="chevron-back" size={22} color={chromeIconColor} />
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
          backdrop tap still closes everything — one control per intention.
          It sits in the top-right corner ON the title line: inset by 16 px it
          hung down into the mode row and covered the host's "Bearbeiten" pill,
          which shares that right edge. `right-5` mirrors the wrapper's `px-5`
          BY HAND — an absolute child is laid out against the padding box, so
          the column inset is not inherited and `right-0` lands on the sheet
          edge, out of line with every other row. */}
      {!chatMode ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Detail schließen"
          className="absolute right-5 top-0 z-10 h-10 w-10 items-center justify-center rounded-full bg-secondary/80"
          haptic={false}
          onPress={closeDetail}
        >
          <Ionicons name="close" size={20} color={chromeIconColor} />
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
          ) : shownSelection.type === 'ActivityStack' ? (
            <ActivityStackContent
              activities={shownSelection.activities}
              onSelect={onOpenStackItem}
            />
          ) : shownSelection.type === 'Planning' ? (
            <PlanningContent
              selection={shownSelection}
              onOpenActivity={onOpenPlannedActivity}
              onClose={closeDetail}
              view={effectivePlanningView}
              onOpenMembers={() => {
                if (!selectedPlanning) return;
                setPlanningViewSelection(selectedPlanning);
                setPlanningView('members');
              }}
              onOpenMatching={() => {
                if (!selectedPlanning) return;
                setPlanningViewSelection(selectedPlanning);
                setPlanningView('full');
              }}
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
              <Text className="pr-12 text-2xl font-bold text-foreground">
                {shownSelection.title}
              </Text>
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
    </>
  );

  /**
   * The overview is a floating card that grows out of its marker; the chat is a
   * resizable working surface. Two different things, so two different shells —
   * and the chat keeps the old one deliberately: `FloatingSheet` is
   * content-sized with a ceiling, while the chat drags between 60 % and 92 %
   * with its own snap physics on the very grabber `FloatingSheet` claims for
   * dismissal. The floating margin would be wrong there too: a card may look
   * light, a working surface needs the whole width.
   *
   * Crossing over closes the card WITHOUT its exit morph (`instantClose`) —
   * the chat opens in the same frame and grows from the height the card just
   * reported, so a flight back to the marker in between would be a detour
   * nobody asked for.
   */
  if (!chatMode) {
    return (
      <FloatingSheet
        contentKey={detailSelectionKey(shownSelection)}
        maxHeightFraction={detailMaxHeightFraction}
        visible={visible}
        onRequestClose={closeDetail}
        resolveOrigin={resolveOrigin}
        instantClose={instantClose}
        onHeightChange={(covered) => {
          sheetHeight.value = covered;
          onHeightChange?.(covered);
        }}
        surfaceColor={sheetSurface}
        borderColor={sheetBorder}
        grabberColor={sheetGrabber}
        originColor={colorWithAlpha(originAccent, 0.16)}
        originBorderColor={colorWithAlpha(originAccent, 0.72)}
        accessibilityLabel={shownSelection.title}
        surfaceLayer={modeWash}
      >
        <View className="px-5">{body}</View>
      </FloatingSheet>
    );
  }

  return (
    /* A plain View: the app's only `GestureHandlerRootView` lives at the root
       (`app/_layout.tsx`). A nested one intercepts touches for the whole screen
       in `dispatchTouchEvent`, past `pointerEvents`, which killed the map
       underneath — see the note in FloatingSheet. */
    <View
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
        style={[keyboardPadding, { paddingLeft: chatInset, paddingRight: chatInset }]}
        pointerEvents="box-none"
        onLayout={(event) => {
          // Raw border box — `parentHeight` subtracts the live padding.
          containerHeight.value = event.nativeEvent.layout.height;
        }}
      >
        <Animated.View
          layout={reducedMotion ? undefined : LinearTransition.duration(240)}
          className="px-5"
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
            {
              backgroundColor: sheetSurface,
              borderColor: sheetBorder,
              borderRadius: chatRadius,
              borderWidth: 1,
              // All four corners are rounded now, so the thread has to be
              // clipped by them instead of running under them.
              overflow: 'hidden',
              paddingBottom: chatInsetBottom,
            },
            sheetStyle,
            chatHeightStyle,
          ]}
          pointerEvents={visible ? 'auto' : 'none'}
        >
          {modeWash}

          {/* Drag zone: generous hit area around the handle. In chat mode it
              resizes the sheet between the snap points; a decisive downward
              drag returns to the details. Screen-reader users resize via the
              adjustable actions instead of the gesture. */}
          <GestureDetector gesture={chatDragGesture}>
            <View
              collapsable={false}
              className="-mx-5 items-center"
              style={{ paddingBottom: 6, paddingTop: 10 }}
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
              <View
                style={{ backgroundColor: sheetGrabber, borderRadius: 2, height: 4, width: 40 }}
              />
            </View>
          </GestureDetector>

          {body}
        </Animated.View>
      </Animated.View>
    </View>
  );
}
