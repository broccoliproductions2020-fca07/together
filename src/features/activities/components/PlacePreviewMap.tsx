import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';

import { useMapStyle } from '@/features/map/mapStyle/useMapStyle';
import { MAP_PROVIDER, SUPPORTS_LITE_MODE } from '@/features/map/utils/mapProvider';
import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

import { PlacePreviewPin, PLACE_PREVIEW_PIN_HEIGHT } from './PlacePreviewPin';

/**
 * Zoom level, NOT a region delta.
 *
 * A region is a box, and this viewport is a very wide, short one — roughly
 * 4.6:1. Asking for a square 0.0035° region there makes the map widen the
 * longitude until the box fits the width, so a block-sized request came out as
 * about a kilometre. A zoom level has no aspect ratio to negotiate: 17 is
 * street level, close enough that the pin reads as "this building".
 */
const PREVIEW_ZOOM = 17;
const HEIGHT = 150;

export interface PlacePreviewMapProps {
  latitude?: number;
  longitude?: number;
  accent: string;
  /** Switch back to the device position. Omitted while no position is known. */
  onUseCurrentLocation?: () => void;
  /** True while the activity already sits on the device position, so the button
   * reads as a state and not only as an offer. */
  currentLocationActive?: boolean;
  /** Hand off to the full-screen picker. */
  onOpenFullMap?: () => void;
  /** Shown instead of the map when the activity deliberately has no place. */
  emptyLabel?: string;
}

/**
 * A small, non-interactive excerpt of the SAME map the app runs on.
 *
 * It exists because the only way to check "did it pick the right place?" used to
 * be closing the composer. Its palette comes from `useMapStyle`, so it is the
 * main map's current phase (day / golden / dusk / night) rather than a
 * lookalike — a preview in a different style would read as a different place.
 *
 * Cost control, in order of importance:
 * - It is rendered only while the location workbench is open, so no second
 *   MapView exists at rest.
 * - Android gets `liteMode`, which renders a static bitmap instead of a live
 *   map surface. iOS has no equivalent, so there it is a real MapView with
 *   every interaction switched off.
 * - The pin is a plain centred View, NOT a `<Marker>`: the map is always
 *   centred on the coordinate, so an overlay is pixel-exact — and it sidesteps
 *   the Fabric marker-snapshot bug that forced the main map to render its
 *   markers as pre-captured images.
 */
function PlacePreviewMapComponent({
  latitude,
  longitude,
  accent,
  onUseCurrentLocation,
  currentLocationActive = false,
  onOpenFullMap,
  emptyLabel,
}: PlacePreviewMapProps) {
  const { mapStyle, colorScheme } = useMapStyle();
  const hasCoordinate = latitude != null && longitude != null;

  const camera = useMemo(
    () =>
      hasCoordinate
        ? {
            center: { latitude: latitude!, longitude: longitude! },
            zoom: PREVIEW_ZOOM,
            pitch: 0,
            heading: 0,
            altitude: 0,
          }
        : undefined,
    [hasCoordinate, latitude, longitude],
  );

  return (
    <View style={styles.frame}>
      {camera ? (
        <MapView
          // Android applies both the lite-map camera and its native colour
          // scheme only at mount time. Recreate the cheap bitmap when either
          // input changes.
          key={`${camera.center.latitude},${camera.center.longitude},${
            Platform.OS === 'android' ? colorScheme : 'map'
          }`}
          style={StyleSheet.absoluteFill}
          provider={MAP_PROVIDER}
          mapType="standard"
          customMapStyle={mapStyle}
          userInterfaceStyle={colorScheme}
          liteMode={SUPPORTS_LITE_MODE}
          initialCamera={camera}
          // Every gesture is off: this is a picture of the choice, not a picker.
          // The two buttons below are the only way to change anything from here.
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          cacheEnabled={SUPPORTS_LITE_MODE}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : (
        <View style={styles.empty}>
          <Ionicons name="map-outline" size={20} color="rgba(244,245,247,0.32)" />
          <Text style={styles.emptyText} {...TEXT_CAPPED}>
            {emptyLabel ?? 'Kein Pin auf der Karte'}
          </Text>
        </View>
      )}

      {camera ? (
        <View pointerEvents="none" style={styles.pinWrap}>
          <PlacePreviewPin color={accent} />
        </View>
      ) : null}

      <View style={styles.actions} pointerEvents="box-none">
        {onUseCurrentLocation ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aktuellen Standort verwenden"
            accessibilityState={{ selected: currentLocationActive }}
            hitSlop={6}
            onPress={onUseCurrentLocation}
            style={({ pressed }) => [
              styles.mapButton,
              currentLocationActive && { backgroundColor: accent, borderColor: accent },
              pressed && styles.mapButtonPressed,
            ]}
          >
            <Ionicons
              name="locate"
              size={17}
              color={currentLocationActive ? '#0E1116' : '#F4F5F7'}
            />
          </Pressable>
        ) : null}
        {onOpenFullMap ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Auf der großen Karte auswählen"
            hitSlop={6}
            onPress={onOpenFullMap}
            style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed]}
          >
            <Ionicons name="expand" size={16} color="#F4F5F7" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export const PlacePreviewMap = memo(PlacePreviewMapComponent);

const styles = StyleSheet.create({
  actions: { bottom: 8, gap: 6, position: 'absolute', right: 8, top: 8, alignItems: 'flex-end' },
  empty: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
    justifyContent: 'center',
  },
  emptyText: { color: 'rgba(244,245,247,0.5)', fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize },
  frame: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16,
    borderWidth: 1,
    height: HEIGHT,
    overflow: 'hidden',
  },
  mapButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(14,17,22,0.82)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 11,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  mapButtonPressed: { opacity: 0.7 },
  pinWrap: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    // The tip, not the SVG's bounding-box centre, marks the map coordinate.
    top: HEIGHT / 2 - PLACE_PREVIEW_PIN_HEIGHT,
  },
});
