import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

export function InfoRow({
  icon,
  text,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  accent: string;
}) {
  return (
    <View className="flex-row items-center gap-2.5">
      <Ionicons name={icon} size={17} color={accent} />
      <Text className="text-sm text-foreground">{text}</Text>
    </View>
  );
}
