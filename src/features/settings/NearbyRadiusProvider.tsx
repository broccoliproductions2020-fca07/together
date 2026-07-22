import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'together.nearby.radius.v1';

export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 20;
export const DEFAULT_RADIUS_KM = 3;

export interface NearbyRadiusValue {
  radiusKm: number;
  setRadiusKm: (km: number) => void;
  minKm: number;
  maxKm: number;
}

export const NearbyRadiusContext = createContext<NearbyRadiusValue | null>(null);

export function NearbyRadiusProvider({ children }: { children: ReactNode }) {
  const [radiusKm, setRadiusState] = useState(DEFAULT_RADIUS_KM);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored != null) {
          const parsed = parseFloat(stored);
          if (!isNaN(parsed) && parsed >= MIN_RADIUS_KM && parsed <= MAX_RADIUS_KM) {
            setRadiusState(parsed);
          }
        }
      })
      .catch(() => {});
  }, []);

  const setRadiusKm = useCallback((km: number) => {
    const clamped = Math.max(MIN_RADIUS_KM, Math.min(MAX_RADIUS_KM, km));
    setRadiusState(clamped);
    AsyncStorage.setItem(STORAGE_KEY, String(clamped)).catch(() => {});
  }, []);

  const value = useMemo<NearbyRadiusValue>(
    () => ({ radiusKm, setRadiusKm, minKm: MIN_RADIUS_KM, maxKm: MAX_RADIUS_KM }),
    [radiusKm, setRadiusKm],
  );

  return <NearbyRadiusContext.Provider value={value}>{children}</NearbyRadiusContext.Provider>;
}
