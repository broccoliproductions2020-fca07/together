import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseFunctions } from '@/shared/services/firebase';

import type {
  PlaceResolveInput,
  PlaceSearchInput,
  PlaceService,
  PlaceSuggestion,
} from './placeService.types';

interface AutocompletePlacesResponse {
  suggestions: PlaceSuggestion[];
}

interface ResolvePlaceResponse {
  place: {
    id: string;
    latitude: number;
    longitude: number;
  };
}

export const firebasePlaceService: PlaceService = {
  async search(input: PlaceSearchInput) {
    const autocomplete = httpsCallable<PlaceSearchInput, AutocompletePlacesResponse>(
      getFirebaseFunctions(),
      'autocompletePlaces',
    );
    const result = await autocomplete({
      query: input.query.trim(),
      sessionToken: input.sessionToken,
      center: input.center,
      radiusMeters: input.radiusMeters,
    });
    return result.data.suggestions ?? [];
  },

  async resolve(input: PlaceResolveInput) {
    const resolve = httpsCallable<PlaceResolveInput, ResolvePlaceResponse>(
      getFirebaseFunctions(),
      'resolvePlaceLocation',
    );
    const result = await resolve(input);
    const place = result.data.place;
    return {
      id: place.id,
      // `displayName` would promote the details request to the expensive Pro
      // SKU. The selected Autocomplete label is already available locally.
      name: input.name,
      latitude: place.latitude,
      longitude: place.longitude,
      source: 'map',
    };
  },
};
