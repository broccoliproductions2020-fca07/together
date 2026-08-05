import { STREET_LIGHT_ROADS } from './streetLightColors';
import type { GoogleMapStyle } from './sunMapStyles';

/**
 * "Hell" ships NOTHING. An empty array is the only way to get Google's own
 * map: any rule at all — in particular a blanket `{ elementType: 'geometry' }`
 * — replaces Google's base geometry and collapses every feature type it does
 * not re-declare into one flat colour.
 */
export const STOCK_LIGHT_STYLE: GoogleMapStyle = [];

/**
 * "Dunkel" is Google's own dark map — produced by the native
 * `userInterfaceStyle` prop, NOT by a style JSON — with exactly one addition:
 * the streets are lit.
 *
 * Note what is deliberately absent: there is no base-geometry rule here. That
 * matters twice over. It keeps Google's dark rendering intact for everything
 * except the roadway, and it is why this can sit on top of the native dark map
 * at all. Do not add a `{ elementType: 'geometry' }` rule — it would flatten
 * the map and defeat the reason we switched to native dark in the first place.
 *
 * Do NOT restore Google's published "Dark" sample JSON here either. That is a
 * demo style, not the Maps app's dark mode: near-uniform #212121 with pure
 * black water, which reads as a flat black sheet on a phone. It was tried and
 * rejected.
 */
export const STOCK_DARK_STYLE: GoogleMapStyle = Object.entries(STREET_LIGHT_ROADS).map(
  ([key, color]) => {
    const [featureType, elementType] = key.split('|');
    return { featureType, elementType, stylers: [{ color }] };
  },
);
