import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { FONT, TYPE, TEXT_CAPPED } from '@/shared/theme';
import { haptics } from '@/shared/utils/haptics';

import { authInteractionStyles } from './authInteractionStyles';
import type { AuthFormMode } from './EmailAuthForm';

const AUTH_MODES: { value: AuthFormMode; label: string }[] = [
  { value: 'login', label: 'Einloggen' },
  { value: 'signup', label: 'Registrieren' },
];

const FAST_EASE = Easing.bezier(0.2, 0, 0, 1);
// The pill settles with a little weight; the labels cross-fade linearly so text
// never looks like it is bouncing.
const PILL_SPRING = { damping: 20, stiffness: 220, mass: 0.7 } as const;

export type AuthModeSwitchProps = {
  mode: AuthFormMode;
  disabled?: boolean;
  onChange: (mode: AuthFormMode) => void;
};

export function AuthModeSwitch({ mode, disabled = false, onChange }: AuthModeSwitchProps) {
  const reducedMotion = useReducedMotion();
  const selected = useSharedValue(mode === 'signup' ? 1 : 0);
  const slide = useSharedValue(mode === 'signup' ? 1 : 0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const target = mode === 'signup' ? 1 : 0;
    selected.value = reducedMotion
      ? target
      : withTiming(target, { duration: 165, easing: FAST_EASE });
    slide.value = reducedMotion ? target : withSpring(target, PILL_SPRING);
  }, [mode, reducedMotion, selected, slide]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value * Math.max(0, (width - 8) / 2) }],
  }));

  const loginLabelStyle = useAnimatedStyle(() => ({
    color: `rgba(244,245,247,${interpolate(selected.value, [0, 1], [1, 0])})`,
    opacity: interpolate(selected.value, [0, 1], [1, 0.55]),
  }));

  const signupLabelStyle = useAnimatedStyle(() => ({
    color: `rgba(244,245,247,${interpolate(selected.value, [0, 1], [0, 1])})`,
    opacity: interpolate(selected.value, [0, 1], [0.55, 1]),
  }));

  const inactiveLoginStyle = useAnimatedStyle(() => ({
    opacity: interpolate(selected.value, [0, 1], [0, 1]),
  }));

  const inactiveSignupStyle = useAnimatedStyle(() => ({
    opacity: interpolate(selected.value, [0, 1], [1, 0]),
  }));

  return (
    <View style={styles.modeSwitch} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Animated.View style={[styles.modePill, { width: (width - 8) / 2 }, pillStyle]} />
      ) : null}
      {AUTH_MODES.map((item) => {
        const isLogin = item.value === 'login';

        return (
          <Pressable
            key={item.value}
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: item.value === mode, disabled }}
            disabled={disabled}
            onPress={() => {
              if (item.value === mode) return;
              haptics.selection();
              onChange(item.value);
            }}
            style={({ pressed }) => [
              styles.modeButton,
              disabled ? authInteractionStyles.disabled : null,
              pressed && !disabled ? authInteractionStyles.pressed : null,
            ]}
          >
            <Animated.Text
              style={[styles.inactiveModeLabel, isLogin ? inactiveLoginStyle : inactiveSignupStyle]}
              {...TEXT_CAPPED}
            >
              {item.label}
            </Animated.Text>
            <Animated.Text
              style={[styles.modeLabel, isLogin ? loginLabelStyle : signupLabelStyle]}
              {...TEXT_CAPPED}
            >
              {item.label}
            </Animated.Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Static font files: set `fontFamily` only — combining it with `fontWeight`
  // makes Android synthesize a fake bold on top of the real one (see AGENTS.md).
  inactiveModeLabel: {
    color: 'rgba(244,245,247,0.62)',
    fontFamily: FONT.semibold,
    ...TYPE.label,
    position: 'absolute',
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 16,
    zIndex: 1,
  },
  modeLabel: {
    fontFamily: FONT.bold,
    ...TYPE.label,
  },
  modePill: {
    backgroundColor: 'rgba(244,245,247,0.14)',
    borderColor: 'rgba(244,245,247,0.2)',
    borderRadius: 16,
    borderWidth: 1,
    bottom: 4,
    left: 4,
    position: 'absolute',
    top: 4,
  },
  modeSwitch: {
    backgroundColor: 'rgba(23,28,35,0.55)',
    borderColor: 'rgba(244,245,247,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    padding: 4,
  },
});
