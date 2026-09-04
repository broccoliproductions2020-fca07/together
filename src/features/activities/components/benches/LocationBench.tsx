import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePlaceSearch } from '@/features/places/hooks/usePlaceSearch';
import { SearchField } from '@/shared/components/SearchField';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import type { ActivityDraft, SelectedPlace } from '../../types';
import { CURRENT_LOCATION_PLACE } from '../../utils/currentPlace';
import { useCoordinateAddress } from '../../utils/useCoordinateAddress';
import { PlacePreviewMap } from '../PlacePreviewMap';

export interface LocationBenchProps {
  draft: ActivityDraft;
  accent: string;
  onChange: (draft: ActivityDraft) => void;
  onOpenMapPicker?: (
    mode: ActivityDraft['mode'],
    onPick: (place: SelectedPlace) => void,
    options?: { focusCurrentLocation?: boolean; autoConfirm?: boolean; searchMode?: boolean },
  ) => void;
  onSearchFocusChange?: (focused: boolean) => void;
  /** Fallback ranking bias for the search when no place is chosen yet. */
  searchCenter?: { latitude: number; longitude: number };
}

function applyPlace(draft: ActivityDraft, place: SelectedPlace): ActivityDraft {
  return {
    ...draft,
    place,
    locationChoice: place.source === 'current' ? 'current' : 'map',
    locationPrecision: 'exact',
  };
}

/** Where the shown place came from. Naming the source is what makes a prefilled
 * value readable as an answer rather than as a guess. */
function sourceLabel(draft: ActivityDraft): string {
  if (draft.locationChoice === 'open') return 'Ohne Ort';
  if (draft.place?.source === 'current' || draft.locationChoice === 'current')
    return 'Dein Standort';
  return 'Gewählter Ort';
}

function SearchMessage({
  icon,
  accent,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  label: string;
}) {
  return (
    <View style={styles.searchMessage}>
      <Ionicons name={icon} size={16} color={accent} />
      <Text style={styles.searchMessageText} {...TEXT_FLEXIBLE}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The place workbench: one layout for every source.
 *
 * Switching source does not happen through a second row of chips — it happens
 * on the map itself, with the same two controls the main map carries (recentre
 * and full screen) plus the search bar above it. What changes between sources
 * is only the caption and the address; the shape of the answer stays identical.
 */
export function LocationBench({
  draft,
  accent,
  onChange,
  onOpenMapPicker,
  onSearchFocusChange,
  searchCenter: fallbackCenter,
}: LocationBenchProps) {
  const isOpenLocation = draft.locationChoice === 'open';
  const place = isOpenLocation ? undefined : draft.place;
  const isCurrentLocation = draft.locationChoice === 'current' || draft.place?.source === 'current';
  const hasCoordinate = place?.latitude != null && place?.longitude != null;
  /**
   * Bias the ranking towards where the person actually is.
   *
   * The already-chosen place wins, because refining a pick usually means
   * looking for something near it. Otherwise the device position stands in —
   * the composer's DEFAULT place (`CURRENT_LOCATION_PLACE`) deliberately has no
   * coordinates, so without this fallback the most common path of all, a fresh
   * sheet, would search the whole world for "Prater".
   */
  const searchCenter = useMemo(
    () =>
      hasCoordinate ? { latitude: place!.latitude!, longitude: place!.longitude! } : fallbackCenter,
    [fallbackCenter, hasCoordinate, place],
  );
  // The compact composer surface owns only its layout. Debounce, session
  // tokens, request cancellation and Place Details resolution are the same
  // shared implementation the full-screen map picker uses.
  const placeSearch = usePlaceSearch({ enabled: true, center: searchCenter });

  // Resolved only for the coordinate actually shown on the mini map, so the
  // address and the pin can never describe different places.
  const shownLatitude = hasCoordinate ? place?.latitude : fallbackCenter?.latitude;
  const shownLongitude = hasCoordinate ? place?.longitude : fallbackCenter?.longitude;
  const resolvedAddress = useCoordinateAddress(
    shownLatitude,
    shownLongitude,
    // A place that already carries its own address needs no lookup at all.
    !isOpenLocation && !place?.address,
  );
  const addressLine = place?.address ?? resolvedAddress;
  const hasSearchQuery = placeSearch.query.trim().length >= 3;
  const showSearchResults =
    hasSearchQuery &&
    (placeSearch.results.length > 0 ||
      placeSearch.loading ||
      placeSearch.resolving ||
      Boolean(placeSearch.error) ||
      placeSearch.completed);

  function pick() {
    onOpenMapPicker?.(draft.mode, (picked) => onChange(applyPlace(draft, picked)));
  }

  /**
   * Switches straight back to the device position — no picker, no screen change.
   *
   * Going from a chosen place back to "where I am" is a change of state, not a
   * new decision, so sending it through the full-screen picker made a one-tap
   * correction cost a detour. The coordinate is the one the map already holds.
   */
  function useCurrentLocation() {
    if (!fallbackCenter) return;
    onChange({
      ...draft,
      place: {
        ...CURRENT_LOCATION_PLACE,
        latitude: fallbackCenter.latitude,
        longitude: fallbackCenter.longitude,
      },
      locationChoice: 'current',
      locationPrecision: 'exact',
    });
  }

  async function selectSearchResult(suggestion: (typeof placeSearch.results)[number]) {
    const picked = await placeSearch.resolve(suggestion);
    if (!picked) return;
    Keyboard.dismiss();
    onSearchFocusChange?.(false);
    onChange(applyPlace(draft, picked));
  }

  return (
    <View style={styles.root}>
      <SearchField
        accessibilityLabel="Ort suchen"
        accessory={
          placeSearch.loading || placeSearch.resolving ? <ActivityIndicator size="small" color={accent} /> : undefined
        }
        containerStyle={styles.search}
        inputStyle={styles.searchInput}
        placeholder={place ? 'Anderen Ort suchen' : 'Ort suchen'}
        placeholderTextColor="rgba(244,245,247,0.45)"
        value={placeSearch.query}
        variant="pill"
        onBlur={() => onSearchFocusChange?.(false)}
        onChangeText={placeSearch.updateQuery}
        onFocus={() => onSearchFocusChange?.(true)}
        onSubmitEditing={placeSearch.submit}
      />

      {showSearchResults ? (
        <View style={styles.results}>
          {placeSearch.loading ? (
            <SearchMessage
              icon="ellipsis-horizontal"
              accent={accent}
              label="Orte werden gesucht …"
            />
          ) : null}
          {placeSearch.resolving ? (
            <SearchMessage icon="location-outline" accent={accent} label="Ort wird geladen …" />
          ) : null}
          {placeSearch.error && !placeSearch.loading ? (
            <SearchMessage icon="alert-circle-outline" accent="#E8B98F" label={placeSearch.error} />
          ) : null}
          {placeSearch.completed &&
          !placeSearch.loading &&
          !placeSearch.resolving &&
          !placeSearch.error &&
          placeSearch.results.length === 0 ? (
            <SearchMessage
              icon="search-outline"
              accent="rgba(244,245,247,0.38)"
              label="Keine passenden Orte gefunden."
            />
          ) : null}
          {/* A plain View, not a scroller: Places returns a handful of
              suggestions, and a nested scroller would fight the composer's own
              ScrollView for the drag with nothing to gain. */}
          {placeSearch.results.length > 0 ? (
            <View>
              {placeSearch.results.map((result) => (
                <Pressable
                  key={result.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${result.name} auswählen`}
                  disabled={placeSearch.resolving}
                  onPress={() => void selectSearchResult(result)}
                  style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
                >
                  <View style={[styles.resultIcon, { backgroundColor: `${accent}20` }]}>
                    <Ionicons name="location-outline" size={16} color={accent} />
                  </View>
                  <View style={styles.resultText}>
                    <Text style={styles.resultName} numberOfLines={1} {...TEXT_FLEXIBLE}>
                      {result.name}
                    </Text>
                    {result.address ? (
                      <Text style={styles.resultAddress} numberOfLines={1} {...TEXT_CAPPED}>
                        {result.address}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
          {placeSearch.results.length > 0 ? (
            <Text style={styles.attribution} {...TEXT_CAPPED}>
              Google Maps
            </Text>
          ) : null}
        </View>
      ) : null}

      {isOpenLocation ? null : (
        <View>
          <Text style={styles.source} {...TEXT_CAPPED}>
            {sourceLabel(draft)}
          </Text>
          <Text style={styles.name} numberOfLines={2} {...TEXT_FLEXIBLE}>
            {place?.name ?? 'Aktueller Standort'}
          </Text>
          {/* A picked place brings its own address; the device position does
              not, so it is resolved here. Either way an address ALWAYS shows
              once one exists — "Aktueller Standort" alone never answered the
              only question worth asking, which is *which* current location. */}
          {addressLine ? (
            <Text style={styles.address} numberOfLines={2} {...TEXT_FLEXIBLE}>
              {addressLine}
            </Text>
          ) : hasCoordinate || fallbackCenter ? (
            <Text style={styles.addressPending} numberOfLines={1} {...TEXT_CAPPED}>
              Adresse wird ermittelt …
            </Text>
          ) : null}
        </View>
      )}

      <PlacePreviewMap
        latitude={hasCoordinate ? place?.latitude : fallbackCenter?.latitude}
        longitude={hasCoordinate ? place?.longitude : fallbackCenter?.longitude}
        accent={accent}
        emptyLabel="Standort noch nicht bekannt"
        // Lit while the activity sits on the device position, so the button
        // shows a STATE rather than only offering an action.
        currentLocationActive={isCurrentLocation}
        onUseCurrentLocation={fallbackCenter ? useCurrentLocation : undefined}
        onOpenFullMap={pick}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  address: {
    color: 'rgba(244,245,247,0.5)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    marginTop: 2,
  },
  addressPending: {
    color: 'rgba(244,245,247,0.32)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    marginTop: 2,
  },
  link: {
    color: 'rgba(244,245,247,0.55)',
    fontFamily: FONT.semibold,
    fontSize: TYPE.caption.fontSize,
    textDecorationLine: 'underline',
  },
  linkRow: { alignSelf: 'flex-start', paddingVertical: 4 },
  name: {
    color: '#F4F5F7',
    fontFamily: FONT.bold,
    fontSize: TYPE.body.fontSize,
    letterSpacing: -0.3,
  },
  pressed: { opacity: 0.72 },
  root: { gap: 10 },
  attribution: {
    color: 'rgba(244,245,247,0.34)',
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  resultAddress: {
    color: 'rgba(244,245,247,0.45)',
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
    marginTop: 1,
  },
  resultIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  resultName: { color: '#F4F5F7', fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  resultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  resultText: { flex: 1, minWidth: 0 },
  results: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16,
    borderWidth: 1,
    padding: 5,
  },
  search: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  searchInput: {
    color: '#F4F5F7',
    flex: 1,
    fontFamily: FONT.medium,
    fontSize: TYPE.label.fontSize,
    paddingVertical: 0,
  },
  searchMessage: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minHeight: 42,
    paddingHorizontal: 8,
  },
  searchMessageText: {
    color: 'rgba(244,245,247,0.58)',
    flex: 1,
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
  },
  source: {
    color: 'rgba(244,245,247,0.32)',
    fontFamily: FONT.semibold,
    fontSize: TYPE.micro.fontSize,
    letterSpacing: 0.6,
    marginBottom: 1,
    textTransform: 'uppercase',
  },
});
