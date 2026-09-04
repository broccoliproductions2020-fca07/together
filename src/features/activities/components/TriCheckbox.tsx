import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { haptics } from '@/shared/utils/haptics';

import type { CheckState } from '../utils/audienceSelection';

const BOX = 24;
/** The composer surface, showing through a partially-selected box so the accent
 * dash stays legible against it. */
const SURFACE = '#0E1116';
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const DURATION = 170;

export interface TriCheckboxProps {
  state: CheckState;
  accent: string;
  onPress: () => void;
  /** Spoken by the screen reader; the checked/mixed state travels separately. */
  accessibilityLabel: string;
  disabled?: boolean;
}

/**
 * Three-state checkbox: on, off, and partially selected.
 *
 * The partial state is drawn as a DASH, never as a lighter fill — the three
 * states have to be distinguishable without colour, and a "slightly less filled
 * box" is exactly the distinction that disappears for a colour-blind user and
 * in bright sunlight alike.
 *
 * `accessibilityState.checked` takes React Native's own `'mixed'` value rather
 * than a hand-written label. TalkBack and VoiceOver both announce it natively,
 * and spelling it out in the label as well makes it announced twice.
 */
export function TriCheckbox({
  state,
  accent,
  onPress,
  accessibilityLabel,
  disabled = false,
}: TriCheckboxProps) {
  const reducedMotion = useReducedMotion();

  const filled = useDerivedValue(() => {
    const target = state === 'off' ? 0 : 1;
    return reducedMotion ? target : withTiming(target, { duration: DURATION, easing: EASE });
  }, [state, reducedMotion]);

  const checkProgress = useDerivedValue(() => {
    const target = state === 'on' ? 1 : 0;
    return reducedMotion ? target : withTiming(target, { duration: DURATION, easing: EASE });
  }, [state, reducedMotion]);

  const dashProgress = useDerivedValue(() => {
    const target = state === 'partial' ? 1 : 0;
    return reducedMotion ? target : withTiming(target, { duration: DURATION, easing: EASE });
  }, [state, reducedMotion]);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(filled.value, [0, 1], ['rgba(255,255,255,0)', accent]),
    borderColor: interpolateColor(filled.value, [0, 1], ['rgba(255,255,255,0.28)', accent]),
  }));

  const partialFillStyle = useAnimatedStyle(() => ({ opacity: dashProgress.value }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: checkProgress.value }));
  const dashStyle = useAnimatedStyle(() => ({ opacity: dashProgress.value }));

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{
        checked: state === 'on' ? true : state === 'partial' ? 'mixed' : false,
        disabled,
      }}
      disabled={disabled}
      // Visually 24px, reachable at the 44px platform floor.
      hitSlop={10}
      onPress={() => {
        if (disabled) return;
        haptics.selection();
        onPress();
      }}
      style={styles.press}
    >
      <Animated.View style={[styles.box, boxStyle]}>
        {/* Partial: accent border, muted fill. Drawn under the glyphs. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: SURFACE }, partialFillStyle]}
        />
        <Animated.View style={[styles.glyph, checkStyle]}>
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke={SURFACE}
              strokeWidth={3.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.glyph, dashStyle]}>
          <View style={[styles.dash, { backgroundColor: accent }]} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1.8,
    height: BOX,
    justifyContent: 'center',
    overflow: 'hidden',
    width: BOX,
  },
  dash: { borderRadius: 2, height: 2.6, width: 12 },
  glyph: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  press: { alignItems: 'center', justifyContent: 'center' },
});
