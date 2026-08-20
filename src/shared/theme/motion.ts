/**
 * Motion values, kept together.
 *
 * Deliberately NOT presented as a derived scale yet. A radius can be derived
 * from a role (an input is 16, the card holding it is 20); a duration cannot —
 * whether 260 ms reads as crisp or sluggish is only answerable by a thumb on
 * glass. These are the numbers the floating sheet was tuned with, in one file
 * so that the scale can be named once a real device has confirmed how they
 * feel, instead of having to be dug back out of a dozen components.
 *
 * Tune here, nowhere else.
 */

/** Springs are used over durations on purpose: only a spring can be caught mid-flight. */
export const MOTION = {
  /** Sheet arrival and departure. */
  sheet: { damping: 24, stiffness: 260, mass: 0.9 },
  /** Settling back after a drag that did not pass the dismiss threshold. */
  settle: { damping: 26, stiffness: 340, mass: 0.8 },
  /**
   * Where along the morph the sheet's own content takes over. It starts late:
   * before ~0.4 the container is still small enough that the content would be
   * mostly clipped, and a clipped fragment reads as a glitch rather than as
   * something arriving.
   */
  contentFade: [0.4, 0.86] as const,
  /** A release past either of these dismisses instead of settling back. */
  dismissDistance: 120,
  dismissVelocity: 850,
  /**
   * The window over which the morph and its origin control trade places.
   *
   * They must cross-fade on ONE shared value, never hand over at a threshold.
   * Two earlier versions of this both failed visibly: waiting for the spring to
   * settle left a hole where neither was on screen (a spring keeps resolving
   * long after it looks finished), and revealing the origin at a threshold drew
   * both at once — two translucent copies of the same pill stack to roughly
   * twice the fill alpha, which reads as a flash exactly when things come to
   * rest. Complementary opacities over one window have neither failure.
   */
  originCrossfade: 0.12,
} as const;

export const FLOATING_SHEET = {
  /**
   * The constant map border. The design rule is that it is NEVER zero and the
   * SAME on all four sides: the map is Together's ground, not a backdrop, and
   * an even frame is what makes it read as a deliberate border rather than as
   * a sheet that failed to reach the edge.
   *
   * Deliberately measured from the SCREEN edge, not the safe area — safe-area
   * insets differ per edge (a home indicator is ~34, the sides are 0), so
   * respecting them here is exactly what makes the bottom gap look wrong.
   * Content keeps clear of the indicator through `contentInsetBottom` instead.
   *
   * Narrow on purpose: it only has to read as a deliberate frame, and every
   * point it takes is a point the content does not get. Note that widening it
   * automatically tightens the sheet's corners via `concentricRadius`, so the
   * two stay parallel without a second value to keep in sync.
   */
  inset: 8,
  /**
   * The device's own display corner radius, which the sheet's rounding is
   * derived from so the gap between screen edge and sheet stays the same width
   * all the way around the corner (concentric rounding — the sheet's curve runs
   * parallel to the phone's).
   *
   * It is a TUNED CONSTANT because there is no API for it: iOS exposes the real
   * value only through private API, and Android's `getRoundedCorner()` would
   * need a native module. ~48 suits current iPhones; older phones and many
   * Androids sit lower (~30). Tune by eye against the actual device.
   */
  screenRadius: 48,
  /**
   * A CEILING, not a size. A sheet is as tall as its content and no taller —
   * a fixed fraction gives a short sheet dead space below its last row and
   * forces a long one to scroll earlier than it needs to. Only once content
   * exceeds this share of the screen does the sheet stop growing and scroll
   * inside instead.
   *
   * Bottom-oriented by design: whatever height is left over stays at the TOP,
   * where the map is worth seeing.
   */
  maxHeightFraction: 0.82,
} as const;

/**
 * Concentric inner radius. Two curves separated by a constant gap only stay
 * parallel if the inner one is exactly that much tighter; using the outer
 * radius for both makes the corners visibly pinch.
 */
export function concentricRadius(outerRadius: number, gap: number): number {
  return Math.max(0, outerRadius - gap);
}
