import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { PressableScale } from '@/shared/components/PressableScale';

import { FloatingSurface } from './FloatingSurface';

export interface RoundControlProps {
  accessibilityLabel: string;
  onPress?: () => void;
  /** `circle` = fixed icon button; `pill` = auto-width label/content. */
  shape?: 'circle' | 'pill';
  tone?: 'default' | 'primary';
  children: ReactNode;
  /** Light haptic on press. On by default. */
  haptic?: boolean;
  disabled?: boolean;
  /** Extra classes on the pressable (e.g. a custom circle size like `h-14 w-14`). */
  className?: string;
  /** Inner content layout for pills; defaults to a centred padded row. */
  contentClassName?: string;
  /** Optional visual override for a control with a meaningful state. */
  surfaceStyle?: StyleProp<ViewStyle>;
}

/**
 * The app's canonical floating round control — the glass circle icon buttons and
 * the pills that hover over the map. One primitive so every one of them shares
 * the same surface, press-scale and haptic instead of re-wiring
 * their press behavior and surface at each call site.
 */
export function RoundControl({
  accessibilityLabel,
  onPress,
  shape = 'circle',
  tone = 'default',
  children,
  haptic = true,
  disabled = false,
  className,
  contentClassName,
  surfaceStyle,
}: RoundControlProps) {
  // Circles are exactly 48px, so their radius is exactly 24 — passed as a real
  // number rather than left to `rounded-full` (9999) so the native GlassView
  // can shape itself. A glass layer that stays square inside a round control
  // is what made these read as "cut off" at the top and bottom.
  const CIRCLE_SIZE = 48;
  const radius = shape === 'circle' ? CIRCLE_SIZE / 2 : 999;
  const base = shape === 'circle' ? 'h-12 w-12 rounded-full' : 'rounded-full';
  const content =
    shape === 'circle'
      ? 'h-full w-full items-center justify-center'
      : (contentClassName ?? 'flex-row items-center gap-2 px-4 py-2.5');

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      haptic={haptic}
      className={`${base} ${className ?? ''}`}
      onPress={onPress}
    >
      <FloatingSurface
        className={base}
        contentClassName={content}
        radius={radius}
        surfaceStyle={surfaceStyle}
        tone={tone}
      >
        {children}
      </FloatingSurface>
    </PressableScale>
  );
}
