import { ScrollView, useWindowDimensions, View } from 'react-native';

import type { MarkerAvatar } from '@/features/map/types/map.types';

import { ParticipantListRow } from './ParticipantListRow';
import type { ActivitySelection } from './types';

/**
 * Content-sized participant list: the sheet wraps however many rows there are,
 * capped so long lists scroll — no fixed tall sheet with dead space below a
 * handful of names.
 */
export function ActivityParticipantsContent({
  selection,
  currentUid,
  joined,
  onOpenProfile,
}: {
  selection: ActivitySelection;
  currentUid?: string;
  joined: boolean;
  onOpenProfile: (participant: MarkerAvatar) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();

  return (
    <ScrollView
      style={{ maxHeight: windowHeight * 0.6 }}
      showsVerticalScrollIndicator={selection.participants.length > 6}
      contentContainerStyle={{ paddingBottom: 8 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="divide-y divide-border rounded-3xl border border-border bg-secondary px-3">
        {selection.participants.map((participant) => (
          <ParticipantListRow
            key={participant.userId}
            participant={participant}
            isSelf={participant.userId === currentUid}
            onPress={
              joined && participant.userId !== currentUid
                ? () => onOpenProfile(participant)
                : undefined
            }
          />
        ))}
      </View>
    </ScrollView>
  );
}
