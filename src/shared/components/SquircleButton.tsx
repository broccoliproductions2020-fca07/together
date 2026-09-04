import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { withAlpha } from '../utils/colorAlpha';
import { onColorTextColor, onTintTextColor } from '../utils/contrastColor';
import { loaderSizeForIcon, TogetherLoader } from './brand/TogetherLoader';
import { PressableScale } from './PressableScale';

// Aliased: `shadow` is already the destructured shadow COLOUR in this file.
import { FONT, shadow as boxShadow, TEXT_CAPPED } from '@/shared/theme';

export type SquircleButtonVariant = 'solid' | 'tonal' | 'outline' | 'ghost' | 'destructive';
export type SquircleButtonSize = 'sm' | 'md' | 'lg';

// Deep, restrained primary — reads more "edel" than a saturated fill. Callers
// pass a mode colour when a button should carry that accent instead.
const DEFAULT_COLOR = '#0E3B2E';
const DANGER = '#C82626';

// Translucent fills go through `withAlpha`, never through an appended
// `#RRGGBBAA` suffix: that only parses on hex. React Native matches the
// `rgb(...)` prefix and drops the suffix silently, so a caller passing
// `markerModeStyles.now.color` got a fully opaque fill with a label computed
// for a 16 % wash — a solid green button with no readable word on it.
const TONAL_ALPHA = 0x29 / 255; // ~16%
const OUTLINE_BORDER_ALPHA = 0x80 / 255; // ~50%
const DANGER_ALPHA = 0x24 / 255; // ~14%

/** Light card (`ThemeColors.card`). Only right for half the schemes, which is
 * why every non-solid call site passes its real surface — see `surface`. */
const DEFAULT_SURFACE = '#FFFFFF';

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

/**
 * `solid` fills with the accent and picks its label by measured luminance. The
 * other four draw the accent as INK — on a bare surface or on a low-alpha wash
 * of itself — and that pairing has to be measured too. Printing the raw accent
 * gave 1.98:1 for `soon` and 2.02:1 for `now` on a light card (4.5:1 is the
 * threshold), so the label and its icon were drawn but not visible: the button
 * read as empty rather than as low-contrast. On a dark card the same variants
 * measured ~5.5:1 and looked fine, which is why it survived so long — and the
 * DEFAULT accent inverted it, at 1.30:1 in dark. Both directions are covered
 * now, which is what makes `surface` worth passing.
 */
function resolve(variant: SquircleButtonVariant, color: string, surface: string): Resolved {
  switch (variant) {
    case 'tonal':
      return {
        bg: withAlpha(color, TONAL_ALPHA),
        fg: onTintTextColor(color, surface, TONAL_ALPHA),
        border: 'transparent',
        raised: false,
        shadow: color,
      };
    case 'outline': {
      // The label sits on the bare surface, so the border takes the same
      // readable ink — an outline nobody can see is not an outline.
      const fg = onTintTextColor(color, surface, 0);
      return {
        bg: 'transparent',
        fg,
        border: withAlpha(fg, OUTLINE_BORDER_ALPHA),
        raised: false,
        shadow: color,
      };
    }
    case 'ghost':
      return {
        bg: 'transparent',
        fg: onTintTextColor(color, surface, 0),
        border: 'transparent',
        raised: false,
        shadow: color,
      };
    case 'destructive':
      return {
        bg: withAlpha(DANGER, DANGER_ALPHA),
        fg: onTintTextColor(DANGER, surface, DANGER_ALPHA),
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
  /**
   * The background this button is drawn ON. Only `solid` can ignore it: every
   * other variant prints the accent as ink over this colour, so it is what the
   * label's contrast is measured against. Pass the real surface (usually
   * `useThemeColors().card`) wherever the scheme can change.
   */
  surface?: string;
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
  surface = DEFAULT_SURFACE,
  accessibilityLabel,
}: SquircleButtonProps) {
  const dims = SIZES[size];
  const isDisabled = disabled || loading;
  const { bg, fg, border, raised, shadow } = resolve(variant, color, surface);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      haptic={haptic}
      hitSlop={size === 'sm' ? 2 : undefined}
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
        // Soft, colour-tinted depth on solids only — now the same shadow on
        // both platforms, where Android used to get a plain grey elevation.
        ...(raised && !isDisabled
          ? boxShadow({ color: shadow, offsetY: 8, radius: 14, opacity: 0.32, elevation: 6 })
          : null),
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
      {/* Unlabelled: the button already carries its label and
          `accessibilityState.busy`, so a nested progressbar would say it twice. */}
      {loading ? (
        <TogetherLoader accessibilityLabel="" color={fg} size={loaderSizeForIcon(dims.icon)} />
      ) : null}
      {!loading && icon ? <Ionicons name={icon} size={dims.icon} color={fg} /> : null}
      <Text
        style={{ color: fg, fontFamily: FONT.bold, fontSize: dims.fontSize, letterSpacing: -0.1 }}
        {...TEXT_CAPPED}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
