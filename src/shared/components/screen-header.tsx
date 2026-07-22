import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: ReactNode;
}

/** Consistent top-level screen header with an explicit way back. */
export function ScreenHeader({ title, subtitle, onBack, action }: ScreenHeaderProps) {
  const iconColor = useColorScheme() === 'dark' ? 'rgb(242,239,233)' : 'rgb(20,33,28)';

  return (
    <View className="flex-row items-center gap-3">
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          className="h-11 w-11 items-center justify-center rounded-full border border-border bg-card shadow-sm active:opacity-80"
          onPress={onBack}
        >
          <Ionicons name="chevron-back" size={21} color={iconColor} />
        </Pressable>
      ) : null}
      <View className="flex-1">
        <Text className="text-[28px] font-extrabold leading-8 tracking-[-0.7px] text-foreground">
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-1 text-sm leading-5 text-muted-foreground">{subtitle}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
