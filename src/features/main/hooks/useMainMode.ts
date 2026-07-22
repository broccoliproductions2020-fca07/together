import { useCallback, useState } from 'react';

import type { MainMode } from '../types/main.types';

/** Local map/calendar mode state for the main surface. */
export function useMainMode(initialMode: MainMode = 'map') {
  const [mode, setMode] = useState<MainMode>(initialMode);
  const toggle = useCallback(
    () => setMode((current) => (current === 'map' ? 'calendar' : 'map')),
    [],
  );
  return { mode, setMode, toggle };
}
