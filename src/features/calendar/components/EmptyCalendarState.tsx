import { View } from 'react-native';

import { AppStateView } from '@/shared/components';

/**
 * No action here on purpose. The card is a floating overlay on the map with the
 * Core one tap below it, so a "create" button would be a second entry point for
 * something already reachable — and the sentence says where to go instead.
 *
 * `compact` and no `flex-1`: the card is content-sized, so an empty calendar
 * has to produce a SHORT card rather than a tall one with a block centred in
 * dead space.
 */
export function EmptyCalendarState() {
  return (
    <View className="px-5 pb-3 pt-4">
      <AppStateView
        compact
        icon="calendar-outline"
        title="Dein Kalender ist frei"
        description="Zusagen erscheinen automatisch hier. Starte unten etwas Eigenes oder sieh auf der Karte, was deine Freunde vorhaben."
        accent="#E0A23E"
      />
    </View>
  );
}
