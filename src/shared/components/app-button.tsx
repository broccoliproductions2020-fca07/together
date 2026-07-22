import { Pressable, Text, type PressableProps } from 'react-native';

import { TogetherLoader } from './brand/TogetherLoader';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost';

const containerVariants: Record<AppButtonVariant, string> = {
  primary: 'bg-primary shadow-sm',
  secondary: 'border border-border bg-card shadow-sm',
  ghost: 'bg-transparent',
};

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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      className={`min-h-[54px] flex-row items-center justify-center gap-2 rounded-[18px] px-5 py-3.5 active:opacity-90 ${
        containerVariants[variant]
      } ${isDisabled ? 'opacity-60' : ''} ${className ?? ''}`}
      {...props}
    >
      {loading ? <TogetherLoader size={24} /> : null}
      <Text className={`text-base font-bold tracking-[-0.15px] ${labelVariants[variant]}`}>
        {label}
      </Text>
    </Pressable>
  );
}
