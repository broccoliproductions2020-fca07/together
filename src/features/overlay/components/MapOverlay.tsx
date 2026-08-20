import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useAuth } from '@/features/auth';
import { MOTION } from '@/shared/theme';
import type { CoreActivitySummary } from '@/features/activities';
import type { SpontaneousRound } from '@/features/chat';
import type { JourneyParticipant } from '@/features/journey';
import { usePostfachBadge } from '@/features/mailbox';
import { useMapStyle } from '@/features/map/mapStyle/useMapStyle';
import { useOpenStatus } from '@/features/presence';
import { SafetyStartSheet, STATUS_COLOR, useSafety } from '@/features/safety';
import { PressableScale } from '@/shared/components/PressableScale';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

import type { CoreTargetId } from '../core/coreTargets';
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

/**
 * Where the Nearby pill's lower edge sits above the safe area.
 *
 * DERIVED, not chosen. The Core's centre is fixed at `insets.bottom + 74` (its
 * wrapper sits at +4 and `BOX_FOOT` is 70), so with a 96 px status Core the
 * circle reaches +122 and its status ring another ~10 px past that. This clears
 * the ring by 10 px.
 *
 * The old value of 112 came from a stale comment claiming the circle topped out
 * at +92; it did not, and the pill and Core have been overlapping slightly.
 * Change this whenever `OPEN_CORE_SIZE` or the ring's overhang changes.
 */
const NEARBY_PILL_BOTTOM = 142;

function NearbyPill({ count, onPress }: { count: number; onPress: () => void }) {
  const countLabel = `${count} ${count === 1 ? 'Freund' : 'Freunde'} offen`;

  return (
    <RoundControl
      accessibilityLabel={`${countLabel} in deiner Nähe anzeigen`}
      contentClassName="min-h-11 flex-row items-center gap-2.5 px-4 py-2"
      shape="pill"
      surfaceStyle={{
        backgroundColor: 'rgba(59,130,246,0.16)',
        borderColor: 'rgba(59,130,246,0.72)',
      }}
      onPress={onPress}
    >
      <View className="h-6 w-6 items-center justify-center rounded-full bg-[#3B82F6]/20">
        <Ionicons name="people-outline" size={15} color="#8DB9FF" />
      </View>
      <View>
        <Text className="text-xs font-bold text-foreground">{countLabel}</Text>
        <Text className="text-[11px] text-muted-foreground">in deiner Nähe</Text>
      </View>
    </RoundControl>
  );
}

export interface MapOverlayProps {
  /** Opens the activity composer in the chosen mode (core orbit → Jetzt/Bald). */
  onCreateActivity: (mode: 'now' | 'soon') => void;
  onRecenter: () => void;
  recentering?: boolean;
  isOpen: boolean;
  /** The current user's running plan, or their next plan from the existing feed. */
  coreActivity?: CoreActivitySummary | null;
  /** Core tap: publish on the open defaults and open the personal status sheet. */
  onOpenStatusPress: () => void;
  onCoreActivityPress: (activityId: string) => void;
  /** Friends currently open in range — shown on the dedicated Nearby pill. */
  nearbyCount?: number;
  journeyFocusLabel?: string;
  journeyParticipants?: JourneyParticipant[];
  /** A running Anreise. Rendered inside the Core, not as a surface of its own. */
  activeJourney?: CoreJourneyIndicator | null;
  onNearbyPress: () => void;
  /** Lets the Nearby sheet measure the pill it morphs out of. */
  nearbyPillRef?: RefObject<View | null>;
  /**
   * The Nearby sheet's morph value. The pill fades out on it, inverted, so the
   * two are never both at full strength and never both absent — a boolean
   * swap at a threshold either flashes (two translucent copies stacking) or
   * leaves a hole, depending on which side of the container's fade it lands.
   */
  nearbyPillProgress?: SharedValue<number>;
  /** Stops the faded pill from taking taps meant for the sheet above it. */
  nearbyPillInert?: boolean;
  onSearchPress?: () => void;
  onPostfachPress: () => void;
  onCalendarPress: () => void;
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
  onCreateActivity,
  onRecenter,
  recentering = false,
  isOpen,
  coreActivity = null,
  onOpenStatusPress,
  onCoreActivityPress,
  nearbyCount = 0,
  journeyFocusLabel,
  journeyParticipants = [],
  activeJourney = null,
  onNearbyPress,
  nearbyPillRef,
  nearbyPillProgress,
  nearbyPillInert = false,
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
  // Falls back to a value that never moves, so the pill simply stays visible
  // for hosts that do not drive a morph.
  const idlePillProgress = useSharedValue(0);
  const pillProgress = nearbyPillProgress ?? idlePillProgress;
  const nearbyPillMorphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      pillProgress.value,
      [0, MOTION.originCrossfade],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));
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
   * gesture. `activity` never arrives here: it unfolds Jetzt/Bald inside the
   * core and comes back as `onCreateActivity`.
   */
  function handleCoreTarget(id: Exclude<CoreTargetId, 'activity'>) {
    if (id === 'search') onSearchPress?.();
    else if (id === 'postfach') onPostfachPress();
    else onCalendarPress();
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
      <Svg
        pointerEvents="none"
        style={{ left: 0, position: 'absolute', right: 0, top: 0 }}
        height={insets.top + 64}
        width="100%"
      >
        <Defs>
          <LinearGradient id="mapTopScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0E1116" stopOpacity={0.4} />
            <Stop offset="1" stopColor="#0E1116" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#mapTopScrim)" />
      </Svg>

      {/* No fixed height. The row used to be h-12 — exactly as tall as its own
          48px buttons — so the drop shadow (offset 8 / radius 18) and the
          shield's pulse ring (-4px on every side) had nothing to render into
          and the circles came out flattened top and bottom. The padding gives
          that headroom back; `top` is shifted by the same amount so the
          buttons stay optically where they were. */}
      <Animated.View
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
            <RoundButton accessibilityLabel="Pläne öffnen" onPress={onCalendarPress}>
              <Ionicons name="calendar-outline" size={20} color={colors.icon} />
            </RoundButton>
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
          <Svg
            style={{ left: 0, position: 'absolute', right: 0, top: 0 }}
            height={insets.top + 118}
            width="100%"
          >
            <Defs>
              <LinearGradient id="heimwegTopVignette" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#0B0E13" stopOpacity={0.32} />
                <Stop offset="1" stopColor="#0B0E13" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#heimwegTopVignette)" />
          </Svg>
          <Svg
            style={{ bottom: 0, left: 0, position: 'absolute', right: 0 }}
            height={insets.bottom + 142}
            width="100%"
          >
            <Defs>
              <LinearGradient id="heimwegBottomVignette" x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor="#0B0E13" stopOpacity={0.32} />
                <Stop offset="1" stopColor="#0B0E13" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#heimwegBottomVignette)" />
          </Svg>
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
              <ActivityIndicator size="small" color={colors.icon} />
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
                  const subtitle =
                    participant.status === 'arrived'
                      ? 'angekommen'
                      : participant.distanceKm < 1
                        ? `${Math.round(participant.distanceKm * 1000)} m entfernt`
                        : `${participant.distanceKm.toLocaleString('de-DE', {
                            maximumFractionDigits: 1,
                          })} km entfernt`;
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
              </View>
            </FloatingSurface>
          ) : null}
          <FloatingSurface
            className="rounded-full"
            contentClassName="min-h-11 flex-row items-center gap-2 px-3 py-2"
          >
            <Ionicons name="navigate" size={15} color={colors.icon} />
            <Text className="max-w-[240px] text-sm font-bold text-foreground" numberOfLines={1}>
              {journeyFocusLabel}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Anreise-Fokus beenden"
              className="ml-1 h-7 w-7 items-center justify-center rounded-full bg-secondary/80"
              onPress={onClearJourneyFocus}
            >
              <Ionicons name="close" size={15} color={colors.icon} />
            </Pressable>
          </FloatingSurface>
        </Animated.View>
      ) : null}
      {/* A running Anreise has no pill of its own any more — it is shown INSIDE
          the Core (see `journey` below). It used to sit here, directly above
          the Core and in place of the Nearby pill, which cost the entry point
          to the open-friends list for the whole trip. */}

      {!coreOrbitVisible && !journeyFocusLabel ? (
        <Animated.View
          entering={FadeIn.duration(reducedMotion ? 0 : 140)}
          exiting={FadeOut.duration(reducedMotion ? 0 : 100)}
          accessibilityElementsHidden={heimwegFocusActive}
          importantForAccessibility={heimwegFocusActive ? 'no-hide-descendants' : 'auto'}
          pointerEvents={heimwegFocusActive ? 'none' : 'box-none'}
          style={{
            alignItems: 'center',
            bottom: insets.bottom + NEARBY_PILL_BOTTOM,
            left: 0,
            position: 'absolute',
            right: 0,
          }}
        >
          {/* `collapsable={false}` is required: without it Android may flatten
              this wrapper away and `measureInWindow` reports nothing. The ref
              sits on the OUTER view so the measured rect is the pill's real
              place regardless of what the fade is doing. */}
          <View
            ref={nearbyPillRef}
            collapsable={false}
            pointerEvents={nearbyPillInert ? 'none' : 'auto'}
          >
            <Animated.View style={nearbyPillMorphStyle}>
              <NearbyPill count={nearbyCount} onPress={onNearbyPress} />
            </Animated.View>
          </View>
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

      {/* The core owns personal status and the four main actions. Nearby stays
          outside it as a direct map pill, so the orbit remains personal. */}
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
          journey={activeJourney}
          expiresAt={openExpiresAt}
          openedAt={openOpenedAt}
          openVibeLabel={openVibe?.label ?? null}
          locationShared={shareLocation && !shareLocationBlocked}
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
          onSelectActivityMode={onCreateActivity}
          onOrbitStateChange={setCoreOrbitState}
        />
      </Animated.View>

      <SafetyStartSheet visible={safetyStartVisible} onClose={() => setSafetyStartVisible(false)} />
    </View>
  );
}
