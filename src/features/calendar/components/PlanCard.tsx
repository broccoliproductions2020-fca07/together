import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, Text, useColorScheme, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { useActivityChat } from '@/features/chat';
import { useActivityEntities } from '@/features/activities';
import { activityPhaseLabel } from '@/features/activities/utils/activityTiming';
import { colorWithAlpha, markerModeStyles } from '@/features/map/utils/markerStyles';

import type { Plan } from '../types/calendar.types';
import { formatTime } from '../utils/formatPlanTime';
import { PlanPeopleAvatars } from './PlanPeopleAvatars';

export interface PlanCardProps {
  plan: Plan;
  expanded: boolean;
  onToggle: () => void;
  onOpenChat: (plan: Plan) => void;
}

export function PlanCard({ plan, expanded, onToggle, onOpenChat }: PlanCardProps) {
  const mutedColor = useColorScheme() === 'dark' ? 'rgb(154,163,157)' : 'rgb(107,98,88)';
  const reducedMotion = useReducedMotion();
  const { isJoined, leaveRoom } = useActivityChat();
  const { leaveActivity } = useActivityEntities();

  const roomId = plan.activityId ?? plan.id;
  const joined = isJoined(roomId);
  // Scheduled plans show the remaining wait time instead of a redundant “Bald”.
  const isNow = plan.sourceMode === 'now';
  const accent = isNow ? markerModeStyles.now.color : markerModeStyles.soon.color;
  const modeLabel = activityPhaseLabel(plan.sourceMode ?? 'soon', plan.startsAt);

  const peopleNames = plan.people.map((person) => person.displayName).join(', ');

  return (
    <Animated.View layout={reducedMotion ? undefined : LinearTransition.duration(220)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Plan ${plan.title}`}
        className="rounded-[26px] border bg-card p-4 shadow-sm active:opacity-95"
        style={({ pressed }) => [
          { borderColor: colorWithAlpha(accent, 0.22) },
          pressed && !reducedMotion ? { transform: [{ scale: 0.985 }] } : undefined,
        ]}
        onPress={onToggle}
      >
        <View className="flex-row gap-3">
          <View className="w-14 pt-0.5">
            <Text className="text-base font-extrabold" style={{ color: accent }}>
              {formatTime(plan.startsAt)}
            </Text>
            {plan.endsAt ? (
              <Text className="text-xs text-muted-foreground">{formatTime(plan.endsAt)}</Text>
            ) : null}
          </View>

          <View className="flex-1 gap-2">
            <View className="flex-row items-start justify-between gap-2">
              <Text className="flex-1 text-base font-bold text-foreground">{plan.title}</Text>
              <View
                className="rounded-full px-2.5 py-1"
                style={{ backgroundColor: colorWithAlpha(accent, 0.15) }}
              >
                <Text className="text-xs font-semibold" style={{ color: accent }}>
                  {modeLabel}
                </Text>
              </View>
            </View>

            {plan.locationName ? (
              <View className="flex-row items-center gap-1">
                <Ionicons name="location-outline" size={14} color={mutedColor} />
                <Text className="flex-1 text-sm text-muted-foreground">{plan.locationName}</Text>
              </View>
            ) : null}

            <View className="flex-row items-center justify-between gap-2 pt-0.5">
              <PlanPeopleAvatars people={plan.people} />
              {plan.circleName ? (
                <Text className="text-xs font-semibold text-muted-foreground">
                  {plan.circleName}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {expanded ? (
          <Animated.View
            entering={reducedMotion ? undefined : FadeInDown.duration(200)}
            exiting={reducedMotion ? undefined : FadeOut.duration(120)}
            className="mt-3 gap-3 border-t border-border pt-3"
          >
            {plan.description ? (
              <Text className="text-sm leading-5 text-muted-foreground">{plan.description}</Text>
            ) : null}

            {plan.address ? (
              <View className="flex-row items-start gap-2">
                <Ionicons name="navigate-outline" size={15} color={mutedColor} />
                <Text className="flex-1 text-sm text-muted-foreground">{plan.address}</Text>
              </View>
            ) : null}

            {peopleNames ? (
              <View className="flex-row items-start gap-2">
                <Ionicons name="people-outline" size={15} color={mutedColor} />
                <Text className="flex-1 text-sm text-muted-foreground">{peopleNames}</Text>
              </View>
            ) : null}

            {joined ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Zum Chat"
                  onPress={() => onOpenChat(plan)}
                  className="mt-1 flex-row items-center justify-center gap-2 rounded-2xl py-3 active:opacity-90"
                  style={{ backgroundColor: accent }}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                  <Text className="text-base font-bold text-white">Zum Chat</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Activity verlassen"
                  className="items-center py-2 active:opacity-70"
                  onPress={() =>
                    Alert.alert(
                      'Activity verlassen?',
                      'Du kannst später erneut beitreten, solange sie aktiv ist.',
                      [
                        { text: 'Abbrechen', style: 'cancel' },
                        {
                          text: 'Verlassen',
                          style: 'destructive',
                          onPress: () => {
                            void (async () => {
                              try {
                                const left = await leaveActivity(roomId);
                                if (!left) {
                                  Alert.alert(
                                    'Nicht möglich',
                                    'Als Host kannst du die Activity nur absagen.',
                                  );
                                  return;
                                }
                                leaveRoom(roomId);
                              } catch {
                                Alert.alert(
                                  'Verlassen fehlgeschlagen',
                                  'Bitte versuche es gleich noch einmal.',
                                );
                              }
                            })();
                          },
                        },
                      ],
                    )
                  }
                >
                  <Text className="text-xs font-semibold text-muted-foreground">Verlassen</Text>
                </Pressable>
              </>
            ) : null}
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
