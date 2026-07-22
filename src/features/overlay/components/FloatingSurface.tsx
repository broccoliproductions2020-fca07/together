import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useOverlayColors } from './overlayTheme';

const canUseNativeGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

export interface FloatingSurfaceProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  interactive?: boolean;
  tone?: 'default' | 'primary';
}

export function FloatingSurface({
  children,
  className,
  contentClassName,
  interactive = true,
  tone = 'default',
}: FloatingSurfaceProps) {
  const colors = useOverlayColors();
  const isPrimary = tone === 'primary';
  const useGlass = canUseNativeGlass && !isPrimary;

  return (
    <View
      className={`overflow-hidden shadow-lg ${className ?? ''}`}
      style={{
        backgroundColor: isPrimary ? colors.primary : useGlass ? 'transparent' : colors.liquidWash,
        borderColor: isPrimary ? colors.primaryBorder : colors.border,
        borderWidth: 1,
        elevation: 8,
        shadowColor: '#07100D',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      }}
    >
      {useGlass ? (
        <GlassView
          colorScheme="auto"
          glassEffectStyle="regular"
          isInteractive={interactive}
          style={StyleSheet.absoluteFill}
          tintColor={colors.glassTint}
        />
      ) : null}
      {isPrimary ? null : (
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
