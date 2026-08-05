import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SelectedPlace } from '@/features/activities';
import { FloatingSurface } from '@/features/overlay/components/FloatingSurface';
import type { PlaceSuggestion } from '@/features/places';
import { AppButton } from '@/shared/components';

import type { ActivityMode, MapCoordinate } from '../types/map.types';

const MODE_ACCENTS: Record<ActivityMode, string> = {
  open: '#6E8BF7',
  soon: '#E0A23E',
  now: '#41C08D',
};

const MODE_BUTTON_CLASSES: Record<ActivityMode, string> = {
  open: 'bg-open',
  soon: 'bg-soon',
  now: 'bg-now',
};

export interface MapLocationPickerOverlayProps {
  coordinate: MapCoordinate;
  mode: ActivityMode;
  searchQuery: string;
  searchResults: PlaceSuggestion[];
  selectedPlaceCandidate?: SelectedPlace;
  loading?: boolean;
  searchLoading?: boolean;
  showSearchAttribution?: boolean;
  currentLocationLoading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearchSubmit: () => void;
  onSelectSearchResult: (place: PlaceSuggestion) => void;
  onUseCurrentLocation: () => void;
}

export function MapLocationPickerOverlay({
  coordinate,
  mode,
  searchQuery,
  searchResults,
  selectedPlaceCandidate,
  loading = false,
  searchLoading = false,
  showSearchAttribution = false,
  currentLocationLoading = false,
  onCancel,
  onConfirm,
  onSearchQueryChange,
  onSearchSubmit,
  onSelectSearchResult,
  onUseCurrentLocation,
}: MapLocationPickerOverlayProps) {
  const insets = useSafeAreaInsets();
  const accent = MODE_ACCENTS[mode];
  const hasSearchQuery = searchQuery.trim().length >= 3;
  const hasSearchResults = hasSearchQuery && searchResults.length > 0;
  const displayTitle = selectedPlaceCandidate?.name ?? 'Kartenpunkt';
  const displaySubtitle =
    selectedPlaceCandidate?.address ??
    `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;

  return (
    <>
      <View pointerEvents="none" style={styles.pinLayer}>
        <Ionicons name="location-sharp" size={52} color={accent} style={styles.pinShadow} />
      </View>

      <View
        pointerEvents="box-none"
        className="absolute left-4 right-4 flex-row items-center gap-3"
        style={{ top: Math.max(insets.top, 12) + 8 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kartenauswahl abbrechen"
          className="h-12 w-12 items-center justify-center rounded-full border bg-white/90 shadow-lg"
          style={{ borderColor: `${accent}55` }}
          onPress={onCancel}
        >
          <Ionicons name="chevron-back" size={23} color={accent} />
        </Pressable>

        <FloatingSurface
          className="flex-1 rounded-full"
          contentClassName="flex-row items-center gap-2 px-4 py-3"
          interactive={false}
        >
          <Ionicons name="search" size={18} color={accent} />
          <TextInput
            accessibilityLabel="Ort suchen"
            className="flex-1 text-base font-semibold text-foreground"
            placeholder="Ort suchen"
            placeholderTextColor="rgba(105,113,127,0.85)"
            returnKeyType="search"
            value={searchQuery}
            onChangeText={onSearchQueryChange}
            onSubmitEditing={onSearchSubmit}
          />
        </FloatingSurface>
      </View>

      {hasSearchQuery && (hasSearchResults || searchLoading) ? (
        <View
          pointerEvents="box-none"
          className="absolute left-16 right-4"
          style={{ top: Math.max(insets.top, 12) + 68 }}
        >
          <FloatingSurface className="rounded-[24px]" contentClassName="p-2">
            {searchLoading ? (
              <View className="flex-row items-center gap-3 px-3 py-3">
                <ActivityIndicator color={accent} />
                <Text className="text-sm font-semibold text-foreground">Orte werden gesucht …</Text>
              </View>
            ) : null}
            {searchResults.map((place) => (
              <Pressable
                key={place.id}
                accessibilityRole="button"
                accessibilityLabel={`${place.name} auswählen`}
                className="flex-row items-center gap-3 rounded-2xl px-3 py-3 active:opacity-80"
                disabled={loading}
                onPress={() => onSelectSearchResult(place)}
              >
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${accent}1F` }}
                >
                  <Ionicons name="location-outline" size={18} color={accent} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-foreground">{place.name}</Text>
                  {place.address ? (
                    <Text className="mt-0.5 text-xs text-muted-foreground">{place.address}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
            {showSearchAttribution && hasSearchResults ? (
              <Text className="px-3 pb-1 pt-1 text-[12px] font-normal text-muted-foreground">
                Google Maps
              </Text>
            ) : null}
          </FloatingSurface>
        </View>
      ) : null}

      <View
        pointerEvents="box-none"
        className="absolute right-4"
        style={{ bottom: Math.max(insets.bottom, 14) + 172, zIndex: 4 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Aktuellen Standort verwenden"
          accessibilityState={{ busy: currentLocationLoading }}
          className="items-center justify-center rounded-full border bg-white/90 shadow-lg active:opacity-90"
          disabled={currentLocationLoading}
          style={{ borderColor: `${accent}55`, height: 52, width: 52 }}
          onPress={onUseCurrentLocation}
        >
          <Ionicons
            name={currentLocationLoading ? 'ellipsis-horizontal' : 'locate'}
            size={23}
            color={accent}
          />
        </Pressable>
      </View>

      <View
        pointerEvents="box-none"
        className="absolute left-4 right-4"
        style={{ bottom: Math.max(insets.bottom, 14) + 10 }}
      >
        <FloatingSurface className="rounded-[28px]" contentClassName="p-4">
          <View className="mb-4 flex-row items-center gap-3">
            <View
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `${accent}22` }}
            >
              <Ionicons name="location-outline" size={20} color={accent} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-foreground">{displayTitle}</Text>
              <Text className="mt-1 text-sm text-muted-foreground">{displaySubtitle}</Text>
            </View>
          </View>

          <AppButton
            accessibilityLabel="Diesen Ort übernehmen"
            className={MODE_BUTTON_CLASSES[mode]}
            label="Diesen Ort übernehmen"
            loading={loading}
            onPress={onConfirm}
          />
        </FloatingSurface>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  pinLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: [{ translateY: -42 }],
  },
  pinShadow: {
    textShadowColor: 'rgba(14,17,22,0.38)',
    textShadowOffset: { height: 4, width: 0 },
    textShadowRadius: 8,
  },
});
