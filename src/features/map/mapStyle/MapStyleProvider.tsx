import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { STOCK_DARK_STYLE, STOCK_LIGHT_STYLE } from '../utils/stockMapStyles';
import { dynamicSunMapStyle } from '../utils/sunMapStyles';
import { useSunPhase } from './useSunPhase';
import type { EffectiveMapStyle, MapStylePreference, MapStyleValue } from './types';

const STORAGE_KEY = 'together.map.style.v1';
const VALID: MapStylePreference[] = ['dynamic', 'light', 'dark'];
const DEFAULT_PREFERENCE: MapStylePreference = 'dynamic';

export const MapStyleContext = createContext<MapStyleValue | null>(null);

/**
 * Holds the user's map-style choice and persists it with AsyncStorage.
 *
 * Dynamic follows the real local sun without requesting a location permission:
 * neutral day holds through noon, warm golden hour arrives late afternoon,
 * followed by a blue-grey twilight and then night. The precise boundaries are
 * computed locally from the day's actual solar times.
 */
export function MapStyleProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<MapStylePreference>(DEFAULT_PREFERENCE);
  const { phase: sunPhase, nextPhase: nextSunPhase, progress: sunProgress } = useSunPhase();

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        if (VALID.includes(stored as MapStylePreference)) {
          setPreferenceState(stored as MapStylePreference);
          return;
        }
        // Keep former explicit choices. Unknown old values follow the new
        // default rather than guessing a visual preference for the user.
        setPreferenceState(stored === 'day' ? 'light' : stored === 'night' ? 'dark' : 'dynamic');
      })
      .catch(() => {
        // Ignore read errors; fall back to the default.
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
    preference === 'dynamic' ? sunPhase : preference === 'dark' ? 'night' : 'day';
  const nextStyle: EffectiveMapStyle = preference === 'dynamic' ? nextSunPhase : effectiveStyle;
  const mapStyle = useMemo(() => {
    if (preference === 'light') return STOCK_LIGHT_STYLE;
    // Dynamic must finish on the identical native Google night map as the
    // explicit "Dunkel" choice. STOCK_DARK_STYLE only adds the intentional
    // warm road-light layer; its base remains Google's original dark palette.
    if (preference === 'dark' || (preference === 'dynamic' && effectiveStyle === 'night')) {
      return STOCK_DARK_STYLE;
    }
    return dynamicSunMapStyle(effectiveStyle, nextStyle, sunProgress);
  }, [effectiveStyle, nextStyle, preference, sunProgress]);
  const colorScheme: 'light' | 'dark' =
    preference === 'dark' || (preference === 'dynamic' && (effectiveStyle === 'dusk' || effectiveStyle === 'night'))
      ? 'dark'
      : 'light';

  const value = useMemo<MapStyleValue>(
    () => ({ preference, effectiveStyle, mapStyle, colorScheme, setPreference }),
    [preference, effectiveStyle, mapStyle, colorScheme, setPreference],
  );

  return <MapStyleContext.Provider value={value}>{children}</MapStyleContext.Provider>;
}
