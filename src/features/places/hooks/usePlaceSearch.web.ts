import { useCallback, useState } from 'react';

import type { SelectedPlace } from '@/features/activities/types';

interface PlaceSuggestion {
  id: string;
  name: string;
  address?: string;
}

export interface PlaceSearchCenter {
  latitude: number;
  longitude: number;
}

export interface UsePlaceSearchOptions {
  enabled: boolean;
  center?: PlaceSearchCenter;
  radiusMeters?: number;
}

/** The landing preview is intentionally read-only and never starts a paid search session. */
export function usePlaceSearch({ enabled: _enabled }: UsePlaceSearchOptions) {
  const [query, setQuery] = useState('');

  const reset = useCallback(() => setQuery(''), []);
  const updateQuery = useCallback((nextQuery: string) => setQuery(nextQuery), []);
  const submit = useCallback(() => undefined, []);
  const resolve = useCallback(async (_suggestion: PlaceSuggestion): Promise<SelectedPlace | null> => null, []);

  return {
    completed: false,
    error: undefined,
    loading: false,
    query,
    reset,
    resolving: false,
    resolve,
    results: [] as PlaceSuggestion[],
    submit,
    updateQuery,
  };
}
