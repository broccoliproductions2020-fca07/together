import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { TogetherLogoAppearance } from '../types/branding.types';
import { TogetherSkiaAnimatedIcon } from './TogetherSkiaAnimatedIcon';

type TogetherLogoSplashProps = {
  appearance?: TogetherLogoAppearance;
  restartKey?: number;
  reducedMotion?: boolean;
  onAnimationComplete?: () => void;
};

/** Isolated splash prototype. It is intentionally not wired into RootNavigator. */
export function TogetherLogoSplash({
  appearance = 'dark',
  restartKey = 0,
  reducedMotion,
  onAnimationComplete,
}: TogetherLogoSplashProps) {
  const { width } = useWindowDimensions();
  const iconWidth = Math.min(318, width - 64);

  return (
    <View style={[styles.root, { backgroundColor: appearance === 'dark' ? '#09111C' : '#F5F7FA' }]}>
      <TogetherSkiaAnimatedIcon
        appearance={appearance}
        onAnimationComplete={onAnimationComplete}
        reducedMotion={reducedMotion}
        restartKey={restartKey}
        width={iconWidth}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
});
