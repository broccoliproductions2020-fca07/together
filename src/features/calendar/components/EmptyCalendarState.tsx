import { View } from 'react-native';

import { AppStateView } from '@/shared/components';

export interface EmptyCalendarStateProps {
  onGoToMap: () => void;
}

export function EmptyCalendarState({ onGoToMap }: EmptyCalendarStateProps) {
  return (
    <View className="flex-1 justify-center px-5 pb-28 pt-5">
      <AppStateView
        icon="calendar-outline"
        title="Dein Kalender ist frei"
        description="Entdecke auf der Karte, was deine Freunde planen. Sobald du zusagst, erscheint die Aktivität hier."
        actionLabel="Aktivitäten entdecken"
        onAction={onGoToMap}
        accent="#E0A23E"
      />
    </View>
  );
}
