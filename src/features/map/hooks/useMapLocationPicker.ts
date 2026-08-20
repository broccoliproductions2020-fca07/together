import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import type { ActivityMode, SelectedPlace } from '@/features/activities';
import { usePlaceSearch, type PlaceSuggestion } from '@/features/places';
import { showLocationPermissionAlert } from '@/shared/utils/locationPermission';

import type { MapCoordinate, MapPlaceSelection } from '../types/map.types';
import { DEFAULT_MAP_REGION } from '../utils/defaultRegion';

const CANDIDATE_CLEAR_DISTANCE = 0.00025;

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

  return {
    id: `map-center-${coordinate.latitude.toFixed(5)}-${coordinate.longitude.toFixed(5)}`,
    name: title || 'Markierter Ort',
    // No raw coordinates and no repeat of the name: this line is the place's
    // address to a person, not a debug readout.
    address: undefined,
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
  /** Let the selected place's detail sheet own the camera focus instead. */
  focusMapOnPick?: boolean;
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
  const [searchMode, setSearchMode] = useState(false);
  const [selectedPlaceCandidate, setSelectedPlaceCandidate] = useState<SelectedPlace>();
  const [coordinate, setCoordinate] = useState<MapCoordinate>({
    latitude: DEFAULT_MAP_REGION.latitude,
    longitude: DEFAULT_MAP_REGION.longitude,
  });
  const [focusCoordinate, setFocusCoordinate] = useState<MapCoordinate>();
  const placeSearch = usePlaceSearch({ enabled: active, center: coordinate });
  const pendingPickRef = useRef<((place: SelectedPlace) => void) | null>(null);
  /** Every open/cancel/selection gets a new ticket. Async GPS and Places work
   * must prove it still belongs to the visible picker before touching state. */
  const pickerSessionRef = useRef(0);
  const placeResolutionInFlightRef = useRef(false);
  const currentLocationInFlightRef = useRef(false);
  const confirmInFlightRef = useRef(false);
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
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  /** The single exit: hand the place to whoever opened the picker and tear the
   * session down. Both `confirm` and every auto-confirm path go through here so
   * a place can never be delivered while the picker stays half-open. */
  const finishWith = useCallback(
    (place: SelectedPlace) => {
      // Invalidate any slower GPS/reverse-geocode request before handing the
      // choice back. Without this, closing and immediately reopening the
      // picker could receive the previous session's answer.
      pickerSessionRef.current += 1;
      placeResolutionInFlightRef.current = false;
      currentLocationInFlightRef.current = false;
      confirmInFlightRef.current = false;
      pendingPickRef.current?.(place);
      pendingPickRef.current = null;
      autoConfirmRef.current = false;
      placeSearch.reset();
      setResolving(false);
      setCurrentLocationLoading(false);
      setSearchMode(false);
      setSelectedPlaceCandidate(undefined);
      setActive(false);
    },
    [placeSearch.reset],
  );

  const updateSearchQuery = useCallback(
    (query: string) => {
      // Typing is a newer decision than a map candidate.
      setSelectedPlaceCandidate(undefined);
      placeSearch.updateQuery(query);
    },
    [placeSearch.updateQuery],
  );

  const submitSearch = placeSearch.submit;

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

      return undefined;
    });
  }, []);

  const focusCurrentLocation = useCallback(async () => {
    if (currentLocationInFlightRef.current) return;

    const session = pickerSessionRef.current;
    currentLocationInFlightRef.current = true;
    setCurrentLocationLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (session !== pickerSessionRef.current) return;
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        // An explicit tap on "Aktuellen Standort verwenden" must never end in
        // silence — say why nothing happened and offer the fix.
        showLocationPermissionAlert();
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (session !== pickerSessionRef.current) return;
      const nextCoordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const address = await reverseGeocodePlaceTitle(nextCoordinate);
      if (session !== pickerSessionRef.current) return;
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
      placeSearch.reset();

      if (autoConfirmRef.current) {
        finishWith(place);
        return;
      }
      setSelectedPlaceCandidate(place);
    } finally {
      if (session === pickerSessionRef.current) {
        currentLocationInFlightRef.current = false;
        setCurrentLocationLoading(false);
      }
    }
  }, [finishWith, placeSearch.reset]);

  const open = useCallback(
    (
      nextMode: ActivityMode,
      onPick: (place: SelectedPlace) => void,
      options: MapLocationPickerOpenOptions = {},
    ) => {
      pickerSessionRef.current += 1;
      placeResolutionInFlightRef.current = false;
      currentLocationInFlightRef.current = false;
      confirmInFlightRef.current = false;
      pendingPickRef.current = onPick;
      autoConfirmRef.current = options.autoConfirm ?? false;
      setMode(nextMode);
      placeSearch.reset();
      if (options.initialCoordinate) setCoordinate(options.initialCoordinate);
      setSearchMode(options.searchMode ?? false);
      setSelectedPlaceCandidate(undefined);
      setResolving(false);
      setCurrentLocationLoading(false);
      setActive(true);
      if (options.focusCurrentLocation !== false) void focusCurrentLocation();
    },
    [focusCurrentLocation, placeSearch.reset],
  );

  const cancel = useCallback(() => {
    pickerSessionRef.current += 1;
    placeResolutionInFlightRef.current = false;
    currentLocationInFlightRef.current = false;
    confirmInFlightRef.current = false;
    pendingPickRef.current = null;
    autoConfirmRef.current = false;
    placeSearch.reset();
    setResolving(false);
    setCurrentLocationLoading(false);
    setSearchMode(false);
    setSelectedPlaceCandidate(undefined);
    setActive(false);
  }, [placeSearch.reset]);

  const selectSearchResult = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (placeResolutionInFlightRef.current) return;

      // Choosing a search result supersedes a slower foreground-location
      // lookup started while the picker opened.
      const session = ++pickerSessionRef.current;
      placeResolutionInFlightRef.current = true;
      currentLocationInFlightRef.current = false;
      setResolving(true);
      try {
        const resolved = await placeSearch.resolve(suggestion);
        if (session !== pickerSessionRef.current || !resolved) return;

        const nextCoordinate = { latitude: resolved.latitude!, longitude: resolved.longitude! };
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
        if (session !== pickerSessionRef.current) return;
        Alert.alert('Ort nicht verfügbar', 'Bitte wähle den Ort direkt auf der Karte aus.');
      } finally {
        if (session === pickerSessionRef.current) {
          placeResolutionInFlightRef.current = false;
          setResolving(false);
        }
      }
    },
    [finishWith, placeSearch.resolve],
  );

  const selectMapPlace = useCallback(
    (place: MapPlaceSelection) => {
      // A direct map tap is a newer decision than any pending Places/GPS work.
      pickerSessionRef.current += 1;
      placeResolutionInFlightRef.current = false;
      currentLocationInFlightRef.current = false;
      confirmInFlightRef.current = false;
      const nextCoordinate = place.coordinate;
      placeSearch.reset();
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
    [placeSearch.reset],
  );

  const confirm = useCallback(async () => {
    if (confirmInFlightRef.current || placeResolutionInFlightRef.current) return;

    const session = ++pickerSessionRef.current;
    confirmInFlightRef.current = true;
    currentLocationInFlightRef.current = false;
    setResolving(true);
    try {
      const place = selectedPlaceCandidate ?? (await coordinateToComposerPlace(coordinate));
      if (session !== pickerSessionRef.current) return;
      finishWith(place);
    } finally {
      if (session === pickerSessionRef.current) {
        confirmInFlightRef.current = false;
        setResolving(false);
      }
    }
  }, [coordinate, finishWith, selectedPlaceCandidate]);

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
    searchCompleted: placeSearch.completed,
    searchError: placeSearch.error,
    searchLoading: placeSearch.loading,
    searchMode,
    searchQuery: placeSearch.query,
    searchResults: placeSearch.results,
    selectMapPlace,
    selectSearchResult,
    selectedPlaceCandidate,
    submitSearch,
    updateCenter,
    updateSearchQuery,
  };
}
