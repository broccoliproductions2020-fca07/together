import type { TextProps } from 'react-native';

/**
 * System font-size handling (iOS Dynamic Type / Android "Schriftgröße").
 *
 * The app previously ignored this entirely — not one `allowFontScaling` or
 * `maxFontSizeMultiplier` in the whole codebase, next to 55 fixed pixel
 * heights. With the system font turned up, button labels and pills overflow
 * their containers.
 *
 * The fix is NOT to switch scaling off. Someone who enlarged their system font
 * did so because they need it, and ignoring that is an accessibility failure.
 * Instead: let text grow wherever the layout can absorb it, and cap it only
 * where the height is genuinely fixed.
 *
 * Pick by what the CONTAINER can do:
 */

/**
 * Text in a container that can grow: body copy, headlines, field messages,
 * anything inside a scroll view. No cap — this is the default and should be
 * the most common choice.
 */
export const TEXT_FLEXIBLE = {
  allowFontScaling: true,
} satisfies Partial<TextProps>;

/**
 * Text inside a fixed-height control: buttons, pills, segmented switches, tab
 * labels. Still scales — just not past the point where the label would be
 * clipped by its own container. 1.3 keeps a 52px control readable and intact.
 */
export const TEXT_CAPPED = {
  allowFontScaling: true,
  maxFontSizeMultiplier: 1.3,
} satisfies Partial<TextProps>;

/**
 * Text that is baked into a bitmap, not laid out live — the map markers, which
 * `markerCapture` renders off-screen and snapshots to a PNG at a fixed size
 * (see AGENTS.md → markers are image-based). Scaling here would not help the
 * user read anything; it would only break the capture geometry and invalidate
 * every cached marker image.
 *
 * This is the ONLY legitimate reason to switch scaling off. Do not reach for it
 * to "fix" a layout that overflows — cap it or make the container flexible.
 */
export const TEXT_FIXED = {
  allowFontScaling: false,
} satisfies Partial<TextProps>;
