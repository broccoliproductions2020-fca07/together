import { Ionicons } from '@expo/vector-icons';

import { SquircleButton } from '@/shared/components/SquircleButton';

/**
 * The activity detail's main action (Beitreten / Mitplanen / Dazustoßen). Thin
 * wrapper over the shared SquircleButton so the "edel" solid look — contrast-safe
 * label, top light edge, soft colour shadow, press-scale + haptic — is inherited
 * from one place; callers keep passing label/accent/icon unchanged.
 */
export function PrimaryButton({
  label,
  accent,
  icon,
  loading = false,
  onPress,
}: {
  label: string;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  onPress?: () => void;
}) {
  return (
    <SquircleButton
      label={label}
      color={accent}
      icon={icon}
      loading={loading}
      disabled={loading}
      onPress={onPress}
    />
  );
}
