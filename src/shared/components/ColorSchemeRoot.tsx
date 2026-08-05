import { useEffect, type ReactNode } from 'react';
import { Appearance, View, type ViewProps } from 'react-native';

export type ColorSchemePreference = 'light' | 'dark' | 'system';

/**
 * Applies the persisted colour-scheme preference and provides the flex root
 * every screen lays out inside.
 *
 * This replaces the generated `GluestackUIProvider`. That wrapper only ever did
 * two things: this `Appearance` call and an unused Overlay/Toast provider pair —
 * the app never rendered a single gluestack component. Keeping it meant keeping
 * `@gluestack-ui/*`, which transitively pulls `react-aria`, which requires
 * `react-dom`. Once `react-dom` was dropped (web is no longer a target) that
 * chain broke the bundle outright.
 */
export function ColorSchemeRoot({
  mode = 'system',
  style,
  children,
}: {
  mode?: ColorSchemePreference;
  style?: ViewProps['style'];
  children?: ReactNode;
}) {
  useEffect(() => {
    // `system` follows the OS — leave Appearance untouched so it tracks the
    // device scheme. Only force a scheme for an explicit light/dark mode.
    if (mode === 'system') return;
    Appearance.setColorScheme(mode);
  }, [mode]);

  return <View style={[{ flex: 1, height: '100%', width: '100%' }, style]}>{children}</View>;
}
