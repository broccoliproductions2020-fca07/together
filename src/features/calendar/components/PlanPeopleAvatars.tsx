import { Image, Text, View } from 'react-native';

import type { PlanPerson } from '../types/calendar.types';

interface PlanPeopleAvatarsProps {
  people: PlanPerson[];
  max?: number;
  size?: number;
}

/** Small overlapping avatar stack (initials, or image when available). */
export function PlanPeopleAvatars({ people, max = 4, size = 28 }: PlanPeopleAvatarsProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  function bubbleStyle(index: number) {
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      marginLeft: index === 0 ? 0 : -8,
    };
  }

  return (
    <View className="flex-row items-center">
      {shown.map((person, index) => (
        <View
          key={person.id}
          style={bubbleStyle(index)}
          className="items-center justify-center overflow-hidden rounded-full border-2 border-card bg-secondary"
        >
          {person.avatarUrl ? (
            <Image source={{ uri: person.avatarUrl }} style={{ width: size, height: size }} />
          ) : (
            <Text className="text-[11px] font-bold text-secondary-foreground">
              {person.initials}
            </Text>
          )}
        </View>
      ))}

      {extra > 0 ? (
        <View
          style={bubbleStyle(shown.length)}
          className="items-center justify-center rounded-full border-2 border-card bg-muted"
        >
          <Text className="text-[11px] font-bold text-muted-foreground">+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}
