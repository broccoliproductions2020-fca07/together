import { StyleSheet } from 'react-native';

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
