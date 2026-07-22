import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { authInteractionStyles } from './authInteractionStyles';
import type { AuthFormMode } from './EmailAuthForm';

const AUTH_MODES: { value: AuthFormMode; label: string }[] = [
  { value: 'login', label: 'Einloggen' },
  { value: 'signup', label: 'Registrieren' },
];

const FAST_EASE = Easing.bezier(0.2, 0, 0, 1);

export type AuthModeSwitchProps = {
  mode: AuthFormMode;
  disabled?: boolean;
  onChange: (mode: AuthFormMode) => void;
};

export function AuthModeSwitch({ mode, disabled = false, onChange }: AuthModeSwitchProps) {
  const reducedMotion = useReducedMotion();
  const selected = useSharedValue(mode === 'signup' ? 1 : 0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    selected.value = reducedMotion
      ? mode === 'signup'
        ? 1
        : 0
      : withTiming(mode === 'signup' ? 1 : 0, { duration: 165, easing: FAST_EASE });
  }, [mode, reducedMotion, selected]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: selected.value * Math.max(0, (width - 8) / 2) }],
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
            accessibilityRole="button"
            accessibilityState={{ selected: item.value === mode, disabled }}
            disabled={disabled}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => [
              styles.modeButton,
              disabled ? authInteractionStyles.disabled : null,
              pressed && !disabled ? authInteractionStyles.pressed : null,
            ]}
          >
            <Animated.Text
              style={[styles.inactiveModeLabel, isLogin ? inactiveLoginStyle : inactiveSignupStyle]}
            >
              {item.label}
            </Animated.Text>
            <Animated.Text style={[styles.modeLabel, isLogin ? loginLabelStyle : signupLabelStyle]}>
              {item.label}
            </Animated.Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  inactiveModeLabel: {
    color: 'rgba(244,245,247,0.62)',
    fontSize: 14,
    fontWeight: '700',
    position: 'absolute',
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 15,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
    zIndex: 1,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  modePill: {
    backgroundColor: 'rgba(244,245,247,0.14)',
    borderColor: 'rgba(244,245,247,0.2)',
    borderRadius: 15,
    borderWidth: 1,
    bottom: 4,
    left: 4,
    position: 'absolute',
    top: 4,
  },
  modeSwitch: {
    backgroundColor: 'rgba(23,28,35,0.55)',
    borderColor: 'rgba(244,245,247,0.08)',
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    padding: 4,
  },
});
