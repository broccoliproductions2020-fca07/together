import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { TOGETHER_BRAND } from './brandTokens';
import { MicaFigure, MicaWordmark, type MicaFigureTone } from './micaLogo';

const REVEAL_EASE = Easing.bezier(0.22, 1, 0.36, 1);

export type TogetherMarkProps = {
  size?: number;
  animated?: boolean;
  idle?: boolean;
  accessibilityLabel?: string;
  color?: string;
  tone?: MicaFigureTone;
};

/** Compact Mica figure, used for loading, the Core rest state and welcome. */
export function TogetherMark({
  size = 112,
  animated = true,
  idle = false,
  accessibilityLabel = 'Mica',
  color = TOGETHER_BRAND.paper,
  tone = 'inherit',
}: TogetherMarkProps) {
  const reducedMotion = useReducedMotion();
  const reveal = useSharedValue(animated && !reducedMotion ? 0 : 1);
  const pulse = useSharedValue(0);

  useEffect(() => {
    reveal.value =
      !animated || reducedMotion ? 1 : withTiming(1, { duration: 620, easing: REVEAL_EASE });
  }, [animated, reducedMotion, reveal]);

  useEffect(() => {
    if (!idle || reducedMotion) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      pulse.value = 0;
    };
  }, [idle, pulse, reducedMotion]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: interpolate(reveal.value, [0, 1], [6, 0]) },
      { scale: 0.985 + pulse.value * 0.015 },
    ],
  }));

  return (
    <Animated.View style={markStyle}>
      <MicaFigure
        accessibilityLabel={accessibilityLabel}
        color={color}
        size={size}
        tone={tone}
      />
    </Animated.View>
  );
}

export type TogetherLockupProps = {
  width?: number;
  layout?: 'horizontal' | 'stacked';
  animated?: boolean;
  idle?: boolean;
  wordColor?: string;
  figureTone?: MicaFigureTone;
};

/** Full Mica wordmark. The reveal stays intentionally quiet on boot screens. */
export function TogetherLockup({
  width = 286,
  animated = true,
  idle = false,
  wordColor = TOGETHER_BRAND.paper,
  figureTone = 'inherit',
}: TogetherLockupProps) {
  const reducedMotion = useReducedMotion();
  const reveal = useSharedValue(animated && !reducedMotion ? 0 : 1);
  const pulse = useSharedValue(0);

  useEffect(() => {
    reveal.value =
      !animated || reducedMotion
        ? 1
        : withDelay(180, withTiming(1, { duration: 540, easing: REVEAL_EASE }));
  }, [animated, reducedMotion, reveal]);

  useEffect(() => {
    if (!idle || reducedMotion) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      pulse.value = 0;
    };
  }, [idle, pulse, reducedMotion]);

  const lockupStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: interpolate(reveal.value, [0, 1], [7, 0]) },
      { scale: 0.992 + pulse.value * 0.008 },
    ],
  }));

  return (
    <Animated.View accessibilityLabel="Mica" accessibilityRole="image" style={lockupStyle}>
      <View pointerEvents="none">
        <MicaWordmark
          accessibilityLabel=""
          color={wordColor}
          figureTone={figureTone}
          width={width}
        />
      </View>
    </Animated.View>
  );
}
