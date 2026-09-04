import { Image, Pressable, Text, View } from 'react-native';
import Animated, { FadeInRight, FadeOutRight, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import type { SpontaneousRound } from '@/features/chat';
import { useThemeColors } from '@/features/theme';
import { shadow, TEXT_CAPPED } from '@/shared/theme';

const OPEN_COLOR = '#3B82F6';
const MAX_VISIBLE_MEMBERS = 4;

const CONTROL_SHADOW = shadow({
  color: '#000000',
  offsetY: 6,
  radius: 12,
  opacity: 0.16,
  elevation: 5,
});

function Face({
  initials,
  avatarUrl,
  host = false,
}: {
  initials: string;
  avatarUrl?: string;
  host?: boolean;
}) {
  return (
    <View
      className="h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2"
      style={{
        borderColor: host ? OPEN_COLOR : 'rgba(255,255,255,0.88)',
        backgroundColor: host ? `${OPEN_COLOR}26` : 'rgba(255,255,255,0.16)',
      }}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} className="h-full w-full" />
      ) : (
        <Text {...TEXT_CAPPED} style={{ color: host ? OPEN_COLOR : '#F8F9FC', fontSize: 11, fontWeight: '800' }}>
          {initials}
        </Text>
      )}
    </View>
  );
}

export function SpontaneousRoundControl({
  round,
  unreadCount,
  onPress,
}: {
  round: SpontaneousRound;
  unreadCount: number;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const people = round.memberPreview.slice(0, MAX_VISIBLE_MEMBERS);
  const overflow = Math.max(0, round.memberIds.length - people.length);
  const acceptedCount = Math.max(0, round.memberIds.length - 1);
  const peopleLabel = acceptedCount === 0 ? 'warte auf Antworten' : `${acceptedCount} dabei`;
  const ariaCount = unreadCount > 9 ? '9 oder mehr' : String(unreadCount);

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInRight.duration(220)}
      exiting={reducedMotion ? undefined : FadeOutRight.duration(150)}
      layout={LinearTransition.duration(reducedMotion ? 0 : 180)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Spontane Runde, ${peopleLabel}${
          unreadCount > 0 ? `, ${ariaCount} ungelesene Nachrichten` : ''
        }`}
        onPress={onPress}
        className="items-center overflow-visible rounded-[20px] border px-2 py-2 active:opacity-80"
        style={{
          minWidth: 54,
          backgroundColor: colors.card,
          borderColor: `${OPEN_COLOR}88`,
          ...CONTROL_SHADOW,
        }}
      >
        <View className="items-center">
          {people.map((person, index) => (
            <Animated.View
              key={person.uid}
              entering={reducedMotion ? undefined : FadeInRight.delay(index * 45).duration(150)}
              style={{ marginTop: index === 0 ? 0 : -8 }}
            >
              <Face {...person} host={person.uid === round.hostUid} />
            </Animated.View>
          ))}
          {overflow > 0 ? (
            <View
              className="-mt-2 h-8 w-8 items-center justify-center rounded-full border-2"
              style={{ backgroundColor: OPEN_COLOR, borderColor: colors.card }}
            >
              <Text {...TEXT_CAPPED} style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                +{overflow}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          {...TEXT_CAPPED}
          style={{ color: OPEN_COLOR, fontSize: 10, fontWeight: '800', marginTop: 5 }}
        >
          Runde
        </Text>
        {unreadCount > 0 ? (
          <View
            pointerEvents="none"
            className="absolute -right-2 -top-2 h-5 min-w-5 items-center justify-center rounded-full border-2 px-1"
            style={{ backgroundColor: '#E85C5C', borderColor: colors.card }}
          >
            <Text {...TEXT_CAPPED} style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
