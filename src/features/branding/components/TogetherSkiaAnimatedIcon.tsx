import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import { buildTogetherMarkSegments, TOGETHER_MARK_VIEW_BOX } from '../assets/together-mark-geometry';
import { useTogetherLogoAnimation } from '../hooks/useTogetherLogoAnimation';
import type { TogetherAnimatedIconProps } from '../types/branding.types';

const LIGHT_INK = '#122741';
const DARK_PAPER = '#F3F6FA';

export function TogetherSkiaAnimatedIcon({
  width = 276,
  height,
  appearance = 'light',
  autoplay = true,
  restartKey = 0,
  reducedMotion,
  onAnimationComplete,
}: TogetherAnimatedIconProps) {
  const resolvedHeight =
    height ?? width / (TOGETHER_MARK_VIEW_BOX.width / TOGETHER_MARK_VIEW_BOX.height);
  const { entranceOpacity, progress } = useTogetherLogoAnimation({
    autoplay,
    restartKey,
    reducedMotion,
    onAnimationComplete,
  });

  const markPath = useDerivedValue(() => {
    const segments = buildTogetherMarkSegments(progress.value);
    const path = Skia.Path.Make();
    path.moveTo(segments[0].start.x, segments[0].start.y);
    for (const segment of segments) {
      path.cubicTo(
        segment.control1.x,
        segment.control1.y,
        segment.control2.x,
        segment.control2.y,
        segment.end.x,
        segment.end.y,
      );
    }
    path.close();
    return path;
  });

  const ink = appearance === 'dark' ? DARK_PAPER : LIGHT_INK;
  const scaleX = width / TOGETHER_MARK_VIEW_BOX.width;
  const scaleY = resolvedHeight / TOGETHER_MARK_VIEW_BOX.height;

  return (
    <View
      accessibilityLabel="Together Logo"
      accessibilityRole="image"
      style={{ height: resolvedHeight, width }}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Group transform={[{ scaleX }, { scaleY }]}>
          <Group
            transform={[
              { translateX: -TOGETHER_MARK_VIEW_BOX.x },
              { translateY: -TOGETHER_MARK_VIEW_BOX.y },
            ]}
          >
            <Path
              antiAlias
              color={ink}
              fillType="evenOdd"
              opacity={entranceOpacity}
              path={markPath}
              style="fill"
            />
          </Group>
        </Group>
      </Canvas>
    </View>
  );
}
