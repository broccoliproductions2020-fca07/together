import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type IconName = keyof typeof Ionicons.glyphMap;

export interface AnimatedToggleIconProps {
  /** Filled glyph shown when active (e.g. `heart`, `flash`, `checkmark-circle`). */
  icon: IconName;
  /** Outline glyph shown when inactive. Defaults to `${icon}-outline`. */
  outlineIcon?: IconName;
  active: boolean;
  size?: number;
  /** Colour of the filled (active) glyph. */
  activeColor: string;
  /** Colour of the outline (inactive) glyph. */
  inactiveColor: string;
}

/**
 * A selectable icon that morphs between its outline and filled form with a
 * springy pop on selection — the satisfying "it reacted" micro-interaction.
 * Two glyphs are cross-faded (so the colour shifts too) and the whole icon
 * overshoots once when it becomes active. Respects reduce-motion (instant swap).
 */
export function AnimatedToggleIcon({
  icon,
  outlineIcon,
  active,
  size = 20,
  activeColor,
  inactiveColor,
}: AnimatedToggleIconProps) {
  const reducedMotion = useReducedMotion();
  const outline = outlineIcon ?? (`${icon}-outline` as IconName);
  const progress = useSharedValue(active ? 1 : 0); // 0 outline → 1 filled
  const pop = useSharedValue(1);
  const mounted = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = active ? 1 : 0;
      return;
    }
    progress.value = withTiming(active ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
    // Pop only when it becomes active, and never on the very first render.
    if (mounted.current && active) {
      pop.value = withSequence(
        withTiming(1.28, { duration: 120, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 6, stiffness: 220, mass: 0.5 }),
      );
    }
  }, [active, reducedMotion, pop, progress]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  const containerStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const filledStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View style={[{ height: size, width: size }, containerStyle]}>
      <Animated.View style={[styles.layer, outlineStyle]}>
        <Ionicons name={outline} size={size} color={inactiveColor} />
      </Animated.View>
      <Animated.View style={[styles.layer, filledStyle]}>
        <Ionicons name={icon} size={size} color={activeColor} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { left: 0, position: 'absolute', top: 0 },
});
