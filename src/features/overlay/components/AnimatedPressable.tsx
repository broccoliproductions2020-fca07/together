import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressableRoot = Animated.createAnimatedComponent(Pressable);

export interface AnimatedPressableProps extends PressableProps {
  children: ReactNode;
  pressedScale?: number;
}

export function AnimatedPressable({
  children,
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  style,
  ...props
}: AnimatedPressableProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      scale.value = 1;
    }
  }, [reducedMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressableRoot
      style={[animatedStyle, style]}
      onPressIn={(event) => {
        if (!reducedMotion) {
          scale.value = withTiming(pressedScale, { duration: 120 });
        }
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
