import type { SelectedPlace } from '../types';

/**
 * The composer's default location choice. It resolves the device position only
 * after the person explicitly chooses it, so it deliberately has no coordinates.
 */
export const CURRENT_LOCATION_PLACE: SelectedPlace = {
  id: 'p_current',
  name: 'Aktueller Standort',
  source: 'current',
};
