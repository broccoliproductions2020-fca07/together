import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
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
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useAuth } from '@/features/auth';
import { useActivityChatActivity } from '@/features/chat';
import type { JourneyParticipant } from '@/features/journey';
import { useMapStyle } from '@/features/map/mapStyle/useMapStyle';
import { SafetyStartSheet, STATUS_COLOR, useSafety } from '@/features/safety';

import { ActionFab } from './ActionFab';
import { AnimatedPressable } from './AnimatedPressable';
import { FloatingSurface } from './FloatingSurface';
import { MapStyleMenu } from './MapStyleMenu';
import { useOverlayColors } from './overlayTheme';

function RoundButton({
  accessibilityLabel,
  children,
  onPress,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  onPress?: () => void;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="h-12 w-12 rounded-full"
      onPress={onPress}
    >
      <FloatingSurface
        className="h-12 w-12 rounded-full"
        contentClassName="h-full w-full items-center justify-center"
      >
        {children}
      </FloatingSurface>
    </AnimatedPressable>
  );
}

export interface MapOverlayProps {
  /** Tapping the create FAB opens the activity composer directly (no speed dial). */
  onCreatePress: () => void;
  onRecenter: () => void;
  nearbyCount: number;
  journeyFocusLabel?: string;
  journeyParticipants?: JourneyParticipant[];
  activeJourneyLabel?: string;
  onNearbyPress: () => void;
  onSearchPress?: () => void;
  onActivitiesPress: () => void;
  onCalendarPress: () => void;
  onClearJourneyFocus?: () => void;
  onJourneyParticipantPress?: (participantId: string) => void;
  onActiveJourneyPress?: () => void;
}

/**
 * Single overlay layer that floats absolutely over a fullscreen MapCanvas.
 * The controls use translucent liquid/glass surfaces and theme-aware icon
 * colors so they remain readable in light and dark mode.
 */
export function MapOverlay({
  onCreatePress,
  onRecenter,
  nearbyCount,
  journeyFocusLabel,
  journeyParticipants = [],
  activeJourneyLabel,
  onNearbyPress,
  onSearchPress,
  onActivitiesPress,
  onCalendarPress,
  onClearJourneyFocus,
  onJourneyParticipantPress,
  onActiveJourneyPress,
}: MapOverlayProps) {
  const insets = useSafeAreaInsets();
  const colors = useOverlayColors();
  const { user } = useAuth();
  // Aggregate unread across all joined rooms — group chats have no map marker,
  // so this badge is the ONLY passive signal that something new arrived.
  // Costs nothing extra: pure client math over the always-on rooms listener.
  const { joinedIds, getUnreadCount } = useActivityChatActivity();
  const unreadTotal = joinedIds.reduce((sum, id) => sum + getUnreadCount(id), 0);
  const reducedMotion = useReducedMotion();
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

      <Animated.View
        style={{ position: 'absolute', top: insets.top + 10, left: 16, right: 16 }}
        className="h-12 flex-row items-center gap-3"
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
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Orte suchen"
              className="h-12 flex-1 rounded-full"
              onPress={onSearchPress}
            >
              <FloatingSurface
                className="h-12 rounded-full"
                contentClassName="h-full flex-row items-center gap-2 px-4"
              >
                <Ionicons name="search" size={18} color={colors.iconMuted} />
                <Text className="flex-1 text-sm font-semibold text-muted-foreground">
                  Orte suchen
                </Text>
              </FloatingSurface>
            </AnimatedPressable>

            <View>
              <RoundButton
                accessibilityLabel={
                  unreadTotal > 0
                    ? `Deine Aktivitäten, ${unreadTotal} ungelesene Nachrichten`
                    : 'Deine Aktivitäten'
                }
                onPress={onActivitiesPress}
              >
                <Ionicons name="chatbubbles-outline" size={20} color={colors.icon} />
              </RoundButton>
              {unreadTotal > 0 ? (
                <View
                  pointerEvents="none"
                  className="absolute -right-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card bg-[#FF3B30] px-0.5"
                >
                  <Text className="text-[10px] font-bold text-white">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
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
            gap: 10,
            },
            normalBottomRightTransitionStyle,
          ]}
          pointerEvents={heimwegFocusActive ? 'none' : 'box-none'}
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
          <RoundButton accessibilityLabel="Karte zentrieren" onPress={onRecenter}>
            <Ionicons name="locate-outline" size={22} color={colors.icon} />
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
              bottom: insets.bottom + 150,
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
                        color={participant.status === 'arrived' ? '#41C08D' : '#6E8BF7'}
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
              bottom: insets.bottom + 150,
              alignItems: 'center',
            },
            normalBottomCenterTransitionStyle,
          ]}
          pointerEvents={heimwegFocusActive ? 'none' : 'box-none'}
        >
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="Aktive Anreise anzeigen"
            className="rounded-full"
            onPress={onActiveJourneyPress}
          >
            <FloatingSurface
              className="rounded-full"
              contentClassName="min-h-11 flex-row items-center gap-2 px-4 py-2"
            >
              <Ionicons name="navigate" size={15} color="#6E8BF7" />
              <Text className="max-w-[250px] text-sm font-bold text-foreground" numberOfLines={1}>
                {activeJourneyLabel}
              </Text>
            </FloatingSurface>
          </AnimatedPressable>
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
            bottom: insets.bottom + 78,
            alignItems: 'center',
          },
          normalBottomCenterTransitionStyle,
        ]}
        pointerEvents={heimwegFocusActive ? 'none' : 'box-none'}
      >
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={`${nearbyCount} Freunde offen in deiner Nähe`}
            className="rounded-full"
            onPress={onNearbyPress}
          >
            <FloatingSurface
              className="rounded-full"
              contentClassName="flex-row items-center gap-2 px-4 py-2.5"
            >
              <View className="h-2 w-2 rounded-full bg-[#6E8BF7]" />
              <Text className="text-sm font-semibold text-foreground">
                {nearbyCount} offen in deiner Nähe
              </Text>
            </FloatingSurface>
          </AnimatedPressable>
      </Animated.View>

      <SafetyStartSheet visible={safetyStartVisible} onClose={() => setSafetyStartVisible(false)} />
    </View>
  );
}
