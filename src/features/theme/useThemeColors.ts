import { useThemePreference } from './useThemePreference';

/**
 * Raw color values for the spots className tokens can't reach (icon `color`
 * props, `placeholderTextColor`, alpha overlays in style objects). The values
 * mirror the design tokens in `src/global.css` — change them there first.
 */
export interface ThemeColors {
  foreground: string;
  mutedForeground: string;
  card: string;
  secondary: string;
  border: string;
  background: string;
  destructive: string;
  /** Brand ink (`--primary`). The profile card is set in it. */
  primary: string;
  /** Readable ON `primary` — never assume white. */
  primaryForeground: string;
}

const LIGHT: ThemeColors = {
  foreground: '#14211C',
  mutedForeground: '#6B6258',
  card: '#FFFFFF',
  secondary: '#EFEAE1',
  border: '#E6DFD3',
  background: '#FAF7F2',
  destructive: '#C82626',
  primary: '#0E3B2E',
  primaryForeground: '#FAF7F2',
};

const DARK: ThemeColors = {
  foreground: '#F2EFE9',
  mutedForeground: '#9AA39D',
  card: '#13201B',
  secondary: '#1A2A24',
  border: '#24332C',
  background: '#0C1512',
  destructive: '#FF6467',
  primary: '#34D399',
  primaryForeground: '#0C1512',
};

export function useThemeColors(): ThemeColors {
  const { resolvedScheme } = useThemePreference();
  return resolvedScheme === 'dark' ? DARK : LIGHT;
}
