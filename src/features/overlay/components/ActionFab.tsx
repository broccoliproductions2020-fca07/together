import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedPressable } from './AnimatedPressable';
import { FloatingSurface } from './FloatingSurface';
import { useOverlayColors } from './overlayTheme';

export interface ActionFabProps {
  active?: boolean;
  onPress?: () => void;
}

export function ActionFab({ active = false, onPress }: ActionFabProps) {
  const reducedMotion = useReducedMotion();
  const colors = useOverlayColors();
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: reducedMotion ? 0 : 170 });
  }, [active, progress, reducedMotion]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 45}deg` }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={active ? 'Erstellungsmenü schließen' : 'Activity erstellen'}
      className="h-14 w-14 rounded-full"
      pressedScale={0.94}
      onPress={onPress}
    >
      <FloatingSurface
        className="h-14 w-14 rounded-full"
        contentClassName="h-full w-full items-center justify-center"
        tone="primary"
      >
        <Animated.View style={iconStyle}>
          <Ionicons name="add" size={30} color={colors.onPrimary} />
        </Animated.View>
      </FloatingSurface>
    </AnimatedPressable>
  );
}
