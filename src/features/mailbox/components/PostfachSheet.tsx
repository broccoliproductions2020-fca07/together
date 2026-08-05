import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  LinearTransition,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActivityEntities, type ActivityInfo } from '@/features/activities';
import { useAuth } from '@/features/auth';
import { formatListTimestamp, useActivityChat } from '@/features/chat';
import { useFriends, type FriendRequest } from '@/features/friends';
import { useJourney } from '@/features/journey';
import { colorWithAlpha, markerModeStyles } from '@/features/map/utils/markerStyles';
import { useNotifications, type NotificationKind } from '@/features/notifications';
import {
  deriveCompanionSignal,
  isCompanionConfirmationActive,
  isCompanionWatchingAlert,
  useSafety,
  type SafetySession,
} from '@/features/safety';
import { useThemeColors } from '@/features/theme';
import { PressableScale, SquircleButton, TogetherLoader } from '@/shared/components';
import { haptics } from '@/shared/utils/haptics';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

import {
  groupMailboxNotifications,
  relativeMailboxTime,
  type NotificationGroup,
} from '../mailboxModel';
import { useMailboxNow } from '../useMailboxNow';

const ACCENT = SEMANTIC_COLOR.action;
const SUCCESS = SEMANTIC_COLOR.social;
const WARNING = SEMANTIC_COLOR.safetyAttention;
const DANGER = SEMANTIC_COLOR.danger;
type IconName = ComponentProps<typeof Ionicons>['name'];

function ActivityRow({
  activity,
  onPress,
  onEdit,
}: {
  activity: ActivityInfo;
  onPress: (activity: ActivityInfo) => void;
  onEdit?: (activity: ActivityInfo) => void;
}) {
  const colors = useThemeColors();
  const { getMessages, getUnreadCount, getRoom } = useActivityChat();
  const accent = markerModeStyles[activity.mode].color;
  const messages = getMessages(activity.id);
  const last = messages[messages.length - 1];
  const unread = getUnreadCount(activity.id);
  const room = getRoom(activity.id);
  const lastAt = room?.lastMessage?.at ?? last?.createdAt;
  const lead = activity.participants[0];

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0 ? `${activity.title}, ${unread} ungelesene Nachrichten` : activity.title
      }
      style={styles.chatRow}
      onPress={() => onPress(activity)}
    >
      {lead ? (
        <View
          className="h-12 w-12 items-center justify-center overflow-hidden rounded-[17px] border-2"
          style={{ borderColor: accent, backgroundColor: colors.secondary }}
        >
          {lead.avatarUrl ? (
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: lead.avatarUrl }}
              className="h-full w-full"
            />
          ) : (
            <Text className="text-sm font-bold text-foreground">{lead.initials}</Text>
          )}
        </View>
      ) : (
        <View
          className="h-12 w-12 items-center justify-center rounded-[17px]"
          style={{ backgroundColor: colorWithAlpha(accent, 0.16) }}
        >
          <Ionicons
            name={room?.type === 'group' ? 'people' : 'chatbubble-ellipses-outline'}
            size={20}
            color={accent}
          />
        </View>
      )}

      <View className="flex-1">
        <Text
          className={`text-base text-foreground ${unread > 0 ? 'font-extrabold' : 'font-semibold'}`}
          numberOfLines={1}
        >
          {activity.title}
        </Text>
        <Text
          className={`mt-0.5 text-sm ${
            unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
          }`}
          numberOfLines={1}
        >
          {last ? `${last.isMe ? 'Du' : last.authorName}: ${last.text}` : 'Noch keine Nachrichten'}
        </Text>
      </View>

      <View className="items-end gap-1.5 self-stretch py-0.5">
        {onEdit ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${activity.title} bearbeiten`}
            hitSlop={8}
            style={[styles.editButton, { backgroundColor: colorWithAlpha(accent, 0.14) }]}
            onPress={(event) => {
              event.stopPropagation();
              onEdit(activity);
            }}
          >
            <Ionicons name="pencil" size={14} color={accent} />
          </PressableScale>
        ) : null}
        {lastAt ? (
          <Text
            className="text-[11px] font-semibold"
            style={{ color: unread > 0 ? accent : colors.mutedForeground }}
          >
            {formatListTimestamp(lastAt)}
          </Text>
        ) : null}
        {unread > 0 ? (
          <View
            className="h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5"
            style={{ backgroundColor: accent }}
          >
            <Text className="text-xs font-bold text-white">{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

function SectionLabel({ children, trailing }: { children: ReactNode; trailing?: string }) {
  return (
    <View className="mb-2 mt-1 flex-row items-center justify-between px-1">
      <Text className="text-xs font-extrabold uppercase tracking-[1.2px] text-muted-foreground">
        {children}
      </Text>
      {trailing ? (
        <Text className="text-xs font-semibold text-muted-foreground">{trailing}</Text>
      ) : null}
    </View>
  );
}

interface StackPreview {
  title: string;
  body: string;
  icon: IconName;
  color: string;
}

function MitteilungenStack({
  count,
  preview,
  onPress,
}: {
  count: number;
  preview: StackPreview;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Animated.View
      entering={FadeInDown.duration(240).easing(Easing.out(Easing.cubic))}
      layout={LinearTransition.duration(240)}
      className="mb-5 px-2 pt-2"
    >
      <View
        pointerEvents="none"
        style={[
          styles.stackBack,
          styles.stackBackSecond,
          { backgroundColor: colors.secondary, borderColor: colors.border },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.stackBack,
          styles.stackBackFirst,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      />
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={count > 0 ? `${count} Mitteilungen öffnen` : 'Mitteilungen öffnen'}
        haptic={false}
        style={[
          styles.stackFront,
          {
            backgroundColor: colors.card,
            borderColor: colorWithAlpha(preview.color, 0.32),
            shadowColor: preview.color,
          },
        ]}
        onPress={onPress}
      >
        <View
          pointerEvents="none"
          style={[styles.stackGlow, { backgroundColor: colorWithAlpha(preview.color, 0.14) }]}
        />
        <View className="flex-row items-center gap-3">
          <View
            className="h-11 w-11 items-center justify-center rounded-[16px]"
            style={{ backgroundColor: colorWithAlpha(preview.color, 0.14) }}
          >
            <Ionicons name={preview.icon} size={21} color={preview.color} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-[11px] font-extrabold uppercase tracking-[1px] text-muted-foreground">
                Mitteilungen
              </Text>
              {count > 0 ? (
                <View
                  className="min-w-5 items-center justify-center rounded-full px-1.5 py-0.5"
                  style={{ backgroundColor: preview.color }}
                >
                  <Text className="text-[10px] font-extrabold text-white">
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-1 text-[15px] font-extrabold text-foreground" numberOfLines={1}>
              {preview.title}
            </Text>
            <Text className="mt-0.5 text-xs leading-4 text-muted-foreground" numberOfLines={1}>
              {preview.body}
            </Text>
          </View>
          <View
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: colorWithAlpha(preview.color, 0.11) }}
          >
            <Ionicons name="chevron-forward" size={17} color={preview.color} />
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

function FriendRequestCard({ request }: { request: FriendRequest }) {
  const colors = useThemeColors();
  const { respondToFriendRequest } = useFriends();
  const [response, setResponse] = useState<'accept' | 'decline' | null>(null);

  async function respond(accept: boolean) {
    if (response) return;
    setResponse(accept ? 'accept' : 'decline');
    try {
      await respondToFriendRequest(request.id, accept);
      if (accept) haptics.success();
      else haptics.selection();
    } catch (error) {
      haptics.warning();
      Alert.alert(
        'Anfrage konnte nicht beantwortet werden',
        error instanceof Error ? error.message : 'Bitte versuche es gleich noch einmal.',
      );
      setResponse(null);
    }
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      layout={LinearTransition.duration(220)}
      style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="h-12 w-12 items-center justify-center overflow-hidden rounded-[17px]"
          style={{ backgroundColor: colorWithAlpha(ACCENT, 0.14) }}
        >
          {request.friend.avatarUrl ? (
            <Image source={{ uri: request.friend.avatarUrl }} className="h-full w-full" />
          ) : (
            <Text className="text-sm font-extrabold" style={{ color: ACCENT }}>
              {request.friend.initials}
            </Text>
          )}
        </View>
        <View className="flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-[15px] font-extrabold text-foreground" numberOfLines={1}>
              {request.friend.displayName}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              {relativeMailboxTime(request.createdAt)}
            </Text>
          </View>
          <Text className="mt-0.5 text-sm leading-5 text-muted-foreground">
            Möchte mit dir befreundet sein.
          </Text>
        </View>
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: ACCENT }} />
      </View>
      <View className="mt-3 flex-row gap-2 pl-[60px]">
        <View className="flex-1">
          <SquircleButton
            label="Ablehnen"
            variant="tonal"
            color={colors.mutedForeground}
            size="sm"
            loading={response === 'decline'}
            disabled={response !== null}
            onPress={() => void respond(false)}
          />
        </View>
        <View className="flex-1">
          <SquircleButton
            label="Annehmen"
            color={ACCENT}
            size="sm"
            loading={response === 'accept'}
            disabled={response !== null}
            onPress={() => void respond(true)}
          />
        </View>
      </View>
    </Animated.View>
  );
}

function safetyCopy(session: SafetySession, now: number) {
  const signal = deriveCompanionSignal(session, now);
  if (signal === 'help')
    return {
      title: `${session.displayName} braucht Hilfe`,
      body: 'Öffne den Heimweg und schau sofort nach.',
      color: DANGER,
      icon: 'warning' as IconName,
    };
  if (signal === 'unwell' || signal === 'no_response')
    return {
      title: `${session.displayName} fühlt sich unsicher`,
      body: 'Bestätige, dass du gerade hinschaust.',
      color: WARNING,
      icon: 'alert-circle' as IconName,
    };
  if (signal === 'data_gap')
    return {
      title: `Kein neues Signal von ${session.displayName}`,
      body: 'Die Verbindung oder der Akku könnte unterbrochen sein.',
      color: WARNING,
      icon: 'cloud-offline-outline' as IconName,
    };
  if (signal === 'timed_out')
    return {
      title: `${session.displayName}s Heimweg ist abgelaufen`,
      body: 'Die Ankunft wurde nicht bestätigt.',
      color: WARNING,
      icon: 'time-outline' as IconName,
    };
  return {
    title: `${session.displayName} ist auf dem Heimweg`,
    body: 'Du kannst den Live-Status begleiten.',
    color: ACCENT,
    icon: 'shield-checkmark-outline' as IconName,
  };
}

function LiveSafetyCard({
  session,
  currentUid,
  now,
  onOpen,
}: {
  session: SafetySession;
  currentUid: string;
  now: number;
  onOpen: () => void;
}) {
  const colors = useThemeColors();
  const { confirmReachable, confirmAlert } = useSafety();
  const [confirming, setConfirming] = useState(false);
  const copy = safetyCopy(session, now);
  const confirmation = session.companions?.[currentUid];
  const confirmed = session.alert
    ? isCompanionWatchingAlert(confirmation, session.alert, now)
    : isCompanionConfirmationActive(confirmation, now);
  const canConfirm = session.expiresAt > now;

  async function confirm() {
    if (confirming || confirmed) return;
    setConfirming(true);
    try {
      if (session.alert) await confirmAlert(session.uid, session.alert.at);
      else await confirmReachable(session.uid);
      haptics.success();
    } catch (error) {
      haptics.warning();
      Alert.alert(
        'Bestätigung nicht möglich',
        error instanceof Error ? error.message : 'Bitte versuche es gleich noch einmal.',
      );
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      layout={LinearTransition.duration(220)}
      style={[
        styles.messageCard,
        {
          backgroundColor: colors.card,
          borderColor: colorWithAlpha(copy.color, session.alert ? 0.46 : 0.28),
        },
      ]}
    >
      <View className="flex-row items-start gap-3">
        <View
          className="h-11 w-11 items-center justify-center rounded-[16px]"
          style={{ backgroundColor: colorWithAlpha(copy.color, 0.14) }}
        >
          <Ionicons name={copy.icon} size={21} color={copy.color} />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold text-foreground">{copy.title}</Text>
          <Text className="mt-1 text-sm leading-5 text-muted-foreground">{copy.body}</Text>
        </View>
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: copy.color }} />
      </View>
      <View className="mt-3 flex-row gap-2 pl-[56px]">
        <View className="flex-1">
          <SquircleButton
            label="Öffnen"
            icon="map-outline"
            variant="tonal"
            color={copy.color}
            size="sm"
            onPress={onOpen}
          />
        </View>
        {canConfirm ? (
          <View className="flex-[1.35]">
            <SquircleButton
              label={
                confirmed
                  ? 'Du bist dabei'
                  : session.alert
                    ? 'Ich schaue hin'
                    : 'Ich bin erreichbar'
              }
              icon={
                confirmed ? 'checkmark-circle' : session.alert ? 'eye-outline' : 'hand-left-outline'
              }
              color={confirmed ? SUCCESS : copy.color}
              variant={confirmed ? 'tonal' : 'solid'}
              size="sm"
              loading={confirming}
              disabled={confirmed}
              onPress={() => void confirm()}
            />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

function LiveJourneyCard({
  title,
  status,
  onOpen,
}: {
  title: string;
  status: 'armed' | 'underway';
  onOpen: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="h-11 w-11 items-center justify-center rounded-[16px]"
          style={{ backgroundColor: colorWithAlpha(ACCENT, 0.14) }}
        >
          <Ionicons
            name={status === 'armed' ? 'time-outline' : 'navigate'}
            size={21}
            color={ACCENT}
          />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold text-foreground" numberOfLines={1}>
            {status === 'armed' ? 'Anreise vorbereitet' : 'Du teilst deine Anreise'}
          </Text>
          <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
            {title}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Activity öffnen"
          style={[styles.roundAction, { backgroundColor: colorWithAlpha(ACCENT, 0.12) }]}
          onPress={onOpen}
        >
          <Ionicons name="chevron-forward" size={18} color={ACCENT} />
        </PressableScale>
      </View>
    </Animated.View>
  );
}

function notificationVisual(kind: NotificationKind): { icon: IconName; color: string } {
  if (kind === 'activity_cancelled') return { icon: 'calendar-clear-outline', color: DANGER };
  if (kind === 'activity_updated') return { icon: 'create-outline', color: WARNING };
  if (kind === 'activity_joined') return { icon: 'people-outline', color: SUCCESS };
  if (kind === 'activity_invite') return { icon: 'person-add-outline', color: ACCENT };
  if (kind === 'spontaneous_round_invite') return { icon: 'hand-left-outline', color: ACCENT };
  if (kind === 'journey_reminder') return { icon: 'navigate-outline', color: ACCENT };
  if (kind === 'safety_emergency') return { icon: 'warning-outline', color: DANGER };
  if (kind === 'safety_unwell' || kind === 'safety_timed_out' || kind === 'safety_unavailable') {
    return { icon: 'alert-circle-outline', color: WARNING };
  }
  if (
    kind === 'safety_request' ||
    kind === 'safety_confirmed' ||
    kind === 'safety_alert_seen' ||
    kind === 'safety_resolved'
  ) {
    return { icon: 'shield-checkmark-outline', color: SUCCESS };
  }
  if (kind === 'circle_invite') return { icon: 'people-circle-outline', color: ACCENT };
  return { icon: 'sparkles-outline', color: ACCENT };
}

function NotificationCard({
  group,
  onOpenActivity,
  onOpenSafety,
  onAcceptSpontaneousRound,
  safetyAvailable,
}: {
  group: NotificationGroup;
  onOpenActivity: (activityId: string) => void;
  onOpenSafety: (ownerUid?: string) => void;
  onAcceptSpontaneousRound: (roundId: string) => Promise<void>;
  safetyAvailable: boolean;
}) {
  const colors = useThemeColors();
  const { findActivityById } = useActivityEntities();
  const notification = group.primary;
  const visual = notificationVisual(notification.kind);
  const activityAvailable = Boolean(
    notification.activityId && findActivityById(notification.activityId),
  );
  const safety = notification.kind.startsWith('safety_');
  const spontaneousRoundInvite =
    notification.kind === 'spontaneous_round_invite' && Boolean(notification.roomId);
  const [acceptingRound, setAcceptingRound] = useState(false);
  const acceptRound = async () => {
    if (!notification.roomId || acceptingRound) return;
    setAcceptingRound(true);
    try {
      await onAcceptSpontaneousRound(notification.roomId);
    } catch {
      Alert.alert(
        'Runde nicht mehr verfuegbar',
        'Vielleicht hast du bereits eine andere Runde angenommen oder die Einladung ist abgelaufen.',
      );
    } finally {
      setAcceptingRound(false);
    }
  };
  const onPress = activityAvailable
    ? () => onOpenActivity(notification.activityId!)
    : safety && safetyAvailable
      ? () => onOpenSafety(notification.safetyOwnerUid)
      : spontaneousRoundInvite
        ? acceptRound
      : undefined;
  const isGroupedJoin = notification.kind === 'activity_joined' && group.count > 1;
  const isGroupedUpdate = notification.kind === 'activity_updated' && group.count > 1;
  const title = isGroupedJoin
    ? `${group.count} Teilnehmer`
    : isGroupedUpdate
      ? `${group.count} Änderungen an dieser Activity`
      : notification.title;
  const body = isGroupedJoin
    ? `${group.count} Personen sind deiner Activity beigetreten.`
    : isGroupedUpdate
      ? `Neueste Änderung: ${notification.body}`
      : notification.body;
  const actionLabel = spontaneousRoundInvite
    ? acceptingRound
      ? 'Wird angenommen …'
      : 'Zurückwinken'
    : safety
      ? 'Heimweg öffnen'
      : 'Activity ansehen';

  return (
    <Animated.View entering={FadeInDown.duration(200)} layout={LinearTransition.duration(220)}>
      <PressableScale
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `${title} öffnen` : undefined}
        disabled={!onPress || acceptingRound}
        haptic={Boolean(onPress)}
        style={[
          styles.messageCard,
          {
            backgroundColor: group.unread ? colorWithAlpha(visual.color, 0.07) : colors.card,
            borderColor: group.unread ? colorWithAlpha(visual.color, 0.3) : colors.border,
          },
        ]}
        onPress={onPress}
      >
        <View className="flex-row items-start gap-3">
          <View
            className="h-11 w-11 items-center justify-center rounded-[16px]"
            style={{ backgroundColor: colorWithAlpha(visual.color, 0.14) }}
          >
            <Ionicons name={visual.icon} size={20} color={visual.color} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-start justify-between gap-2">
              <Text className="flex-1 text-[15px] font-extrabold text-foreground">{title}</Text>
              <Text className="text-[11px] text-muted-foreground">
                {relativeMailboxTime(group.createdAt)}
              </Text>
            </View>
            <Text className="mt-1 text-sm leading-5 text-muted-foreground">{body}</Text>
            {onPress ? (
              <View className="mt-2 flex-row items-center gap-1">
                <Text className="text-xs font-extrabold" style={{ color: visual.color }}>
                  {actionLabel}
                </Text>
                <Ionicons name="arrow-forward" size={13} color={visual.color} />
              </View>
            ) : null}
          </View>
          {group.unread ? (
            <View
              className="mt-1.5 h-2 w-2 rounded-full"
              style={{ backgroundColor: visual.color }}
            />
          ) : null}
        </View>
      </PressableScale>
    </Animated.View>
  );
}

export interface PostfachSheetProps {
  visible: boolean;
  covered?: boolean;
  onClose: () => void;
  onOpenChat: (activity: ActivityInfo) => void;
  onEditActivity?: (activity: ActivityInfo) => void;
  onOpenActivity: (activityId: string) => void;
  onOpenSafety: (ownerUid?: string) => void;
  onAcceptSpontaneousRound: (roundId: string) => Promise<void>;
}

export function PostfachSheet({
  visible,
  covered = false,
  onClose,
  onOpenChat,
  onEditActivity,
  onOpenActivity,
  onOpenSafety,
  onAcceptSpontaneousRound,
}: PostfachSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const { height: viewportHeight } = useWindowDimensions();
  const { user } = useAuth();
  const currentUid = user?.id ?? 'u_you';
  const { joinedIds, getGroup, getRoom, setRoomsListActive } = useActivityChat();
  const { findActivityById } = useActivityEntities();
  const { incomingRequests } = useFriends();
  const { activeJourney } = useJourney();
  const { friendSessions, session: ownSafetySession } = useSafety();
  const {
    notifications,
    isLoading,
    listError,
    unreadCount,
    isUnread,
    markAllSeen,
    retryList,
    setListActive,
  } = useNotifications();
  const [view, setView] = useState<'home' | 'notifications'>('home');
  const [notificationSurfaceMounted, setNotificationSurfaceMounted] = useState(false);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewProgress = useSharedValue(0);
  const maximumSheetHeight = Math.max(320, viewportHeight - Math.max(insets.top, 8));
  const sheetHeight = Math.min(760, Math.max(420, viewportHeight * 0.84), maximumSheetHeight);
  const safetyNow = useMailboxNow(friendSessions.length > 0 && visible && !covered);

  useEffect(() => {
    setRoomsListActive(visible && !covered && view === 'home');
    return () => setRoomsListActive(false);
  }, [covered, setRoomsListActive, view, visible]);

  useEffect(() => {
    setListActive(visible && !covered);
    return () => setListActive(false);
  }, [covered, setListActive, visible]);

  useEffect(() => {
    if (visible) return;
    setView('home');
    setNotificationSurfaceMounted(false);
    viewProgress.value = 0;
  }, [viewProgress, visible]);

  useEffect(
    () => () => {
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
    },
    [],
  );

  const activeSafetyOwnerUids = useMemo(
    () => new Set(friendSessions.map((session) => session.uid)),
    [friendSessions],
  );
  const notificationGroups = useMemo(
    () => groupMailboxNotifications(notifications, isUnread, activeSafetyOwnerUids),
    [activeSafetyOwnerUids, isUnread, notifications],
  );
  const unreadGroups = notificationGroups.filter((group) => group.unread);
  const loadedUnreadCount = notifications.filter(isUnread).length;
  const pushOnlyHintCount = Math.max(0, unreadCount - loadedUnreadCount);

  const lastActivityAt = (id: string) => {
    const room = getRoom(id);
    return room?.lastMessage?.at ?? room?.createdAt ?? 0;
  };
  const activities = joinedIds
    .map((id): ActivityInfo | null => {
      const activity = findActivityById(id);
      if (activity) {
        const includesCurrentUser = activity.participants.some(
          (participant) => participant.userId === currentUid,
        );
        return {
          ...activity,
          participantCount: activity.participantCount + (includesCurrentUser ? 0 : 1),
        };
      }
      const group = getGroup(id);
      return group
        ? {
            id,
            title: group.title,
            mode: 'open',
            participantCount: group.memberIds.length,
            participants: [],
          }
        : null;
    })
    .filter((activity): activity is ActivityInfo => activity !== null)
    .sort((a, b) => lastActivityAt(b.id) - lastActivityAt(a.id));

  const sortedFriendSessions = [...friendSessions].sort((a, b) => {
    const rank = (session: SafetySession) => {
      const signal = deriveCompanionSignal(session, safetyNow);
      if (signal === 'help') return 6;
      if (signal === 'no_response') return 5;
      if (signal === 'data_gap') return 4;
      if (signal === 'timed_out') return 3;
      if (signal === 'unwell') return 2;
      return 1;
    };
    return rank(b) - rank(a);
  });
  const urgentSafety = sortedFriendSessions[0];
  const firstUnreadGroup = unreadGroups[0];
  const firstUnread = firstUnreadGroup?.primary;
  const stackPreview: StackPreview | null = urgentSafety
    ? safetyCopy(urgentSafety, safetyNow)
    : incomingRequests[0]
      ? {
          title: `${incomingRequests[0].friend.displayName} möchte dich hinzufügen`,
          body: 'Freundschaftsanfrage beantworten',
          icon: 'person-add-outline',
          color: ACCENT,
        }
      : firstUnread
        ? {
            title:
              firstUnread.kind === 'activity_joined' && firstUnreadGroup.unreadCount > 1
                ? `${firstUnreadGroup.unreadCount} neue Teilnehmer`
                : firstUnread.title,
            body: firstUnread.body,
            icon: notificationVisual(firstUnread.kind).icon,
            color: notificationVisual(firstUnread.kind).color,
          }
        : activeJourney
          ? {
              title:
                activeJourney.status === 'armed' ? 'Anreise vorbereitet' : 'Anreise wird geteilt',
              body: activeJourney.title,
              icon: activeJourney.status === 'armed' ? 'time-outline' : 'navigate',
              color: ACCENT,
            }
          : unreadCount > 0
            ? {
                title: 'Neue Mitteilungen',
                body: 'Öffne das Postfach, um sie abzugleichen.',
                icon: 'mail-unread-outline',
                color: ACCENT,
              }
            : listError
              ? {
                  title: 'Mitteilungen nicht abgeglichen',
                  body: 'Tippe, um die Verbindung erneut zu prüfen.',
                  icon: 'cloud-offline-outline',
                  color: WARNING,
                }
              : null;
  const actionableSafetyCount = friendSessions.filter((session) => {
    const confirmation = session.companions?.[currentUid];
    return session.alert
      ? !isCompanionWatchingAlert(confirmation, session.alert, safetyNow)
      : !isCompanionConfirmationActive(confirmation, safetyNow);
  }).length;
  const stackCount =
    actionableSafetyCount + incomingRequests.length + unreadGroups.length + pushOnlyHintCount;
  const liveImportantCount =
    friendSessions.length + incomingRequests.length + (activeJourney ? 1 : 0);
  const openOrNewCount = liveImportantCount + unreadGroups.length + pushOnlyHintCount;

  function openNotifications() {
    if (unmountTimerRef.current) {
      clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
    setNotificationSurfaceMounted(true);
    setView('notifications');
    haptics.medium();
    viewProgress.value = withTiming(1, {
      duration: reducedMotion ? 0 : 280,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
    markAllSeen();
  }

  function showHome() {
    markAllSeen();
    setView('home');
    haptics.selection();
    viewProgress.value = withTiming(0, {
      duration: reducedMotion ? 0 : 250,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
    if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
    unmountTimerRef.current = setTimeout(
      () => {
        setNotificationSurfaceMounted(false);
        unmountTimerRef.current = null;
      },
      reducedMotion ? 0 : 260,
    );
  }

  function closeSheet() {
    if (view === 'notifications') markAllSeen();
    onClose();
  }

  function requestClose() {
    if (view === 'notifications') showHome();
    else closeSheet();
  }

  const homeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(viewProgress.value, [0, 0.58, 1], [1, 0, 0]),
    transform: [
      { translateX: -18 * viewProgress.value },
      { scale: 1 - 0.015 * viewProgress.value },
    ],
  }));
  const notificationsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(viewProgress.value, [0, 0.36, 1], [0, 0, 1]),
    transform: [
      { translateX: 28 * (1 - viewProgress.value) },
      { scale: 0.985 + 0.015 * viewProgress.value },
    ],
  }));

  return (
    <Modal
      transparent
      animationType={reducedMotion ? 'none' : 'slide'}
      visible={visible}
      onRequestClose={requestClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessible={false}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={requestClose}
        />
        <View
          accessibilityViewIsModal
          className="rounded-t-[34px] border border-border bg-card"
          style={{ height: sheetHeight, paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="items-center pt-3">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>

          <View className="h-[76px] flex-row items-center gap-3 px-5 pb-3 pt-3">
            {view === 'notifications' ? (
              <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(160)}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Zurück zu den Chats"
                  style={[styles.headerButton, { backgroundColor: colors.secondary }]}
                  onPress={showHome}
                >
                  <Ionicons name="arrow-back" size={20} color={colors.foreground} />
                </PressableScale>
              </Animated.View>
            ) : (
              <Animated.View
                entering={reducedMotion ? undefined : FadeIn.duration(160)}
                className="h-11 w-11 items-center justify-center rounded-[17px]"
                style={{ backgroundColor: colorWithAlpha(ACCENT, 0.13) }}
              >
                <Ionicons name="mail-outline" size={21} color={ACCENT} />
              </Animated.View>
            )}
            <View className="flex-1">
              <Text className="text-xl font-extrabold tracking-[-0.35px] text-foreground">
                {view === 'notifications' ? 'Mitteilungen' : 'Postfach'}
              </Text>
              <Text className="mt-0.5 text-sm text-muted-foreground">
                {view === 'notifications'
                  ? openOrNewCount > 0
                    ? `${openOrNewCount} wichtig oder neu`
                    : 'Alles auf dem neuesten Stand'
                  : 'Chats und wichtige Mitteilungen'}
              </Text>
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Postfach schließen"
              style={[styles.headerButton, { backgroundColor: colors.secondary }]}
              onPress={closeSheet}
            >
              <Ionicons name="close" size={20} color={colors.foreground} />
            </PressableScale>
          </View>

          <View className="flex-1 overflow-hidden">
            <Animated.View
              pointerEvents={view === 'home' ? 'auto' : 'none'}
              style={[StyleSheet.absoluteFill, homeStyle]}
            >
              <ScrollView
                className="px-3"
                contentContainerStyle={{ paddingBottom: 16 }}
                showsVerticalScrollIndicator={false}
              >
                {stackPreview ? (
                  <MitteilungenStack
                    count={stackCount}
                    preview={stackPreview}
                    onPress={openNotifications}
                  />
                ) : null}

                <View className="px-2">
                  <SectionLabel trailing={activities.length ? `${activities.length}` : undefined}>
                    Chats
                  </SectionLabel>
                </View>
                {activities.length === 0 ? (
                  <View className="items-center px-6 py-12">
                    <View
                      className="mb-4 h-16 w-16 items-center justify-center rounded-[24px]"
                      style={{ backgroundColor: colorWithAlpha(ACCENT, 0.09) }}
                    >
                      <Ionicons name="chatbubbles-outline" size={27} color={ACCENT} />
                    </View>
                    <Text className="text-center text-base font-extrabold text-foreground">
                      Noch keine Chats
                    </Text>
                    <Text className="mt-2 max-w-[280px] text-center text-sm leading-5 text-muted-foreground">
                      Tritt einer Activity bei. Der zugehörige Chat erscheint dann hier.
                    </Text>
                  </View>
                ) : (
                  <View className="gap-0.5">
                    {activities.map((activity) => (
                      <ActivityRow
                        key={activity.id}
                        activity={activity}
                        onPress={onOpenChat}
                        onEdit={
                          activity.hostId === currentUid && onEditActivity
                            ? onEditActivity
                            : undefined
                        }
                      />
                    ))}
                  </View>
                )}
              </ScrollView>
            </Animated.View>

            {notificationSurfaceMounted ? (
              <Animated.View
                pointerEvents={view === 'notifications' ? 'auto' : 'none'}
                style={[StyleSheet.absoluteFill, notificationsStyle]}
              >
                <ScrollView
                  className="px-4"
                  contentContainerStyle={{ paddingBottom: 20 }}
                  showsVerticalScrollIndicator={false}
                >
                  {friendSessions.length || incomingRequests.length || activeJourney ? (
                    <SectionLabel>Jetzt wichtig</SectionLabel>
                  ) : null}
                  <View className="gap-2.5">
                    {sortedFriendSessions.map((session) => (
                      <LiveSafetyCard
                        key={`safety-${session.uid}`}
                        session={session}
                        currentUid={currentUid}
                        now={safetyNow}
                        onOpen={() => onOpenSafety(session.uid)}
                      />
                    ))}
                    {incomingRequests.map((request) => (
                      <FriendRequestCard key={request.id} request={request} />
                    ))}
                    {activeJourney ? (
                      <LiveJourneyCard
                        title={activeJourney.title}
                        status={activeJourney.status === 'armed' ? 'armed' : 'underway'}
                        onOpen={() => onOpenActivity(activeJourney.activityId)}
                      />
                    ) : null}
                  </View>

                  {notificationGroups.length ? (
                    <View className="mt-5">
                      <SectionLabel trailing={`${notificationGroups.length}`}>
                        Weitere Mitteilungen
                      </SectionLabel>
                      <View className="gap-2.5">
                        {notificationGroups.map((group) => (
                          <NotificationCard
                            key={group.id}
                            group={group}
                            onOpenActivity={onOpenActivity}
                            onOpenSafety={onOpenSafety}
                            onAcceptSpontaneousRound={onAcceptSpontaneousRound}
                            safetyAvailable={Boolean(
                              group.primary.safetyOwnerUid &&
                              (activeSafetyOwnerUids.has(group.primary.safetyOwnerUid) ||
                                ownSafetySession?.uid === group.primary.safetyOwnerUid),
                            )}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {isLoading ? (
                    <View className="items-center px-8 py-12">
                      <TogetherLoader size={44} tile />
                      <Text className="mt-4 text-sm font-bold text-foreground">
                        Mitteilungen werden abgeglichen
                      </Text>
                    </View>
                  ) : listError ? (
                    <View
                      className="mt-5 items-center rounded-[22px] border px-6 py-6"
                      style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                      <View
                        className="mb-3 h-12 w-12 items-center justify-center rounded-[17px]"
                        style={{ backgroundColor: colorWithAlpha(WARNING, 0.14) }}
                      >
                        <Ionicons name="cloud-offline-outline" size={22} color={WARNING} />
                      </View>
                      <Text className="text-center text-sm font-extrabold text-foreground">
                        Abgleich nicht möglich
                      </Text>
                      <Text className="mt-1 text-center text-sm leading-5 text-muted-foreground">
                        {listError}
                      </Text>
                      <View className="mt-4 w-full max-w-[220px]">
                        <SquircleButton
                          label="Erneut versuchen"
                          icon="refresh"
                          variant="tonal"
                          color={ACCENT}
                          size="sm"
                          onPress={retryList}
                        />
                      </View>
                    </View>
                  ) : !friendSessions.length &&
                    !incomingRequests.length &&
                    !activeJourney &&
                    !notificationGroups.length ? (
                    <View className="items-center px-8 py-14">
                      <View
                        className="mb-4 h-16 w-16 items-center justify-center rounded-[24px]"
                        style={{ backgroundColor: colorWithAlpha(SUCCESS, 0.12) }}
                      >
                        <Ionicons name="checkmark-done" size={28} color={SUCCESS} />
                      </View>
                      <Text className="text-center text-base font-extrabold text-foreground">
                        Alles erledigt
                      </Text>
                      <Text className="mt-2 max-w-[280px] text-center text-sm leading-5 text-muted-foreground">
                        Hier erscheinen nur Dinge, die für dich wichtig oder handlungsrelevant sind.
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
              </Animated.View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  chatRow: {
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    gap: 12,
    minHeight: 74,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  editButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  messageCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 16,
  },
  roundAction: {
    alignItems: 'center',
    borderRadius: 16,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  stackBack: {
    borderRadius: 20,
    borderWidth: 1,
    height: 94,
    left: 18,
    position: 'absolute',
    right: 18,
  },
  stackBackFirst: {
    opacity: 0.76,
    top: 13,
    transform: [{ scale: 0.975 }],
  },
  stackBackSecond: {
    opacity: 0.48,
    top: 20,
    transform: [{ scale: 0.94 }],
  },
  stackFront: {
    borderRadius: 20,
    borderWidth: 1,
    elevation: 5,
    minHeight: 98,
    overflow: 'hidden',
    padding: 16,
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  stackGlow: {
    borderRadius: 80,
    height: 150,
    position: 'absolute',
    right: -50,
    top: -72,
    width: 150,
  },
});
