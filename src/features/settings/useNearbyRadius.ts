import { useContext } from 'react';

import { NearbyRadiusContext } from './NearbyRadiusProvider';

export function useNearbyRadius() {
  const ctx = useContext(NearbyRadiusContext);
  if (!ctx) throw new Error('useNearbyRadius must be used within NearbyRadiusProvider');
  return ctx;
}
