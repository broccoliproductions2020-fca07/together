import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { activitySupportsJourney } from '@/features/activities';
import {
  ChatRoomInfoSheet,
  InlineActivityChat,
  InlineChatPreview,
  useActivityChat,
  type ProposalData,
} from '@/features/chat';
import {
  JourneyShareRow,
  useJourney,
  type JourneyActivityContext,
  type JourneyParticipant,
} from '@/features/journey';
import { colorWithAlpha, markerModeStyles } from '@/features/map/utils/markerStyles';
import { useThemeColors } from '@/features/theme';
import { PressableScale } from '@/shared/components/PressableScale';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

import { ActivityHeader } from './ActivityHeader';
import { MODE_COPY } from './constants';
import { PrimaryButton } from './PrimaryButton';
import type { ActivitySelection } from './types';

const JOURNEY_ENTRY_LEAD_MS = 60 * 60 * 1000;
const JOURNEY_HARD_MAX_MS = 2 * 60 * 60 * 1000;
const ACTIVITY_CLOCK_TICK_MS = 60_000;

/** Last moment at which starting an Anreise to this activity still means anything. */
function journeyEntryClosesAt(start: number, endsAt: string | undefined) {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  return Number.isFinite(end) ? end : start + JOURNEY_HARD_MAX_MS;
}

// The idle entry opens one hour before the start and stays available while the
// activity runs — a `now` activity you joined is exactly the case where you are
// still on your way AFTER the start time, and the entry remains available after
// manually stopping a shared Anreise.
function journeyEntryIsProminent(
  startsAt: string | undefined,
  endsAt: string | undefined,
  now: number,
) {
  if (!startsAt) return false;
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return false;
  return now >= start - JOURNEY_ENTRY_LEAD_MS && now < journeyEntryClosesAt(start, endsAt);
}

function activityToJourneyContext(activity: ActivitySelection): JourneyActivityContext {
  return {
    id: activity.id,
    title: activity.title,
    participants: activity.participants,
    targetCoordinate: activity.targetCoordinate,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
  };
}

function JourneyFocusShortcut({
  journeys,
  accent,
  onFocus,
}: {
  journeys: JourneyParticipant[];
  accent: string;
  onFocus?: () => void;
}) {
  const underwayCount = journeys.filter((journey) => journey.status === 'underway').length;
  if (!onFocus || underwayCount === 0) return null;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${underwayCount} unterwegs, Anreise auf Karte ansehen`}
      className="mt-4 min-h-12 flex-row items-center gap-3 rounded-2xl border px-3 active:opacity-80"
      haptic={false}
      style={{
        backgroundColor: colorWithAlpha(accent, 0.1),
        borderColor: colorWithAlpha(accent, 0.22),
      }}
      onPress={onFocus}
    >
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: colorWithAlpha(accent, 0.18) }}
      >
        <Ionicons name="navigate-outline" size={17} color={accent} />
      </View>
      <Text className="flex-1 text-sm font-bold text-foreground">{underwayCount} unterwegs</Text>
      <Text className="text-xs font-semibold" style={{ color: accent }}>
        Auf Karte
      </Text>
      <Ionicons name="chevron-forward" size={16} color={accent} />
    </PressableScale>
  );
}

function ParticipantSection({
  selection,
  compact = false,
  onOpen,
}: {
  selection: ActivitySelection;
  compact?: boolean;
  onOpen: () => void;
}) {
  const colors = useThemeColors();
  // More participants than the stack can show → 3 avatars + a "+N" chip, so
  // the overflow is visible in the stack itself instead of only in the text.
  const hasOverflow = selection.participantCount > 4;
  const shownParticipants = selection.participants.slice(0, hasOverflow ? 3 : 4);
  const overflowCount = selection.participantCount - shownParticipants.length;
  const countLabel = selection.maxParticipants
    ? `${selection.participantCount} von ${selection.maxParticipants} dabei`
    : `${selection.participantCount} dabei`;
  const visibleNames = selection.participants
    .slice(0, 3)
    .map((participant) => participant.displayName);
  const subtitle =
    selection.participantCount <= 3 && visibleNames.length === selection.participantCount
      ? visibleNames.join(', ')
      : `Alle ${selection.participantCount} Teilnehmer ansehen`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Teilnehmer ansehen, ${countLabel}`}
      className={`flex-row items-center gap-3 rounded-2xl border border-border bg-background/35 active:opacity-75 ${
        compact ? 'mt-3 min-h-12 px-3 py-2' : 'mt-4 min-h-16 px-3.5 py-2.5'
      }`}
      onPress={onOpen}
    >
      <View className="flex-row" style={{ minWidth: shownParticipants.length ? 40 : 0 }}>
        {shownParticipants.map((participant, index) => (
          <View
            key={participant.userId}
            className="h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-secondary"
            style={{
              marginLeft: index === 0 ? 0 : -10,
              zIndex: shownParticipants.length + 1 - index,
            }}
          >
            {participant.avatarUrl ? (
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: participant.avatarUrl }}
                className="h-full w-full"
              />
            ) : (
              <Text className="text-xs font-bold text-foreground">{participant.initials}</Text>
            )}
          </View>
        ))}
        {hasOverflow && overflowCount > 0 ? (
          <View
            className="h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-secondary"
            style={{ marginLeft: shownParticipants.length ? -10 : 0 }}
          >
            <Text className="text-[11px] font-bold text-muted-foreground">+{overflowCount}</Text>
          </View>
        ) : null}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-foreground">{countLabel}</Text>
        {compact ? null : (
          <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

function ActivityManagementActions({
  onLeave,
  onCancel,
  isHost = false,
}: {
  onLeave?: () => void;
  onCancel?: () => void;
  /** Only picks the leave action's label — a host hands the Activity on. */
  isHost?: boolean;
}) {
  const colors = useThemeColors();
  if (!onLeave && !onCancel) return null;

  return (
    <View className="mt-4 gap-2 border-t border-border pt-4">
      <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Activity verwalten
      </Text>
      {onLeave ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isHost ? 'Activity abgeben und verlassen' : 'Activity verlassen'}
          className="min-h-11 flex-row items-center justify-center gap-2 rounded-2xl bg-secondary px-4 active:opacity-70"
          onPress={onLeave}
        >
          <Ionicons name="exit-outline" size={17} color={colors.foreground} />
          <Text className="text-sm font-bold text-foreground">Activity verlassen</Text>
        </Pressable>
      ) : null}
      {onCancel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Activity absagen"
          className="min-h-11 flex-row items-center justify-center gap-2 rounded-2xl px-4 active:opacity-70"
          style={{ backgroundColor: `${colors.destructive}14` }}
          onPress={onCancel}
        >
          <Ionicons name="calendar-outline" size={17} color={colors.destructive} />
          <Text className="text-sm font-bold" style={{ color: colors.destructive }}>
            Activity absagen
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ActivityContent({
  selection,
  joined,
  joining = false,
  chatExpanded,
  canEdit,
  onJoin,
  onEdit,
  onStartRoute,
  onExpandChat,
  onCollapseChat,
  onOpenParticipants,
  onFocusJourney,
  onCreateActivity,
  onLeave,
  onCancel,
}: {
  selection: ActivitySelection;
  joined: boolean;
  joining?: boolean;
  chatExpanded: boolean;
  canEdit?: boolean;
  onJoin?: () => void;
  onEdit?: () => void;
  onStartRoute?: () => void;
  onExpandChat: () => void;
  onCollapseChat: () => void;
  onOpenParticipants: () => void;
  onFocusJourney?: (participantId?: string) => void;
  onCreateActivity?: (roomId: string, messageId: string, proposal: ProposalData) => void;
  onLeave?: () => void;
  onCancel?: () => void;
}) {
  const accent = markerModeStyles[selection.mode].color;
  const {
    activeJourney,
    getActivityJourneys,
    getActivityJourneyError,
    watchActivityJourney,
  } = useJourney();
  const [now, setNow] = useState(() => Date.now());
  // Chat info (members, admins) — the same sheet the full-screen chat opens,
  // so the inline chat is not a second-class surface.
  const [chatInfoOpen, setChatInfoOpen] = useState(false);
  useEffect(() => {
    setChatInfoOpen(false);
  }, [selection.id]);
  // Stream this room's messages as soon as it's shown here — not only once
  // the chat is expanded. Otherwise `getMessages` falls back to a 1-message
  // stub (the room summary's `lastMessage`) until the listener attaches, so
  // messages visible in the collapsed preview appear to "disappear" for a
  // frame when expanding into the full thread. Still only one room open at a
  // time (cost rule): this is the same activity the expanded thread would
  // open anyway.
  const { openRoom, closeRoom } = useActivityChat();
  useEffect(() => {
    if (!joined) return;
    openRoom(selection.id);
    return () => closeRoom(selection.id);
  }, [joined, selection.id, openRoom, closeRoom]);
  const journeyContext = useMemo(() => activityToJourneyContext(selection), [selection]);
  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    updateClock();

    const interval = setInterval(updateClock, ACTIVITY_CLOCK_TICK_MS);
    const start = selection.startsAt ? Date.parse(selection.startsAt) : NaN;
    const boundaryTimers = Number.isFinite(start)
      ? [start - JOURNEY_ENTRY_LEAD_MS, journeyEntryClosesAt(start, selection.endsAt)]
          .map((boundary) => boundary - Date.now())
          .filter((delay) => delay > 0 && delay <= 2_147_483_647)
          .map((delay) => setTimeout(updateClock, delay + 25))
      : [];

    return () => {
      clearInterval(interval);
      boundaryTimers.forEach(clearTimeout);
    };
  }, [selection.startsAt, selection.endsAt]);
  const journeySupported = activitySupportsJourney(
    selection.plannedMode,
    selection.targetCoordinate,
  );
  useEffect(() => {
    if (!joined || !journeySupported) return;
    return watchActivityJourney(journeyContext);
  }, [joined, journeySupported, journeyContext, watchActivityJourney]);
  const journeys = joined && journeySupported ? getActivityJourneys(journeyContext) : [];
  const armedJourney =
    activeJourney?.activityId === selection.id && activeJourney.status === 'armed'
      ? activeJourney
      : undefined;
  const journeyIdlePresentation = journeyEntryIsProminent(selection.startsAt, selection.endsAt, now)
    ? 'action'
    : 'hidden';
  const journeyFocusShortcut = (
    <JourneyFocusShortcut
      journeys={journeys}
      accent={SEMANTIC_COLOR.journey}
      onFocus={onFocusJourney ? () => onFocusJourney() : undefined}
    />
  );
  const participantSection = (
    <ParticipantSection selection={selection} onOpen={onOpenParticipants} />
  );
  // Joined + expanded → a dedicated chat surface inside the same sheet.
  // Flat messenger header (no nested card): back chevron + title + count.
  // Resizing happens on the sheet handle (drag / accessibility-adjustable),
  // so the header carries no extra chrome.
  if (joined && chatExpanded) {
    const participantLabel = selection.maxParticipants
      ? `${selection.participantCount}/${selection.maxParticipants} dabei`
      : `${selection.participantCount} dabei`;

    return (
      <View className="flex-1">
        <View className="flex-row items-center gap-1 pb-2 pr-12">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zurück zu den Activity-Details"
            className="-ml-2 h-10 w-10 items-center justify-center rounded-full active:opacity-60"
            onPress={onCollapseChat}
          >
            <Ionicons name="chevron-back" size={24} color={accent} />
          </Pressable>
          {/* Tapping the title opens the room info — the same "group info"
              affordance as the full-screen chat, so no feature disappears
              depending on where the chat was opened. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chat-Info öffnen"
            className="flex-1 active:opacity-70"
            onPress={() => setChatInfoOpen(true)}
          >
            <Text className="text-[16px] font-bold text-foreground" numberOfLines={1}>
              {selection.title}
            </Text>
            <View className="mt-0.5 flex-row items-center gap-1.5">
              <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
              <Text className="text-xs font-semibold text-muted-foreground">
                Activity-Chat · {participantLabel} · Info
              </Text>
            </View>
          </Pressable>
        </View>
        <View className="-mx-5 border-b border-border" />
        <InlineActivityChat
          activityId={selection.id}
          accent={accent}
          onCreateActivity={onCreateActivity}
        />
        <ChatRoomInfoSheet
          visible={chatInfoOpen}
          roomId={selection.id}
          accent={accent}
          fallbackTitle={selection.title}
          onClose={() => setChatInfoOpen(false)}
          onLeave={onCollapseChat}
        />
      </View>
    );
  }

  // Joined (collapsed) → info header + small chat preview that expands on tap.
  if (joined) {
    return (
      <>
        <ActivityHeader
          selection={selection}
          accent={accent}
          joined={joined}
          canEdit={canEdit}
          onEdit={onEdit}
          onStartRoute={onStartRoute}
        />
        {journeyFocusShortcut}
        {participantSection}
        {journeySupported ? (
          <JourneyShareRow
            activityId={selection.id}
            context={journeyContext}
            journeys={journeys}
            viewerError={getActivityJourneyError(selection.id)}
            armedJourney={armedJourney}
            idlePresentation={journeyIdlePresentation}
            onFocusParticipant={onFocusJourney}
          />
        ) : null}
        <View className="mt-4">
          <InlineChatPreview activityId={selection.id} accent={accent} onExpand={onExpandChat} />
        </View>
        <ActivityManagementActions onLeave={onLeave} onCancel={onCancel} isHost={canEdit} />
      </>
    );
  }

  // Not joined → full info + participant list + join CTA (blocked when full).
  const isFull =
    selection.maxParticipants != null && selection.participantCount >= selection.maxParticipants;

  return (
    <>
      <ActivityHeader
        selection={selection}
        accent={accent}
        joined={joined}
        canEdit={canEdit}
        onEdit={onEdit}
        onStartRoute={onStartRoute}
      />

      {/* 4. Participant list */}
      {participantSection}

      {/* 6. Join */}
      <View className="mt-5">
        {isFull ? (
          <View className="min-h-[54px] flex-row items-center justify-center gap-2 rounded-2xl bg-secondary px-5">
            <Ionicons name="lock-closed-outline" size={18} color={accent} />
            <Text className="text-base font-bold text-muted-foreground">
              Voll · max. {selection.maxParticipants} Teilnehmer
            </Text>
          </View>
        ) : (
          <PrimaryButton
            label={MODE_COPY[selection.mode].cta}
            icon="add"
            accent={accent}
            loading={joining}
            onPress={onJoin}
          />
        )}
      </View>
      <ActivityManagementActions onLeave={onLeave} onCancel={onCancel} isHost={canEdit} />
    </>
  );
}
