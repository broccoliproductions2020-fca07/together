import { STREET_LIGHT_ROADS } from './streetLightColors';
import type { SunPhase } from './sunPhase';

/**
 * Google Maps JSON palettes for the four solar phases.
 *
 * These are real Google map-style rules, not a colour overlay. Dynamic mode
 * interpolates the matching rules locally, so roads, water and labels all
 * change together as daylight moves on. Nothing is fetched or sent anywhere.
 */
type MapStyleElement = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
};

export type GoogleMapStyle = MapStyleElement[];

/**
 * THE SYSTEM — two independent layers, because that is how the real world
 * works. Change the model here, not inside a palette.
 *
 * LAYER 1 · SKY (the four palettes below). What the SUN is doing to the
 * ground, and nothing else. It follows the real arc, so the same four
 * palettes serve both ends of the day:
 *      day    · neutral, stock Google light. Sun is simply up.
 *      golden · low sun. The famous sundown/sunrise wash — the whole
 *               landscape goes reddish-orange, and water turns COOL against
 *               it, because that opposition is what makes the light read as
 *               low rather than merely warm.
 *      dusk   · the blue hour. Civil twilight at BOTH ends of the day
 *               (sunset→night and night→sunrise): blue-grey, sun just gone
 *               or not yet back.
 *      night  · Google's own dark map. Sun is down; nothing is lit but lamps.
 *
 * LAYER 2 · STREET LIGHTS (`streetLightLevel` + `withStreetLights`). A real
 * lighting fixture, not a colour choice: lamps come on around sunset, burn
 * through the night, and go off around sunrise. NO palette contains lamp
 * orange — the orange is applied on top, scaled by how lit the world is.
 *
 * The rule that follows from this, and the reason the palettes look the way
 * they do: ORANGE ROADS MEAN LAMPS ARE ON. Never paint an orange road into a
 * daylight palette — it costs the lamps their meaning, and with it the whole
 * point of the map changing with the day.
 *
 * The two layers compose rather than being special-cased. "Google's dark map
 * with our orange streets" is not a palette in here; it is night + lamps at
 * full, which is what the map already does every night by itself.
 *
 * STRUCTURAL CONTRACT: `blendSunMapStyles` pairs entries BY ARRAY INDEX, so
 * all four arrays must keep the exact same entries in the exact same order.
 * Adding a rule to one palette means adding it to all four, in place.
 */

/**
 * Day is in STOCK_PHASES, so this array is NEVER what you see at midday — the
 * map ships Google's own untouched styling then. This exists only as the
 * numeric endpoint the sky interpolates from during the last stretch before
 * golden hour, so it is deliberately a REPLICA of Google's default day
 * colours rather than a design of ours: the closer it sits to stock, the less
 * visible the moment the custom style takes over.
 *
 * Which is why it has none of the POI category hues or building-silhouette
 * lifts the other palettes carry. Do not "fix" that here — those rules exist
 * to compensate for overriding Google's geometry, and at noon we no longer
 * override it. The colour audit skips this palette for the same reason.
 */
const dayStyle: GoogleMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#F2EFE9' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6E6B64' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F2EFE9' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#C6C2BA' }],
  },
  // This is used only as the day-side interpolation endpoint; real midday
  // still ships the untouched Google map. A green endpoint stops forests
  // briefly inheriting the beige city-ground colour at Golden Hour onset.
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#D9E8C6' }] },
  {
    featureType: 'landscape.natural.terrain',
    elementType: 'geometry',
    stylers: [{ color: '#D0DFC0' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.fill',
    stylers: [{ color: '#F0EDE5' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#E0DCD2' }],
  },
  { featureType: 'poi.attraction', elementType: 'geometry', stylers: [{ color: '#F0EDE5' }] },
  { featureType: 'poi.business', elementType: 'geometry', stylers: [{ color: '#F0EDE5' }] },
  { featureType: 'poi.medical', elementType: 'geometry', stylers: [{ color: '#F0EDE5' }] },
  { featureType: 'poi.school', elementType: 'geometry', stylers: [{ color: '#F0EDE5' }] },
  { featureType: 'poi.sports_complex', elementType: 'geometry', stylers: [{ color: '#D8E5C1' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6E6B64' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#BFE09A' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#47763A' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#D9D5CC' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#E4E1D9' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6B6862' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F8C77E' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#E4A64B' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FFF6D2' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#E8E5DE' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#C6C2B8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#AADAFF' }] },
  { featureType: 'water', elementType: 'geometry.stroke', stylers: [{ color: '#8CC4EF' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3A6F9E' }] },
];

/**
 * Golden hour: the sundown/sunrise wash. The LIGHT is reddish-orange and it
 * lands on everything — ground, buildings, even the asphalt. Water is pushed
 * deliberately COOL against it: low sun means warm surfaces and cool shadows,
 * and without that opposition the palette reads as "sepia filter" instead of
 * "the sun is low". Lamps are still off; every warm tone here is sunlight.
 */
const goldenStyle: GoogleMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#F7E6D2' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#514B43' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F7E6D2' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#D6B58E' }],
  },
  // Do not use landscape.natural.landcover here. That finer rule is unstable
  // across Google zoom levels and previously made urban tiles flash green.
  // The broad natural surface is stable and keeps woodland distinct from the
  // sun-warmed city with a soft olive-gold shimmer.
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#B9CB8C' }] },
  {
    featureType: 'landscape.natural.terrain',
    elementType: 'geometry',
    stylers: [{ color: '#AABD80' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.fill',
    stylers: [{ color: '#F0DCC6' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#C9A783' }],
  },
  // Same category hues as day, but pulled into the warm wash — a violet
  // attraction block under a low sun reads rose, not lilac. The identity is
  // the RELATIVE lean, so it survives the palette it sits in.
  { featureType: 'poi.attraction', elementType: 'geometry', stylers: [{ color: '#E7D7D0' }] },
  { featureType: 'poi.business', elementType: 'geometry', stylers: [{ color: '#F1E0CC' }] },
  { featureType: 'poi.medical', elementType: 'geometry', stylers: [{ color: '#EAD6D2' }] },
  { featureType: 'poi.school', elementType: 'geometry', stylers: [{ color: '#ECE2B3' }] },
  { featureType: 'poi.sports_complex', elementType: 'geometry', stylers: [{ color: '#C7D59C' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#5B514A' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#B1D180' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#3B693F' }] },
  // Sun-warmed asphalt: warm but PALE and low-saturation. The lamps' orange is
  // a saturated fill; this is the same white road catching a low sun.
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFF7EC' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#DEC5A4' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#FDF1E1' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#E8D5BD' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#5C534B' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F2C881' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#D39B58' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FAE7BE' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#D9C1A4' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#B99A7B' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#9CC4CF' }] },
  { featureType: 'water', elementType: 'geometry.stroke', stylers: [{ color: '#7CA8B7' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#315D6C' }] },
];

/**
 * The blue hour — civil twilight, and it happens TWICE a day: after sunset on
 * the way down, and before sunrise on the way back up. A properly blue blue
 * hour, not a dark grey with a hint: the sun is below the horizon but the sky
 * is still lit, and that scattered blue is the only light source on the
 * ground. The roads below are unlit asphalt under that blue; the lamp layer
 * is what makes them glow, and at this hour it is already close to full.
 */
const duskStyle: GoogleMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#40505E' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#E3ECF3' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#40505E' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#687987' }],
  },
  // Open natural land IS the base ground after dark — same surface, nothing
  // built on it and nothing lighting it. Matched exactly rather than left at a
  // near-miss (it was ΔE00 1.32 away, which is neither a distinction nor a
  // match). The dark phases have no luminance headroom to spend on a
  // difference that carries no information; parks, forest, water and buildings
  // carry the differentiation instead.
  // The sun's warmth leaves nature first, but it should not become the same
  // blue-grey as urban ground. This restrained blue-green carries the forest
  // silhouette naturally from Golden Hour into Blue Hour.
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#3D5D50' }] },
  {
    featureType: 'landscape.natural.terrain',
    elementType: 'geometry',
    stylers: [{ color: '#4E6A5A' }],
  },
  // Same silhouette rule as night: the stroke draws the block, the fill gives
  // it mass. Twilight can carry a stronger outline than full dark because the
  // sky is still providing ambient light for it to catch.
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.fill',
    stylers: [{ color: '#4A5B68' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#708391' }],
  },
  // Dark phases had the worst of it — all four categories inside ΔE00 1.1 of
  // each other and of the plain built-up block. The hue lean has to be
  // stronger here than in daylight to survive the low luminance.
  { featureType: 'poi.attraction', elementType: 'geometry', stylers: [{ color: '#5B5E78' }] },
  { featureType: 'poi.business', elementType: 'geometry', stylers: [{ color: '#5A6870' }] },
  { featureType: 'poi.medical', elementType: 'geometry', stylers: [{ color: '#6A5964' }] },
  { featureType: 'poi.school', elementType: 'geometry', stylers: [{ color: '#6A6854' }] },
  { featureType: 'poi.sports_complex', elementType: 'geometry', stylers: [{ color: '#456C53' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#D6E2E8' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#37684C' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#B9DEC3' }] },
  // Unlit asphalt under a blue sky. Nothing warm here — the warmth at this
  // hour comes from the lamp layer, which is the entire point.
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#7E8E9B' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#35434F' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#697986' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#35434F' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#F0F5F7' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#A4B0B9' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#435461' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#8E9DA8' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#52636E' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#6A7B86' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#293F4E' }] },
  { featureType: 'water', elementType: 'geometry.stroke', stylers: [{ color: '#466171' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#C2DCE9' }] },
];

/**
 * Night: Google's own dark map, kept stock. The sun is gone and nothing here
 * is lit by it — the only light in the scene arrives from the lamp layer, at
 * full strength. Deliberately contains no lamp light of its own.
 */
const nightStyle: GoogleMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9A9A9A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#3C3C3C' }],
  },
  // Nature is subtle at night, but remains a different material from the
  // charcoal city ground. That prevents a colour snap at the end of twilight.
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#202D25' }] },
  // Same rule as dusk: open land is the base ground (the entry above), while
  // terrain, forest and parks are what actually differ after dark.
  {
    featureType: 'landscape.natural.terrain',
    elementType: 'geometry',
    stylers: [{ color: '#29372D' }],
  },
  // The city needs a SILHOUETTE. Blocks used to sit at #262626 on a #212121
  // ground — a 1.06:1 difference, i.e. invisible, which left the night map
  // looking like streets floating in a void with no city around them. The fill
  // gives the massing, and the lighter stroke is what actually draws the
  // outline; a built-up block has to read as built-up even before you find a
  // street. Buildings stay well below the lit roadway: the lamps are still the
  // brightest thing at night, they are just no longer the ONLY thing.
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.fill',
    stylers: [{ color: '#383838' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#505050' }],
  },
  { featureType: 'poi.attraction', elementType: 'geometry', stylers: [{ color: '#3B3244' }] },
  { featureType: 'poi.business', elementType: 'geometry', stylers: [{ color: '#3E3A32' }] },
  { featureType: 'poi.medical', elementType: 'geometry', stylers: [{ color: '#452F2F' }] },
  { featureType: 'poi.school', elementType: 'geometry', stylers: [{ color: '#3A3F2A' }] },
  { featureType: 'poi.sports_complex', elementType: 'geometry', stylers: [{ color: '#2B4832' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9E9E9E' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1F4227' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6F9B78' }] },
  // Google's own dark-map road greys, untouched. Every bit of warm light the
  // night map has comes from the lamp layer on top — which is exactly why
  // switching the lamps off leaves you with the stock Google dark map, intact.
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3C3C3C' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1A1A1A' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#2C2C2C' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#1A1A1A' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#D8D8D8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4E4E4E' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1A1A1A' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2F2F2F' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#3A3A3A' }] },
  // Google's dark sample puts water at pure black. Lifted to a blue-grey: at
  // black it reads as a hole in the map, and it has to sit next to the
  // brightest surface in the system without turning into a void.
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17232B' }] },
  { featureType: 'water', elementType: 'geometry.stroke', stylers: [{ color: '#1E2E38' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5D7A8A' }] },
];

export const SUN_MAP_STYLES: Record<SunPhase, GoogleMapStyle> = {
  day: dayStyle,
  golden: goldenStyle,
  dusk: duskStyle,
  night: nightStyle,
};

function hexToRgb(hex: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return { red: value >> 16, green: (value >> 8) & 0xff, blue: value & 0xff };
}

function blendColor(from: string, to: string, progress: number) {
  const fromRgb = hexToRgb(from);
  const toRgb = hexToRgb(to);
  if (!fromRgb || !toRgb) return progress < 0.5 ? from : to;
  const channel = (start: number, end: number) =>
    Math.round(start + (end - start) * progress)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(fromRgb.red, toRgb.red)}${channel(fromRgb.green, toRgb.green)}${channel(
    fromRgb.blue,
    toRgb.blue,
  )}`;
}

/**
 * Colour and exposure travel independently. A forest can become darker before
 * it shifts toward the cooler twilight hue; water can hold its reflection a
 * little longer. At progress 0 and 1 this always returns the exact palette
 * endpoints, so the four main looks remain recognisable anchors.
 */
/** WCAG relative luminance — the basis for a real contrast check. */
function relativeLuminance(hex: string) {
  const parsed = hexToRgb(hex);
  if (!parsed) return 0;
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(parsed.red) + 0.7152 * channel(parsed.green) + 0.0722 * channel(parsed.blue)
  );
}

function contrastRatio(a: string, b: string) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Minimum label-vs-background contrast. Map labels are small, so this sits at
 * the readable end rather than the decorative one.
 */
const MIN_LABEL_CONTRAST = 4;

/**
 * Pushes `color` toward black or white — whichever the background leaves room
 * for — until it is legible, keeping as much of the original hue as possible.
 */
function ensureContrast(color: string, background: string) {
  if (!hexToRgb(color) || !hexToRgb(background)) return color;
  if (contrastRatio(color, background) >= MIN_LABEL_CONTRAST) return color;
  // Pick the direction with the MOST headroom, not a fixed luminance cutoff.
  // A mid-tone surface (water #83A8B7) can only ever reach 2.55:1 against
  // white but 8.2:1 against black — a threshold rule picks wrong exactly where
  // the problem is hardest.
  const target =
    contrastRatio('#000000', background) >= contrastRatio('#FFFFFF', background)
      ? '#000000'
      : '#FFFFFF';
  let candidate = color;
  for (let step = 0.08; step <= 1.0001; step += 0.08) {
    candidate = blendColor(color, target, Math.min(1, step));
    if (contrastRatio(candidate, background) >= MIN_LABEL_CONTRAST) return candidate;
  }
  return candidate;
}

/**
 * Guarantees every text label stays readable against whatever it actually sits
 * on. Necessary because the two palettes move in OPPOSITE directions during a
 * transition — the ground darkens while the labels lighten — so a plain
 * interpolation walks them through each other. Measured at the golden→dusk
 * midpoint that produced ground #888884 against text #888280: a contrast of
 * 1.06:1, i.e. invisible, for the middle stretch of every sunrise and sunset.
 *
 * Each label is compared against its OWN surface where one exists (water
 * labels against water, park labels against parks), else the base geometry.
 */
const NIGHT_POI_LABEL_COLOR = '#9E9E9E';

function withReadableLabels(style: GoogleMapStyle, litRoadNamesUseNightPoiColor = false): GoogleMapStyle {
  const colorOf = (featureType: string | undefined, elementType: string) =>
    style.find((entry) => entry.featureType === featureType && entry.elementType === elementType)
      ?.stylers[0]?.color;

  const base = style.find((entry) => !entry.featureType && entry.elementType === 'geometry')
    ?.stylers[0]?.color;
  if (typeof base !== 'string') return style;

  const geometryColor = (...featureTypes: (string | undefined)[]) => {
    for (const featureType of featureTypes) {
      const color = colorOf(featureType, 'geometry') ?? colorOf(featureType, 'geometry.fill');
      if (typeof color === 'string') return color;
    }
    return base;
  };

  // POI names generally sit on the urban/man-made surface, not on the entire
  // map's base colour. Roads and water similarly need their own halo colour.
  // Using that surface for both contrast calculation and text stroke keeps
  // place names crisp all the way through a palette transition.
  const labelSurface = (featureType: string | undefined) => {
    if (featureType === 'water') return geometryColor('water');
    if (featureType?.startsWith('road')) return geometryColor(featureType, 'road');
    if (featureType === 'poi.park') return geometryColor('poi.park');
    if (featureType?.startsWith('poi')) return geometryColor('landscape.man_made');
    if (featureType?.startsWith('landscape.natural')) return geometryColor(featureType);
    return geometryColor(featureType);
  };

  const readable = style.map((entry) => {
    if (entry.elementType === 'labels.text.stroke' && !entry.featureType) {
      return { ...entry, stylers: [{ color: base }] };
    }
    if (entry.elementType !== 'labels.text.fill') return entry;
    const isLitRoadName = litRoadNamesUseNightPoiColor && entry.featureType?.startsWith('road');
    if (isLitRoadName) {
      // Once the lamps are on, road names deliberately use the exact same
      // neutral grey as normal Dark Mode POI names. No amber halo: Together's
      // night typography should read as one quiet system, not as a road decal.
      return {
        ...entry,
        stylers: entry.stylers.map((styler) =>
          typeof styler.color === 'string' ? { ...styler, color: NIGHT_POI_LABEL_COLOR } : styler,
        ),
      };
    }
    const background = labelSurface(entry.featureType);
    return {
      ...entry,
      stylers: entry.stylers.map((styler) =>
        typeof styler.color === 'string'
          ? { ...styler, color: ensureContrast(styler.color, background) }
          : styler,
      ),
    };
  });

  // A feature-specific text stroke is a tiny halo, not a new visual layer.
  // It is especially important for POI names where a dark-to-light blend can
  // otherwise leave the name technically contrasted but visually noisy.
  const labelHalos = readable
    .filter(
      (entry) =>
        entry.elementType === 'labels.text.fill' &&
        Boolean(entry.featureType) &&
        !(litRoadNamesUseNightPoiColor && entry.featureType?.startsWith('road')),
    )
    .map((entry) => ({
      featureType: entry.featureType,
      elementType: 'labels.text.stroke',
      stylers: [{ color: labelSurface(entry.featureType) }],
    }));

  return [...readable, ...labelHalos];
}

function smoothStep(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

function remapProgress(progress: number, start: number, end: number) {
  return Math.max(0, Math.min(1, (progress - start) / (end - start)));
}

type TransitionWindow = readonly [start: number, end: number];

/**
 * Every hand-off is eased through a real portion of its SunCalc interval.
 * Keeping the windows here makes the route continuous at each phase boundary:
 * Day -> Golden -> Blue -> Night and the same route in reverse at dawn.
 *
 * This intentionally stays RGB interpolation. A prior feature-aware/HSL path
 * caused invalid native Google style output; the geometry rules remain stable
 * and only their valid colour values travel here.
 */
function smoothWindow(progress: number, [start, end]: TransitionWindow) {
  return smoothStep(remapProgress(progress, start, end));
}

const DYNAMIC_TRANSITION_WINDOWS = {
  // The warm shift is deliberately late in the astronomical Golden Hour, so
  // daytime stays neutral for most of the afternoon.
  eveningDayToGolden: [0.3, 0.72],
  morningGoldenToDay: [0.28, 0.7],
  // The warm city and green land both cool gradually after the actual sunset;
  // Blue Hour then has enough time to be perceived as its own state.
  eveningGoldenToDusk: [0.06, 0.44],
  eveningDuskToNight: [0.8, 1],
  morningNightToDusk: [0, 0.2],
  morningDuskToGolden: [0.56, 0.94],
} as const satisfies Record<string, TransitionWindow>;

/* ------------------------------------------------------------------ *
 * LAYER 2 · STREET LIGHTS
 * ------------------------------------------------------------------ */

/**
 * Where each road lands at FULL illumination. Not a palette — a light source.
 *
 * This is the colour of ASPHALT UNDER A SODIUM LAMP, which is a pale warm
 * cream, NOT saturated orange. Real street lighting is low-saturation and very
 * bright; a saturated orange road reads as a highlighter drawn over the map
 * instead of a surface being lit, and it also picks a fight with the saturated
 * orange avatar markers. The lit street is legible because it is BRIGHT
 * (11.24:1 against the night ground), not because it is colourful.
 *
 * Lamps hit the carriageway, not the casing: casings go dark so the lit
 * surface has something to sit against. Minor roads stay dimmer than main
 * roads because they genuinely are.
 */
const STREET_LIGHT_COLORS: Record<string, string> = STREET_LIGHT_ROADS;

/** Full dark. */
const NIGHT_LIGHT_LEVEL = 1;
/**
 * Twilight. Lamps are on but the sky still competes with them, so they read a
 * little weaker than at full dark — the same lamps, less dominant.
 */
const TWILIGHT_LIGHT_LEVEL = 0.85;

/** What a phase looks like when it is NOT mid-transition (manual light/dark,
 * and the polar-region fallbacks where there is no next boundary). */
const STATIC_LIGHT_LEVEL: Record<SunPhase, number> = {
  day: 0,
  golden: 0,
  dusk: TWILIGHT_LIGHT_LEVEL,
  night: NIGHT_LIGHT_LEVEL,
};

/**
 * How lit the streets are, 0 (off) → 1 (full night), for the transition the
 * map is currently in. Street lights are a real fixture on a real switch, so
 * this is deliberately NOT a smooth 24 h curve — lamps are off all day, come
 * on around sunset, burn flat through the night, and go off around sunrise.
 *
 * The phase PAIR is what distinguishes morning from evening: the four palettes
 * are shared by both halves of the day, but `golden → dusk` can only be a
 * sunset and `dusk → golden` can only be a sunrise (see sunPhase.ts's arc:
 * night → dusk → golden → day → golden → dusk → night). That is why this
 * keys off the pair instead of the phase alone.
 *
 * Timing comes from the real solar boundaries for the actual date and place
 * (suncalc, via `resolveSunPhase`), so the lamps follow the true sunset — they
 * shift with the seasons on their own, with no schedule to maintain.
 */
export function streetLightLevel(fromPhase: SunPhase, toPhase: SunPhase, progress: number): number {
  if (fromPhase === toPhase) return STATIC_LIGHT_LEVEL[fromPhase];
  const p = Math.max(0, Math.min(1, progress));

  // Sunset. Golden hour ENDS at sunset, so the lamps stay off through most of
  // it and flick on over the last stretch — not a dimmer ramp across the whole
  // golden hour, which would put lit streets under a still-bright sun.
  if (fromPhase === 'golden' && toPhase === 'dusk') {
    return TWILIGHT_LIGHT_LEVEL * smoothStep(remapProgress(p, 0.55, 1));
  }
  // Sunrise. Morning blue hour ENDS at sunrise; lamps hold, then go out as the
  // sun clears the horizon.
  if (fromPhase === 'dusk' && toPhase === 'golden') {
    return TWILIGHT_LIGHT_LEVEL * (1 - smoothStep(remapProgress(p, 0.45, 1)));
  }
  // Twilight settling into full dark, and back out of it at dawn.
  if (fromPhase === 'dusk' && toPhase === 'night') {
    return TWILIGHT_LIGHT_LEVEL + (NIGHT_LIGHT_LEVEL - TWILIGHT_LIGHT_LEVEL) * smoothStep(p);
  }
  if (fromPhase === 'night' && toPhase === 'dusk') {
    return NIGHT_LIGHT_LEVEL - (NIGHT_LIGHT_LEVEL - TWILIGHT_LIGHT_LEVEL) * smoothStep(p);
  }
  // Everything else is daylight on both sides (day↔golden), or a jump the sun
  // cannot actually make. Lamps off.
  return 0;
}

/**
 * Applies the lamps to a sky palette. Runs BEFORE `withReadableLabels` on
 * purpose: road labels have to be measured against the road as it will
 * actually be lit, not against the unlit asphalt underneath.
 */
function withStreetLights(style: GoogleMapStyle, level: number): GoogleMapStyle {
  if (level <= 0) return style;
  const lit = Math.min(1, level);
  return style.map((entry) => {
    const lamp = STREET_LIGHT_COLORS[`${entry.featureType}|${entry.elementType}`];
    if (!lamp) return entry;
    return {
      ...entry,
      stylers: entry.stylers.map((styler) =>
        typeof styler.color === 'string'
          ? { ...styler, color: blendColor(styler.color, lamp, lit) }
          : styler,
      ),
    };
  });
}

/**
 * Phases that ship Google's OWN map, with no custom style at all.
 *
 * A `customMapStyle` carrying a blanket `{ elementType: 'geometry' }` rule
 * overrides Google's entire base geometry, so every feature type we do not
 * explicitly re-style collapses into that single colour. Google differentiates
 * far more features than the ~30 a hand-written palette can carry (building
 * footprints, government/worship/parking land use, tiered road fills), and the
 * result of overriding them all is a city rendered as one flat slab with roads
 * drawn on it. Daylight is where that loss is most obvious and least
 * justified — there is no lighting effect to express at noon — so day ships
 * stock. The dark phases keep their palettes: there is no way to make Google's
 * day map look like night without covering the geometry.
 */
const STOCK_PHASES = new Set<SunPhase>(['day']);

/**
 * Dynamic day must be pixel-for-pixel the same native Google base map as the
 * explicit "Hell" selection. An empty style array is the only way to leave
 * every Google feature untouched; even a narrow built-up-area override makes
 * the daytime map visibly darker than that reference.
 */
const STOCK_PHASE_STYLES: Partial<Record<SunPhase, GoogleMapStyle>> = {
  day: [],
};

/**
 * Fraction of a phase for which the sky HOLDS its own palette before crossing
 * to the next one.
 *
 * Without this the map is a permanent crossfade and no palette is ever seen:
 * `resolveSunPhase` reports progress across the WHOLE phase, and the day phase
 * runs from morning golden hour to evening golden hour, so a linear blend put
 * solar noon at ~50% golden — the map was warm-washed at midday and every hour
 * looked like an average of two palettes. Holding, then crossing near the
 * boundary, means each phase actually looks like itself.
 */
const SKY_HOLD = 0.75;

/** The manual light/dark choices use the same lamps and label guarantees as
 * Dynamic — picking "Dunkel" gives you the night map with its lights on. */
export function readableSunMapStyle(phase: SunPhase): GoogleMapStyle {
  if (STOCK_PHASES.has(phase)) return STOCK_PHASE_STYLES[phase] ?? [];
  const lightLevel = STATIC_LIGHT_LEVEL[phase];
  return withReadableLabels(withStreetLights(SUN_MAP_STYLES[phase], lightLevel), lightLevel > 0);
}

/**
 * One local interpolation step: the sky moves from one palette to the next,
 * then the lamps are laid over the result at whatever the hour deserves.
 *
 * The sky blends on ONE shared curve — no per-feature lead or lag. Roads used
 * to be run ahead of the ground here to fake "the lights came on"; with the
 * lamp layer modelling that for real, desyncing the sky would only smear it.
 */
export function blendSunMapStyles(
  fromPhase: SunPhase,
  toPhase: SunPhase,
  progress: number,
): GoogleMapStyle {
  const from = SUN_MAP_STYLES[fromPhase];
  const to = SUN_MAP_STYLES[toPhase];
  const linear = Math.max(0, Math.min(1, progress));
  const heldProgress = smoothStep(remapProgress(linear, SKY_HOLD, 1));

  // Still holding a stock phase: hand back Google's untouched native map.
  // Lamps are off in every stock phase (all of them are daylight), so there is
  // nothing to lay over it.
  if (heldProgress === 0 && STOCK_PHASES.has(fromPhase)) {
    return STOCK_PHASE_STYLES[fromPhase] ?? [];
  }

  const blended = from.map((fromElement, elementIndex) => {
    const toElement = to[elementIndex] ?? fromElement;
    return {
      ...fromElement,
      stylers: fromElement.stylers.map((fromStyler, stylerIndex) => {
        const toStyler = toElement.stylers[stylerIndex] ?? fromStyler;
        const fromColor = fromStyler.color;
        const toColor = toStyler.color;
        if (typeof fromColor === 'string' && typeof toColor === 'string') {
          return {
            ...fromStyler,
            color: blendColor(fromColor, toColor, heldProgress),
          };
        }
        return { ...fromStyler };
      }),
    };
  });

  const lightLevel = streetLightLevel(fromPhase, toPhase, linear);
  return withReadableLabels(withStreetLights(blended, lightLevel), lightLevel > 0);
}

function dynamicStreetLightsOn(phase: SunPhase, nextPhase: SunPhase, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  if (phase === 'night') return true;

  // The blue-hour interval is defined by SunCalc's real sunset/dusk or
  // dawn/sunrise times. A single threshold at the same solar elevation gives
  // us the deliberate evening on-switch and the matching morning off-switch.
  if (phase === 'dusk' && nextPhase === 'night') return p >= 0.4;
  if (phase === 'dusk' && nextPhase === 'golden') return p < 0.6;
  return false;
}

function styledPhase(phase: SunPhase, streetLightsOn: boolean): GoogleMapStyle {
  if (STOCK_PHASES.has(phase)) return STOCK_PHASE_STYLES[phase] ?? [];
  return withReadableLabels(withStreetLights(SUN_MAP_STYLES[phase], streetLightsOn ? 1 : 0), streetLightsOn);
}

function blendDynamicPhases(
  fromPhase: SunPhase,
  toPhase: SunPhase,
  progress: number,
  streetLightsOn: boolean,
): GoogleMapStyle {
  const p = Math.max(0, Math.min(1, progress));
  if (p === 0) return styledPhase(fromPhase, streetLightsOn);
  if (p === 1) return styledPhase(toPhase, streetLightsOn);

  const from = SUN_MAP_STYLES[fromPhase];
  const to = SUN_MAP_STYLES[toPhase];
  const blended = from.map((fromElement, elementIndex) => {
    const toElement = to[elementIndex] ?? fromElement;
    return {
      ...fromElement,
      stylers: fromElement.stylers.map((fromStyler, stylerIndex) => {
        const toStyler = toElement.stylers[stylerIndex] ?? fromStyler;
        const fromColor = fromStyler.color;
        const toColor = toStyler.color;
        return typeof fromColor === 'string' && typeof toColor === 'string'
          ? { ...fromStyler, color: blendColor(fromColor, toColor, p) }
          : { ...fromStyler };
      }),
    };
  });
  return withReadableLabels(withStreetLights(blended, streetLightsOn ? 1 : 0), streetLightsOn);
}

/**
 * Resolves the visual map state from the current SunCalc interval. Day and
 * night hold steady; golden and blue hours use their real daily duration for
 * broad, visible colour travel instead of a generic clock animation.
 */
export function dynamicSunMapStyle(
  phase: SunPhase,
  nextPhase: SunPhase,
  progress: number,
): GoogleMapStyle {
  const p = Math.max(0, Math.min(1, progress));
  const streetLightsOn = dynamicStreetLightsOn(phase, nextPhase, p);

  if (phase === 'day' || phase === 'night') return styledPhase(phase, streetLightsOn);

  if (phase === 'golden') {
    // Evening: warm up slowly over the actual golden-hour interval. Morning:
    // keep the warm sunrise for a moment, then return slowly to neutral day.
    return nextPhase === 'dusk'
      ? blendDynamicPhases('day', 'golden', smoothWindow(p, DYNAMIC_TRANSITION_WINDOWS.eveningDayToGolden), false)
      : blendDynamicPhases('golden', 'day', smoothWindow(p, DYNAMIC_TRANSITION_WINDOWS.morningGoldenToDay), false);
  }

  if (phase === 'dusk' && nextPhase === 'night') {
    // Sunset: warm -> blue, a recognisable blue plateau, then blue -> night.
    if (p < DYNAMIC_TRANSITION_WINDOWS.eveningGoldenToDusk[1]) {
      return blendDynamicPhases(
        'golden',
        'dusk',
        smoothWindow(p, DYNAMIC_TRANSITION_WINDOWS.eveningGoldenToDusk),
        streetLightsOn,
      );
    }
    if (p < DYNAMIC_TRANSITION_WINDOWS.eveningDuskToNight[0]) {
      return styledPhase('dusk', streetLightsOn);
    }
    return blendDynamicPhases(
      'dusk',
      'night',
      smoothWindow(p, DYNAMIC_TRANSITION_WINDOWS.eveningDuskToNight),
      streetLightsOn,
    );
  }

  if (phase === 'dusk' && nextPhase === 'golden') {
    // Dawn is the exact reverse of sunset, including the crisp lamp switch.
    if (p < DYNAMIC_TRANSITION_WINDOWS.morningNightToDusk[1]) {
      return blendDynamicPhases(
        'night',
        'dusk',
        smoothWindow(p, DYNAMIC_TRANSITION_WINDOWS.morningNightToDusk),
        streetLightsOn,
      );
    }
    if (p < DYNAMIC_TRANSITION_WINDOWS.morningDuskToGolden[0]) {
      return styledPhase('dusk', streetLightsOn);
    }
    return blendDynamicPhases(
      'dusk',
      'golden',
      smoothWindow(p, DYNAMIC_TRANSITION_WINDOWS.morningDuskToGolden),
      streetLightsOn,
    );
  }

  return styledPhase(phase, streetLightsOn);
}
