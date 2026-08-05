import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { STOCK_DARK_STYLE, STOCK_LIGHT_STYLE } from '../utils/stockMapStyles';
import { blendSunMapStyles, readableSunMapStyle } from '../utils/sunMapStyles';
import { PREVIEW_STATE_BY_ID, PREVIEW_STATE_IDS, type PreviewStateId } from './previewStates';
import type { EffectiveMapStyle, MapStylePreference, MapStyleValue } from './types';
import { useSunPhase } from './useSunPhase';

const STORAGE_KEY = 'together.map.style.v1';
const VALID: MapStylePreference[] = ['dynamic', 'light', 'dark', ...PREVIEW_STATE_IDS];
/** Dynamic is the default: the map matching the actual time of day is part of
 * the product's identity, not a setting people should have to discover. */
const DEFAULT_PREFERENCE: MapStylePreference = 'dynamic';

export const MapStyleContext = createContext<MapStyleValue | null>(null);

/**
 * Holds the user's map-style choice and persists it with AsyncStorage. Dynamic
 * blends complete Google Maps JSON palettes on-device; it is not a visual
 * overlay and makes no network request.
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
        // Migrate former manual day/night choices. Removed satellite and
        // app-theme choices become Dynamic, the new safe default.
        setPreferenceState(stored === 'day' ? 'light' : stored === 'night' ? 'dark' : 'dynamic');
      })
      .catch(() => {
        // Ignore read errors; fall back to Dynamic.
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

  const previewScheme = PREVIEW_STATE_BY_ID.get(preference as PreviewStateId)?.colorScheme;
  const effectiveStyle: EffectiveMapStyle = previewScheme
    ? previewScheme === 'dark'
      ? 'night'
      : 'day'
    : preference === 'dynamic'
      ? sunPhase
      : preference === 'light'
        ? 'day'
        : 'night';
  const nextStyle: EffectiveMapStyle = preference === 'dynamic' ? nextSunPhase : effectiveStyle;
  const progress = preference === 'dynamic' ? sunProgress : 0;
  const previewState = PREVIEW_STATE_BY_ID.get(preference as PreviewStateId);
  // "Hell" and "Dunkel" are Google's own map, with NOTHING of ours applied —
  // they are the reference the dynamic map gets judged against, so they must
  // never pick up a solar palette, street lamps, or a label pass. Only
  // "Dynamisch" runs our design.
  //
  // Dark is produced by `colorScheme` below — the SDK renders Google's real
  // dark map — and the only style laid over it is the lit roadway. Light ships
  // nothing at all.
  const mapStyle = useMemo(() => {
    if (previewState) return previewState.style;
    if (preference === 'light') return STOCK_LIGHT_STYLE;
    if (preference === 'dark') return STOCK_DARK_STYLE;
    return effectiveStyle === nextStyle
      ? readableSunMapStyle(effectiveStyle)
      : blendSunMapStyles(effectiveStyle, nextStyle, progress);
  }, [previewState, preference, effectiveStyle, nextStyle, progress]);

  const colorScheme: 'light' | 'dark' =
    previewState?.colorScheme ??
    (preference === 'dark' ||
    (preference === 'dynamic' && (effectiveStyle === 'dusk' || effectiveStyle === 'night'))
      ? 'dark'
      : 'light');

  const value = useMemo<MapStyleValue>(
    () => ({ preference, effectiveStyle, mapStyle, colorScheme, setPreference }),
    [preference, effectiveStyle, mapStyle, colorScheme, setPreference],
  );

  return <MapStyleContext.Provider value={value}>{children}</MapStyleContext.Provider>;
}
