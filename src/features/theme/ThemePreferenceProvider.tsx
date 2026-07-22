import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { ColorSchemePreference, ThemePreferenceValue } from './types';

const STORAGE_KEY = 'together.theme.preference.v1';
const VALID: ColorSchemePreference[] = ['system', 'light', 'dark'];

export const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

/**
 * Holds the user's color-scheme preference and persists it with AsyncStorage so
 * it survives restarts. Defaults to `system` until the stored value is read.
 */
export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ColorSchemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (active && stored && VALID.includes(stored as ColorSchemePreference)) {
          setPreferenceState(stored as ColorSchemePreference);
        }
      })
      .catch(() => {
        // Ignore read errors; fall back to `system`.
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ColorSchemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best-effort persistence.
    });
  }, []);

  const resolvedScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemePreferenceValue>(
    () => ({ preference, resolvedScheme, setPreference, ready }),
    [preference, resolvedScheme, setPreference, ready],
  );

  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}
