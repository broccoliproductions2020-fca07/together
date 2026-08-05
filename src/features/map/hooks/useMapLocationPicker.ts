import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import type { ActivityMode, SelectedPlace } from '@/features/activities';
import {
  placeService,
  readPlaceSearchCache,
  storePlaceSearchCache,
  type PlaceSuggestion,
} from '@/features/places';
import { showLocationPermissionAlert } from '@/shared/utils/locationPermission';

import type { MapCoordinate, MapPlaceSelection } from '../types/map.types';
import { DEFAULT_MAP_REGION } from '../utils/defaultRegion';

const CANDIDATE_CLEAR_DISTANCE = 0.00025;
const PLACE_SEARCH_MIN_QUERY_LENGTH = 3;
const PLACE_SEARCH_DEBOUNCE_MS = 650;

function createPlaceSearchSessionToken() {
  return `together-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`;
}

function compactAddressParts(parts: (string | null | undefined)[]) {
  const uniqueParts = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return [...new Set(uniqueParts)].join(', ');
}

function formatReverseGeocodedAddress(address: Location.LocationGeocodedAddress) {
  const streetLine = compactAddressParts([address.street, address.streetNumber]);
  const areaLine = compactAddressParts([address.district, address.city]);

  return (
    address.name?.trim() ||
    address.formattedAddress?.trim() ||
    compactAddressParts([streetLine, areaLine, address.country])
  );
}

async function reverseGeocodePlaceTitle(coordinate: MapCoordinate) {
  try {
    const [address] = await Location.reverseGeocodeAsync(coordinate);
    return address ? formatReverseGeocodedAddress(address) : null;
  } catch {
    return null;
  }
}

async function coordinateToComposerPlace(coordinate: MapCoordinate): Promise<SelectedPlace> {
  const title = await reverseGeocodePlaceTitle(coordinate);
  const coordinateLabel = `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;

  return {
    id: `map-center-${coordinate.latitude.toFixed(5)}-${coordinate.longitude.toFixed(5)}`,
    name: title || 'Markierter Ort',
    address: title ? `${title} · ${coordinateLabel}` : `Koordinate: ${coordinateLabel}`,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    source: 'map',
  };
}

function distanceBetweenCoordinates(a: MapCoordinate, b: MapCoordinate) {
  return Math.abs(a.latitude - b.latitude) + Math.abs(a.longitude - b.longitude);
}

export interface UseMapLocationPickerOptions {
  onActiveChange?: (active: boolean) => void;
}

export function useMapLocationPicker({ onActiveChange }: UseMapLocationPickerOptions = {}) {
  const [active, setActive] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [currentLocationLoading, setCurrentLocationLoading] = useState(false);
  const [mode, setMode] = useState<ActivityMode>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPlaceCandidate, setSelectedPlaceCandidate] = useState<SelectedPlace>();
  const [coordinate, setCoordinate] = useState<MapCoordinate>({
    latitude: DEFAULT_MAP_REGION.latitude,
    longitude: DEFAULT_MAP_REGION.longitude,
  });
  const [focusCoordinate, setFocusCoordinate] = useState<MapCoordinate>();
  const [searchRequestVersion, setSearchRequestVersion] = useState(0);
  const coordinateRef = useRef(coordinate);
  const pendingPickRef = useRef<((place: SelectedPlace) => void) | null>(null);
  const searchRequestRef = useRef(0);
  const searchSignatureRef = useRef<string | undefined>(undefined);
  const skipSearchRef = useRef(false);
  const submitSearchRef = useRef(false);
  const searchSessionRef = useRef(createPlaceSearchSessionToken());
  const searchSessionHasInputRef = useRef(false);
  const searchSessionResolvedRef = useRef(false);

  useEffect(() => {
    coordinateRef.current = coordinate;
  }, [coordinate]);

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!active || query.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
      skipSearchRef.current = false;
      searchSignatureRef.current = undefined;
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    if (selectedPlaceCandidate || skipSearchRef.current) {
      skipSearchRef.current = false;
      searchSignatureRef.current = undefined;
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const center = coordinateRef.current;
    const normalizedQuery = query.replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
    const signature = `${normalizedQuery}:${center.latitude.toFixed(3)}:${center.longitude.toFixed(3)}`;
    if (searchSignatureRef.current === signature) {
      setSearchLoading(false);
      return;
    }

    // A recent identical search (same query + map area) paints instantly and
    // costs neither the debounce wait, a Places request, nor daily quota.
    const cachedResults = readPlaceSearchCache(signature);
    if (cachedResults) {
      searchSignatureRef.current = signature;
      setSearchResults(cachedResults);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const requestId = ++searchRequestRef.current;
    const runImmediately = submitSearchRef.current;
    submitSearchRef.current = false;
    setSearchLoading(true);
    const timer = setTimeout(
      () => {
        searchSignatureRef.current = signature;
        void placeService
          .search({
            query,
            sessionToken: searchSessionRef.current,
            center,
            radiusMeters: 10_000,
          })
          .then((results) => {
            storePlaceSearchCache(signature, results);
            if (!cancelled && requestId === searchRequestRef.current) {
              setSearchResults(results);
              setSearchLoading(false);
            }
          })
          .catch(() => {
            if (!cancelled && requestId === searchRequestRef.current) {
              searchSignatureRef.current = undefined;
              setSearchResults([]);
              setSearchLoading(false);
            }
          });
      },
      runImmediately ? 0 : PLACE_SEARCH_DEBOUNCE_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, searchQuery, searchRequestVersion, selectedPlaceCandidate]);

  const resetSearchSession = useCallback(() => {
    searchSessionRef.current = createPlaceSearchSessionToken();
    searchSessionHasInputRef.current = false;
    searchSessionResolvedRef.current = false;
  }, []);

  const updateSearchQuery = useCallback((query: string) => {
    const hasInput = query.trim().length > 0;
    if (hasInput && (!searchSessionHasInputRef.current || searchSessionResolvedRef.current)) {
      searchSessionRef.current = createPlaceSearchSessionToken();
      searchSessionResolvedRef.current = false;
    }
    searchSessionHasInputRef.current = hasInput;
    skipSearchRef.current = false;
    submitSearchRef.current = false;
    setSelectedPlaceCandidate(undefined);
    setSearchQuery(query);
  }, []);

  const submitSearch = useCallback(() => {
    submitSearchRef.current = true;
    setSearchRequestVersion((version) => version + 1);
  }, []);

  const updateCenter = useCallback((nextCoordinate: MapCoordinate) => {
    setCoordinate(nextCoordinate);
    setSelectedPlaceCandidate((candidate) => {
      if (candidate?.latitude == null || candidate.longitude == null) return candidate;

      const candidateCoordinate = {
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      };
      if (distanceBetweenCoordinates(nextCoordinate, candidateCoordinate) <= CANDIDATE_CLEAR_DISTANCE) {
        return candidate;
      }

      skipSearchRef.current = true;
      return undefined;
    });
  }, []);

  const focusCurrentLocation = useCallback(async () => {
    if (currentLocationLoading) return;

    setCurrentLocationLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        // An explicit tap on "Aktuellen Standort verwenden" must never end in
        // silence — say why nothing happened and offer the fix.
        showLocationPermissionAlert();
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextCoordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const address = await reverseGeocodePlaceTitle(nextCoordinate);

      setCoordinate(nextCoordinate);
      setFocusCoordinate(nextCoordinate);
      setSelectedPlaceCandidate({
        id: `current-${nextCoordinate.latitude.toFixed(5)}-${nextCoordinate.longitude.toFixed(5)}`,
        name: 'Aktueller Standort',
        address: address ?? 'Aktuelle Position',
        latitude: nextCoordinate.latitude,
        longitude: nextCoordinate.longitude,
        source: 'current',
      });
      setSearchQuery('');
      setSearchResults([]);
      setSearchLoading(false);
    } finally {
      setCurrentLocationLoading(false);
    }
  }, [currentLocationLoading]);

  const open = useCallback(
    (
      nextMode: ActivityMode,
      onPick: (place: SelectedPlace) => void,
      options: { focusCurrentLocation?: boolean } = {},
    ) => {
      pendingPickRef.current = onPick;
      setMode(nextMode);
      resetSearchSession();
      setSearchQuery('');
      setSearchResults([]);
      setSearchLoading(false);
      setSelectedPlaceCandidate(undefined);
      setResolving(false);
      setCurrentLocationLoading(false);
      setActive(true);
      if (options.focusCurrentLocation !== false) void focusCurrentLocation();
    },
    [focusCurrentLocation, resetSearchSession],
  );

  const cancel = useCallback(() => {
    pendingPickRef.current = null;
    resetSearchSession();
    setResolving(false);
    setCurrentLocationLoading(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchLoading(false);
    setSelectedPlaceCandidate(undefined);
    setActive(false);
  }, [resetSearchSession]);

  const selectSearchResult = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (resolving) return;

      setResolving(true);
      try {
        const place = await placeService.resolve({
          placeId: suggestion.id,
          sessionToken: searchSessionRef.current,
          name: suggestion.name,
        });
        if (place.latitude == null || place.longitude == null) {
          throw new Error('Der Ort hat keine Kartenkoordinate.');
        }

        const nextCoordinate = { latitude: place.latitude, longitude: place.longitude };
        searchSessionResolvedRef.current = true;
        setSelectedPlaceCandidate({ ...place, source: 'map' });
        setSearchQuery('');
        setSearchResults([]);
        setSearchLoading(false);
        setCoordinate(nextCoordinate);
        setFocusCoordinate(nextCoordinate);
      } catch {
        Alert.alert('Ort nicht verfügbar', 'Bitte wähle den Ort direkt auf der Karte aus.');
      } finally {
        setResolving(false);
      }
    },
    [resolving],
  );

  const selectMapPlace = useCallback((place: MapPlaceSelection) => {
    const nextCoordinate = place.coordinate;
    searchRequestRef.current += 1;
    searchSignatureRef.current = undefined;
    resetSearchSession();
    setSearchQuery('');
    setSearchResults([]);
    setSearchLoading(false);
    setSelectedPlaceCandidate({
      id: place.placeId ?? place.id,
      name: place.title.trim() || 'Markierter Ort',
      latitude: nextCoordinate.latitude,
      longitude: nextCoordinate.longitude,
      source: 'map',
    });
    setCoordinate(nextCoordinate);
    setFocusCoordinate(nextCoordinate);
  }, [resetSearchSession]);

  const confirm = useCallback(async () => {
    if (resolving) return;

    setResolving(true);
    const place = selectedPlaceCandidate ?? (await coordinateToComposerPlace(coordinate));
    pendingPickRef.current?.(place);
    pendingPickRef.current = null;
    resetSearchSession();
    setResolving(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchLoading(false);
    setSelectedPlaceCandidate(undefined);
    setActive(false);
  }, [coordinate, resetSearchSession, resolving, selectedPlaceCandidate]);

  return {
    active,
    cancel,
    confirm,
    coordinate,
    currentLocationLoading,
    focusCoordinate,
    focusCurrentLocation,
    mode,
    open,
    resolving,
    searchLoading,
    searchQuery,
    searchResults,
    selectMapPlace,
    selectSearchResult,
    selectedPlaceCandidate,
    submitSearch,
    updateCenter,
    updateSearchQuery,
  };
}
