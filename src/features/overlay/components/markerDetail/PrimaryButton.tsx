import { Ionicons } from '@expo/vector-icons';
import { Text } from 'react-native';

import { AnimatedPressable } from '../AnimatedPressable';

export function PrimaryButton({
  label,
  accent,
  icon,
  onPress,
}: {
  label: string;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[54px] flex-row items-center justify-center gap-2 rounded-2xl px-5"
      style={{ backgroundColor: accent }}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color="#ffffff" />
      <Text className="text-base font-bold text-white">{label}</Text>
    </AnimatedPressable>
  );
}
