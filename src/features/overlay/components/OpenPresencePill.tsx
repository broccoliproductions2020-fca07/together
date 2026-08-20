import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { RoundControl } from './RoundControl';

/**
 * RETIRED MOUNT — kept, not deleted.
 *
 * This is the former bottom-centre "N offen in deiner Nähe" pill, lifted out of
 * `MapOverlay` unchanged when `TogetherCore` took over the bottom band. Its two
 * jobs now live in different places: the own open status is the core's tap and
 * `OpenStatusSheet`, and the friends list is the core orbit's "Nähe" target.
 *
 * It has no call site. It stays because the countdown-ring geometry and the
 * pointer-events lesson recorded below were paid for once already, and a future
 * surface that needs a compact open-status pill should start from this rather
 * than rediscover them.
 */

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
          stroke="rgba(59,130,246,0.22)"
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
          stroke="#3B82F6"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${perimeter * left} ${perimeter}`}
        />
      </Svg>
    </View>
  );
}

export function OpenPresencePill({
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
          backgroundColor: isOpen ? 'rgba(59, 130, 246, 0.14)' : 'rgba(59, 130, 246, 0.07)',
          borderColor: '#3B82F6',
        }}
        onPress={onPress}
      >
        {isOpen ? (
          <View className="h-2 w-2 rounded-full bg-[#3B82F6]" />
        ) : (
          <Ionicons
            name="add"
            size={19}
            color="#3B82F6"
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

const styles = StyleSheet.create({
  openPillCountdown: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  openPillGlow: {
    borderColor: '#3B82F6',
    borderRadius: 999,
    borderWidth: 1.5,
    bottom: -2,
    left: -2,
    position: 'absolute',
    right: -2,
    top: -2,
  },
});
