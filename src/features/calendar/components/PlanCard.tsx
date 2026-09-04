import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, Text, useColorScheme, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { useActivityChat } from '@/features/chat';
import { useActivityEntities, writeFailureMessage } from '@/features/activities';
import { useAuth } from '@/features/auth';
import { activityPhaseLabel } from '@/features/activities/utils/activityTiming';
import { colorWithAlpha, markerModeStyles } from '@/features/map/utils/markerStyles';
import { SquircleButton } from '@/shared/components/SquircleButton';
import { useThemeColors } from '@/features/theme';
import { PlanCardSummary } from '@/shared/product-ui/PlanCardSummary';
import { NATIVE_FONTS } from '@/shared/product-ui/nativeFonts';
import { shadow } from '@/shared/theme';

import type { Plan } from '../types/calendar.types';
import { formatTime } from '../utils/formatPlanTime';
import { PlanPeopleAvatars } from './PlanPeopleAvatars';

/** The card's own lift. Matches the `shadow-sm` it carried before the extraction. */
const CARD_SHADOW = shadow({ color: '#000000', offsetY: 1, radius: 1, opacity: 0.05, elevation: 1 });

export interface PlanCardProps {
  plan: Plan;
  expanded: boolean;
  onToggle: () => void;
  onOpenChat: (plan: Plan) => void;
  onEditActivity: (plan: Plan) => void;
}

export function PlanCard({ plan, expanded, onToggle, onOpenChat, onEditActivity }: PlanCardProps) {
  const colors = useThemeColors();
  const mutedColor = useColorScheme() === 'dark' ? 'rgb(154,163,157)' : 'rgb(107,98,88)';
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const { isJoined, leaveRoom } = useActivityChat();
  const { cancelActivity, findActivityById, leaveActivity } = useActivityEntities();

  const roomId = plan.activityId ?? plan.id;
  const joined = isJoined(roomId);
  const currentUid = user?.id ?? 'u_you';
  const activity = findActivityById(roomId);
  const canEdit = activity?.hostId === currentUid;
  // Same succession the callable applies: the longest-standing other
  // participant. Without one there is nobody to hand the Activity to, so a solo
  // host is offered "Absagen" only.
  const successor = canEdit
    ? activity?.participants.find((participant) => participant.userId !== currentUid)
    : undefined;
  const canLeave = joined && (!canEdit || Boolean(successor));

  function confirmLeave() {
    Alert.alert(
      'Activity verlassen?',
      successor
        ? `${successor.displayName} übernimmt als Host. Die Activity bleibt für alle bestehen.`
        : 'Du kannst später erneut beitreten, solange sie aktiv ist.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Verlassen',
          style: 'destructive',
          onPress: () => {
            void leaveActivity(roomId)
              .then(() => leaveRoom(roomId))
              .catch((error: unknown) => {
                Alert.alert(
                  'Verlassen fehlgeschlagen',
                  writeFailureMessage(error, 'Du bist weiterhin dabei.'),
                );
              });
          },
        },
      ],
    );
  }

  function confirmCancel() {
    Alert.alert(
      'Activity absagen?',
      'Die Activity verschwindet sofort aus Karte und Kalender — für alle. Der Chat bleibt noch kurz verfügbar.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Absagen',
          style: 'destructive',
          onPress: () => {
            void cancelActivity(roomId).catch((error: unknown) => {
              // The card is already back — the provider rolls the optimistic
              // cancel back before it throws.
              Alert.alert(
                'Absagen fehlgeschlagen',
                writeFailureMessage(error, 'Deine Activity ist wieder da.'),
              );
            });
          },
        },
      ],
    );
  }

  const isNow = plan.sourceMode === 'now';
  const accent = isNow ? markerModeStyles.now.color : markerModeStyles.soon.color;
  const modeLabel = activityPhaseLabel(plan.sourceMode ?? 'soon', plan.startsAt);
  const peopleNames = plan.people.map((person) => person.displayName).join(', ');

  return (
    <Animated.View layout={reducedMotion ? undefined : LinearTransition.duration(220)}>
      <PlanCardSummary
        time={formatTime(plan.startsAt)}
        endTime={plan.endsAt ? formatTime(plan.endsAt) : undefined}
        title={plan.title}
        stateLabel={modeLabel}
        location={plan.locationName}
        locationIcon={<Ionicons name="location-outline" size={14} color={mutedColor} />}
        people={<PlanPeopleAvatars people={plan.people} />}
        circleName={plan.circleName}
        onPress={onToggle}
        animatePress={!reducedMotion}
        elevation={CARD_SHADOW}
        theme={{
          background: colors.card,
          text: colors.foreground,
          muted: colors.mutedForeground,
          accent,
          accentSoft: colorWithAlpha(accent, 0.15),
          accentBorder: colorWithAlpha(accent, 0.22),
          fonts: NATIVE_FONTS,
        }}
      >
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

            {joined || canEdit ? (
              <>
                <View className="mt-1 flex-row gap-2">
                  {canEdit ? (
                    <View className="flex-1">
                      <SquircleButton
                        label="Bearbeiten"
                        color={accent}
                        variant="tonal"
                        surface={colors.card}
                        size="md"
                        icon="pencil"
                        accessibilityLabel="Aktivität bearbeiten"
                        onPress={() => onEditActivity(plan)}
                      />
                    </View>
                  ) : null}
                  <View className="flex-1">
                    <SquircleButton
                      label="Zum Chat"
                      color={accent}
                      size="md"
                      icon="chatbubble-ellipses-outline"
                      accessibilityLabel="Zum Chat"
                      onPress={() => onOpenChat(plan)}
                    />
                  </View>
                </View>
                {/* A host holds two different powers and must be able to tell
                    them apart at a glance: stepping out (quiet, secondary) and
                    ending it for everyone (destructive). */}
                <View className="flex-row items-center justify-center gap-5 py-2">
                  {canLeave ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        canEdit ? 'Aktivität abgeben und verlassen' : 'Aktivität verlassen'
                      }
                      className="active:opacity-70"
                      onPress={confirmLeave}
                    >
                      <Text className="text-xs font-semibold text-muted-foreground">Verlassen</Text>
                    </Pressable>
                  ) : null}
                  {canEdit ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Aktivität absagen"
                      className="active:opacity-70"
                      onPress={confirmCancel}
                    >
                      <Text className="text-xs font-semibold text-destructive">
                        Activity absagen
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : null}
          </Animated.View>
        ) : null}
      </PlanCardSummary>
    </Animated.View>
  );
}
