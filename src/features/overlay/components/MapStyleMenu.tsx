import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';

import type { MapStylePreference } from '@/features/map/mapStyle/types';
import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

import { FloatingSurface } from './FloatingSurface';
import { useOverlayColors } from './overlayTheme';

// Filled glyphs — the active style's icon morphs from its outline form with a pop.
const OPTIONS: {
  value: MapStylePreference;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'dynamic', label: 'Automatisch', icon: 'partly-sunny' },
  { value: 'light', label: 'Tag', icon: 'sunny' },
  { value: 'dark', label: 'Nacht', icon: 'moon' },
];

const ACCENT = SEMANTIC_COLOR.action;

/** Small map-style popover opened from the layers button. */
export function MapStyleMenu({
  preference,
  onSelect,
}: {
  preference: MapStylePreference;
  onSelect: (value: MapStylePreference) => void;
}) {
  const colors = useOverlayColors();

  return (
    <FloatingSurface className="rounded-2xl" contentClassName="gap-0.5 px-1.5 py-1.5">
      <Text className="px-2.5 pb-1 pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Kartenstil
      </Text>
      {OPTIONS.map((option) => {
        const active = option.value === preference;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Kartenstil ${option.label}`}
            className="flex-row items-center gap-2.5 rounded-xl py-2.5 pl-2.5 pr-3 active:opacity-70"
            onPress={() => onSelect(option.value)}
          >
            <AnimatedToggleIcon
              icon={option.icon}
              active={active}
              size={18}
              activeColor={ACCENT}
              inactiveColor={colors.icon}
            />
            {/* No flex-1 here: the text keeps its natural width so the popup
                hugs the widest row and each label stays on ONE line (flex-1
                without a min-width collapsed the text to letter-per-line). */}
            <Text
              className="text-sm font-semibold"
              numberOfLines={1}
              style={{ color: active ? ACCENT : colors.icon }}
            >
              {option.label}
            </Text>
            {active ? <Ionicons name="checkmark" size={17} color={ACCENT} /> : null}
          </Pressable>
        );
      })}
    </FloatingSurface>
  );
}
