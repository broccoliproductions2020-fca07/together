import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingSurface } from '@/features/overlay/components/FloatingSurface';
import { useOverlayColors } from '@/features/overlay/components/overlayTheme';

import type { MainMode } from '../types/main.types';

const SEGMENT_WIDTH = 72;
const SEGMENT_HEIGHT = 46;
const PADDING = 4;

// Calendar opens from the map top bar. This return control only appears there;
// the regular map deliberately stays free of a redundant bottom navigation.
const SEGMENTS: { mode: MainMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'map', label: 'Karte', icon: 'map-outline' },
];

export interface FloatingModeSwitchProps {
  mode: MainMode;
  onChange: (mode: MainMode) => void;
  /** Retract like the map's lower controls instead of abruptly unmounting. */
  retracted?: boolean;
}

/**
 * Small floating pill that switches between map and calendar with one tap. Not a
 * tab bar; it floats absolutely over the current mode and has no large surface.
 */
export function FloatingModeSwitch({ mode, onChange, retracted = false }: FloatingModeSwitchProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const colors = useOverlayColors();

  // On the calendar surface no segment matches — the highlight hides and both
  // segments render inactive; tapping one leaves the calendar.
  const activeIndex = SEGMENTS.findIndex((segment) => segment.mode === mode);
  const hasActive = activeIndex >= 0;
  const progress = useSharedValue(Math.max(0, activeIndex));
  const retractProgress = useSharedValue(retracted ? 1 : 0);

  useEffect(() => {
    if (!hasActive) return;
    progress.value = withTiming(activeIndex, { duration: reducedMotion ? 0 : 220 });
  }, [activeIndex, hasActive, progress, reducedMotion]);

  // Match the coordinated lower-map chrome motion in MapOverlay: a restrained
  // downward retreat with a tiny scale change, not a standalone fade. This is
  // especially important while an inline detail sheet takes over the lower edge.
  useEffect(() => {
    retractProgress.value = withTiming(retracted ? 1 : 0, {
      duration: reducedMotion ? 0 : retracted ? 360 : 320,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [reducedMotion, retractProgress, retracted]);

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * SEGMENT_WIDTH }],
  }));
  const retractStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, retractProgress.value / 0.72),
    transform: [
      { translateY: 24 * retractProgress.value },
      { scale: 1 - 0.035 * retractProgress.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        { position: 'absolute', bottom: insets.bottom + 12, left: 0, right: 0, zIndex: 20 },
        retractStyle,
      ]}
      className="items-center"
      pointerEvents={retracted ? 'none' : 'box-none'}
      entering={
        reducedMotion
          ? undefined
          : FadeIn.delay(55)
              .duration(185)
              .easing(Easing.out(Easing.cubic))
              .withInitialValues({
                opacity: 0,
                transform: [{ translateY: 6 }, { scale: 0.985 }],
              })
      }
    >
      <FloatingSurface
        className="rounded-[22px]"
        contentClassName="flex-row p-1"
        interactive={false}
      >
        {hasActive ? (
          <Animated.View
            className="rounded-[18px] bg-primary"
            style={[
              highlightStyle,
              {
                position: 'absolute',
                top: PADDING,
                bottom: PADDING,
                left: PADDING,
                width: SEGMENT_WIDTH,
              },
            ]}
          />
        ) : null}
        {SEGMENTS.map((segment) => {
          const active = segment.mode === mode;
          return (
            <Pressable
              key={segment.mode}
              accessibilityRole="button"
              accessibilityLabel={segment.label}
              accessibilityState={{ selected: active }}
              className="items-center justify-center gap-0.5 rounded-[18px] active:opacity-80"
              style={{ width: SEGMENT_WIDTH, height: SEGMENT_HEIGHT }}
              onPress={() => onChange(segment.mode)}
            >
              <Ionicons
                name={segment.icon}
                size={17}
                color={active ? colors.onPrimary : colors.icon}
              />
              <Text
                className="text-[10px] font-bold"
                style={{ color: active ? colors.onPrimary : colors.iconMuted }}
              >
                {segment.label}
              </Text>
            </Pressable>
          );
        })}
      </FloatingSurface>
    </Animated.View>
  );
}
