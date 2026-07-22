import { Text, View } from 'react-native';

import type { MapSelection } from '@/features/map/types/map.types';
import { AppButton } from '@/shared/components';

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
    <>
      <View className="flex-row items-center gap-2">
        <View className="rounded-full bg-secondary px-3 py-1.5">
          <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Ort
          </Text>
        </View>
      </View>

      <View className="mt-4 gap-2">
        <Text className="text-2xl font-bold leading-tight text-foreground">{selection.title}</Text>
        <Text className="text-base text-muted-foreground">{selection.subtitle}</Text>
      </View>

      <View className="mt-6 gap-3">
        <AppButton label="Activity hier starten" onPress={onCreateAtSelection} />
        <AppButton label="Route starten" variant="secondary" onPress={onStartRoute} />
        <AppButton label="In Karten öffnen" variant="ghost" onPress={onOpenInMaps} />
      </View>
    </>
  );
}
