import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { markerModeStyles } from '@/features/map/utils/markerStyles';
import { onColorTextColor } from '@/shared/utils/contrastColor';
import { haptics } from '@/shared/utils/haptics';

import type { ActivityMode } from '../types';

// "open" is intentionally NOT a creatable activity here — it's a lightweight
// presence toggle that lives in the NearbySheet (OpenStatusCard), not the
// composer. The composer only creates real events: Jetzt (now) and Soon.
const MODES: ActivityMode[] = ['now', 'soon'];
const MODE_LABELS: Record<ActivityMode, string> = {
  open: 'Open',
  soon: 'Soon',
  now: 'Jetzt',
};
// Filled glyphs — AnimatedToggleIcon derives the `-outline` form for the
// unselected state and morphs between them with a pop on selection.
const MODE_ICONS: Record<ActivityMode, keyof typeof Ionicons.glyphMap> = {
  open: 'compass',
  soon: 'calendar-clear',
  now: 'flash',
};
const MODE_COLORS = ['#41C08D', '#E0A23E'];
const MODE_INDEX: Record<ActivityMode, number> = {
  now: 0,
  soon: 1,
  open: 1,
};
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export interface ActivityModeSwitchProps {
  mode: ActivityMode;
  onChange: (mode: ActivityMode) => void;
}

export function ActivityModeSwitch({ mode, onChange }: ActivityModeSwitchProps) {
  const reducedMotion = useReducedMotion();
  const selected = useSharedValue(MODE_INDEX[mode]);
  const [width, setWidth] = useState(0);
  const segmentWidth = width > 0 ? (width - 8) / MODES.length : 0;

  useEffect(() => {
    selected.value = reducedMotion
      ? MODE_INDEX[mode]
      : withTiming(MODE_INDEX[mode], { duration: 240, easing: EASE });
  }, [mode, reducedMotion, selected]);

  const activeStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(selected.value, [0, 1], MODE_COLORS),
    opacity: width > 0 ? 1 : 0,
    transform: [{ translateX: selected.value * segmentWidth }],
  }));

  return (
    <View
      className="relative flex-row overflow-hidden rounded-full border border-white/10 bg-white/10 p-1"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        pointerEvents="none"
        className="absolute bottom-1 left-1 top-1 rounded-full shadow-sm"
        style={[{ width: segmentWidth }, activeStyle]}
      />
      {MODES.map((item) => {
        const active = mode === item;
        // Active tab sits on the mode-colour fill → contrast-safe foreground
        // (white fails WCAG on green/amber); inactive sits on the dark track.
        const activeForeground = onColorTextColor(markerModeStyles[item].color);
        return (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={`Mode ${markerModeStyles[item].label}`}
            accessibilityState={{ selected: active }}
            className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-full px-3"
            onPress={() => {
              if (item !== mode) haptics.selection();
              onChange(item);
            }}
          >
            <AnimatedToggleIcon
              icon={MODE_ICONS[item]}
              active={active}
              size={16}
              activeColor={activeForeground}
              inactiveColor={markerModeStyles[item].color}
            />
            <Text
              className="text-sm font-bold"
              style={{ color: active ? activeForeground : '#D6DAE2' }}
            >
              {MODE_LABELS[item]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
