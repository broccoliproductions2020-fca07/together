import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import {
  buildTogetherMarkSegments,
  segmentsToSvgPath,
  TOGETHER_MARK_VIEW_BOX,
} from '../assets/together-mark-geometry';
import { useTogetherLogoAnimation } from '../hooks/useTogetherLogoAnimation';
import type { TogetherAnimatedIconProps } from '../types/branding.types';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const LIGHT_INK = '#122741';
const DARK_PAPER = '#F3F6FA';

export function TogetherAnimatedIcon({
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

  const markProps = useAnimatedProps(() => ({
    d: segmentsToSvgPath(buildTogetherMarkSegments(progress.value)),
    opacity: entranceOpacity.value,
  }));

  const ink = appearance === 'dark' ? DARK_PAPER : LIGHT_INK;
  const viewBox = `${TOGETHER_MARK_VIEW_BOX.x} ${TOGETHER_MARK_VIEW_BOX.y} ${TOGETHER_MARK_VIEW_BOX.width} ${TOGETHER_MARK_VIEW_BOX.height}`;

  return (
    <Svg
      accessibilityLabel="Together Logo"
      accessibilityRole="image"
      height={resolvedHeight}
      preserveAspectRatio="xMidYMid meet"
      viewBox={viewBox}
      width={width}
    >
      <AnimatedPath animatedProps={markProps} clipRule="evenodd" fill={ink} fillRule="evenodd" />
    </Svg>
  );
}
