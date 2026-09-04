import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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

import { useSafety } from '../SafetyProvider';
import { STATUS_COLOR, worstStatus } from '../safetyTheme';

/**
 * Everything about OTHER people's walks lives here (the shield is exclusively
 * the OWN Heimweg — one element, one meaning). Floats below the search bar on
 * every surface:
 *  - Friends sharing, focus not open → severity-colored, PULSING ("there is
 *    something to watch and you are not watching it"), tap → Heimweg-Fokus.
 *  - Fall-3 focus open → calm exit pill back to the normal map.
 *  - Own session minimised without shared walks → way back into the console
 *    (matters on calendar/socialize, where there is no shield).
 * Hidden while the console panel/modal is open — those show everything.
 */
export function SafetyStatusPill({
  showOwnSessionReminder = true,
  onTopOcclusionHeightChange,
}: {
  showOwnSessionReminder?: boolean;
  /** Bottom edge of the pill, measured from the screen top. */
  onTopOcclusionHeightChange?: (height: number) => void;
}) {
  const {
    session,
    friendSessions,
    consoleMinimized,
    heimwegFocusActive,
    startingHeimweg,
    setConsoleMinimized,
    setCompanionFocus,
  } = useSafety();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // Honest signal colors need a ticking clock (data gaps emerge over time).
  const active = Boolean(session) || friendSessions.length > 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [active]);

  const consoleOpen = Boolean(session) && !consoleMinimized;
  const companionPending = friendSessions.length > 0 && !heimwegFocusActive && !consoleOpen;
  const focusExit = heimwegFocusActive && !consoleOpen;
  const ownMinimized =
    showOwnSessionReminder &&
    Boolean(session) &&
    consoleMinimized &&
    !friendSessions.length &&
    !heimwegFocusActive;
  const visible = companionPending || focusExit || ownMinimized;
  useEffect(() => {
    if (!visible) onTopOcclusionHeightChange?.(0);
  }, [onTopOcclusionHeightChange, visible]);

  // Pulse only while friends share unseen — stops the moment you watch.
  // Blue = calm: the pill body stays STILL, only an expanding radar ring
  // breathes outward. Orange/red = urgent: the whole pill pulses too.
  // The pill describes OTHER people's Heimwege only. The own status belongs
  // exclusively to the shield/console and must never recolor a friend's label.
  const worst = STATUS_COLOR[worstStatus(friendSessions, now)];
  const urgent = worst !== STATUS_COLOR.blue;
  const ping = useSharedValue(0);
  const body = useSharedValue(0);
  const pulsing = companionPending && !reducedMotion;
  useEffect(() => {
    if (!pulsing) {
      ping.value = 0;
      body.value = 0;
      return;
    }
    ping.value = 0;
    ping.value = withRepeat(
      withTiming(1, { duration: urgent ? 900 : 1900, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    if (urgent) {
      body.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 650, easing: Easing.in(Easing.quad) }),
        ),
        -1,
      );
    } else {
      body.value = 0;
    }
  }, [pulsing, urgent, ping, body]);
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + body.value * 0.035 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ping.value) * 0.55,
    transform: [{ scale: 1 + ping.value * 0.17 }],
  }));

  if (!visible) return null;

  let color: string;
  let label: string;
  let icon: keyof typeof Ionicons.glyphMap;
  let a11yLabel: string;
  let onPress: () => void;

  if (companionPending) {
    color = worst;
    label =
      friendSessions.length === 1
        ? `Heimweg von ${friendSessions[0].displayName}`
        : `Heimwege von ${friendSessions.length} Freunden`;
    icon = startingHeimweg ? 'time-outline' : 'chevron-up';
    a11yLabel = `${label}. Auf der Karte ansehen`;
    onPress = () => {
      // With an own session the focus IS the open split console.
      if (session) setConsoleMinimized(false);
      else setCompanionFocus(true);
    };
  } else if (focusExit) {
    color = worst;
    label = 'Heimweg-Fokus verlassen';
    icon = 'close';
    a11yLabel = 'Heimweg-Fokus verlassen, zurück zur normalen Karte';
    onPress = () => setCompanionFocus(false);
  } else {
    color = STATUS_COLOR[session!.status];
    const count = session!.audienceUids.length;
    label = startingHeimweg
      ? 'Heimweg wird gestartet'
      : session!.status === 'red'
        ? 'Hilferuf gesendet'
        : session!.status === 'orange'
          ? 'Unsicher gemeldet'
          : `Heimweg aktiv · ${count} ${count === 1 ? 'Freund:in' : 'Freunde'}`;
    icon = 'chevron-up';
    a11yLabel = `${label}. Heimweg öffnen`;
    onPress = () => setConsoleMinimized(false);
  }

  return (
    // box-none strip: only the pill itself is tappable, never the whole row.
    <Animated.View
      className="absolute left-0 right-0 items-center"
      style={{ top: insets.top + 64, zIndex: 40 }}
      onLayout={(event) => {
        onTopOcclusionHeightChange?.(
          Math.max(0, insets.top + 64 + event.nativeEvent.layout.height),
        );
      }}
      pointerEvents="box-none"
      entering={reducedMotion ? undefined : FadeIn.delay(45).duration(180)}
      exiting={reducedMotion ? undefined : FadeOut.duration(125)}
    >
      <Animated.View
        key={companionPending ? 'pending' : focusExit ? 'focus-exit' : 'own'}
        style={bodyStyle}
        entering={reducedMotion ? undefined : FadeIn.duration(165)}
        exiting={reducedMotion ? undefined : FadeOut.duration(105)}
      >
        {/* Radar ring — expands outward and fades, silent once watched. */}
        <Animated.View
          pointerEvents="none"
          className="absolute -bottom-1 -left-1 -right-1 -top-1 rounded-full border-2"
          style={[{ borderColor: color }, ringStyle]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          onPress={onPress}
          className="flex-row items-center gap-2 rounded-full border px-4 py-2.5 active:opacity-85"
          style={{ borderColor: color, backgroundColor: '#0B0E13F2' }}
        >
          <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <Text className="text-sm font-extrabold text-white">{label}</Text>
          <Ionicons name={icon} size={15} color="rgba(244,245,247,0.6)" />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
