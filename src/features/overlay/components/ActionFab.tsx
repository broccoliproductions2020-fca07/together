import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/shared/components/PressableScale';
import { haptics } from '@/shared/utils/haptics';

import { FloatingSurface } from './FloatingSurface';
import { useOverlayColors } from './overlayTheme';

export interface ActionFabProps {
  active?: boolean;
  onPress?: () => void;
}

/**
 * The app's primary action — creating an activity.
 *
 * Deliberately static: no ambient glow or pulse. Its presence comes from form,
 * not motion — a squircle rather than a circle, which is the app's own shape
 * language (markers and buttons are squircles) and quietly reads as "add a
 * marker". The only movement is the press response.
 */
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
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={active ? 'Erstellungsmenü schließen' : 'Activity erstellen'}
      className="h-14 w-14 rounded-[20px]"
      pressedScale={0.93}
      haptic={false}
      onPressIn={() => haptics.medium()}
      onPress={onPress}
    >
      <FloatingSurface
        className="h-14 w-14 rounded-[20px]"
        contentClassName="h-full w-full items-center justify-center"
        tone="primary"
      >
        <Animated.View style={iconStyle}>
          <Ionicons name="add" size={27} color={colors.onPrimary} />
        </Animated.View>
      </FloatingSurface>
    </PressableScale>
  );
}
