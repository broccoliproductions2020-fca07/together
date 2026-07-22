import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Glass input row that softly lights up (accent border + tint) while focused. */
export function GlassField({
  focused,
  children,
  accent = '#6E8BF7',
}: {
  focused: boolean;
  children: ReactNode;
  accent?: string;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, {
      duration: reducedMotion ? 0 : 160,
      easing: EASE,
    });
  }, [focused, progress, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(23,28,35,0.72)', 'rgba(27,33,43,0.88)'],
    ),
    borderColor: interpolateColor(progress.value, [0, 1], ['rgba(244,245,247,0.13)', accent]),
  }));

  return <Animated.View style={[styles.field, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  field: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 16,
  },
});
