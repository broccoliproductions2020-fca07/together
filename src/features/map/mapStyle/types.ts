import type { GoogleMapStyle } from '../utils/sunMapStyles';
import type { PreviewStateId } from './previewStates';

/** Dynamic follows the real sun; light and dark are intentional manual choices.
 * The `state*` ids are TEMPORARY on-device previews — see previewStates.ts. */
export type MapStylePreference = 'dynamic' | 'light' | 'dark' | PreviewStateId;

/** The concrete palette currently applied to the native map. */
export type EffectiveMapStyle = 'day' | 'golden' | 'dusk' | 'night';

export interface MapStyleValue {
  /** The user's stored choice. */
  preference: MapStylePreference;
  /** Concrete palette after resolving the selected choice. */
  effectiveStyle: EffectiveMapStyle;
  /** Ready-to-apply Google Maps JSON style. Dynamic is blended locally. */
  mapStyle: GoogleMapStyle;
  /**
   * Drives the native map's `userInterfaceStyle`. With an EMPTY `mapStyle`
   * this is what makes Google render its own dark map — the real one from the
   * Maps app, which no style JSON can reproduce. With our palettes it just
   * keeps the SDK's own chrome on the right side of light/dark.
   */
  colorScheme: 'light' | 'dark';
  setPreference: (preference: MapStylePreference) => void;
}
