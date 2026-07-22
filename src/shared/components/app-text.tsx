import type { ReactNode } from 'react';
import { Text } from 'react-native';

export type AppTextVariant = 'display' | 'heading' | 'title' | 'body' | 'caption' | 'label';

const variantClasses: Record<AppTextVariant, string> = {
  display: 'text-[36px] leading-[40px] font-extrabold tracking-[-1px] text-foreground',
  heading: 'text-[30px] leading-[34px] font-extrabold tracking-[-0.7px] text-foreground',
  title: 'text-lg leading-6 font-bold tracking-[-0.2px] text-foreground',
  body: 'text-base leading-6 text-foreground',
  caption: 'text-sm leading-5 text-muted-foreground',
  label: 'text-xs font-bold uppercase tracking-[0.9px] text-muted-foreground',
};

export interface AppTextProps {
  children?: ReactNode;
  variant?: AppTextVariant;
  className?: string;
}

/** Small typography helper for the three text scales used across screens. */
export function AppText({ children, variant = 'title', className }: AppTextProps) {
  return <Text className={`${variantClasses[variant]} ${className ?? ''}`}>{children}</Text>;
}
