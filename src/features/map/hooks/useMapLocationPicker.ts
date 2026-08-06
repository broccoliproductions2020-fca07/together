import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import type { ActivityMode, SelectedPlace } from '@/features/activities';
import { placeService, type PlaceSuggestion } from '@/features/places';
import { showLocationPermissionAlert } from '@/shared/utils/locationPermission';

import type { MapCoordinate, MapPlaceSelection } from '../types/map.types';
import { DEFAULT_MAP_REGION } from '../utils/defaultRegion';

const CANDIDATE_CLEAR_DISTANCE = 0.00025;
const PLACE_SEARCH_MIN_QUERY_LENGTH = 3;
const PLACE_SEARCH_DEBOUNCE_MS = 650;

function placeSearchFailureMessage(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message.trim() : '';
  // Callables return German, user-safe copy for expected configuration and
  // quota states. Transport/provider errors remain a stable local message.
  if (
    typeof code === 'string' &&
    (code === 'failed-precondition' ||
      code === 'resource-exhausted' ||
      code === 'invalid-argument' ||
      code === 'permission-denied') &&
    message
  ) {
    return message.replace(/^\[[^\]]+\]\s*/, '');
  }
  return 'Die Ortssuche ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.';
}

function createPlaceSearchSessionToken() {
  // Google bills Autocomplete as a session only when its token is unique and
  // reused once for the selected Place Details request. Expo Crypto produces
  // an RFC 4122 v4 UUID: URL-safe and exactly within Google's 36-char limit.
  return Crypto.randomUUID();
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

export interface MapLocationPickerOpenOptions {
  focusCurrentLocation?: boolean;
  autoConfirm?: boolean;
  /** Search is a distinct task, not a manual map-pin picker. */
  searchMode?: boolean;
  /** Local-only bias for Places; it is never written to Firebase. */
  initialCoordinate?: MapCoordinate;
}

export function useMapLocationPicker({ onActiveChange }: UseMapLocationPickerOptions = {}) {
  const [active, setActive] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [currentLocationLoading, setCurrentLocationLoading] = useState(false);
  const [mode, setMode] = useState<ActivityMode>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
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
  /**
   * "The moment a real place is resolved, hand it back and get out of the way."
   *
   * Set for the entry points where picking IS the decision — the map search bar
   * and the composer's "Ort suchen" / "Aktueller Standort". Tapping a result
   * there and then having to confirm it is a second answer to a question already
   * answered. Left off for "Auf Karte auswählen", where moving the map is the
   * act of choosing and the confirm is the only thing that ends it.
   */
  const autoConfirmRef = useRef(false);

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
      setSearchError(undefined);
      setSearchCompleted(false);
      return;
    }

    if (selectedPlaceCandidate || skipSearchRef.current) {
      skipSearchRef.current = false;
      searchSignatureRef.current = undefined;
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(undefined);
      setSearchCompleted(false);
      return;
    }

    const center = coordinateRef.current;
    const normalizedQuery = query.replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
    const signature = `${normalizedQuery}:${center.latitude.toFixed(3)}:${center.longitude.toFixed(3)}`;
    // Google Places content must not be cached. This only suppresses a repeat
    // request while the same live result list is already on screen (for
    // example, pressing the keyboard Search key twice); typing away and back
    // deliberately performs a fresh request.
    if (searchSignatureRef.current === signature) {
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const requestId = ++searchRequestRef.current;
    const runImmediately = submitSearchRef.current;
    submitSearchRef.current = false;
    setSearchLoading(true);
    setSearchError(undefined);
    setSearchCompleted(false);
    const timer = setTimeout(
      () => {
        searchSignatureRef.current = signature;
        void placeService
          .search({
            query,
            sessionToken: searchSessionRef.current,
            center,
            // Establishments rank more reliably with a nearby bias. The map
            // already has the user's local foreground position when available;
            // this only changes ranking, never restricts the world search.
            radiusMeters: 5_000,
          })
          .then((results) => {
            if (!cancelled && requestId === searchRequestRef.current) {
              setSearchResults(results);
              setSearchLoading(false);
              setSearchCompleted(true);
            }
          })
          .catch((error: unknown) => {
            if (!cancelled && requestId === searchRequestRef.current) {
              searchSignatureRef.current = undefined;
              setSearchResults([]);
              setSearchLoading(false);
              setSearchError(placeSearchFailureMessage(error));
              setSearchCompleted(true);
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

  /** The single exit: hand the place to whoever opened the picker and tear the
   * session down. Both `confirm` and every auto-confirm path go through here so
   * a place can never be delivered while the picker stays half-open. */
  const finishWith = useCallback(
    (place: SelectedPlace) => {
      pendingPickRef.current?.(place);
      pendingPickRef.current = null;
      autoConfirmRef.current = false;
      resetSearchSession();
      setResolving(false);
      setCurrentLocationLoading(false);
      setSearchQuery('');
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(undefined);
      setSearchCompleted(false);
      setSearchMode(false);
      setSelectedPlaceCandidate(undefined);
      setActive(false);
    },
    [resetSearchSession],
  );

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
    setSearchResults([]);
    setSearchError(undefined);
    setSearchCompleted(false);
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
      if (
        distanceBetweenCoordinates(nextCoordinate, candidateCoordinate) <= CANDIDATE_CLEAR_DISTANCE
      ) {
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
      const place: SelectedPlace = {
        id: `current-${nextCoordinate.latitude.toFixed(5)}-${nextCoordinate.longitude.toFixed(5)}`,
        name: 'Aktueller Standort',
        address: address ?? 'Aktuelle Position',
        latitude: nextCoordinate.latitude,
        longitude: nextCoordinate.longitude,
        source: 'current',
      };

      setCoordinate(nextCoordinate);
      // Always publish the focus, even when finishing immediately: the camera
      // move is what makes "use my position" visible as a place rather than as
      // a label, and the composer reopens over a map already showing it.
      setFocusCoordinate(nextCoordinate);
      setSearchQuery('');
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(undefined);
      setSearchCompleted(false);

      if (autoConfirmRef.current) {
        finishWith(place);
        return;
      }
      setSelectedPlaceCandidate(place);
    } finally {
      setCurrentLocationLoading(false);
    }
  }, [currentLocationLoading, finishWith]);

  const open = useCallback(
    (
      nextMode: ActivityMode,
      onPick: (place: SelectedPlace) => void,
      options: MapLocationPickerOpenOptions = {},
    ) => {
      pendingPickRef.current = onPick;
      autoConfirmRef.current = options.autoConfirm ?? false;
      setMode(nextMode);
      resetSearchSession();
      if (options.initialCoordinate) setCoordinate(options.initialCoordinate);
      setSearchQuery('');
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(undefined);
      setSearchCompleted(false);
      setSearchMode(options.searchMode ?? false);
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
    autoConfirmRef.current = false;
    resetSearchSession();
    setResolving(false);
    setCurrentLocationLoading(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError(undefined);
    setSearchCompleted(false);
    setSearchMode(false);
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
        const resolved: SelectedPlace = { ...place, source: 'map' };
        searchSessionResolvedRef.current = true;
        setSearchQuery('');
        setSearchResults([]);
        setSearchLoading(false);
        setSearchError(undefined);
        setSearchCompleted(false);
        // Move the camera before handing over, so the sheet that opens next is
        // already sitting on the right place instead of sliding up over the
        // old one and catching up afterwards.
        setCoordinate(nextCoordinate);
        setFocusCoordinate(nextCoordinate);

        if (autoConfirmRef.current) {
          finishWith(resolved);
          return;
        }
        setSelectedPlaceCandidate(resolved);
      } catch {
        Alert.alert('Ort nicht verfügbar', 'Bitte wähle den Ort direkt auf der Karte aus.');
      } finally {
        setResolving(false);
      }
    },
    [finishWith, resolving],
  );

  const selectMapPlace = useCallback(
    (place: MapPlaceSelection) => {
      const nextCoordinate = place.coordinate;
      searchRequestRef.current += 1;
      searchSignatureRef.current = undefined;
      resetSearchSession();
      setSearchQuery('');
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(undefined);
      setSearchCompleted(false);
      setSelectedPlaceCandidate({
        id: place.placeId ?? place.id,
        name: place.title.trim() || 'Markierter Ort',
        latitude: nextCoordinate.latitude,
        longitude: nextCoordinate.longitude,
        source: 'map',
      });
      setCoordinate(nextCoordinate);
      setFocusCoordinate(nextCoordinate);
    },
    [resetSearchSession],
  );

  const confirm = useCallback(async () => {
    if (resolving) return;

    setResolving(true);
    const place = selectedPlaceCandidate ?? (await coordinateToComposerPlace(coordinate));
    finishWith(place);
  }, [coordinate, finishWith, resolving, selectedPlaceCandidate]);

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
    searchCompleted,
    searchError,
    searchLoading,
    searchMode,
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
