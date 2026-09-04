import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * How long the boot curtain keeps waiting for a map that may never arrive.
 *
 * The curtain exists to hide a COLD MAP, so waiting for one only means
 * something while a map is actually being built. Opening the app through a
 * deep link — an invite `f/<name>` — starts it on a route that never mounts
 * `MapCanvas`, so neither `reportMapRendererReady` nor `reportLocationBootState`
 * ever fires and the curtain stayed up forever: the app looked hung on the
 * Mica mark with no way out. The same net catches a renderer that genuinely
 * fails to come up, which would otherwise be an unrecoverable white-glove
 * freeze in production.
 *
 * The timer starts only once `baseReady` is true, so a slow cold start still
 * gets its full data budget (`BOOT_DATA_WAIT_MAX_MS`) before this one begins.
 */
const MAP_PHASE_WAIT_MAX_MS = 4_000;

type LocationBootState =
  | 'checking'
  | 'needs-permission'
  | 'locating'
  | 'location-pending'
  | 'camera-ready'
  | 'unavailable';

interface MapBootContextValue {
  prewarming: boolean;
  showLocationPermissionIntro: boolean;
  initialLocationAttemptFinished: boolean;
  reportMapRendererReady: () => void;
  reportLocationBootState: (state: LocationBootState) => void;
  registerLocationPermissionRequest: (request: (() => void) | null) => void;
  requestLocationPermission: () => void;
  skipLocationPermission: () => void;
}

const MapBootContext = createContext<MapBootContextValue | null>(null);

export function MapBootProvider({
  baseReady,
  children,
}: {
  baseReady: boolean;
  children: ReactNode;
}) {
  const [locationState, setLocationState] = useState<LocationBootState>('checking');
  const [mapRendererReady, setMapRendererReady] = useState(false);
  const permissionRequestRef = useRef<(() => void) | null>(null);

  const registerLocationPermissionRequest = useCallback((request: (() => void) | null) => {
    permissionRequestRef.current = request;
  }, []);

  const requestLocationPermission = useCallback(() => {
    setLocationState('locating');
    permissionRequestRef.current?.();
  }, []);

  const skipLocationPermission = useCallback(() => {
    setLocationState('unavailable');
  }, []);

  const reportLocationBootState = useCallback((state: LocationBootState) => {
    setLocationState(state);
  }, []);

  const reportMapRendererReady = useCallback(() => setMapRendererReady(true), []);

  const [mapWaitElapsed, setMapWaitElapsed] = useState(false);
  useEffect(() => {
    if (!baseReady || mapRendererReady) return;
    const timer = setTimeout(() => setMapWaitElapsed(true), MAP_PHASE_WAIT_MAX_MS);
    return () => clearTimeout(timer);
  }, [baseReady, mapRendererReady]);

  const initialLocationAttemptFinished =
    locationState === 'camera-ready' ||
    locationState === 'location-pending' ||
    locationState === 'unavailable';
  const mapPhaseSettled =
    (mapRendererReady && initialLocationAttemptFinished) || mapWaitElapsed;
  const prewarming = !baseReady || !mapPhaseSettled;
  const value = useMemo<MapBootContextValue>(
    () => ({
      prewarming,
      showLocationPermissionIntro: baseReady && locationState === 'needs-permission',
      initialLocationAttemptFinished,
      reportLocationBootState,
      reportMapRendererReady,
      registerLocationPermissionRequest,
      requestLocationPermission,
      skipLocationPermission,
    }),
    [
      baseReady,
      initialLocationAttemptFinished,
      prewarming,
      reportMapRendererReady,
      registerLocationPermissionRequest,
      reportLocationBootState,
      requestLocationPermission,
      skipLocationPermission,
      locationState,
    ],
  );

  return <MapBootContext.Provider value={value}>{children}</MapBootContext.Provider>;
}

export function useMapBoot() {
  const value = useContext(MapBootContext);
  if (!value) throw new Error('useMapBoot must be used inside MapBootProvider.');
  return value;
}
