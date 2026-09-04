import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

import { PlacePreviewPin, PLACE_PREVIEW_PIN_HEIGHT } from './PlacePreviewPin';

export interface PlacePreviewMapProps {
  latitude?: number;
  longitude?: number;
  accent: string;
  onUseCurrentLocation?: () => void;
  currentLocationActive?: boolean;
  onOpenFullMap?: () => void;
  emptyLabel?: string;
}

const HEIGHT = 150;

/** The native map engine has no browser renderer; the surrounding Wo UI stays shared. */
function PlacePreviewMapComponent({
  latitude,
  longitude,
  accent,
  onUseCurrentLocation,
  currentLocationActive = false,
  onOpenFullMap,
  emptyLabel,
}: PlacePreviewMapProps) {
  const hasCoordinate = latitude != null && longitude != null;

  return (
    <View pointerEvents="none" style={styles.frame}>
      {hasCoordinate ? (
        <Image
          source={{ uri: '/screenshots/mica-map-810.webp' }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={styles.empty}>
          <Ionicons name="map-outline" size={20} color="rgba(244,245,247,0.32)" />
          <Text style={styles.emptyText} {...TEXT_CAPPED}>
            {emptyLabel ?? 'Kein Pin auf der Karte'}
          </Text>
        </View>
      )}

      {hasCoordinate ? (
        <View pointerEvents="none" style={styles.pinWrap}>
          <PlacePreviewPin color={accent} />
        </View>
      ) : null}

      <View style={styles.actions} pointerEvents="none">
        {onUseCurrentLocation ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aktuellen Standort verwenden"
            accessibilityState={{ selected: currentLocationActive }}
            style={[
              styles.mapButton,
              currentLocationActive && { backgroundColor: accent, borderColor: accent },
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
            style={styles.mapButton}
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
  pinWrap: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: HEIGHT / 2 - PLACE_PREVIEW_PIN_HEIGHT,
  },
});
