import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth';
import type { CoreActivitySummary } from '@/features/activities';
import type { SpontaneousRound } from '@/features/chat';
import type { JourneyParticipant } from '@/features/journey';
import { usePostfachBadge } from '@/features/mailbox';
import { useMapStyle } from '@/features/map/mapStyle/useMapStyle';
import { useOpenStatus } from '@/features/presence';
import { SafetyStartSheet, STATUS_COLOR, useSafety } from '@/features/safety';
import { loaderSizeForIcon, TogetherLoader } from '@/shared/components/brand/TogetherLoader';
import { PressableScale } from '@/shared/components/PressableScale';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

import type { CoreTargetId } from '../core/coreTargets';
import { measureSheetOrigin, type SheetOriginResolver } from './FloatingSheet';
import { useCoreHoldHint } from '../core/useCoreHoldHint';
import { FloatingSurface } from './FloatingSurface';
import { MapStyleMenu } from './MapStyleMenu';
import { RoundControl } from './RoundControl';
import { SpontaneousRoundControl } from './SpontaneousRoundControl';
import {
  TogetherCore,
  type CoreJourneyIndicator,
  type CoreOrbitState,
  type TogetherCoreHandle,
} from './TogetherCore';
import { useOverlayColors } from './overlayTheme';

/**
 * A one-directional fade hugging the top or bottom edge of the map.
 *
 * Each of these used to be a whole `<Svg>` tree — `Defs` + `LinearGradient` +
 * two `Stop`s + a `Rect` — for a two-stop fade, and three of them sat over a
 * live map. RN 0.86 draws gradients natively (`RCTLinearGradient` on iOS,
 * `LinearGradient.kt` on Android), so this is one View with one style.
 *
 * `experimental_backgroundImage` still carries its prefix: the value is stable
 * but the property may be renamed, which is why it lives in exactly one place.
 */
function MapScrim({
  edge,
  height,
  from,
  to,
}: {
  edge: 'top' | 'bottom';
  height: number;
  /** Colour at the edge the scrim hugs. */
  from: string;
  /** Colour at the far end — the same colour at zero alpha, never a hard cut. */
  to: string;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        ...(edge === 'top' ? { top: 0 } : { bottom: 0 }),
        height,
        experimental_backgroundImage: [
          {
            type: 'linear-gradient',
            // The gradient runs AWAY from the edge, so `from` sits on it.
            direction: edge === 'top' ? 'to bottom' : 'to top',
            colorStops: [{ color: from }, { color: to }],
          },
        ],
      }}
    />
  );
}

function RoundButton({
  accessibilityLabel,
  children,
  onPress,
  disabled = false,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <RoundControl accessibilityLabel={accessibilityLabel} disabled={disabled} onPress={onPress}>
      {children}
    </RoundControl>
  );
}

export interface MapOverlayProps {
  /** Bottom edge of the persistent top controls, measured from the screen top. */
  onTopOcclusionHeightChange?: (height: number) => void;
  /** Opens the activity composer in the chosen mode (Core orbit → Jetzt/Soon). */
  onCreateActivity: (mode: 'now' | 'soon') => void;
  onRecenter: () => void;
  recentering?: boolean;
  isOpen: boolean;
  /** The current user's running plan, or an upcoming plan inside the Core horizon. */
  coreActivity?: CoreActivitySummary | null;
  /** Earliest future plan, including plans outside the three-hour Core horizon. */
  nextActivity?: CoreActivitySummary | null;
  /** Core tap: publish on the open defaults and open the personal status sheet. */
  onOpenStatusPress: () => void;
  onCoreActivityPress: (activityId: string) => void;
  /** Friends currently open in range — shown only on the Freunde orbit target. */
  nearbyCount?: number;
  journeyFocusLabel?: string;
  journeyFocusError?: string | null;
  journeyParticipants?: JourneyParticipant[];
  /** A running Anreise. Rendered inside the Core, not as a surface of its own. */
  activeJourney?: CoreJourneyIndicator | null;
  onNearbyPress: () => void;
  onSearchPress?: () => void;
  onPostfachPress: () => void;
  /**
   * Opens the plans card, and hands over HOW to find the control that opened
   * it — the top-bar button or the Core — so the card can grow out of the thing
   * the thumb actually hit. A resolver rather than a rect: the card re-asks on
   * close, see `SheetOriginResolver`.
   */
  onCalendarPress: (origin: SheetOriginResolver) => void;
  onClearJourneyFocus?: () => void;
  onJourneyParticipantPress?: (participantId: string) => void;
  onActiveJourneyPress?: () => void;
  spontaneousRound?: SpontaneousRound | null;
  spontaneousRoundUnreadCount?: number;
  onSpontaneousRoundPress?: () => void;
  /** Perspective camera state — session only, never persisted. */
}

/**
 * Single overlay layer that floats absolutely over a fullscreen MapCanvas.
 * The controls use translucent liquid/glass surfaces and theme-aware icon
 * colors so they remain readable in light and dark mode.
 */
export function MapOverlay({
  onTopOcclusionHeightChange,
  onCreateActivity,
  onRecenter,
  recentering = false,
  isOpen,
  coreActivity = null,
  nextActivity = null,
  onOpenStatusPress,
  onCoreActivityPress,
  nearbyCount = 0,
  journeyFocusLabel,
  journeyFocusError,
  journeyParticipants = [],
  activeJourney = null,
  onNearbyPress,
  onSearchPress,
  onPostfachPress,
  onCalendarPress,
  onClearJourneyFocus,
  onJourneyParticipantPress,
  onActiveJourneyPress,
  spontaneousRound,
  spontaneousRoundUnreadCount = 0,
  onSpontaneousRoundPress,
}: MapOverlayProps) {
  const insets = useSafeAreaInsets();
  const colors = useOverlayColors();
  const { user } = useAuth();
  const postfachBadge = usePostfachBadge();
  const postfachBadgeCount = postfachBadge.count;
  const reducedMotion = useReducedMotion();
  // The core's countdown ring reads the window straight from the status, so it
  // can never disagree with the card that set it.
  const {
    expiresAt: openExpiresAt,
    openedAt: openOpenedAt,
    vibe: openVibe,
    shareLocation,
    shareLocationBlocked,
  } = useOpenStatus();
  const { preference: mapStyle, setPreference: setMapStyle } = useMapStyle();
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [coreOrbitState, setCoreOrbitState] = useState<CoreOrbitState>('closed');
  const coreOrbitVisible = coreOrbitState !== 'closed';
  const coreRef = useRef<TogetherCoreHandle>(null);
  /** The plans card's origin when it is opened from the top bar. */
  const calendarButtonRef = useRef<View | null>(null);
  // One element, one meaning (docs/safety-mode.md): the shield is ALWAYS and
  // ONLY the own Heimweg — start it, or return to the running console/panel.
  // Friends' walks live in the pulsing status pill below the search bar; the
  // shield never changes function based on what others do (muscle memory in
  // the moment of need must not break).
  const {
    session: safetySession,
    startingHeimweg,
    heimwegFocusActive,
    setConsoleMinimized,
  } = useSafety();
  const [safetyStartVisible, setSafetyStartVisible] = useState(false);
  const holdHint = useCoreHoldHint();
  const safetyColor = safetySession
    ? STATUS_COLOR[safetySession.status]
    : startingHeimweg
      ? STATUS_COLOR.blue
      : null;
  const postfachBadgeColor =
    postfachBadge.severity === 'critical'
      ? STATUS_COLOR.red
      : postfachBadge.severity === 'attention'
        ? STATUS_COLOR.orange
        : STATUS_COLOR.blue;
  const postfachBadgeAccessibilityLabel =
    postfachBadgeCount === 0
      ? 'Postfach'
      : [
          `Postfach, ${postfachBadgeCount} neue oder offene Einträge`,
          postfachBadge.severity === 'critical'
            ? 'Dringender Heimweg-Hinweis'
            : postfachBadge.severity === 'attention'
              ? 'Heimweg braucht deine Aufmerksamkeit'
              : null,
        ]
          .filter(Boolean)
          .join('. ');
  const remindOwnSession = Boolean(safetySession) || startingHeimweg;
  const shieldRing = useSharedValue(0);
  const shieldBreath = useSharedValue(0);
  const focusTransition = useSharedValue(heimwegFocusActive ? 1 : 0);
  const coreControlsTransition = useSharedValue(0);

  // Heimweg is a spatial map focus, not another screen. All chrome therefore
  // follows one coordinated progress value instead of unrelated fades.
  useEffect(() => {
    focusTransition.value = withTiming(heimwegFocusActive ? 1 : 0, {
      duration: reducedMotion ? 0 : heimwegFocusActive ? 360 : 320,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [focusTransition, heimwegFocusActive, reducedMotion]);

  // The orbit owns the immediate space around the core. Park only the two map
  // controls that compete with it; safety and spontaneous-round controls keep
  // their independent meanings and remain available.
  useEffect(() => {
    if (coreOrbitVisible) setStyleMenuOpen(false);
    coreControlsTransition.value = withTiming(coreOrbitVisible ? 1 : 0, {
      duration: reducedMotion ? 0 : coreOrbitVisible ? 120 : 170,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [coreControlsTransition, coreOrbitVisible, reducedMotion]);

  // Outside the Safety console the shield is the persistent reminder that
  // sharing continues. Severity controls the pace, never the tap behavior.
  useEffect(() => {
    if (!remindOwnSession || reducedMotion) {
      shieldRing.value = 0;
      shieldBreath.value = 0;
      return;
    }
    const ringDuration =
      safetySession?.status === 'red' ? 760 : safetySession?.status === 'orange' ? 1080 : 1800;
    const breathHalfDuration =
      safetySession?.status === 'red' ? 560 : safetySession?.status === 'orange' ? 760 : 1100;
    shieldRing.value = 0;
    shieldBreath.value = 0;
    shieldRing.value = withRepeat(
      withTiming(1, { duration: ringDuration, easing: Easing.out(Easing.cubic) }),
      -1,
      false,
    );
    shieldBreath.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: breathHalfDuration,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(0, {
          duration: breathHalfDuration,
          easing: Easing.inOut(Easing.cubic),
        }),
      ),
      -1,
    );
  }, [reducedMotion, remindOwnSession, safetySession?.status, shieldBreath, shieldRing]);

  const shieldPulseStyle = useAnimatedStyle(() => ({
    opacity: (1 - shieldRing.value) * 0.58,
    transform: [{ scale: 1 + shieldRing.value * 0.18 }],
  }));
  const shieldGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.13 + shieldBreath.value * 0.12,
    transform: [{ scale: 0.96 + shieldBreath.value * 0.06 }],
  }));
  const shieldIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + shieldBreath.value * 0.055 }],
  }));
  const profileTransitionStyle = useAnimatedStyle(() => {
    const progress = focusTransition.value;
    return {
      opacity: 1 - Math.min(1, progress / 0.68),
      transform: [{ translateX: -18 * progress }, { scale: 1 - 0.08 * progress }],
    };
  });
  const normalTopTransitionStyle = useAnimatedStyle(() => {
    const progress = focusTransition.value;
    return {
      opacity: 1 - Math.min(1, progress / 0.72),
      transform: [
        { translateX: 14 * progress },
        { translateY: -12 * progress },
        { scale: 1 - 0.025 * progress },
      ],
    };
  });
  const focusTopTransitionStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, Math.min(1, (focusTransition.value - 0.28) / 0.72));
    return {
      opacity: progress,
      transform: [{ translateX: 20 * (1 - progress) }, { scale: 0.94 + 0.06 * progress }],
    };
  });
  const normalBottomRightTransitionStyle = useAnimatedStyle(() => {
    const progress = focusTransition.value;
    return {
      opacity: 1 - Math.min(1, progress / 0.72),
      transform: [
        { translateX: 22 * progress },
        { translateY: 10 * progress },
        { scale: 1 - 0.035 * progress },
      ],
    };
  });
  const coreControlsTransitionStyle = useAnimatedStyle(() => {
    const progress = coreControlsTransition.value;
    return {
      opacity: 1 - progress,
      transform: [
        { translateX: 18 * progress },
        { translateY: 8 * progress },
        { scale: 1 - 0.06 * progress },
      ],
    };
  });
  const normalBottomCenterTransitionStyle = useAnimatedStyle(() => {
    const progress = focusTransition.value;
    return {
      opacity: 1 - Math.min(1, progress / 0.72),
      transform: [{ translateY: 24 * progress }, { scale: 1 - 0.035 * progress }],
    };
  });

  function onShieldPress() {
    if (safetySession) setConsoleMinimized(false);
    else if (startingHeimweg) return;
    else setSafetyStartVisible(true);
  }

  /**
   * The orbit reaches the SAME handlers the top bar already uses — the
   * redundancy is deliberate, so nothing depends on discovering the hold
   * gesture. `activity` never arrives here: it unfolds Jetzt/Soon inside the
   * Core, and both choices open the composer.
   */
  function handleCoreTarget(id: Exclude<CoreTargetId, 'activity'>) {
    if (id === 'search') onSearchPress?.();
    else if (id === 'nearby') onNearbyPress();
    else if (id === 'postfach') onPostfachPress();
    else onCalendarPress(() => coreRef.current?.measureOrigin() ?? Promise.resolve(null));
  }
  const profileInitials = (user?.displayName ?? 'Du')
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Soft top scrim so the status bar stays readable over the bright map */}
      <MapScrim
        edge="top"
        height={insets.top + 64}
        from="rgba(14, 17, 22, 0.4)"
        to="rgba(14, 17, 22, 0)"
      />

      {/* No fixed height. The row used to be h-12 — exactly as tall as its own
          48px buttons — so the drop shadow (offset 8 / radius 18) and the
          shield's pulse ring (-4px on every side) had nothing to render into
          and the circles came out flattened top and bottom. The padding gives
          that headroom back; `top` is shifted by the same amount so the
          buttons stay optically where they were. */}
      <Animated.View
        onLayout={(event) => {
          onTopOcclusionHeightChange?.(
            Math.max(0, insets.top - 2 + event.nativeEvent.layout.height),
          );
        }}
        style={{
          position: 'absolute',
          top: insets.top - 2,
          left: 16,
          right: 16,
          overflow: 'visible',
        }}
        className="flex-row items-center gap-3 py-3"
        entering={reducedMotion ? undefined : FadeIn.duration(180)}
        pointerEvents="box-none"
      >
        {/* Identity retracts; the shield deliberately remains a fixed anchor. */}
        <Animated.View
          accessibilityElementsHidden={heimwegFocusActive}
          importantForAccessibility={heimwegFocusActive ? 'no-hide-descendants' : 'auto'}
          pointerEvents={heimwegFocusActive ? 'none' : 'auto'}
          style={profileTransitionStyle}
        >
          <RoundButton accessibilityLabel="Profil öffnen" onPress={() => router.push('/profile')}>
            <Text className="text-base font-bold text-foreground">{profileInitials}</Text>
          </RoundButton>
        </Animated.View>
        {/* Shield = ALWAYS the own Heimweg (start, or back into the running
            console/panel). Tinted only by the OWN status; friends' walks are
            the pill's job. Never starts tracking or an alarm by itself. */}
        <Animated.View>
          {remindOwnSession && safetyColor ? (
            <Animated.View
              pointerEvents="none"
              className="absolute -bottom-1 -left-1 -right-1 -top-1 rounded-full border-2"
              style={[
                { borderColor: safetyColor },
                reducedMotion ? { opacity: 0.72 } : shieldPulseStyle,
              ]}
            />
          ) : null}
          <RoundButton
            accessibilityLabel={
              safetySession
                ? 'Eigener Heimweg aktiv. Heimweg öffnen'
                : startingHeimweg
                  ? 'Heimweg wird aktiviert'
                  : 'Sicher nach Hause'
            }
            onPress={onShieldPress}
          >
            {safetyColor ? (
              <Animated.View
                pointerEvents="none"
                className="absolute h-10 w-10 rounded-full"
                style={[
                  { backgroundColor: safetyColor },
                  reducedMotion ? { opacity: 0.18 } : shieldGlowStyle,
                ]}
              />
            ) : null}
            <Animated.View style={reducedMotion ? undefined : shieldIconStyle}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={safetyColor ?? colors.icon}
              />
            </Animated.View>
          </RoundButton>
        </Animated.View>

        <View className="h-12 flex-1">
          <Animated.View
            accessibilityElementsHidden={!heimwegFocusActive}
            importantForAccessibility={heimwegFocusActive ? 'auto' : 'no-hide-descendants'}
            pointerEvents={heimwegFocusActive ? 'auto' : 'none'}
            className="items-end"
            style={[StyleSheet.absoluteFill, focusTopTransitionStyle]}
          >
            <RoundButton accessibilityLabel="Geteilte Heimwege zentrieren" onPress={onRecenter}>
              <Ionicons name="locate-outline" size={21} color={colors.icon} />
            </RoundButton>
          </Animated.View>
          <Animated.View
            accessibilityElementsHidden={heimwegFocusActive}
            importantForAccessibility={heimwegFocusActive ? 'no-hide-descendants' : 'auto'}
            pointerEvents={heimwegFocusActive ? 'none' : 'auto'}
            className="flex-row items-center gap-3"
            style={[StyleSheet.absoluteFill, normalTopTransitionStyle]}
          >
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Orte suchen"
              className="h-12 flex-1 rounded-full"
              haptic={false}
              onPress={onSearchPress}
            >
              <FloatingSurface
                className="h-12 rounded-full"
                contentClassName="h-full flex-row items-center gap-2 px-4"
              >
                {/* Full icon colour, like the calendar/postfach glyphs next to
                    it — only the placeholder LABEL is muted. The muted glyph
                    read as a disabled control in dark mode. */}
                <Ionicons name="search" size={18} color={colors.icon} />
                <Text className="flex-1 text-sm font-semibold text-muted-foreground">
                  Orte suchen
                </Text>
              </FloatingSurface>
            </PressableScale>

            <View>
              <RoundButton
                accessibilityLabel={postfachBadgeAccessibilityLabel}
                onPress={onPostfachPress}
              >
                <Ionicons name="chatbubbles-outline" size={20} color={colors.icon} />
              </RoundButton>
              {postfachBadgeCount > 0 ? (
                <View
                  pointerEvents="none"
                  className="absolute -right-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card px-0.5"
                  style={{ backgroundColor: postfachBadgeColor }}
                >
                  <Text className="text-[10px] font-bold text-white">
                    {postfachBadgeCount > 99 ? '99+' : postfachBadgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
            {/* Wrapped so the plans card has a node to measure: the card grows
                out of this button and shrinks back into it. */}
            <View ref={calendarButtonRef}>
              <RoundButton
                accessibilityLabel="Pläne öffnen"
                onPress={() => onCalendarPress(() => measureSheetOrigin(calendarButtonRef))}
              >
                <Ionicons name="calendar-outline" size={20} color={colors.icon} />
              </RoundButton>
            </View>
          </Animated.View>
        </View>
      </Animated.View>

      {/* Restrained depth wash: focus separation without darkening the map. */}
      {heimwegFocusActive ? (
        <Animated.View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          entering={reducedMotion ? undefined : FadeIn.duration(220)}
          exiting={reducedMotion ? undefined : FadeOut.duration(150)}
        >
          <MapScrim
            edge="top"
            height={insets.top + 118}
            from="rgba(11, 14, 19, 0.32)"
            to="rgba(11, 14, 19, 0)"
          />
          <MapScrim
            edge="bottom"
            height={insets.bottom + 142}
            from="rgba(11, 14, 19, 0.32)"
            to="rgba(11, 14, 19, 0)"
          />
        </Animated.View>
      ) : null}

      {/* Tap-anywhere backdrop that closes the map-style menu. */}
      {styleMenuOpen && !heimwegFocusActive && !coreOrbitVisible ? (
        <Pressable
          accessibilityLabel="Menü schließen"
          style={StyleSheet.absoluteFill}
          onPress={() => setStyleMenuOpen(false)}
        />
      ) : null}

      <Animated.View
        accessibilityElementsHidden={heimwegFocusActive}
        importantForAccessibility={heimwegFocusActive ? 'no-hide-descendants' : 'auto'}
        style={[
          {
            position: 'absolute',
            right: 16,
            bottom: insets.bottom + 16,
            alignItems: 'flex-end',
            gap: 12,
          },
          normalBottomRightTransitionStyle,
        ]}
        pointerEvents={heimwegFocusActive ? 'none' : 'box-none'}
      >
        {spontaneousRound && onSpontaneousRoundPress ? (
          <SpontaneousRoundControl
            round={spontaneousRound}
            unreadCount={spontaneousRoundUnreadCount}
            onPress={onSpontaneousRoundPress}
          />
        ) : null}
        <Animated.View
          accessibilityElementsHidden={heimwegFocusActive || coreOrbitVisible}
          importantForAccessibility={
            heimwegFocusActive || coreOrbitVisible ? 'no-hide-descendants' : 'auto'
          }
          pointerEvents={heimwegFocusActive || coreOrbitVisible ? 'none' : 'box-none'}
          style={[{ alignItems: 'flex-end', gap: 12 }, coreControlsTransitionStyle]}
        >
          {styleMenuOpen ? (
            <MapStyleMenu
              preference={mapStyle}
              onSelect={(value) => {
                setMapStyle(value);
                setStyleMenuOpen(false);
              }}
            />
          ) : null}
          <RoundButton
            accessibilityLabel="Kartenstil wählen"
            onPress={() => setStyleMenuOpen((open) => !open)}
          >
            <Ionicons name="layers-outline" size={20} color={colors.icon} />
          </RoundButton>
          <RoundButton
            accessibilityLabel={recentering ? 'Standort wird gesucht' : 'Karte zentrieren'}
            onPress={onRecenter}
            disabled={recentering}
          >
            {recentering ? (
              <TogetherLoader
                accessibilityLabel=""
                color={colors.icon}
                size={loaderSizeForIcon(22)}
              />
            ) : (
              <Ionicons name="locate-outline" size={22} color={colors.icon} />
            )}
          </RoundButton>
        </Animated.View>
      </Animated.View>

      {journeyFocusLabel ? (
        <Animated.View
          accessibilityElementsHidden={heimwegFocusActive}
          importantForAccessibility={heimwegFocusActive ? 'no-hide-descendants' : 'auto'}
          style={[
            {
              position: 'absolute',
              left: 16,
              right: 16,
              // Clears the Together Core beneath it: the core's circle tops
              // out at insets.bottom + 92, so the Anreise surfaces stay fully
              // visible and tappable instead of being clipped by it.
              bottom: insets.bottom + 104,
              alignItems: 'center',
              gap: 8,
            },
            normalBottomCenterTransitionStyle,
          ]}
          pointerEvents={heimwegFocusActive ? 'none' : 'box-none'}
        >
          {journeyFocusError ? (
            <FloatingSurface className="rounded-2xl" contentClassName="min-h-11 px-3 py-2.5">
              <Text className="text-sm font-semibold text-destructive">{journeyFocusError}</Text>
            </FloatingSurface>
          ) : null}
          {journeyParticipants.length > 0 ? (
            <FloatingSurface className="w-full max-w-[360px] rounded-3xl" contentClassName="p-3">
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-sm font-bold text-foreground">Anreise</Text>
                <Text className="text-xs font-medium text-muted-foreground">
                  {journeyParticipants.filter((item) => item.status === 'underway').length}{' '}
                  unterwegs
                </Text>
              </View>
              <View className="gap-1">
                {journeyParticipants.slice(0, 4).map((participant) => {
                  const label = participant.isCurrentUser ? 'Du' : participant.displayName;
                  const updatedMinutes = Math.max(
                    0,
                    Math.floor((Date.now() - Date.parse(participant.updatedAt)) / 60_000),
                  );
                  const freshness =
                    updatedMinutes < 1 ? 'gerade aktualisiert' : `vor ${updatedMinutes} Min.`;
                  const subtitle =
                    participant.status === 'arrived'
                      ? 'angekommen'
                      : participant.distanceKm < 1
                        ? `${Math.round(participant.distanceKm * 1000)} m Luftlinie · ${freshness}`
                        : `${participant.distanceKm.toLocaleString('de-DE', {
                            maximumFractionDigits: 1,
                          })} km Luftlinie · ${freshness}`;
                  return (
                    <Pressable
                      key={participant.userId}
                      accessibilityRole="button"
                      accessibilityLabel={`${label}, ${subtitle}`}
                      className="flex-row items-center gap-2 rounded-2xl px-1 py-1.5 active:bg-secondary/70"
                      onPress={() => onJourneyParticipantPress?.(participant.userId)}
                    >
                      <View className="h-8 w-8 items-center justify-center rounded-full bg-secondary">
                        <Text className="text-[11px] font-bold text-secondary-foreground">
                          {participant.initials}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-foreground">{label}</Text>
                        <Text className="text-xs text-muted-foreground">{subtitle}</Text>
                      </View>
                      <Ionicons
                        name={participant.status === 'arrived' ? 'checkmark-circle' : 'navigate'}
                        size={16}
                        color={SEMANTIC_COLOR.journey}
                      />
                    </Pressable>
                  );
                })}
                {journeyParticipants.length > 4 ? (
                  <Text className="px-2 pt-1 text-xs font-semibold text-muted-foreground">
                    +{journeyParticipants.length - 4} weitere unterwegs
                  </Text>
                ) : null}
              </View>
            </FloatingSurface>
          ) : null}
          <FloatingSurface
            className="rounded-full"
            contentClassName="min-h-11 flex-row items-center gap-2 px-3 py-2"
          >
            <Ionicons name="navigate" size={15} color={SEMANTIC_COLOR.journey} />
            <Text className="max-w-[240px] text-sm font-bold text-foreground" numberOfLines={1}>
              {journeyFocusLabel}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Anreise-Fokus beenden"
              className="ml-1 h-11 w-11 items-center justify-center rounded-full bg-secondary/80"
              onPress={onClearJourneyFocus}
            >
              <Ionicons name="close" size={15} color={colors.icon} />
            </Pressable>
          </FloatingSurface>
        </Animated.View>
      ) : null}
      {/* A parked orbit has no finger on it and hides the map's own controls,
          so it needs the one exit every menu has: a tap next to it. Only while
          PARKED — during a hold the thumb owns the gesture, and a backdrop
          would sit under it doing nothing. It stays below the core in the tree
          so the core and its targets keep taking their own taps. */}
      {coreOrbitState === 'parked' && !heimwegFocusActive ? (
        <Pressable
          accessibilityLabel="Menü schließen"
          style={StyleSheet.absoluteFill}
          onPress={() => coreRef.current?.close()}
        />
      ) : null}

      {/* Personal status, nearby friends and the five main actions share one
          stable circular gateway. */}
      <Animated.View
        accessibilityElementsHidden={heimwegFocusActive}
        importantForAccessibility={heimwegFocusActive ? 'no-hide-descendants' : 'auto'}
        style={[
          { position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 4 },
          normalBottomCenterTransitionStyle,
        ]}
        pointerEvents={heimwegFocusActive ? 'none' : 'box-none'}
      >
        <TogetherCore
          ref={coreRef}
          status={isOpen ? 'open' : (coreActivity?.mode ?? 'idle')}
          activity={isOpen ? null : coreActivity}
          nextActivity={nextActivity}
          journey={activeJourney}
          expiresAt={openExpiresAt}
          openedAt={openOpenedAt}
          openVibeLabel={openVibe?.label ?? null}
          locationShared={shareLocation && !shareLocationBlocked}
          nearbyCount={nearbyCount}
          postfachBadgeCount={postfachBadgeCount}
          holdHintVisible={holdHint.visible}
          onHoldHintDismiss={holdHint.dismiss}
          onTap={() => {
            // The Core shows whatever it shows — so a tap has to open THAT.
            // A running Anreise outranks the rest for the same reason it owns
            // the readout: it is the state with something running behind it.
            if (activeJourney) onActiveJourneyPress?.();
            else if (isOpen || !coreActivity) onOpenStatusPress();
            else onCoreActivityPress(coreActivity.id);
          }}
          onSelectTarget={handleCoreTarget}
          onSelectActivityMode={(mode) => onCreateActivity(mode)}
          onOrbitStateChange={setCoreOrbitState}
        />
      </Animated.View>

      <SafetyStartSheet visible={safetyStartVisible} onClose={() => setSafetyStartVisible(false)} />
    </View>
  );
}
