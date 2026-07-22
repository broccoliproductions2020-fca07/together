import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useThemePreference } from '@/features/theme';

import type { EffectiveMapStyle, MapStylePreference, MapStyleValue } from './types';

const STORAGE_KEY = 'together.map.style.v1';
const VALID: MapStylePreference[] = ['system', 'day', 'night', 'satellite'];

export const MapStyleContext = createContext<MapStyleValue | null>(null);

/**
 * Holds the user's map-style choice (day / night / satellite / follow-theme) and
 * persists it with AsyncStorage. Mirrors {@link ThemePreferenceProvider}. Must
 * live INSIDE `ThemePreferenceProvider` so `system` can resolve against the
 * app's light/dark scheme.
 */
export function MapStyleProvider({ children }: { children: ReactNode }) {
  const { resolvedScheme } = useThemePreference();
  const [preference, setPreferenceState] = useState<MapStylePreference>('system');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (active && stored && VALID.includes(stored as MapStylePreference)) {
          setPreferenceState(stored as MapStylePreference);
        }
      })
      .catch(() => {
        // Ignore read errors; fall back to `system`.
      });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: MapStylePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best-effort persistence.
    });
  }, []);

  const effectiveStyle: EffectiveMapStyle =
    preference === 'system' ? (resolvedScheme === 'dark' ? 'night' : 'day') : preference;

  const value = useMemo<MapStyleValue>(
    () => ({ preference, effectiveStyle, setPreference }),
    [preference, effectiveStyle, setPreference],
  );

  return <MapStyleContext.Provider value={value}>{children}</MapStyleContext.Provider>;
}
