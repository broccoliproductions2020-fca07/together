import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle, View } from 'react-native';

import { useOverlayColors } from './overlayTheme';

const canUseNativeGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

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
      className={`overflow-hidden shadow-lg ${className ?? ''}`}
      style={[
        {
          backgroundColor: isPrimary ? colors.primary : useGlass ? 'transparent' : colors.liquidWash,
          borderColor: isPrimary ? colors.primaryBorder : colors.border,
          borderWidth: 1,
          elevation: 8,
          shadowColor: '#07100D',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.16,
          shadowRadius: 18,
        },
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
