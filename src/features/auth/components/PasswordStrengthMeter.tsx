import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';

import { FONT, TYPE } from '@/shared/theme';

import { evaluatePassword } from '../utils/passwordStrength';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const TRACK = 'rgba(244,245,247,0.1)';
const MUTED = 'rgba(244,245,247,0.5)';
const DANGER = '#FCA5A5';

/** Weak → strong, using the app's own mode palette rather than a generic traffic light. */
const TONES = [DANGER, '#E0A23E', '#E0A23E', '#41C08D', '#41C08D'] as const;

interface PasswordStrengthMeterProps {
  password: string;
}

/**
 * Live strength feedback for the sign-up password.
 *
 * It exists so the length requirement is visible *while typing* instead of
 * arriving as a rejection after submit — the single cheapest fix for the
 * "type a password, get told off" pattern. It shows encouragement, not a gate:
 * the actual rule (8 characters) lives in `evaluatePassword`.
 */
export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const reduced = useReducedMotion();
  const { score, label, acceptable } = evaluatePassword(password);

  // 0 characters → an empty track, so the meter does not shout before anyone typed.
  const filled = password.length === 0 ? 0 : Math.max(score, 1);
  const progress = useDerivedValue(
    () => (reduced ? filled / 4 : withTiming(filled / 4, { duration: 260, easing: EASE })),
    [filled, reduced],
  );

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View accessible accessibilityLabel={label ? `Passwortstärke: ${label}` : 'Passwortstärke'}>
      <View style={styles.track}>
        <Animated.View
          style={[styles.bar, barStyle, { backgroundColor: TONES[Math.max(0, filled - 1)] }]}
        />
      </View>
      {label ? (
        <Text style={[styles.label, acceptable ? null : styles.labelWarn]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 999,
    height: '100%',
  },
  label: {
    color: MUTED,
    fontFamily: FONT.medium,
    ...TYPE.micro,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  labelWarn: {
    color: DANGER,
  },
  track: {
    backgroundColor: TRACK,
    borderRadius: 999,
    height: 4,
    marginHorizontal: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
});
