import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { AppButton } from './app-button';

export interface AppStateViewProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  accent?: string;
  compact?: boolean;
}

/** Empty/error state with enough visual weight to feel intentional. */
export function AppStateView({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  accent = '#6E8BF7',
  compact = false,
}: AppStateViewProps) {
  return (
    <View
      className={`items-center rounded-[30px] border border-border bg-card px-7 ${
        compact ? 'py-8' : 'py-11'
      } shadow-sm`}
    >
      <View
        className="mb-5 h-[72px] w-[72px] items-center justify-center rounded-[26px] border"
        style={{ backgroundColor: `${accent}14`, borderColor: `${accent}2b` }}
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${accent}20` }}
        >
          <Ionicons name={icon} size={23} color={accent} />
        </View>
      </View>
      <Text className="text-center text-xl font-extrabold tracking-[-0.35px] text-foreground">
        {title}
      </Text>
      <Text className="mt-2 max-w-[290px] text-center text-sm leading-5 text-muted-foreground">
        {description}
      </Text>
      {actionLabel && onAction ? (
        <View className="mt-6 w-full max-w-[230px]">
          <AppButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
