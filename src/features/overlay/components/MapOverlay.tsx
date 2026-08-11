import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useAuth } from '@/features/auth';
import type { SpontaneousRound } from '@/features/chat';
import type { JourneyParticipant } from '@/features/journey';
import { usePostfachBadge } from '@/features/mailbox';
import { useMapStyle } from '@/features/map/mapStyle/useMapStyle';
import { useOpenStatus } from '@/features/presence';
import { SafetyStartSheet, STATUS_COLOR, useSafety } from '@/features/safety';
import { PressableScale } from '@/shared/components/PressableScale';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

import { ActionFab } from './ActionFab';
import { FloatingSurface } from './FloatingSurface';
import { MapStyleMenu } from './MapStyleMenu';
import { RoundControl } from './RoundControl';
import { SpontaneousRoundControl } from './SpontaneousRoundControl';
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
 * Countdown ring around the pill — the same language the `now` activity markers
 * speak (ActivityMarkerChrome → CountdownRing): a stroke that shortens as the
 * window runs out. Your own open status expires just like an activity does, so
 * it gets the same clock rather than a second invented one.
 */
function OpenPillCountdown({
  remaining,
  size,
}: {
  remaining: number;
  size: { width: number; height: number };
}) {
  if (size.width <= 0 || size.height <= 0) return null;

  const stroke = 2;
  const width = size.width - stroke;
  const height = size.height - stroke;
  const radius = height / 2;
  // Rounded-rect perimeter: the straight runs plus one full circle of corners.
  const perimeter =
    2 * Math.max(0, width - 2 * radius) +
    2 * Math.max(0, height - 2 * radius) +
    2 * Math.PI * radius;
  const left = Math.max(0, Math.min(1, remaining));

  return (
    // Wrapped in a real View on purpose: `pointerEvents` is not a view prop the
    // native <Svg> host honours, and this ring covers the pill exactly. Without
    // the wrapper it ate every tap on the pill while open — the one state in
    // which it renders — so the sheet could not be reopened to end the status.
    <View
      pointerEvents="none"
      style={[styles.openPillCountdown, { width: size.width, height: size.height }]}
    >
      <Svg width={size.width} height={size.height}>
        <Rect
          x={stroke / 2}
          y={stroke / 2}
          width={width}
          height={height}
          rx={radius}
          ry={radius}
          fill="none"
          stroke="rgba(110,139,247,0.22)"
          strokeWidth={stroke}
        />
        <Rect
          x={stroke / 2}
          y={stroke / 2}
          width={width}
          height={height}
          rx={radius}
          ry={radius}
          fill="none"
          stroke="#6E8BF7"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${perimeter * left} ${perimeter}`}
        />
      </Svg>
    </View>
  );
}

function OpenPresencePill({
  isOpen,
  expiresAt,
  openedAt,
  onPress,
}: {
  isOpen: boolean;
  expiresAt: number | null;
  openedAt: number | null;
  onPress: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const breath = useSharedValue(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // One tick a minute is plenty for a 3–12 h window and costs nothing; the ring
  // only has to be honest, not smooth.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const remaining =
    isOpen && expiresAt && openedAt && expiresAt > openedAt
      ? Math.max(0, Math.min(1, (expiresAt - now) / (expiresAt - openedAt)))
      : null;
  const untilLabel = expiresAt
    ? `${new Date(expiresAt).getHours().toString().padStart(2, '0')}:${new Date(expiresAt)
        .getMinutes()
        .toString()
        .padStart(2, '0')}`
    : null;

  useEffect(() => {
    if (!isOpen || reducedMotion) {
      breath.value = 0;
      return;
    }
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
    );
  }, [breath, isOpen, reducedMotion]);

  const activeGlowStyle = useAnimatedStyle(() => ({
    opacity: isOpen ? 0.1 + breath.value * 0.18 : 0,
    transform: [{ scale: 1 + breath.value * 0.035 }],
  }));

  return (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
      }}
    >
      {isOpen ? (
        <Animated.View pointerEvents="none" style={[styles.openPillGlow, activeGlowStyle]} />
      ) : null}
      <RoundControl
        accessibilityLabel={
          isOpen
            ? untilLabel
              ? `Du bist offen bis ${untilLabel}`
              : 'Du bist offen'
            : 'Offen stellen'
        }
        contentClassName="flex-row items-center gap-2 px-4 py-2.5"
        shape="pill"
        // The ONLY blue border in the overlay: this pill is the "offen" control,
        // and blue is that state's colour. Solid in both states — a faded edge
        // made the closed pill look half-disabled — with only the fill telling
        // open from closed.
        surfaceStyle={{
          backgroundColor: isOpen ? 'rgba(110, 139, 247, 0.14)' : 'rgba(110, 139, 247, 0.07)',
          borderColor: '#6E8BF7',
        }}
        onPress={onPress}
      >
        {isOpen ? (
          <View className="h-2 w-2 rounded-full bg-[#6E8BF7]" />
        ) : (
          <Ionicons
            name="add"
            size={19}
            color="#6E8BF7"
            style={{ transform: [{ translateY: 1 }] }}
          />
        )}
        <Text className="text-sm font-semibold text-foreground">
          {isOpen ? (untilLabel ? `Offen bis ${untilLabel}` : 'Du bist offen') : 'Offen stellen'}
        </Text>
      </RoundControl>
      {remaining == null ? null : <OpenPillCountdown remaining={remaining} size={size} />}
    </View>
  );
}

export interface MapOverlayProps {
  /** Tapping the create FAB opens the activity composer directly (no speed dial). */
  onCreatePress: () => void;
  onRecenter: () => void;
  recentering?: boolean;
  isOpen: boolean;
  journeyFocusLabel?: string;
  journeyParticipants?: JourneyParticipant[];
  activeJourneyLabel?: string;
  onNearbyPress: () => void;
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
  onCreatePress,
  onRecenter,
  recentering = false,
  isOpen,
  journeyFocusLabel,
  journeyParticipants = [],
  activeJourneyLabel,
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
  // The pill's countdown reads the window straight from the status, so it can
  // never disagree with the card that set it.
  const { expiresAt: openExpiresAt, openedAt: openOpenedAt } = useOpenStatus();
  const { preference: mapStyle, setPreference: setMapStyle } = useMapStyle();
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
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

  // Heimweg is a spatial map focus, not another screen. All chrome therefore
  // follows one coordinated progress value instead of unrelated fades.
  useEffect(() => {
    focusTransition.value = withTiming(heimwegFocusActive ? 1 : 0, {
      duration: reducedMotion ? 0 : heimwegFocusActive ? 360 : 320,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [focusTransition, heimwegFocusActive, reducedMotion]);

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
  const normalBottomLeftTransitionStyle = useAnimatedStyle(() => {
    const progress = focusTransition.value;
    return {
      opacity: 1 - Math.min(1, progress / 0.72),
      transform: [
        { translateX: -22 * progress },
        { translateY: 10 * progress },
        { scale: 1 - 0.035 * progress },
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
      {styleMenuOpen && !heimwegFocusActive ? (
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
        {styleMenuOpen ? (
          <MapStyleMenu
            preference={mapStyle}
            onSelect={(value) => {
              setMapStyle(value);
              setStyleMenuOpen(false);
            }}
          />
        ) : null}
        {/* Perspective. Deliberately a button and not a gesture: `pitchEnabled`
            stays off on the MapView, so the camera can only ever be tilted
            here, and never accidentally mid-pinch. */}
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

      {journeyFocusLabel ? (
        <Animated.View
          accessibilityElementsHidden={heimwegFocusActive}
          importantForAccessibility={heimwegFocusActive ? 'no-hide-descendants' : 'auto'}
          style={[
            {
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: insets.bottom + 84,
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
      ) : activeJourneyLabel ? (
        <Animated.View
          accessibilityElementsHidden={heimwegFocusActive}
          importantForAccessibility={heimwegFocusActive ? 'no-hide-descendants' : 'auto'}
          style={[
            {
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: insets.bottom + 84,
              alignItems: 'center',
            },
            normalBottomCenterTransitionStyle,
          ]}
          pointerEvents={heimwegFocusActive ? 'none' : 'box-none'}
        >
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Aktive Anreise anzeigen"
            className="rounded-full"
            haptic={false}
            onPress={onActiveJourneyPress}
          >
            <FloatingSurface
              className="rounded-full"
              contentClassName="min-h-11 flex-row items-center gap-2 px-4 py-2"
            >
              <Ionicons name="navigate" size={15} color={SEMANTIC_COLOR.journey} />
              <Text className="max-w-[250px] text-sm font-bold text-foreground" numberOfLines={1}>
                {activeJourneyLabel}
              </Text>
            </FloatingSurface>
          </PressableScale>
        </Animated.View>
      ) : null}

      <Animated.View
        accessibilityElementsHidden={heimwegFocusActive}
        importantForAccessibility={heimwegFocusActive ? 'no-hide-descendants' : 'auto'}
        style={[
          { position: 'absolute', left: 16, bottom: insets.bottom + 16 },
          normalBottomLeftTransitionStyle,
        ]}
        pointerEvents={heimwegFocusActive ? 'none' : 'box-none'}
      >
        <ActionFab onPress={onCreatePress} />
      </Animated.View>

      {/* Fixed "N offen in deiner Nähe" pill — centered, just above FloatingModeSwitch */}
      <Animated.View
        accessibilityElementsHidden={heimwegFocusActive}
        importantForAccessibility={heimwegFocusActive ? 'no-hide-descendants' : 'auto'}
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            // Same band as the FAB and the recenter button. The mode switch
            // only renders on the calendar surface (MainSurface), so the
            // bottom-centre of the map is free. Matching the FAB's 56px height
            // with justifyContent centre aligns the pill's centre line with
            // both round buttons without hard-coding the pill's own height.
            bottom: insets.bottom + 16,
            height: 56,
            justifyContent: 'center',
            alignItems: 'center',
          },
          normalBottomCenterTransitionStyle,
        ]}
        pointerEvents={heimwegFocusActive ? 'none' : 'box-none'}
      >
        <OpenPresencePill
          isOpen={isOpen}
          expiresAt={openExpiresAt}
          openedAt={openOpenedAt}
          onPress={onNearbyPress}
        />
      </Animated.View>

      <SafetyStartSheet visible={safetyStartVisible} onClose={() => setSafetyStartVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  openPillCountdown: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  openPillGlow: {
    position: 'absolute',
    top: -2,
    right: -2,
    bottom: -2,
    left: -2,
    borderWidth: 1.5,
    borderColor: '#6E8BF7',
    borderRadius: 999,
  },
});
