import { Pressable, Text, View } from 'react-native';

export interface AvailableBubbleProps {
  count: number;
  text: string;
  onPress?: () => void;
}

export function AvailableBubble({ count, text, onPress }: AvailableBubbleProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      className="min-h-16 min-w-32 items-center justify-center rounded-full border border-teal/25 bg-card/80 px-5 py-3 shadow-lg"
      onPress={onPress}
    >
      <View className="flex-row items-center gap-1">
        <Text className="text-2xl font-bold text-foreground">{count}</Text>
        <Text className="text-sm font-semibold text-teal">open</Text>
      </View>
      <Text className="text-xs font-medium text-muted-foreground">
        {text.replace(`${count} `, '')}
      </Text>
    </Pressable>
  );
}
