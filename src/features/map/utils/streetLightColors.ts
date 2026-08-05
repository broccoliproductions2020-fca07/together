/**
 * The colour of a road under a street lamp — shared by BOTH night maps:
 * "Dunkel" (Google's native dark map) and the dynamic night palette. One
 * source, so the two can never drift apart.
 *
 * DERIVATION, so the next person does not re-guess it:
 *
 * High-pressure sodium street lighting runs 1900–2200 K; LED replacements sit
 * at 3000–4000 K and read noticeably whiter. Computing the Planckian locus and
 * converting to sRGB gives:
 *
 *     1900 K  #ff8400      2400 K  #ffa042      3000 K  #ffb86d
 *     2000 K  #ff8b16      2700 K  #ffad59      4000 K  #ffd3a5
 *
 * Two lessons are baked into the values below.
 *
 * 1. Do NOT paint the road the lamp's own colour. A pure 2000 K amber on a
 *    road is a saturated stripe that reads as a highlighter drawn over the
 *    map, not as a lit surface. What the eye actually sees at night is grey
 *    asphalt REFLECTING that lamp: the same hue, far brighter, far less
 *    saturated. So these are ~2400 K mixed roughly a third toward white.
 * 2. A lit street reads as lit because it is BRIGHT, not because it is
 *    colourful. Keep the luminance high; push the hue, not the saturation.
 *
 * The previous value (#E8D6AE) computes to about 4000 K — neutral LED — which
 * is why it read as cream rather than as a street lamp.
 *
 * Hierarchy is deliberate: motorways are the most lit, minor streets the
 * least, exactly as in the real world. Casings stay near-black so the lit
 * surface has something to sit against.
 */
export const STREET_LIGHT_ROADS: Record<string, string> = {
  'road|geometry': '#FFC182',
  'road|geometry.stroke': '#1A1A1A',
  'road.local|geometry': '#C99A66',
  'road.local|geometry.stroke': '#1A1A1A',
  'road.highway|geometry': '#FFD8A8',
  'road.highway|geometry.stroke': '#1A1A1A',
  'road.arterial|geometry': '#F2AE6E',
};
