import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle, View } from 'react-native';

import { shadow } from '@/shared/theme';

import { useOverlayColors } from './overlayTheme';

const canUseNativeGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

const SURFACE_SHADOW = shadow({
  color: '#07100D',
  offsetY: 8,
  radius: 18,
  opacity: 0.16,
  elevation: 8,
});

export interface FloatingSurfaceProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  interactive?: boolean;
  tone?: 'default' | 'primary';
  /** Optional visual override for a control with a meaningful state. */
  surfaceStyle?: StyleProp<ViewStyle>;
  /**
   * Explicit corner radius in px. Give this to any pill/circle instead of
   * relying on `rounded-full`: the native GlassView draws into its OWN layer,
   * so a parent's `overflow: hidden` does not reliably clip it to the rounded
   * shape — the glass keeps its square corners and the control stops looking
   * like a circle. Passing the radius lets the glass shape itself.
   */
  radius?: number;
}

export function FloatingSurface({
  children,
  className,
  contentClassName,
  interactive = true,
  tone = 'default',
  surfaceStyle,
  radius,
}: FloatingSurfaceProps) {
  const colors = useOverlayColors();
  const isPrimary = tone === 'primary';
  const useGlass = canUseNativeGlass && !isPrimary;

  return (
    <View
      className={`overflow-hidden ${className ?? ''}`}
      style={[
        {
          backgroundColor: isPrimary ? colors.primary : useGlass ? 'transparent' : colors.liquidWash,
          borderColor: isPrimary ? colors.primaryBorder : colors.border,
          borderWidth: 1,
        },
        // The `shadow-lg` utility class used to sit on this view as well, so the
        // surface described its shadow twice. One source now, and it survives
        // the `overflow-hidden` above: RN detects that combination
        // (`styleWouldClipOverflowInk`) and clips the content separately, which
        // the old `shadowRadius` path did not.
        SURFACE_SHADOW,
        radius === undefined ? null : { borderRadius: radius },
        surfaceStyle,
      ]}
    >
      {useGlass ? (
        <GlassView
          colorScheme="auto"
          glassEffectStyle="regular"
          isInteractive={interactive}
          // The glass gets the radius too — see `radius` on the props. Without
          // it the native layer stays square inside a round control.
          style={[StyleSheet.absoluteFill, radius === undefined ? null : { borderRadius: radius }]}
          tintColor={colors.glassTint}
        />
      ) : null}
      {/* Fallback wash for devices WITHOUT native Liquid Glass. It must never
          be painted over a live GlassView: stacked with glassTint it reached
          ~90% opacity and buried the effect under a near-solid slab. */}
      {useGlass || isPrimary ? null : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.liquidWash }]} />
      )}
      <View
        className="absolute left-3 right-3 top-0 h-px"
        style={{ backgroundColor: colors.highlight }}
      />
      <View className={contentClassName}>{children}</View>
    </View>
  );
}
