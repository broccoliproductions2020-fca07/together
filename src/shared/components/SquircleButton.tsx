import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';

import { onColorTextColor } from '../utils/contrastColor';
import { PressableScale } from './PressableScale';

import { TEXT_CAPPED } from '@/shared/theme';

export type SquircleButtonVariant = 'solid' | 'tonal' | 'outline' | 'ghost' | 'destructive';
export type SquircleButtonSize = 'sm' | 'md' | 'lg';

// Deep, restrained primary — reads more "edel" than a saturated fill. Callers
// pass a mode colour when a button should carry that accent instead.
const DEFAULT_COLOR = '#0E3B2E';
const DANGER = '#C82626';

// 8-digit hex alpha suffixes (RN supports #RRGGBBAA).
const A16 = '29'; // ~16%
const A50 = '80'; // ~50%
const A14 = '24'; // ~14%

const SIZES: Record<
  SquircleButtonSize,
  {
    minHeight: number;
    radius: number;
    paddingH: number;
    fontSize: number;
    icon: number;
    gap: number;
  }
> = {
  sm: { minHeight: 40, radius: 12, paddingH: 14, fontSize: 14, icon: 16, gap: 8 },
  md: { minHeight: 48, radius: 16, paddingH: 18, fontSize: 15, icon: 18, gap: 8 },
  lg: { minHeight: 54, radius: 18, paddingH: 20, fontSize: 16, icon: 20, gap: 8 },
};

interface Resolved {
  bg: string;
  fg: string;
  border: string;
  /** Solid fills get the premium detailing: top light edge + soft colour shadow. */
  raised: boolean;
  shadow: string;
}

function resolve(variant: SquircleButtonVariant, color: string): Resolved {
  switch (variant) {
    case 'tonal':
      return {
        bg: `${color}${A16}`,
        fg: color,
        border: 'transparent',
        raised: false,
        shadow: color,
      };
    case 'outline':
      return {
        bg: 'transparent',
        fg: color,
        border: `${color}${A50}`,
        raised: false,
        shadow: color,
      };
    case 'ghost':
      return { bg: 'transparent', fg: color, border: 'transparent', raised: false, shadow: color };
    case 'destructive':
      return {
        bg: `${DANGER}${A14}`,
        fg: DANGER,
        border: 'transparent',
        raised: false,
        shadow: DANGER,
      };
    case 'solid':
    default:
      return {
        bg: color,
        fg: onColorTextColor(color),
        border: 'transparent',
        raised: true,
        shadow: color,
      };
  }
}

export interface SquircleButtonProps {
  label: string;
  onPress?: () => void;
  variant?: SquircleButtonVariant;
  /** Accent colour. For `solid` it fills (label colour is contrast-picked); for
   * tonal/outline/ghost it tints the fill/border/label. Defaults to deep green. */
  color?: string;
  size?: SquircleButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  /** Light haptic on press. On by default. */
  haptic?: boolean;
  /** Stretch to the container width (default true — CTAs usually do). */
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

/**
 * The app's canonical squircle button. One place for the "edel" button feel:
 * a tier system (solid / tonal / outline / ghost / destructive), a contrast-safe
 * label, a loading spinner, the shared press-scale + haptic, and — on solids —
 * the two premium details that read as classy: a fine top light edge and a soft
 * colour-tinted shadow instead of a hard box shadow.
 */
export function SquircleButton({
  label,
  onPress,
  variant = 'solid',
  color = DEFAULT_COLOR,
  size = 'lg',
  icon,
  loading = false,
  disabled = false,
  haptic = true,
  fullWidth = true,
  accessibilityLabel,
}: SquircleButtonProps) {
  const dims = SIZES[size];
  const isDisabled = disabled || loading;
  const { bg, fg, border, raised, shadow } = resolve(variant, color);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      haptic={haptic}
      style={{
        alignItems: 'center',
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        backgroundColor: bg,
        borderColor: border,
        borderRadius: dims.radius,
        borderWidth: border === 'transparent' ? 0 : 1.5,
        flexDirection: 'row',
        gap: dims.gap,
        justifyContent: 'center',
        minHeight: dims.minHeight,
        opacity: isDisabled ? 0.55 : 1,
        paddingHorizontal: dims.paddingH,
        // Soft, colour-tinted depth on solids only (iOS: coloured; Android: elevation).
        shadowColor: shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: raised && !isDisabled ? 0.32 : 0,
        shadowRadius: 14,
        elevation: raised && !isDisabled ? 6 : 0,
      }}
      onPress={onPress}
    >
      {/* Top light edge — the "lit from above" premium cue. Inset so it stays
          inside the rounded corners (keeps the iOS shadow intact — no clipping). */}
      {raised ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 1,
            left: dims.radius,
            right: dims.radius,
            height: 1.5,
            borderRadius: 1,
            backgroundColor: 'rgba(255,255,255,0.28)',
          }}
        />
      ) : null}
      {loading ? <ActivityIndicator size="small" color={fg} /> : null}
      {!loading && icon ? <Ionicons name={icon} size={dims.icon} color={fg} /> : null}
      <Text
        style={{ color: fg, fontSize: dims.fontSize, fontWeight: '700', letterSpacing: -0.1 }}
        {...TEXT_CAPPED}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
