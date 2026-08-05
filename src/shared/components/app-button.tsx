import { Pressable, Text, View, type PressableProps } from 'react-native';

import { TogetherLoader } from './brand/TogetherLoader';

import { TEXT_CAPPED } from '@/shared/theme';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost';

const containerVariants: Record<AppButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'border border-border bg-card shadow-sm',
  ghost: 'bg-transparent',
};

// Soft, deep-green-tinted depth for the primary CTA — the "edel" detail that
// reads classier than a hard box shadow.
const primaryShadow = {
  shadowColor: '#0E3B2E',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.28,
  shadowRadius: 14,
  elevation: 6,
} as const;

const labelVariants: Record<AppButtonVariant, string> = {
  primary: 'text-primary-foreground',
  secondary: 'text-secondary-foreground',
  ghost: 'text-primary',
};

export interface AppButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: AppButtonVariant;
  loading?: boolean;
  className?: string;
}

/**
 * Large, clear primary/secondary/ghost button used across the app. Colors come
 * from the theme tokens so it adapts to light/dark.
 */
export function AppButton({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  className,
  ...props
}: AppButtonProps) {
  const isDisabled = Boolean(disabled) || loading;
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={isPrimary && !isDisabled ? primaryShadow : undefined}
      className={`min-h-[54px] flex-row items-center justify-center gap-2 rounded-[18px] px-5 py-3.5 active:opacity-90 ${
        containerVariants[variant]
      } ${isDisabled ? 'opacity-60' : ''} ${className ?? ''}`}
      {...props}
    >
      {/* Fine top light edge — inset so it stays inside the rounded corners. */}
      {isPrimary ? (
        <View
          pointerEvents="none"
          className="absolute left-[18px] right-[18px] top-px h-[1.5px] rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
        />
      ) : null}
      {loading ? <TogetherLoader size={24} /> : null}
      <Text
        className={`text-base font-bold tracking-[-0.15px] ${labelVariants[variant]}`}
        {...TEXT_CAPPED}
      >
        {label}
      </Text>
    </Pressable>
  );
}
