/** The user's stored map-style choice. `system` follows the app's light/dark
 * theme (day/night); the others are explicit manual overrides. */
export type MapStylePreference = 'system' | 'day' | 'night' | 'satellite';

/** The concrete style after resolving `system` against the app theme. */
export type EffectiveMapStyle = 'day' | 'night' | 'satellite';

export interface MapStyleValue {
  /** The user's stored choice. */
  preference: MapStylePreference;
  /** Concrete style after resolving `system` (dark→night, light→day). */
  effectiveStyle: EffectiveMapStyle;
  setPreference: (preference: MapStylePreference) => void;
}
