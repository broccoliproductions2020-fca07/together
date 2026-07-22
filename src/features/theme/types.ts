export type ColorSchemePreference = 'system' | 'light' | 'dark';
export type ResolvedColorScheme = 'light' | 'dark';

export interface ThemePreferenceValue {
  /** The user's stored choice. */
  preference: ColorSchemePreference;
  /** The concrete scheme after resolving `system` against the device. */
  resolvedScheme: ResolvedColorScheme;
  setPreference: (preference: ColorSchemePreference) => void;
  /** False until the persisted preference has been read once. */
  ready: boolean;
}
