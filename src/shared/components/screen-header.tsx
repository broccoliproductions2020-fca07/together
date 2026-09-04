import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';

import { FONT, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

/**
 * The sizes stay where they were (28 / 14) — 28 is off the scale, but a screen
 * title that grows to `display` wraps "Datenschutzerklärung" onto two lines.
 * Aligning it is a layout decision that needs a device, not a side effect of
 * fixing the typeface.
 */
const TITLE = { fontSize: 28, lineHeight: 32, letterSpacing: -0.7, fontFamily: FONT.bold };
const SUBTITLE = { ...TYPE.label, fontFamily: FONT.medium };

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
        <Text {...TEXT_FLEXIBLE} className="text-foreground" style={TITLE}>
          {title}
        </Text>
        {subtitle ? (
          <Text {...TEXT_FLEXIBLE} className="mt-1 text-muted-foreground" style={SUBTITLE}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
