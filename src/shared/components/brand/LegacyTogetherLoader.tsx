import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const INK = '#0E1116';
const NOW = '#41C08D';
const SOON = '#E0A23E';

const SPIN_MS = 1100;

// Ring geometry in a 100×100 viewBox — same hollow-"o" proportions as the
// brand mark's ring (AnimatedLogo), so the loader reads as the "o" searching
// for its partner dot, not as a generic spinner.
const R = 38;
const STROKE = 13;
const CIRCUMFERENCE = 2 * Math.PI * R;
// Arc covers ~30% of the ring; the rest is the quiet track.
const ARC: [number, number] = [CIRCUMFERENCE * 0.3, CIRCUMFERENCE * 0.7];

type TogetherLoaderProps = {
  size?: number;
  tile?: boolean;
  accessibilityLabel?: string;
};

/**
 * Brand loading indicator: the hollow "o" ring from the Together mark with a
 * gradient arc sweeping around it. Replaces the old three-dot orbit spinner —
 * the three-circle motif is retired everywhere.
 */
export function LegacyTogetherLoader({
  size = 36,
  tile = false,
  accessibilityLabel = 'Wird geladen',
}: TogetherLoaderProps) {
  const reducedMotion = useReducedMotion();
  const spin = useSharedValue(0);
  const ringSize = tile ? size * 0.56 : size;

  useEffect(() => {
    if (reducedMotion) return;
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: SPIN_MS, easing: Easing.linear }), -1, false);
    return () => {
      spin.value = 0;
    };
  }, [reducedMotion, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[
        styles.container,
        tile
          ? {
              backgroundColor: INK,
              borderRadius: size * 0.23,
              height: size,
              width: size,
            }
          : null,
      ]}
    >
      <Animated.View style={[{ height: ringSize, width: ringSize }, spinStyle]}>
        <Svg height={ringSize} viewBox="0 0 100 100" width={ringSize}>
          <Defs>
            <LinearGradient id="loaderArc" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={NOW} />
              <Stop offset="1" stopColor={SOON} />
            </LinearGradient>
          </Defs>
          {/* Quiet full-ring track */}
          <Circle
            cx={50}
            cy={50}
            fill="none"
            r={R}
            stroke="rgba(244,245,247,0.14)"
            strokeWidth={STROKE}
          />
          {/* Sweeping gradient arc */}
          <Circle
            cx={50}
            cy={50}
            fill="none"
            r={R}
            stroke="url(#loaderArc)"
            strokeDasharray={ARC}
            strokeLinecap="round"
            strokeWidth={STROKE}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
