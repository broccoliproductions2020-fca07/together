import { Text, View } from 'react-native';

import { PLANNING_COLOR, TimePlanContent } from '@/features/time-planning';

import { InfoRow } from './InfoRow';

import type { MapSelection } from '@/features/map/types/map.types';

type PlanningSelection = Extract<MapSelection, { type: 'Planning' }>;

/**
 * A round in the ordinary detail sheet.
 *
 * Deliberately the same shape as {@link ActivityContent}: name at the top, the
 * place on an icon row, then the thing that differs. For an activity that is a
 * clock time; here it is the proposals and where they overlap. Everything
 * around it stays identical, because a round IS an ordinary thing on the map.
 */
export function PlanningContent({
  selection,
  onOpenActivity,
  onClose,
}: {
  selection: PlanningSelection;
  onOpenActivity?: (activityId: string) => void;
  onClose?: () => void;
}) {
  return (
    <View className="gap-3">
      <Text className="text-2xl font-bold text-foreground">{selection.title}</Text>

      <View className="gap-2">
        <InfoRow icon="person-outline" text={`von ${selection.hostName}`} accent={PLANNING_COLOR} />
        {selection.placeLabel ? (
          <InfoRow icon="location-outline" text={selection.placeLabel} accent={PLANNING_COLOR} />
        ) : null}
      </View>

      <TimePlanContent
        planId={selection.planId}
        onOpenActivity={onOpenActivity}
        onClose={onClose}
      />
    </View>
  );
}
