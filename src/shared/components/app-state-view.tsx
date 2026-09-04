import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { FONT, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { SEMANTIC_COLOR } from '../utils/semanticColors';

import { SquircleButton } from './SquircleButton';

// 20 is off the scale; kept as-is so fixing the typeface does not also resize
// every empty state in the app.
const TITLE = { fontSize: 20, lineHeight: 26, letterSpacing: -0.35, fontFamily: FONT.bold };
const DESCRIPTION = { ...TYPE.label, fontFamily: FONT.medium };

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
  accent = SEMANTIC_COLOR.action,
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
      <Text {...TEXT_FLEXIBLE} className="text-center text-foreground" style={TITLE}>
        {title}
      </Text>
      <Text
        {...TEXT_FLEXIBLE}
        className="mt-2 max-w-[290px] text-center text-muted-foreground"
        style={DESCRIPTION}
      >
        {description}
      </Text>
      {actionLabel && onAction ? (
        <View className="mt-6 w-full max-w-[230px]">
          <SquircleButton label={actionLabel} color={accent} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
