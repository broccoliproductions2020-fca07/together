import { useCallback, useEffect, useRef } from 'react';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const LOGO_DURATION_MS = 2100;
const REDUCED_FADE_MS = 220;

type UseTogetherLogoAnimationOptions = {
  autoplay: boolean;
  restartKey: number;
  reducedMotion?: boolean;
  onAnimationComplete?: () => void;
};

export function useTogetherLogoAnimation({
  autoplay,
  restartKey,
  reducedMotion,
  onAnimationComplete,
}: UseTogetherLogoAnimationOptions) {
  const systemReducedMotion = useReducedMotion();
  const shouldReduceMotion = reducedMotion ?? systemReducedMotion;
  const progress = useSharedValue(shouldReduceMotion ? 1 : 0);
  const entranceOpacity = useSharedValue(shouldReduceMotion ? 0 : 1);
  const completionRef = useRef(onAnimationComplete);

  useEffect(() => {
    completionRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  const reportComplete = useCallback(() => {
    completionRef.current?.();
  }, []);

  const restart = useCallback(() => {
    cancelAnimation(progress);
    cancelAnimation(entranceOpacity);

    if (shouldReduceMotion) {
      progress.value = 1;
      entranceOpacity.value = 0;
      entranceOpacity.value = withTiming(
        1,
        { duration: REDUCED_FADE_MS, easing: Easing.out(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(reportComplete)();
        },
      );
      return;
    }

    entranceOpacity.value = 1;
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: LOGO_DURATION_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(reportComplete)();
      },
    );
  }, [entranceOpacity, progress, reportComplete, shouldReduceMotion]);

  useEffect(() => {
    if (autoplay) restart();
    return () => {
      cancelAnimation(progress);
      cancelAnimation(entranceOpacity);
    };
  }, [autoplay, entranceOpacity, progress, restart, restartKey]);

  return {
    entranceOpacity,
    progress,
    restart,
    shouldReduceMotion,
  };
}
