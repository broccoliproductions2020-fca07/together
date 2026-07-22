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
import Svg, { Path } from 'react-native-svg';

import { TOGETHER_BRAND } from './brandTokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const DRAW_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const MAIN_LENGTH = 150;
const JOIN_LENGTH = 70;
const BAR_LENGTH = 72;

// Bespoke lowercase t: the indigo route joins the white stem before both
// continue as one letter. In the lockup this glyph literally replaces the t.
const MAIN_PATH = 'M43 15 L43 78 C43 90 50 96 63 94';
const JOIN_PATH = 'M14 92 C27 92 35 82 43 70';
const BAR_PATH = 'M16 39 H70';

export type TogetherMarkProps = {
  /** Glyph height. Its width stays proportional to the custom letterform. */
  size?: number;
  animated?: boolean;
  idle?: boolean;
  accessibilityLabel?: string;
  color?: string;
};

export function TogetherMark({
  size = 112,
  animated = true,
  idle = false,
  accessibilityLabel = 'Together',
  color = TOGETHER_BRAND.paper,
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
    draw.value = withTiming(1, { duration: 920, easing: DRAW_EASE });
  }, [animated, draw, reducedMotion]);

  useEffect(() => {
    if (!idle || reducedMotion) {
      flow.value = 0;
      return;
    }

    flow.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1, false);
    return () => {
      flow.value = 0;
    };
  }, [flow, idle, reducedMotion]);

  const mainProps = useAnimatedProps(() => ({
    opacity: interpolate(draw.value, [0, 0.06, 1], [0, 1, 1]),
    strokeDashoffset: MAIN_LENGTH * (1 - draw.value),
  }));

  const joinProps = useAnimatedProps(() => ({
    opacity: interpolate(draw.value, [0.12, 0.24, 1], [0, 1, 1]),
    strokeDashoffset: JOIN_LENGTH * (1 - interpolate(draw.value, [0.12, 0.82], [0, 1], 'clamp')),
  }));

  const barProps = useAnimatedProps(() => ({
    opacity: interpolate(draw.value, [0.36, 0.5, 1], [0, 1, 1]),
    strokeDashoffset: BAR_LENGTH * (1 - interpolate(draw.value, [0.36, 1], [0, 1], 'clamp')),
  }));

  const sheenProps = useAnimatedProps(() => ({
    opacity: idle ? interpolate(flow.value, [0, 0.12, 0.7, 1], [0, 0.56, 0.56, 0]) : 0,
    strokeDashoffset: JOIN_LENGTH * (1 - flow.value),
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: interpolate(draw.value, [0, 0.1, 1], [0, 1, 1]),
    transform: [{ scale: interpolate(draw.value, [0, 1], [0.985, 1]) }],
  }));

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={[{ height: size, width: size * 0.77 }, markStyle]}
    >
      <Svg height="100%" viewBox="0 0 86 112" width="100%">
        <AnimatedPath
          animatedProps={mainProps}
          d={MAIN_PATH}
          fill="none"
          stroke={color}
          strokeDasharray={`${MAIN_LENGTH} ${MAIN_LENGTH}`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={9.5}
        />
        <AnimatedPath
          animatedProps={joinProps}
          d={JOIN_PATH}
          fill="none"
          stroke={TOGETHER_BRAND.indigo}
          strokeDasharray={`${JOIN_LENGTH} ${JOIN_LENGTH}`}
          strokeLinecap="round"
          strokeWidth={9.5}
        />
        <AnimatedPath
          animatedProps={barProps}
          d={BAR_PATH}
          fill="none"
          stroke={color}
          strokeDasharray={`${BAR_LENGTH} ${BAR_LENGTH}`}
          strokeLinecap="round"
          strokeWidth={9.5}
        />
        <AnimatedPath
          animatedProps={sheenProps}
          d={JOIN_PATH}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeDasharray={`9 ${JOIN_LENGTH - 9}`}
          strokeLinecap="round"
          strokeWidth={2.2}
        />
      </Svg>
    </Animated.View>
  );
}

export type TogetherLockupProps = {
  width?: number;
  /** Kept for call-site compatibility; the v3 mark is always part of the word. */
  layout?: 'horizontal' | 'stacked';
  animated?: boolean;
  idle?: boolean;
  wordColor?: string;
};

/** Integrated wordmark: the custom mark is the first letter of "together". */
export function TogetherLockup({
  width = 286,
  animated = true,
  idle = false,
  wordColor = TOGETHER_BRAND.paper,
}: TogetherLockupProps) {
  const reducedMotion = useReducedMotion();
  const reveal = useSharedValue(animated && !reducedMotion ? 0 : 1);
  const fontSize = width * 0.207;
  const markSize = fontSize * 1.14;

  useEffect(() => {
    if (!animated || reducedMotion) {
      reveal.value = 1;
      return;
    }

    reveal.value = 0;
    reveal.value = withDelay(470, withTiming(1, { duration: 520, easing: DRAW_EASE }));
  }, [animated, reducedMotion, reveal]);

  const wordStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateX: (1 - reveal.value) * -7 }],
  }));

  return (
    <View
      accessibilityLabel="Together"
      accessibilityRole="image"
      style={[styles.lockup, { height: fontSize * 1.24, width }]}
    >
      <TogetherMark
        accessibilityLabel=""
        animated={animated}
        color={wordColor}
        idle={idle}
        size={markSize}
      />
      <Animated.View style={[styles.wordSlot, wordStyle]}>
        <Text
          style={[
            styles.wordmark,
            {
              color: wordColor,
              fontSize,
              letterSpacing: -fontSize * 0.055,
              lineHeight: fontSize * 1.03,
            },
          ]}
        >
          ogether
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  wordSlot: {
    marginLeft: -3,
  },
  wordmark: {
    fontFamily: 'SchibstedGrotesk_700Bold',
  },
});
