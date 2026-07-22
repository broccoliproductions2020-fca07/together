import { httpsCallable } from '@react-native-firebase/functions';

import type { SelectedPlace } from '@/features/activities';
import { getFirebaseFunctions } from '@/shared/services/firebase';

import type { PlaceSearchInput, PlaceService } from './placeService.types';

interface SearchPlacesResponse {
  places: SelectedPlace[];
}

export const firebasePlaceService: PlaceService = {
  async search(input: PlaceSearchInput) {
    const search = httpsCallable<PlaceSearchInput, SearchPlacesResponse>(
      getFirebaseFunctions(),
      'searchPlaces',
    );
    const result = await search({
      query: input.query.trim(),
      center: input.center,
      radiusMeters: input.radiusMeters,
    });
    return result.data.places ?? [];
  },
};
