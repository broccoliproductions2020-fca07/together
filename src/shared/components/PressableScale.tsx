import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../utils/haptics';

const AnimatedPressableRoot = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends PressableProps {
  children: ReactNode;
  /** Scale reached while held. 0.97 mirrors the app's existing press language. */
  pressedScale?: number;
  /** Light haptic tap on press-in. On by default; suppressed while disabled. */
  haptic?: boolean;
}

/**
 * Shared press primitive: a scale-down-on-hold Pressable (reduced-motion aware)
 * with an optional light haptic. It is the single place the app's tactile press
 * feel lives, so buttons built on it stay consistent instead of each re-deriving
 * their own press animation.
 */
export function PressableScale({
  children,
  pressedScale = 0.97,
  haptic = true,
  disabled,
  onPressIn,
  onPressOut,
  style,
  ...props
}: PressableScaleProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) scale.value = 1;
  }, [reducedMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressableRoot
      disabled={disabled}
      style={[animatedStyle, style]}
      onPressIn={(event) => {
        if (!reducedMotion) {
          scale.value = withTiming(pressedScale, { duration: 120 });
        }
        if (haptic && !disabled) haptics.light();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!reducedMotion) {
          scale.value = withTiming(1, { duration: 140 });
        }
        onPressOut?.(event);
      }}
      {...props}
    >
      {children}
    </AnimatedPressableRoot>
  );
}
