import { mockComposerPlaces } from '@/data/mock';

import type { PlaceService } from './placeService.types';

export const mockPlaceService: PlaceService = {
  async search({ query }) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return mockComposerPlaces
      .filter((place) => `${place.name} ${place.address ?? ''}`.toLowerCase().includes(normalized))
      .slice(0, 8);
  },
};
