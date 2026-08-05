import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import type { MapSelection } from '@/features/map/types/map.types';
import { SquircleButton } from '@/shared/components/SquircleButton';

const CREATE_ACCENT = '#41C08D';

/**
 * Compact, action-first place bar. A POI tap is an ambiguous, easily-mistapped
 * gesture, so this stays a thin strip rather than a full sheet: the place name,
 * one unmissable primary action, and route/maps as small icon buttons. Tapping
 * the empty map dismisses it (MapScreen clears the selection) — a stray tap
 * costs nothing, and marker-to-marker switching keeps working because the sheet
 * never blocks the map with a backdrop.
 */
export function PlaceContent({
  selection,
  onCreateAtSelection,
  onOpenInMaps,
  onStartRoute,
}: {
  selection: Extract<MapSelection, { type: 'Place' }>;
  onCreateAtSelection?: () => void;
  onOpenInMaps?: () => void;
  onStartRoute?: () => void;
}) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: `${CREATE_ACCENT}1F` }}
        >
          <Ionicons name="location" size={19} color={CREATE_ACCENT} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold leading-5 text-foreground" numberOfLines={1}>
            {selection.title}
          </Text>
          {selection.subtitle ? (
            <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
              {selection.subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <SquircleButton
            color={CREATE_ACCENT}
            label="Aktivität hier starten"
            accessibilityLabel="Aktivität hier starten"
            onPress={onCreateAtSelection}
          />
        </View>
        <SecondaryAction
          icon="navigate-outline"
          label="Route starten"
          onPress={onStartRoute}
        />
        <SecondaryAction icon="map-outline" label="In Karten öffnen" onPress={onOpenInMaps} />
      </View>
    </View>
  );
}

function SecondaryAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  if (!onPress) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-[52px] w-[52px] items-center justify-center rounded-2xl border border-border bg-secondary active:opacity-80"
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color="rgba(150,155,165,0.95)" />
    </Pressable>
  );
}
