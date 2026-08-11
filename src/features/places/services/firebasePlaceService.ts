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

interface PlacesAutocompleteRequest extends PlaceSearchInput {
  action: 'autocomplete';
}

interface PlacesResolveRequest extends PlaceResolveInput {
  action: 'resolve';
}

export const firebasePlaceService: PlaceService = {
  async search(input: PlaceSearchInput) {
    const places = httpsCallable<PlacesAutocompleteRequest, AutocompletePlacesResponse>(
      getFirebaseFunctions(),
      'places',
    );
    const result = await places({
      action: 'autocomplete',
      query: input.query.trim(),
      sessionToken: input.sessionToken,
      center: input.center,
      radiusMeters: input.radiusMeters,
    });
    return result.data.suggestions ?? [];
  },

  async resolve(input: PlaceResolveInput) {
    const places = httpsCallable<PlacesResolveRequest, ResolvePlaceResponse>(
      getFirebaseFunctions(),
      'places',
    );
    const result = await places({ ...input, action: 'resolve' });
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
