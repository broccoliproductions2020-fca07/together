import { useEffect } from 'react';
import { type DimensionValue, StyleSheet, View } from 'react-native';
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
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { COLORS } from '../colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

type EncounterProps = {
  /** Absolute placement of the pair's 120×80 stage, as percentages. */
  left: DimensionValue;
  top: DimensionValue;
  width: number;
  colorA: string;
  colorB: string;
  durationMs: number;
  delayMs: number;
};

// Path endpoints inside the 120×80 stage: far corners → near-meeting points.
const A_FROM = { x: 10, y: 64 };
const A_TO = { x: 48, y: 42 };
const B_FROM = { x: 110, y: 16 };
const B_TO = { x: 72, y: 38 };

/**
 * One ambient "Begegnung": two presence dots drift toward each other, a thin
 * line briefly connects them while both glow a little brighter, then the
 * moment dissolves — the app's story (people finding each other sponta-
 * neously) told at whisper volume in the background.
 */
function Encounter({ left, top, width, colorA, colorB, durationMs, delayMs }: EncounterProps) {
  const reducedMotion = useReducedMotion();
  // Rest at 0.6 = the connected moment, which is also the reduced-motion pose.
  const t = useSharedValue(0.6);

  useEffect(() => {
    if (reducedMotion) {
      t.value = 0.6;
      return;
    }
    t.value = 0;
    t.value = withDelay(
      delayMs,
      withRepeat(withTiming(1, { duration: durationMs, easing: Easing.linear }), -1, false),
    );
    return () => {
      t.value = 0.6;
    };
  }, [delayMs, durationMs, reducedMotion, t]);

  const dotOpacity = (peak: number) => {
    'worklet';
    return interpolate(t.value, [0, 0.12, 0.55, 0.72, 0.88, 1], [0, 0.4, peak, peak, 0, 0]);
  };

  const aProps = useAnimatedProps(() => ({
    cx: interpolate(t.value, [0.12, 0.5], [A_FROM.x, A_TO.x], 'clamp'),
    cy: interpolate(t.value, [0.12, 0.5], [A_FROM.y, A_TO.y], 'clamp'),
    opacity: dotOpacity(0.6),
  }));
  const bProps = useAnimatedProps(() => ({
    cx: interpolate(t.value, [0.12, 0.5], [B_FROM.x, B_TO.x], 'clamp'),
    cy: interpolate(t.value, [0.12, 0.5], [B_FROM.y, B_TO.y], 'clamp'),
    opacity: dotOpacity(0.6),
  }));

  const lineProps = useAnimatedProps(() => ({
    x1: interpolate(t.value, [0.12, 0.5], [A_FROM.x, A_TO.x], 'clamp'),
    y1: interpolate(t.value, [0.12, 0.5], [A_FROM.y, A_TO.y], 'clamp'),
    x2: interpolate(t.value, [0.12, 0.5], [B_FROM.x, B_TO.x], 'clamp'),
    y2: interpolate(t.value, [0.12, 0.5], [B_FROM.y, B_TO.y], 'clamp'),
    opacity: interpolate(t.value, [0.5, 0.58, 0.68, 0.78], [0, 0.38, 0.38, 0], 'clamp'),
  }));

  const height = width * (80 / 120);

  return (
    <View pointerEvents="none" style={{ height, left, position: 'absolute', top, width }}>
      <Svg height={height} viewBox="0 0 120 80" width={width}>
        <AnimatedLine animatedProps={lineProps} stroke={COLORS.paper} strokeWidth={0.9} />
        <AnimatedCircle animatedProps={aProps} fill={colorA} r={3.4} />
        <AnimatedCircle animatedProps={bProps} fill={colorB} r={3.4} />
      </Svg>
    </View>
  );
}

type TwinkleProps = {
  left: DimensionValue;
  top: DimensionValue;
  color: string;
  size: number;
  durationMs: number;
  delayMs: number;
};

/** A lone presence dot, slowly breathing — people who are simply "da". */
function Twinkle({ left, top, color, size, durationMs, delayMs }: TwinkleProps) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 0.5;
      return;
    }
    pulse.value = 0;
    pulse.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => {
      pulse.value = 0.5;
    };
  }, [delayMs, durationMs, pulse, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.1 + pulse.value * 0.22,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          backgroundColor: color,
          borderRadius: size / 2,
          height: size,
          left,
          position: 'absolute',
          top,
          width: size,
        },
        style,
      ]}
    />
  );
}

/**
 * Aurora backdrop: deep dark base + soft brand-color glows (NO fake map
 * lines), plus a quiet living layer — drifting presence dots that
 * occasionally find each other (`Encounter`) and lone slowly-breathing dots
 * (`Twinkle`). Everything stays far below foreground contrast.
 */
export function AuroraBackdrop() {
  const reducedMotion = useReducedMotion();
  const stageIn = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      stageIn.value = 1;
      return;
    }
    stageIn.value = withTiming(1, { duration: 900, easing: EASE });
  }, [reducedMotion, stageIn]);

  const stageStyle = useAnimatedStyle(() => ({
    opacity: interpolate(stageIn.value, [0, 1], [0.62, 1]),
    transform: [
      { scale: interpolate(stageIn.value, [0, 1], [1.035, 1]) },
      { translateY: interpolate(stageIn.value, [0, 1], [16, 0]) },
    ],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, stageStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#0B0E13" stopOpacity="0.2" />
              <Stop offset="0.52" stopColor="#0B0E13" stopOpacity="0" />
              <Stop offset="1" stopColor="#0B0E13" stopOpacity="0.6" />
            </LinearGradient>
            <RadialGradient id="glowBlue" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={COLORS.open} stopOpacity="0.32" />
              <Stop offset="1" stopColor={COLORS.open} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="glowGreen" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={COLORS.now} stopOpacity="0.22" />
              <Stop offset="1" stopColor={COLORS.now} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="glowAmber" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={COLORS.soon} stopOpacity="0.16" />
              <Stop offset="1" stopColor={COLORS.soon} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width="390" height="844" fill="#0B0E13" />

          {/* Soft brand-color glows — the base mood. */}
          <Circle cx={50} cy={130} r={260} fill="url(#glowBlue)" />
          <Circle cx={380} cy={440} r={300} fill="url(#glowGreen)" />
          <Circle cx={110} cy={820} r={280} fill="url(#glowAmber)" />

          <Rect width="390" height="844" fill="url(#fade)" />
        </Svg>

        {/* Living layer: Begegnungen + einzelne Presence-Punkte. */}
        <Encounter
          colorA={COLORS.now}
          colorB={COLORS.open}
          delayMs={1400}
          durationMs={11000}
          left="52%"
          top="7%"
          width={150}
        />
        <Encounter
          colorA={COLORS.soon}
          colorB={COLORS.now}
          delayMs={5600}
          durationMs={14000}
          left="4%"
          top="24%"
          width={130}
        />
        <Encounter
          colorA={COLORS.open}
          colorB={COLORS.soon}
          delayMs={9800}
          durationMs={12500}
          left="34%"
          top="40%"
          width={140}
        />
        <Twinkle color={COLORS.open} delayMs={600} durationMs={3400} left="16%" size={5} top="9%" />
        <Twinkle color={COLORS.now} delayMs={1900} durationMs={4200} left="84%" size={4} top="30%" />
        <Twinkle
          color={COLORS.soon}
          delayMs={900}
          durationMs={3800}
          left="10%"
          size={4}
          top="52%"
        />
        <Twinkle
          color={COLORS.open}
          delayMs={2700}
          durationMs={4600}
          left="70%"
          size={5}
          top="56%"
        />
      </Animated.View>
      <View style={styles.focusShade} />
    </View>
  );
}

const styles = StyleSheet.create({
  focusShade: {
    backgroundColor: 'rgba(14,17,22,0.18)',
    ...StyleSheet.absoluteFillObject,
  },
});
