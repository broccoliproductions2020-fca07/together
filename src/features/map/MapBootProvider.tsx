import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

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

  const initialLocationAttemptFinished =
    locationState === 'camera-ready' ||
    locationState === 'location-pending' ||
    locationState === 'unavailable';
  const prewarming = !baseReady || !mapRendererReady || !initialLocationAttemptFinished;
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
