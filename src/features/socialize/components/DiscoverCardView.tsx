import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { SOCIALIZE_COLOR } from '../SocializeProvider';
import type { DiscoverCard, DiscoverState } from '../types/socialize.types';

/**
 * One person/group in the discover feed. Privat bis Match: before a match only
 * "Person in deiner Nähe" / "N Leute", coarse distance, note and vibes are
 * shown — never name or avatar. After the mutual match the identity is
 * revealed and the CTA becomes "Chat öffnen".
 */
export function DiscoverCardView({
  card,
  state,
  onInterest,
  onOpenChat,
}: {
  card: DiscoverCard;
  state: DiscoverState;
  onInterest: () => void;
  onOpenChat: () => void;
}) {
  const matched = state === 'matched';
  const interested = state === 'interested';
  const isGroup = card.kind === 'group';

  const anonymousTitle = isGroup
    ? `${card.memberCount ?? 2} Leute in deiner Nähe`
    : 'Person in deiner Nähe';

  return (
    <View
      className="rounded-3xl border px-4 py-4"
      style={{
        backgroundColor: matched ? `${SOCIALIZE_COLOR}1a` : 'rgba(255,255,255,0.07)',
        borderColor: matched ? `${SOCIALIZE_COLOR}77` : 'rgba(255,255,255,0.12)',
      }}
    >
      <View className="flex-row items-center gap-3">
        {/* Identity: violet-tinted anonymous circle before match, initials after */}
        <View
          className="h-12 w-12 items-center justify-center rounded-full border"
          style={{
            backgroundColor: matched ? SOCIALIZE_COLOR : `${SOCIALIZE_COLOR}16`,
            borderColor: matched ? SOCIALIZE_COLOR : `${SOCIALIZE_COLOR}45`,
          }}
        >
          {matched ? (
            <Text className="text-base font-bold text-[#0E1116]">{card.initials}</Text>
          ) : (
            <Ionicons
              name={isGroup ? 'people-outline' : 'person-outline'}
              size={22}
              color={`${SOCIALIZE_COLOR}dd`}
            />
          )}
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-bold text-white" numberOfLines={1}>
              {matched ? card.displayName : anonymousTitle}
            </Text>
            {matched ? (
              <View
                className="rounded-full px-2 py-0.5"
                style={{ backgroundColor: SOCIALIZE_COLOR }}
              >
                <Text className="text-[10px] font-bold text-[#0E1116]">MATCH</Text>
              </View>
            ) : null}
          </View>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <Ionicons name="location-outline" size={13} color="rgba(244,245,247,0.5)" />
            <Text className="text-xs font-semibold text-white/50">
              {card.distanceLabel}
              {isGroup && matched ? ` · ${card.memberCount} Leute` : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Free text = the decision basis */}
      <Text className="mt-3 text-[15px] leading-5 text-white/85">„{card.note}“</Text>

      {/* Vibes */}
      <View className="mt-3 flex-row flex-wrap gap-1.5">
        {card.vibes.map((vibe) => (
          <View
            key={vibe.label}
            className="flex-row items-center gap-1 rounded-full border px-2.5 py-1"
            style={{
              backgroundColor: 'rgba(255,255,255,0.07)',
              borderColor: 'rgba(255,255,255,0.1)',
            }}
          >
            {vibe.emoji ? <Text className="text-xs">{vibe.emoji}</Text> : null}
            <Text className="text-xs font-semibold text-white/75">{vibe.label}</Text>
          </View>
        ))}
      </View>

      {/* CTA: interest → sent → chat */}
      <View className="mt-4">
        {matched ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Chat mit ${card.displayName} öffnen`}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-90"
            style={{ backgroundColor: SOCIALIZE_COLOR }}
            onPress={onOpenChat}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#0E1116" />
            <Text className="text-base font-bold text-[#0E1116]">Chat öffnen</Text>
          </Pressable>
        ) : interested ? (
          <View
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl border"
            style={{ borderColor: `${SOCIALIZE_COLOR}66`, backgroundColor: `${SOCIALIZE_COLOR}14` }}
          >
            <Ionicons name="checkmark" size={18} color={SOCIALIZE_COLOR} />
            <Text className="text-sm font-bold" style={{ color: SOCIALIZE_COLOR }}>
              Interesse gesendet — bei Gegenseitigkeit entsteht ein Chat
            </Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isGroup ? 'Gruppe anfragen' : 'Interesse zeigen'}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl border active:opacity-80"
            style={{
              borderColor: `${SOCIALIZE_COLOR}88`,
              backgroundColor: `${SOCIALIZE_COLOR}22`,
            }}
            onPress={onInterest}
          >
            <Ionicons name="hand-right-outline" size={17} color={SOCIALIZE_COLOR} />
            <Text className="text-base font-bold" style={{ color: SOCIALIZE_COLOR }}>
              {isGroup ? 'Gruppe anfragen' : 'Interesse zeigen'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
