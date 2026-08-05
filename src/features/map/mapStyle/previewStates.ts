import { STOCK_DARK_STYLE } from '../utils/stockMapStyles';
import type { GoogleMapStyle } from '../utils/sunMapStyles';

/**
 * TEMPORARY preview states for picking the time-of-day look on a real device.
 * Delete this file, its ids in `MapStylePreference`, and the "Vorschau" block
 * in MapStyleMenu once a look is chosen.
 *
 * THE RULE THAT MATTERS — learned the hard way, twice:
 *
 * 1. NEVER set `color` on the base geometry. That replaces Google's own
 *    geometry and collapses every feature type not re-declared into one flat
 *    slab. It is what made the map look like a parking lot.
 *
 * 2. NEVER apply `hue` globally. `hue` does not tint — it REPLACES the hue of
 *    everything it touches, keeping only saturation and lightness. A global
 *    warm hue turns forests orange and water orange, because they keep their
 *    saturation and get the new hue forced on. This was the previous attempt's
 *    failure: "the forest is nearly always orange and sometimes blue".
 *
 * So the split is:
 *
 *   GLOBAL  → `lightness` and `gamma` only. Both are hue-preserving: they
 *             change how bright and how contrasty the world is, which is most
 *             of what time of day actually does, and greens stay green.
 *   TARGETED → `hue` + a little `saturation`, applied ONLY to built surfaces
 *             (roads, man-made land). Those are the things that visibly take
 *             on the colour of low sun or street lighting. Nature and water
 *             are deliberately left alone.
 *
 * Values are kept small on purpose. If a state reads as "a filter", it is too
 * strong — time of day should be felt, not seen.
 */

export const PREVIEW_STATE_IDS = [
  'state1',
  'state2',
  'state3',
  'state4',
  'state5',
  'state6',
  'state7',
  'state8',
] as const;

export type PreviewStateId = (typeof PREVIEW_STATE_IDS)[number];

export interface PreviewState {
  id: PreviewStateId;
  label: string;
  colorScheme: 'light' | 'dark';
  style: GoogleMapStyle;
}

interface Tone {
  /** -100..100. Hue-preserving brightness. */
  lightness?: number;
  /** 0.01..10. <1 lifts midtones, >1 deepens them. Hue-preserving. */
  gamma?: number;
  /** Hue for BUILT surfaces only — never global. */
  tint?: string;
  /** How strongly the tint reads. Keep well under 25. */
  tintStrength?: number;
  /** Street lamps on (dark states). */
  lit?: boolean;
}

function build({ lightness, gamma, tint, tintStrength = 12, lit }: Tone): GoogleMapStyle {
  const style: GoogleMapStyle = [];

  const globalStylers: Record<string, string | number>[] = [];
  if (lightness !== undefined) globalStylers.push({ lightness });
  if (gamma !== undefined) globalStylers.push({ gamma });
  if (globalStylers.length) style.push({ stylers: globalStylers });

  // The tint touches built surfaces only, so nature keeps its own hue.
  if (tint) {
    for (const featureType of ['road', 'landscape.man_made']) {
      style.push({
        featureType,
        elementType: 'geometry',
        stylers: [{ hue: tint }, { saturation: tintStrength }],
      });
    }
  }

  // Lit roads are literal colours and must come last so they win over the tint.
  if (lit) style.push(...STOCK_DARK_STYLE);
  return style;
}

export const PREVIEW_STATES: PreviewState[] = [
  {
    id: 'state1',
    label: '1 · Nacht (Vorlage)',
    colorScheme: 'dark',
    // Exactly what "Dunkel" ships today: Google's native dark + amber roads,
    // no filter at all. The night reference to judge 2 and 3 against.
    style: build({ lit: true }),
  },
  {
    id: 'state2',
    label: '2 · Blaue Stunde früh',
    colorScheme: 'dark',
    // Sky already scattering blue, lamps still burning. Slightly lifted out of
    // full dark; the blue sits on built surfaces only.
    style: build({ lightness: 6, gamma: 0.95, tint: '#4A76B8', tintStrength: 10, lit: true }),
  },
  {
    id: 'state3',
    label: '3 · Dämmerung',
    colorScheme: 'dark',
    // Lamps fading, real light arriving. Brighter than 2, barely any cast.
    style: build({ lightness: 16, gamma: 0.9, tint: '#6E8CB0', tintStrength: 6, lit: true }),
  },
  {
    id: 'state4',
    label: '4 · Sonnenaufgang',
    colorScheme: 'light',
    // Sun on the horizon: warm on buildings and roads, midtones still deep.
    style: build({ lightness: -6, gamma: 1.06, tint: '#FF9E4D', tintStrength: 16 }),
  },
  {
    id: 'state5',
    label: '5 · Mittag (Vorlage)',
    colorScheme: 'light',
    // Google untouched. Zero rules. The daylight reference.
    style: [],
  },
  {
    id: 'state6',
    label: '6 · Nachmittag',
    colorScheme: 'light',
    // Barely there — the first hint of warmth returning.
    style: build({ lightness: -2, tint: '#FFC078', tintStrength: 8 }),
  },
  {
    id: 'state7',
    label: '7 · Goldene Stunde',
    colorScheme: 'light',
    // The sundown wash. Same sun as state 4, a little stronger and deeper.
    style: build({ lightness: -8, gamma: 1.1, tint: '#FF8C33', tintStrength: 20 }),
  },
  {
    id: 'state8',
    label: '8 · Blaue Stunde abends',
    colorScheme: 'dark',
    // After sunset: darker than 2, lamps at full, cool cast on built surfaces.
    style: build({ lightness: -2, gamma: 1.0, tint: '#3A5F9E', tintStrength: 14, lit: true }),
  },
];

export const PREVIEW_STATE_BY_ID = new Map(PREVIEW_STATES.map((state) => [state.id, state]));

export function isPreviewStateId(value: string): value is PreviewStateId {
  return PREVIEW_STATE_BY_ID.has(value as PreviewStateId);
}
