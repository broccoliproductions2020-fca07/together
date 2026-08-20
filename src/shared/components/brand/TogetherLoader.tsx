import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { TOGETHER_BRAND } from './brandTokens';
import {
  MICA_FIGURE_ASPECT_RATIO,
  MICA_FIGURE_PARTS,
  MICA_FIGURE_VIEW_BOX,
} from './micaLogo';

const DIM = 0.28;
const UP = 420;
const DOWN = 560;
const STAGGER = 180;
const EASE = Easing.inOut(Easing.ease);

export type TogetherLoaderProps = {
  size?: number;
  tile?: boolean;
  /**
   * The loader sits on dark chrome everywhere it is currently mounted, so the
   * default stays light. Pass a colour for any surface that is not.
   */
  color?: string;
  accessibilityLabel?: string;
};

/**
 * The Mica figure's three parts pulse in sequence — arm, head, body. It reads
 * as the familiar three-beat loader while still being the mark itself.
 *
 * Each part gets its own `Svg` in a stacked, identically sized layer rather
 * than one `Svg` with animated path props: all three share the same view box,
 * so they compose back into the exact figure, and animating plain View opacity
 * keeps this off the SVG-prop interop path entirely.
 */
export function TogetherLoader({
  size = 36,
  tile = false,
  color = TOGETHER_BRAND.paper,
  accessibilityLabel = 'Wird geladen',
}: TogetherLoaderProps) {
  const reducedMotion = useReducedMotion();
  const markHeight = tile ? size * 0.6 : size * 0.86;
  const markWidth = markHeight * MICA_FIGURE_ASPECT_RATIO;

  const a = useSharedValue(1);
  const b = useSharedValue(1);
  const c = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      a.value = 1;
      b.value = 1;
      c.value = 1;
      return;
    }
    const beat = (delay: number) =>
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: UP, easing: EASE }),
            withTiming(DIM, { duration: DOWN, easing: EASE }),
          ),
          -1,
          false,
        ),
      );
    a.value = beat(0);
    b.value = beat(STAGGER);
    c.value = beat(STAGGER * 2);
    return () => {
      a.value = 1;
      b.value = 1;
      c.value = 1;
    };
  }, [a, b, c, reducedMotion]);

  const armStyle = useAnimatedStyle(() => ({ opacity: a.value }));
  const headStyle = useAnimatedStyle(() => ({ opacity: b.value }));
  const bodyStyle = useAnimatedStyle(() => ({ opacity: c.value }));
  const byBeat = [armStyle, headStyle, bodyStyle];

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[
        styles.container,
        tile
          ? {
              backgroundColor: TOGETHER_BRAND.inkRaised,
              borderColor: TOGETHER_BRAND.line,
              borderRadius: size * 0.24,
              borderWidth: 1,
              height: size,
              width: size,
            }
          : { height: size, width: size },
      ]}
    >
      <View style={{ height: markHeight, width: markWidth }}>
        {MICA_FIGURE_PARTS.map((part) => (
          <Animated.View
            key={part.key}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, byBeat[part.beat]]}
          >
            <Svg
              height="100%"
              preserveAspectRatio="xMidYMid meet"
              viewBox={MICA_FIGURE_VIEW_BOX}
              width="100%"
            >
              <Path d={part.d} fill={color} />
            </Svg>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
