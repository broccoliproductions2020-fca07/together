import type { SelectedPlace } from '@/features/activities';

export interface PlaceSearchInput {
  query: string;
  center?: { latitude: number; longitude: number };
  radiusMeters?: number;
}

export interface PlaceService {
  search(input: PlaceSearchInput): Promise<SelectedPlace[]>;
}
