/**
 * Non-activity colours. Open, Soon and Now own blue, amber and green and
 * must never be reused to explain an unrelated state.
 */
export const SEMANTIC_COLOR = {
  action: '#7657A8',
  social: '#9A629D',
  journey: '#7657A8',
  safetyNormal: '#7657A8',
  safetyAttention: '#C45178',
  danger: '#D64557',
  quiet: '#746C7A',
  /**
   * "Complete / ready", never "now".
   *
   * Currently unused: the composer's completeness border and check were removed
   * (product decision, August 2026) and the header subtitle carries the signal
   * on its own. Kept because the reasoning is the expensive part — deliberately
   * NOT a green, since `now` owns #41C08D and a second green would make a
   * finished form look like a running activity. This is a cool teal, placed
   * between the two colours it could be mistaken for and far from both —
   * ΔE00 23.9 to the mode green and 24.2 to the `open` blue #3B82F6 (the map
   * palettes treat ~4 as the threshold for "reads as a different colour").
   */
  success: '#4EA8B8',
} as const;
