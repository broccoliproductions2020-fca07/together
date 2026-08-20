import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Alert,
  ActivityIndicator,
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
import {
  activityChatAccent,
  formatListTimestamp,
  GROUP_CHAT_ACCENT,
  useActivityChat,
} from '@/features/chat';
import { useFriends, type FriendRequest } from '@/features/friends';
import { useJourney } from '@/features/journey';
import { colorWithAlpha } from '@/features/map/utils/markerStyles';
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
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';
import { DIAGNOSTICS_VISIBLE } from '@/shared/utils/buildInfo';
import { haptics } from '@/shared/utils/haptics';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

import {
  groupMailboxNotifications,
  relativeMailboxTime,
  type NotificationGroup,
} from '../mailboxModel';
import { useMailboxNow } from '../useMailboxNow';
import { usePostfachBadge } from '../usePostfachBadgeCount';

const ACCENT = SEMANTIC_COLOR.action;
const SUCCESS = SEMANTIC_COLOR.social;
const WARNING = SEMANTIC_COLOR.safetyAttention;
const DANGER = SEMANTIC_COLOR.danger;
type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * A row in the Postfach chat list. An activity chat and a planning round are
 * different things and must look different — a group is NOT an activity with
 * mode 'open', which is what faking the mode used to imply.
 */
export type PostfachRoom =
  | { kind: 'activity'; id: string; title: string; accent: string; activity: ActivityInfo }
  | { kind: 'group'; id: string; title: string; accent: string; memberCount: number };

/** What a host needs to open the right chat in the right colour. */
export interface PostfachChatTarget {
  id: string;
  title: string;
  accent: string;
  kind: 'activity' | 'group';
  memberCount: number;
}

function chatTarget(room: PostfachRoom): PostfachChatTarget {
  return {
    id: room.id,
    title: room.title,
    accent: room.accent,
    kind: room.kind,
    memberCount: room.kind === 'activity' ? room.activity.participantCount : room.memberCount,
  };
}

function ChatRow({
  room,
  onPress,
  onEdit,
}: {
  room: PostfachRoom;
  onPress: (room: PostfachRoom) => void;
  onEdit?: (activity: ActivityInfo) => void;
}) {
  const colors = useThemeColors();
  const { getMessages, getUnreadCount, getRoom } = useActivityChat();
  const accent = room.accent;
  const messages = getMessages(room.id);
  const last = messages[messages.length - 1];
  const unread = getUnreadCount(room.id);
  const summary = getRoom(room.id);
  const lastAt = summary?.lastMessage?.at ?? last?.createdAt;
  const lead = room.kind === 'activity' ? room.activity.participants[0] : undefined;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0 ? `${room.title}, ${unread} ungelesene Nachrichten` : room.title
      }
      style={styles.chatRow}
      onPress={() => onPress(room)}
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
            <Text
              {...TEXT_CAPPED}
              style={{ ...TYPE.label, fontFamily: FONT.bold, color: colors.foreground }}
            >
              {lead.initials}
            </Text>
          )}
        </View>
      ) : (
        <View
          className="h-12 w-12 items-center justify-center rounded-[17px]"
          style={{ backgroundColor: colorWithAlpha(accent, 0.16) }}
        >
          <Ionicons
            name={room.kind === 'group' ? 'people' : 'chatbubble-ellipses-outline'}
            size={20}
            color={accent}
          />
        </View>
      )}

      <View className="flex-1">
        <Text
          {...TEXT_FLEXIBLE}
          numberOfLines={1}
          style={{
            ...TYPE.body,
            fontFamily: unread > 0 ? FONT.bold : FONT.semibold,
            color: colors.foreground,
          }}
        >
          {room.title}
        </Text>
        <Text
          {...TEXT_FLEXIBLE}
          numberOfLines={1}
          className="mt-0.5"
          style={{
            ...TYPE.label,
            fontFamily: FONT.medium,
            color: unread > 0 ? colors.foreground : colors.mutedForeground,
          }}
        >
          {last ? `${last.isMe ? 'Du' : last.authorName}: ${last.text}` : 'Noch keine Nachrichten'}
        </Text>
      </View>

      <View className="items-end gap-1.5 self-stretch py-0.5">
        {onEdit && room.kind === 'activity' ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${room.title} bearbeiten`}
            hitSlop={8}
            style={[styles.editButton, { backgroundColor: colorWithAlpha(accent, 0.14) }]}
            onPress={(event) => {
              event.stopPropagation();
              onEdit(room.activity);
            }}
          >
            <Ionicons name="pencil" size={14} color={accent} />
          </PressableScale>
        ) : null}
        {lastAt ? (
          <Text
            {...TEXT_CAPPED}
            style={{
              ...TYPE.micro,
              fontFamily: FONT.semibold,
              color: unread > 0 ? accent : colors.mutedForeground,
            }}
          >
            {formatListTimestamp(lastAt)}
          </Text>
        ) : null}
        {unread > 0 ? (
          <View
            className="h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5"
            style={{ backgroundColor: accent }}
          >
            <Text
              {...TEXT_CAPPED}
              style={{ ...TYPE.caption, fontFamily: FONT.bold, color: '#ffffff' }}
            >
              {unread > 99 ? '99+' : unread}
            </Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

function SectionLabel({ children, trailing }: { children: ReactNode; trailing?: string }) {
  const colors = useThemeColors();
  const style = {
    ...TYPE.micro,
    fontFamily: FONT.bold,
    color: colors.mutedForeground,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  };
  return (
    <View className="mb-2 mt-1 flex-row items-center justify-between px-1">
      <Text {...TEXT_FLEXIBLE} style={style}>
        {children}
      </Text>
      {trailing ? (
        <Text {...TEXT_FLEXIBLE} style={{ ...style, letterSpacing: 0 }}>
          {trailing}
        </Text>
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

/**
 * The permanent entry into Mitteilungen.
 *
 * Deliberately rendered at ALL times, including with nothing new: the previous
 * version only existed while something was unread, so reading everything made
 * the entry point — and with it the whole notification history — disappear
 * until the next push arrived.
 */
function MitteilungenRow({
  count,
  preview,
  onPress,
}: {
  count: number;
  preview: StackPreview | null;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const color = preview?.color ?? colors.mutedForeground;
  const hasNews = count > 0 && preview !== null;

  return (
    <Animated.View
      entering={FadeInDown.duration(240).easing(Easing.out(Easing.cubic))}
      layout={LinearTransition.duration(240)}
      className="mb-5 px-2 pt-2"
    >
      {hasNews ? (
        <>
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
        </>
      ) : null}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={hasNews ? `Mitteilungen, ${count} neu` : 'Mitteilungen, alles gelesen'}
        haptic={false}
        style={[
          styles.stackFront,
          {
            backgroundColor: colors.card,
            borderColor: hasNews ? colorWithAlpha(color, 0.32) : colors.border,
            shadowColor: hasNews ? color : 'transparent',
            shadowOpacity: hasNews ? 0.18 : 0,
            elevation: hasNews ? 5 : 0,
          },
        ]}
        onPress={onPress}
      >
        {hasNews ? (
          <View
            pointerEvents="none"
            style={[styles.stackGlow, { backgroundColor: colorWithAlpha(color, 0.14) }]}
          />
        ) : null}
        <View className="flex-row items-center gap-3">
          <View
            className="h-11 w-11 items-center justify-center rounded-[16px]"
            style={{ backgroundColor: colorWithAlpha(color, hasNews ? 0.14 : 0.1) }}
          >
            <Ionicons
              name={hasNews ? (preview?.icon ?? 'mail-unread-outline') : 'mail-outline'}
              size={21}
              color={color}
            />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text
                {...TEXT_FLEXIBLE}
                style={{
                  ...TYPE.micro,
                  fontFamily: FONT.bold,
                  color: colors.mutedForeground,
                  letterSpacing: 0.9,
                  textTransform: 'uppercase',
                }}
              >
                Mitteilungen
              </Text>
              {hasNews ? (
                <View
                  className="min-w-5 items-center justify-center rounded-full px-1.5 py-0.5"
                  style={{ backgroundColor: color }}
                >
                  <Text
                    {...TEXT_CAPPED}
                    style={{ ...TYPE.micro, fontFamily: FONT.bold, color: '#ffffff' }}
                  >
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              {...TEXT_FLEXIBLE}
              numberOfLines={1}
              className="mt-1"
              style={{ ...TYPE.label, fontFamily: FONT.bold, color: colors.foreground }}
            >
              {hasNews ? preview.title : 'Alles gelesen'}
            </Text>
            {hasNews ? (
              <Text
                {...TEXT_FLEXIBLE}
                numberOfLines={1}
                className="mt-0.5"
                style={{
                  ...TYPE.caption,
                  fontFamily: FONT.medium,
                  color: colors.mutedForeground,
                }}
              >
                {preview.body}
              </Text>
            ) : null}
          </View>
          <View
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: colorWithAlpha(color, hasNews ? 0.11 : 0.08) }}
          >
            <Ionicons name="chevron-forward" size={17} color={color} />
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
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: request.friend.avatarUrl }}
              className="h-full w-full"
            />
          ) : (
            <Text {...TEXT_CAPPED} style={{ ...TYPE.label, fontFamily: FONT.bold, color: ACCENT }}>
              {request.friend.initials}
            </Text>
          )}
        </View>
        <View className="flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text
              {...TEXT_FLEXIBLE}
              numberOfLines={1}
              className="flex-1"
              style={{ ...TYPE.label, fontFamily: FONT.bold, color: colors.foreground }}
            >
              {request.friend.displayName}
            </Text>
            <Text
              {...TEXT_FLEXIBLE}
              style={{ ...TYPE.micro, fontFamily: FONT.medium, color: colors.mutedForeground }}
            >
              {relativeMailboxTime(request.createdAt)}
            </Text>
          </View>
          <Text
            {...TEXT_FLEXIBLE}
            className="mt-0.5"
            style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.mutedForeground }}
          >
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

/**
 * A targeted planning-round invitation. Two real actions, because "beitreten"
 * is a decision — the card never joins on a stray tap the way an
 * open-the-activity card does.
 */
function GroupInviteCard({
  group,
  isNew,
  onRespond,
}: {
  group: NotificationGroup;
  isNew: boolean;
  onRespond: (roomId: string, accept: boolean) => Promise<void>;
}) {
  const colors = useThemeColors();
  const [response, setResponse] = useState<'accept' | 'decline' | null>(null);
  const notification = group.primary;
  const roomId = notification.roomId;

  async function respond(accept: boolean) {
    if (response || !roomId) return;
    setResponse(accept ? 'accept' : 'decline');
    try {
      await onRespond(roomId, accept);
      if (accept) haptics.success();
      else haptics.selection();
    } catch (error) {
      haptics.warning();
      Alert.alert(
        'Einladung nicht mehr verfügbar',
        error instanceof Error ? error.message : 'Vielleicht ist die Planung abgelaufen oder voll.',
      );
      setResponse(null);
    }
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      layout={LinearTransition.duration(220)}
      style={[
        styles.messageCard,
        {
          backgroundColor: isNew ? colorWithAlpha(GROUP_CHAT_ACCENT, 0.07) : colors.card,
          borderColor: isNew ? colorWithAlpha(GROUP_CHAT_ACCENT, 0.3) : colors.border,
        },
      ]}
    >
      <View className="flex-row items-start gap-3">
        <View
          className="h-11 w-11 items-center justify-center rounded-[16px]"
          style={{ backgroundColor: colorWithAlpha(GROUP_CHAT_ACCENT, 0.14) }}
        >
          <Ionicons name="people-outline" size={20} color={GROUP_CHAT_ACCENT} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text
              {...TEXT_FLEXIBLE}
              className="flex-1"
              style={{ ...TYPE.label, fontFamily: FONT.bold, color: colors.foreground }}
            >
              {notification.title}
            </Text>
            <Text
              {...TEXT_FLEXIBLE}
              style={{ ...TYPE.micro, fontFamily: FONT.medium, color: colors.mutedForeground }}
            >
              {relativeMailboxTime(group.createdAt)}
            </Text>
          </View>
          <Text
            {...TEXT_FLEXIBLE}
            className="mt-1"
            style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.mutedForeground }}
          >
            {notification.body}
          </Text>
        </View>
        {isNew ? (
          <View
            className="mt-1.5 h-2 w-2 rounded-full"
            style={{ backgroundColor: GROUP_CHAT_ACCENT }}
          />
        ) : null}
      </View>
      <View className="mt-3 flex-row gap-2 pl-[56px]">
        <View className="flex-1">
          <SquircleButton
            label="Ablehnen"
            variant="tonal"
            color={colors.mutedForeground}
            size="sm"
            loading={response === 'decline'}
            disabled={response !== null || !roomId}
            onPress={() => void respond(false)}
          />
        </View>
        <View className="flex-1">
          <SquircleButton
            label="Beitreten"
            color={GROUP_CHAT_ACCENT}
            size="sm"
            loading={response === 'accept'}
            disabled={response !== null || !roomId}
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
          <Text
            {...TEXT_FLEXIBLE}
            style={{ ...TYPE.label, fontFamily: FONT.bold, color: colors.foreground }}
          >
            {copy.title}
          </Text>
          <Text
            {...TEXT_FLEXIBLE}
            className="mt-1"
            style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.mutedForeground }}
          >
            {copy.body}
          </Text>
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
          <Text
            {...TEXT_FLEXIBLE}
            numberOfLines={1}
            style={{ ...TYPE.label, fontFamily: FONT.bold, color: colors.foreground }}
          >
            {status === 'armed' ? 'Anreise vorbereitet' : 'Du teilst deine Anreise'}
          </Text>
          <Text
            {...TEXT_FLEXIBLE}
            numberOfLines={1}
            className="mt-0.5"
            style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.mutedForeground }}
          >
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
  if (kind === 'activity_left') return { icon: 'exit-outline', color: WARNING };
  if (kind === 'activity_host_changed') return { icon: 'swap-horizontal-outline', color: ACCENT };
  if (kind === 'activity_invite') return { icon: 'person-add-outline', color: ACCENT };
  if (kind === 'spontaneous_round_invite') return { icon: 'hand-left-outline', color: ACCENT };
  if (kind === 'group_chat_invite') return { icon: 'people-outline', color: GROUP_CHAT_ACCENT };
  if (kind === 'time_plan_invite') return { icon: 'calendar-outline', color: WARNING };
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
  return { icon: 'sparkles-outline', color: ACCENT };
}

function NotificationCard({
  group,
  isNew,
  onOpenActivity,
  onOpenSafety,
  onOpenSpontaneousRoundInvite,
  onOpenTimePlan,
  timePlanJoiningId,
  safetyAvailable,
}: {
  group: NotificationGroup;
  /** Highlighted because it was unread when this view opened. */
  isNew: boolean;
  onOpenActivity: (activityId: string) => void;
  onOpenSafety: (ownerUid?: string) => void;
  onOpenSpontaneousRoundInvite: (roundId: string) => void;
  onOpenTimePlan: (planId: string) => void;
  timePlanJoiningId: string | null;
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
  const timePlanInvite = notification.kind === 'time_plan_invite' && Boolean(notification.timePlanId);
  const timePlanJoining = timePlanInvite && timePlanJoiningId === notification.timePlanId;
  const onPress = activityAvailable
    ? () => onOpenActivity(notification.activityId!)
    : safety && safetyAvailable
      ? () => onOpenSafety(notification.safetyOwnerUid)
      : spontaneousRoundInvite
        ? // Opens the confirmation sheet — it does NOT join. Tapping used to
          // accept outright, which put you in a room with people you had not
          // seen yet. The preview callable fires from there, on this deliberate
          // tap only, never for every card in the list.
          () => onOpenSpontaneousRoundInvite(notification.roomId!)
        : timePlanInvite
          ? () => onOpenTimePlan(notification.timePlanId!)
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
      : // The reminder's body is written by the server at send time and says
        // "Anreise teilen? Zum Aktivieren tippen." Once the activity is gone
        // the card is already not tappable — so that sentence instructs you to
        // do something the card cannot do. Say what is true instead.
        notification.kind === 'journey_reminder' && !activityAvailable
        ? 'Diese Activity ist vorbei.'
        : notification.body;
  const actionLabel = timePlanInvite
    ? timePlanJoining
      ? 'Du trittst bei …'
      : 'Beitreten'
    : spontaneousRoundInvite
    ? // The card no longer joins, so it must not promise that it does.
      'Einladung ansehen'
    : safety
      ? 'Heimweg öffnen'
      : 'Activity ansehen';

  return (
    <Animated.View entering={FadeInDown.duration(200)} layout={LinearTransition.duration(220)}>
      <PressableScale
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `${title} öffnen` : undefined}
        disabled={!onPress || timePlanJoining}
        haptic={Boolean(onPress)}
        style={[
          styles.messageCard,
          {
            backgroundColor: isNew ? colorWithAlpha(visual.color, 0.07) : colors.card,
            borderColor: isNew ? colorWithAlpha(visual.color, 0.3) : colors.border,
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
              <Text
                {...TEXT_FLEXIBLE}
                className="flex-1"
                style={{ ...TYPE.label, fontFamily: FONT.bold, color: colors.foreground }}
              >
                {title}
              </Text>
              <Text
                {...TEXT_FLEXIBLE}
                style={{ ...TYPE.micro, fontFamily: FONT.medium, color: colors.mutedForeground }}
              >
                {relativeMailboxTime(group.createdAt)}
              </Text>
            </View>
            <Text
              {...TEXT_FLEXIBLE}
              className="mt-1"
              style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.mutedForeground }}
            >
              {body}
            </Text>
            {onPress ? (
              <View className="mt-2 flex-row items-center gap-1">
                <Text
                  {...TEXT_FLEXIBLE}
                  style={{ ...TYPE.caption, fontFamily: FONT.bold, color: visual.color }}
                >
                  {actionLabel}
                </Text>
                {timePlanJoining ? <ActivityIndicator size="small" color={visual.color} /> : <Ionicons name="arrow-forward" size={13} color={visual.color} />}
              </View>
            ) : null}
          </View>
          {isNew ? (
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
  onOpenChat: (target: PostfachChatTarget) => void;
  onEditActivity?: (activity: ActivityInfo) => void;
  onOpenActivity: (activityId: string) => void;
  onOpenSafety: (ownerUid?: string) => void;
  onOpenSpontaneousRoundInvite: (roundId: string) => void;
  onOpenTimePlan: (planId: string) => void;
  timePlanJoiningId?: string | null;
}

export function PostfachSheet({
  visible,
  covered = false,
  onClose,
  onOpenChat,
  onEditActivity,
  onOpenActivity,
  onOpenSafety,
  onOpenSpontaneousRoundInvite,
  onOpenTimePlan,
  timePlanJoiningId = null,
}: PostfachSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const { height: viewportHeight } = useWindowDimensions();
  const { user } = useAuth();
  const currentUid = user?.id ?? 'u_you';
  const { joinedIds, getGroup, getRoom, setRoomsListActive, respondToGroupInvite } =
    useActivityChat();
  const { findActivityById } = useActivityEntities();
  const { incomingRequests } = useFriends();
  const { activeJourney } = useJourney();
  const { friendSessions, session: ownSafetySession } = useSafety();
  const { mitteilungenCount } = usePostfachBadge();
  const {
    notifications,
    isLoading,
    listError,
    listErrorCode,
    unreadCount,
    isUnread,
    markAllSeen,
    retryList,
    setListActive,
  } = useNotifications();
  const [view, setView] = useState<'home' | 'notifications'>('home');
  const [notificationSurfaceMounted, setNotificationSurfaceMounted] = useState(false);
  // Ids that were unread when the Mitteilungen view opened. They keep their
  // "neu" treatment for the whole visit, because the seen cursor only moves
  // when the user leaves — otherwise everything went grey the instant the
  // list appeared and nobody could tell what had arrived.
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
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
    setNewIds(new Set());
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

  /**
   * A group counts as new while it is either still unread (so notifications
   * arriving during the visit light up too) or was in the opening snapshot.
   */
  const isGroupNew = (group: NotificationGroup) =>
    group.unread || group.ids.some((id) => newIds.has(id));

  const lastActivityAt = (id: string) => {
    const room = getRoom(id);
    return room?.lastMessage?.at ?? room?.createdAt ?? 0;
  };
  const rooms: PostfachRoom[] = joinedIds
    .map((id): PostfachRoom | null => {
      const room = getRoom(id);
      // An activity or group gets a room at creation/join time so anyone can
      // start a conversation from its detail. It belongs in the Postfach only
      // once there is an actual conversation to return to.
      if (!room || (room.messageCount ?? 0) < 1) return null;

      const activity = findActivityById(id);
      if (activity) {
        const includesCurrentUser = activity.participants.some(
          (participant) => participant.userId === currentUid,
        );
        return {
          kind: 'activity',
          id,
          title: activity.title,
          accent: activityChatAccent(activity.mode),
          activity: {
            ...activity,
            participantCount: activity.participantCount + (includesCurrentUser ? 0 : 1),
          },
        };
      }
      const group = getGroup(id);
      // A planning round is its own kind of room with its own colour. It is
      // NOT an activity in mode 'open' — that fake made every Planung look
      // like an Open activity in the list.
      return group
        ? {
            kind: 'group',
            id,
            title: group.title,
            accent: GROUP_CHAT_ACCENT,
            memberCount: group.memberIds.length,
          }
        : null;
    })
    .filter((room): room is PostfachRoom => room !== null)
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

  function openNotifications() {
    if (unmountTimerRef.current) {
      clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
    // Snapshot BEFORE anything is marked seen. markAllSeen deliberately does
    // not run here — it runs on the way out (showHome / closeSheet), so the
    // list can actually show what was new.
    setNewIds(new Set(notifications.filter(isUnread).map((notification) => notification.id)));
    setNotificationSurfaceMounted(true);
    setView('notifications');
    haptics.medium();
    viewProgress.value = withTiming(1, {
      duration: reducedMotion ? 0 : 280,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
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

  const hasLiveItems = Boolean(friendSessions.length || incomingRequests.length || activeJourney);
  const notificationsEmpty = !hasLiveItems && !notificationGroups.length;

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
        {/* The scrim must NOT ride the sheet's slide-up. `animationType="slide"`
            translates this WHOLE container, so a screen-sized backdrop inside it
            enters as a moving rectangle — a big translucent panel sweeping up
            across the map alongside the sheet, with its top edge visible the
            entire way. Over-sizing it upward by one viewport keeps that edge off
            screen for the full travel (it already covers everything at frame
            one), and the fade does the appearing instead of the translation. */}
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(200)}
          style={[styles.backdrop, { top: -viewportHeight }]}
        >
          <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={requestClose} />
        </Animated.View>
        <View
          accessibilityViewIsModal
          className="rounded-t-[34px] border border-border bg-card"
          style={{ height: sheetHeight, paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="items-center pt-3">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>

          <View className="min-h-[76px] flex-row items-center gap-3 px-5 pb-3 pt-3">
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
              <Text
                {...TEXT_FLEXIBLE}
                style={{
                  ...TYPE.display,
                  fontSize: 22,
                  lineHeight: 27,
                  fontFamily: FONT.bold,
                  color: colors.foreground,
                }}
              >
                {view === 'notifications' ? 'Mitteilungen' : 'Postfach'}
              </Text>
              {/* Deliberately a stable description, not a count. The old
                  "N wichtig oder neu" used a different formula than the badge
                  that led here, so the two numbers disagreed on the same screen. */}
              <Text
                {...TEXT_FLEXIBLE}
                className="mt-0.5"
                style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.mutedForeground }}
              >
                {view === 'notifications'
                  ? 'Aktuelles und Mitteilungen'
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
                <MitteilungenRow
                  count={mitteilungenCount}
                  preview={stackPreview}
                  onPress={openNotifications}
                />

                <View className="px-2">
                  <SectionLabel trailing={rooms.length ? `${rooms.length}` : undefined}>
                    Chats
                  </SectionLabel>
                </View>
                {rooms.length === 0 ? (
                  <View className="items-center px-6 py-12">
                    <View
                      className="mb-4 h-16 w-16 items-center justify-center rounded-[24px]"
                      style={{ backgroundColor: colorWithAlpha(ACCENT, 0.09) }}
                    >
                      <Ionicons name="chatbubbles-outline" size={27} color={ACCENT} />
                    </View>
                    <Text
                      {...TEXT_FLEXIBLE}
                      className="text-center"
                      style={{ ...TYPE.body, fontFamily: FONT.bold, color: colors.foreground }}
                    >
                      Noch keine Chats
                    </Text>
                    <Text
                      {...TEXT_FLEXIBLE}
                      className="mt-2 max-w-[280px] text-center"
                      style={{
                        ...TYPE.label,
                        fontFamily: FONT.medium,
                        color: colors.mutedForeground,
                      }}
                    >
                      Tritt einer Activity bei. Der zugehörige Chat erscheint dann hier.
                    </Text>
                  </View>
                ) : (
                  <View className="gap-0.5">
                    {rooms.map((room) => (
                      <ChatRow
                        key={room.id}
                        room={room}
                        onPress={(target) => onOpenChat(chatTarget(target))}
                        onEdit={
                          room.kind === 'activity' &&
                          room.activity.hostId === currentUid &&
                          onEditActivity
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
                  {hasLiveItems ? <SectionLabel>Jetzt wichtig</SectionLabel> : null}
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
                        {notificationGroups.map((group) =>
                          group.primary.kind === 'group_chat_invite' ? (
                            <GroupInviteCard
                              key={group.id}
                              group={group}
                              isNew={isGroupNew(group)}
                              onRespond={respondToGroupInvite}
                            />
                          ) : (
                            <NotificationCard
                              key={group.id}
                              group={group}
                              isNew={isGroupNew(group)}
                              onOpenActivity={onOpenActivity}
                              onOpenSafety={onOpenSafety}
                          onOpenSpontaneousRoundInvite={onOpenSpontaneousRoundInvite}
                          onOpenTimePlan={onOpenTimePlan}
                          timePlanJoiningId={timePlanJoiningId}
                              safetyAvailable={Boolean(
                                group.primary.safetyOwnerUid &&
                                (activeSafetyOwnerUids.has(group.primary.safetyOwnerUid) ||
                                  ownSafetySession?.uid === group.primary.safetyOwnerUid),
                              )}
                            />
                          ),
                        )}
                      </View>
                    </View>
                  ) : null}

                  {isLoading ? (
                    <View className="items-center px-8 py-12">
                      <TogetherLoader size={44} tile />
                      <Text
                        {...TEXT_FLEXIBLE}
                        className="mt-4"
                        style={{ ...TYPE.label, fontFamily: FONT.bold, color: colors.foreground }}
                      >
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
                      <Text
                        {...TEXT_FLEXIBLE}
                        className="text-center"
                        style={{ ...TYPE.label, fontFamily: FONT.bold, color: colors.foreground }}
                      >
                        Abgleich nicht möglich
                      </Text>
                      <Text
                        {...TEXT_FLEXIBLE}
                        className="mt-1 text-center"
                        style={{
                          ...TYPE.label,
                          fontFamily: FONT.medium,
                          color: colors.mutedForeground,
                        }}
                      >
                        {listError}
                      </Text>
                      {/* Dev/staging only: the Firestore code IS the diagnosis
                          (permission-denied vs unavailable vs failed-precondition
                          are three unrelated bugs behind one German sentence).
                          Never shown in production — it is noise to a real user. */}
                      {DIAGNOSTICS_VISIBLE && listErrorCode ? (
                        <Text
                          {...TEXT_FLEXIBLE}
                          className="mt-2 text-center"
                          style={{
                            ...TYPE.micro,
                            fontFamily: FONT.medium,
                            color: colors.mutedForeground,
                            opacity: 0.7,
                          }}
                        >
                          {listErrorCode}
                        </Text>
                      ) : null}
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
                  ) : notificationsEmpty ? (
                    // A real empty state. Reaching Mitteilungen with nothing in
                    // them is a normal, expected outcome now that the entry is
                    // always there — it must look intentional, not broken.
                    <View className="items-center px-8 py-14">
                      <View
                        className="mb-4 h-16 w-16 items-center justify-center rounded-[24px]"
                        style={{ backgroundColor: colorWithAlpha(SUCCESS, 0.12) }}
                      >
                        <Ionicons name="checkmark-done" size={28} color={SUCCESS} />
                      </View>
                      <Text
                        {...TEXT_FLEXIBLE}
                        className="text-center"
                        style={{ ...TYPE.body, fontFamily: FONT.bold, color: colors.foreground }}
                      >
                        Keine Mitteilungen
                      </Text>
                      <Text
                        {...TEXT_FLEXIBLE}
                        className="mt-2 max-w-[280px] text-center"
                        style={{
                          ...TYPE.label,
                          fontFamily: FONT.medium,
                          color: colors.mutedForeground,
                        }}
                      >
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
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    // `top` is set inline to -viewportHeight; see the comment at the call site.
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
    minHeight: 88,
    overflow: 'hidden',
    padding: 16,
    shadowOffset: { width: 0, height: 9 },
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
