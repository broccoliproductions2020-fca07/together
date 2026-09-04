import type { ReactNode } from 'react';
import { Text, type TextStyle } from 'react-native';

import { FONT, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

export type AppTextVariant = 'display' | 'heading' | 'title' | 'body' | 'caption' | 'label';

/**
 * Sizes and weights come from the scale, never from Tailwind's `font-*`
 * classes. The app ships STATIC Schibsted files, so a weight class alone
 * silently renders the system font — which is exactly what this helper used to
 * do on every screen that reached for it. Colours stay on className, where
 * light/dark resolves for free.
 *
 * `heading` and `title` have no step of their own (the scale goes 36 → 16 by
 * design) and fold onto the nearest one. Both are currently unused; only
 * `label` has call sites.
 */
const variantStyles: Record<AppTextVariant, TextStyle> = {
  display: { ...TYPE.display, fontFamily: FONT.bold },
  heading: { ...TYPE.displayCompact, fontFamily: FONT.bold },
  title: { ...TYPE.body, fontFamily: FONT.bold, letterSpacing: -0.2 },
  body: { ...TYPE.body, fontFamily: FONT.medium },
  caption: { ...TYPE.label, fontFamily: FONT.medium },
  label: { ...TYPE.caption, fontFamily: FONT.bold, letterSpacing: 0.9 },
};

const variantClasses: Record<AppTextVariant, string> = {
  display: 'text-foreground',
  heading: 'text-foreground',
  title: 'text-foreground',
  body: 'text-foreground',
  caption: 'text-muted-foreground',
  label: 'uppercase text-muted-foreground',
};

export interface AppTextProps {
  children?: ReactNode;
  variant?: AppTextVariant;
  className?: string;
}

/** Small typography helper for the text roles used across screens. */
export function AppText({ children, variant = 'title', className }: AppTextProps) {
  return (
    <Text
      {...TEXT_FLEXIBLE}
      className={`${variantClasses[variant]} ${className ?? ''}`}
      style={variantStyles[variant]}
    >
      {children}
    </Text>
  );
}
