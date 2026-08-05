import type { SelectedPlace } from '@/features/activities';

export interface PlaceSearchInput {
  query: string;
  sessionToken: string;
  center?: { latitude: number; longitude: number };
  radiusMeters?: number;
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  address?: string;
}

export interface PlaceResolveInput {
  placeId: string;
  sessionToken: string;
  /** The user-selected label from the just-displayed Autocomplete result. */
  name: string;
}

export interface PlaceService {
  search(input: PlaceSearchInput): Promise<PlaceSuggestion[]>;
  resolve(input: PlaceResolveInput): Promise<SelectedPlace>;
}
