import { useContext } from 'react';

import { MapStyleContext } from './MapStyleProvider';
import type { MapStyleValue } from './types';

export function useMapStyle(): MapStyleValue {
  const context = useContext(MapStyleContext);
  if (!context) {
    throw new Error('useMapStyle() must be used within a <MapStyleProvider>.');
  }
  return context;
}
