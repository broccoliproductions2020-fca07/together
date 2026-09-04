import { StyleSheet } from 'react-native';

/**
 * One height for every control in the sign-in stack (Apple, Google, e-mail).
 * They are the same class of control, so they take the same step — 52 next to
 * 56 was drift, not hierarchy. Hierarchy is carried by fill, not by 4 px.
 */
export const AUTH_CONTROL_HEIGHT = 56;

/** Shared press/disabled feedback styles reused by AuthScreen and AuthModeSwitch. */
export const authInteractionStyles = StyleSheet.create({
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
});
