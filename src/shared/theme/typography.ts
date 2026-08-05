/**
 * The type scale.
 *
 * Five steps, deliberately. The auth surface had grown to twelve distinct font
 * sizes, four of them (10.5 / 11.5 / 12 / 13) within 2.5px of each other doing
 * the same job — which reads as accumulation rather than intent, and is the
 * single clearest tell of an unfinished interface.
 *
 * Rules:
 * - Pick the step whose ROLE matches, never the size that happens to look right.
 * - Two controls of the same class get the same step (a provider button and the
 *   e-mail button are peers, so they share `body`).
 * - Need something between two steps? That is a signal the hierarchy is wrong,
 *   not that the scale needs a sixth value.
 *
 * Weights: static font files, so set `fontFamily` ONLY — never combine it with
 * `fontWeight` (Android synthesizes a second, fake bold on top). See AGENTS.md.
 */

export const FONT = {
  medium: 'SchibstedGrotesk_500Medium',
  semibold: 'SchibstedGrotesk_600SemiBold',
  bold: 'SchibstedGrotesk_700Bold',
} as const;

export const TYPE = {
  /** Headline / wordmark-adjacent display copy. One per screen. */
  display: { fontSize: 36, lineHeight: 41, letterSpacing: -1.3 },
  /** Display on short screens (< 730px). A responsive variant, not a sixth step. */
  displayCompact: { fontSize: 32, lineHeight: 37, letterSpacing: -1.3 },
  /** Inputs and primary button labels — everything the eye lands on first. */
  body: { fontSize: 16, lineHeight: 22 },
  /** Secondary controls: segmented switch, inline actions, panel titles. */
  label: { fontSize: 14, lineHeight: 19 },
  /** Supporting text: field messages, errors, dividers, helper copy. */
  caption: { fontSize: 12, lineHeight: 16 },
  /** The quiet layer: legal, privacy line, meter labels, floated field labels. */
  micro: { fontSize: 11, lineHeight: 15 },
} as const;
