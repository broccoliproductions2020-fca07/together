import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { TOGETHER_BRAND } from './brandTokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const PATH_LENGTH = 240;
const DRAW_EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Legacy woven-path concept retained only for visual rollback. */
const UPPER_PATH = 'M10 27 C38 27 43 79 70 79 C97 79 102 27 130 27';
const LOWER_PATH = 'M10 79 C38 79 43 27 70 27 C97 27 102 79 130 79';

export type TogetherMarkProps = {
  size?: number;
  animated?: boolean;
  idle?: boolean;
  accessibilityLabel?: string;
};

export function TogetherMark({
  size = 112,
  animated = true,
  idle = false,
  accessibilityLabel = 'Together',
}: TogetherMarkProps) {
  const reducedMotion = useReducedMotion();
  const draw = useSharedValue(animated && !reducedMotion ? 0 : 1);
  const flow = useSharedValue(0);

  useEffect(() => {
    if (!animated || reducedMotion) {
      draw.value = 1;
      return;
    }

    draw.value = 0;
    draw.value = withTiming(1, { duration: 1180, easing: DRAW_EASE });
  }, [animated, draw, reducedMotion]);

  useEffect(() => {
    if (!idle || reducedMotion) {
      flow.value = 0;
      return;
    }

    flow.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.linear }), -1, false);
    return () => {
      flow.value = 0;
    };
  }, [flow, idle, reducedMotion]);

  const upperProps = useAnimatedProps(() => ({
    opacity: interpolate(draw.value, [0, 0.08, 1], [0, 1, 1]),
    strokeDashoffset: PATH_LENGTH * (1 - draw.value),
  }));

  const lowerProps = useAnimatedProps(() => ({
    opacity: interpolate(draw.value, [0.08, 0.2, 1], [0, 1, 1]),
    strokeDashoffset: PATH_LENGTH * (1 - interpolate(draw.value, [0.1, 1], [0, 1], 'clamp')),
  }));

  const sheenProps = useAnimatedProps(() => ({
    opacity: idle ? interpolate(flow.value, [0, 0.15, 0.8, 1], [0, 0.72, 0.72, 0]) : 0,
    strokeDashoffset: PATH_LENGTH * (1 - flow.value),
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: interpolate(draw.value, [0, 0.12, 1], [0, 1, 1]),
    transform: [{ scale: interpolate(draw.value, [0, 1], [0.96, 1]) }],
  }));

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={[{ height: size * 0.76, width: size }, markStyle]}
    >
      <Svg height="100%" viewBox="0 0 140 106" width="100%">
        <Defs>
          <LinearGradient id="togetherPathUpper" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={TOGETHER_BRAND.indigo} />
            <Stop offset="1" stopColor={TOGETHER_BRAND.violet} />
          </LinearGradient>
          <LinearGradient id="togetherPathLower" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={TOGETHER_BRAND.aqua} />
            <Stop offset="1" stopColor={TOGETHER_BRAND.indigo} />
          </LinearGradient>
        </Defs>

        <AnimatedPath
          animatedProps={upperProps}
          d={UPPER_PATH}
          fill="none"
          stroke="url(#togetherPathUpper)"
          strokeDasharray={`${PATH_LENGTH} ${PATH_LENGTH}`}
          strokeLinecap="round"
          strokeWidth={12}
        />
        <AnimatedPath
          animatedProps={lowerProps}
          d={LOWER_PATH}
          fill="none"
          stroke="url(#togetherPathLower)"
          strokeDasharray={`${PATH_LENGTH} ${PATH_LENGTH}`}
          strokeLinecap="round"
          strokeWidth={12}
        />
        <AnimatedPath
          animatedProps={sheenProps}
          d={LOWER_PATH}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeDasharray={`18 ${PATH_LENGTH - 18}`}
          strokeLinecap="round"
          strokeWidth={3.2}
        />
      </Svg>
    </Animated.View>
  );
}

export type TogetherLockupProps = {
  width?: number;
  layout?: 'horizontal' | 'stacked';
  animated?: boolean;
  idle?: boolean;
  wordColor?: string;
};

export function TogetherLockup({
  width = 286,
  layout = 'horizontal',
  animated = true,
  idle = false,
  wordColor = TOGETHER_BRAND.paper,
}: TogetherLockupProps) {
  const reducedMotion = useReducedMotion();
  const reveal = useSharedValue(animated && !reducedMotion ? 0 : 1);
  const stacked = layout === 'stacked';
  const markSize = stacked ? width * 0.49 : width * 0.25;
  const fontSize = stacked ? width * 0.155 : width * 0.145;

  useEffect(() => {
    if (!animated || reducedMotion) {
      reveal.value = 1;
      return;
    }

    reveal.value = 0;
    reveal.value = withDelay(620, withTiming(1, { duration: 620, easing: DRAW_EASE }));
  }, [animated, reducedMotion, reveal]);

  const wordStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: (1 - reveal.value) * (stacked ? 9 : 0) },
      { translateX: (1 - reveal.value) * (stacked ? 0 : -8) },
    ],
  }));

  return (
    <View
      accessibilityLabel="Together"
      accessibilityRole="image"
      style={[styles.lockup, stacked ? styles.stacked : styles.horizontal, { width }]}
    >
      <TogetherMark animated={animated} idle={idle} size={markSize} accessibilityLabel="" />
      <Animated.View style={wordStyle}>
        <Text
          style={[
            styles.wordmark,
            {
              color: wordColor,
              fontSize,
              letterSpacing: -fontSize * 0.055,
              lineHeight: fontSize * 1.06,
            },
          ]}
        >
          together
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  horizontal: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  lockup: {
    justifyContent: 'center',
  },
  stacked: {
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    fontFamily: 'SchibstedGrotesk_700Bold',
  },
});
