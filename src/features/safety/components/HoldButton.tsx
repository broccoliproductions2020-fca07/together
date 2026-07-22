import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export interface HoldButtonProps {
  label: string;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  /** How long the user must hold — deliberate friction against accidents. */
  durationMs: number;
  /** Filled style = primary action; outline = secondary/destructive-quiet. */
  variant?: 'filled' | 'outline';
  disabled?: boolean;
  onComplete: () => void;
}

/**
 * Hold-to-activate: a progress fill grows while pressing; releasing early
 * cancels. The safety contract forbids instant taps for state changes — the
 * hold IS the confirmation, so there is never a dialog after it.
 */
export function HoldButton({
  label,
  hint,
  icon,
  color,
  durationMs,
  variant = 'filled',
  disabled = false,
  onComplete,
}: HoldButtonProps) {
  const progress = useSharedValue(0);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const start = () => {
    progress.value = withTiming(1, { duration: durationMs }, (finished) => {
      if (finished) {
        progress.value = 0;
        runOnJS(onComplete)();
      }
    });
  };

  const cancel = () => {
    progress.value = withTiming(0, { duration: 120 });
  };

  const filled = variant === 'filled';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} — halten`}
      disabled={disabled}
      onPressIn={start}
      onPressOut={cancel}
      className="min-h-14 overflow-hidden rounded-2xl border"
      style={{
        borderColor: filled ? color : `${color}66`,
        backgroundColor: filled ? `${color}2E` : 'rgba(255,255,255,0.04)',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {/* Progress fill — visible feedback that holding is working. */}
      <Animated.View
        pointerEvents="none"
        className="absolute bottom-0 left-0 top-0"
        style={[{ backgroundColor: filled ? color : `${color}55` }, fillStyle]}
      />
      <View className="min-h-14 flex-row items-center justify-center gap-2 px-4">
        <Ionicons name={icon} size={19} color={filled ? '#fff' : color} />
        <Text className="text-base font-extrabold" style={{ color: filled ? '#fff' : color }}>
          {label}
        </Text>
        {hint ? <Text className="text-xs font-semibold text-white/55">{hint}</Text> : null}
      </View>
    </Pressable>
  );
}
