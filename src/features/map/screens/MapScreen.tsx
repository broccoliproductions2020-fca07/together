import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import {
  ActivityComposerSheet,
  useActivityEntities,
  type ActivityDraft,
  type ActivityInfo,
  type SelectedPlace,
} from '@/features/activities';
import { useAuth } from '@/features/auth';
import {
  ActivityChatView,
  useActivityChatActivity,
  type GroupMember,
  type GroupOpening,
} from '@/features/chat';
import {
  isJourneyAutoShareResponse,
  useJourney,
  type JourneyParticipant,
} from '@/features/journey';
import { useFriends } from '@/features/friends';
import { PostfachSheet } from '@/features/mailbox';
import { usePushNudge } from '@/features/notifications';
import { claimNotificationResponse } from '@/features/notifications/notificationResponse';
import {
  MapOverlay,
  MarkerDetailSheet,
  NearbySheet,
  SpontaneousRoundSheet,
} from '@/features/overlay';
import { presenceToNearby, useOpenStatus } from '@/features/presence';
import {
  deriveCompanionSignal,
  getSafetySplitPanelHeight,
  SafetyCompanionSheet,
  SafetyStartSheet,
  SafetyStatusPill,
  useSafety,
} from '@/features/safety';
import { useNearbyRadius } from '@/features/settings';
import { haptics } from '@/shared/utils/haptics';
import {
  requestForegroundLocationPermission,
  showLocationPermissionAlert,
} from '@/shared/utils/locationPermission';

import { MapCanvas } from '../components/MapCanvas';
import { MapLocationPickerOverlay } from '../components/MapLocationPickerOverlay';
import { useMapLocationPicker } from '../hooks/useMapLocationPicker';
import type {
  ActivityMode,
  ActivitySelectionPreview,
  MapCoordinate,
  MapSelection,
} from '../types/map.types';
import {
  clusterToJourneyContext,
  coordinateFromSelection,
  infoToActivityPreview,
  markerToJourneyContext,
  openNativeMaps,
  placeSelectionToComposerPlace,
  placeToSelection,
  previewToJourneyContext,
} from '../utils/mapSelection';
import { selectFriendsWithoutLocation, selectNearbyFriends } from '../utils/nearbySelectors';

export interface MapScreenProps {
  /** MainSurface keeps map layers mounted for transitions; this tells the
   * presence seam whether the map is actually visible to the user. */
  active?: boolean;
  editActivityRequest?: { requestId: number; activityId: string };
  onEditActivityRequestHandled?: (requestId: number) => void;
  onLocationPickerActiveChange?: (active: boolean) => void;
  /** The activity/place detail is rendered inline over the map so marker taps
   * can switch directly. Let the parent retract its global mode switch while
   * that sheet owns the lower edge. */
  onDetailSheetVisibleChange?: (visible: boolean) => void;
  /** Opens the calendar surface (top-bar calendar button; calendar is not in the mode pill). */
  onOpenCalendar?: () => void;
}

interface AcquireOwnLocationOptions {
  /** Show the OS permission dialog if it has never been answered. */
  prompt?: boolean;
  /** Explicit user actions may ask a second time after an earlier denial —
   * Android still shows the dialog, iOS does not and reports `canAskAgain:
   * false`. Background acquisition must never do this: it would re-nag on
   * every map visit. */
  repromptAfterDenial?: boolean;
  isCancelled?: () => boolean;
}

/** `granted` is reported separately: "no coordinate" means a denied permission
 * OR a permission that is fine but has not produced a fix yet, and those two
 * need different answers on an explicit "Zentrieren" tap. */
interface OwnLocationResult {
  coordinate: MapCoordinate | null;
  granted: boolean;
}

/**
 * Map-first screen. The map fills the entire screen and every control floats
 * absolutely above it via `MapOverlay`; there is no bottom bar, panel or dark
 * container below the map.
 */
export function MapScreen({
  active = true,
  editActivityRequest,
  onEditActivityRequestHandled,
  onLocationPickerActiveChange,
  onDetailSheetVisibleChange,
  onOpenCalendar,
}: MapScreenProps) {
  const { height: viewportHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const currentUid = user?.id ?? 'u_you';
  const { radiusKm } = useNearbyRadius();
  const {
    isJoined,
    joinActivity,
    leaveRoom,
    getGroup,
    markProposalPlanned,
    joinOpenGroup,
    spontaneousRound,
    setRoundSurfaceActive,
    startSpontaneousRound,
    acceptSpontaneousRound,
    leaveSpontaneousRound,
    getUnreadCount,
  } = useActivityChatActivity();
  const {
    markerToSelection,
    clusterToSelection,
    findActivityById,
    createActivityFromDraft,
    getEditableDraft,
    updateActivityFromDraft,
    joinActivity: joinActivityParticipants,
    cancelActivity: cancelActivityEntity,
    leaveActivity: leaveActivityEntity,
    mapMarkers,
    markerClusters,
  } = useActivityEntities();
  const { activeJourney, getActivityJourneys, getJourneySummary } = useJourney();
  const { journeyRemindersEnabled, friends: friendProfiles } = useFriends();
  const { maybeAskForPush } = usePushNudge();
  const {
    friendSessions,
    mapFocusRequest,
    clearMapFocusRequest,
    heimwegFocusActive,
    session: ownSafetySession,
    consoleMinimized,
    setConsoleMinimized,
    startingHeimweg,
  } = useSafety();
  const mapLocationPicker = useMapLocationPicker({
    onActiveChange: onLocationPickerActiveChange,
  });
  const safetySplitPanelHeight =
    ownSafetySession && friendSessions.length > 0 && !consoleMinimized && !startingHeimweg
      ? getSafetySplitPanelHeight(viewportHeight)
      : 0;
  const [companionSheetVisible, setCompanionSheetVisible] = useState(false);
  const [selectedSafetyUid, setSelectedSafetyUid] = useState<string>();
  const [safetyStartVisible, setSafetyStartVisible] = useState(false);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [journeyJoinPromptActivityId, setJourneyJoinPromptActivityId] = useState<string>();
  const [journeyFocus, setJourneyFocus] = useState<{
    activity: ActivitySelectionPreview;
    participantId?: string;
  } | null>(null);
  const [nearbySheetVisible, setNearbySheetVisible] = useState(false);
  const [postfachVisible, setPostfachVisible] = useState(false);
  const [chatActivity, setChatActivity] = useState<ActivityInfo | null>(null);
  const [roundSheetVisible, setRoundSheetVisible] = useState(false);
  // Pill count is radius-based and viewport-independent — it does NOT change when
  // the user zooms or pans the map. See nearbySelectors.ts for the rationale.
  // The list comes from the signed-in user's live presence subscription.
  const {
    isOpen,
    goOpen,
    shareLocation,
    openFriends,
    setFriendPresenceListening,
    close: closeOpenStatus,
  } = useOpenStatus();

  useEffect(() => {
    setFriendPresenceListening(active && nearbySheetVisible);
    return () => setFriendPresenceListening(false);
  }, [active, nearbySheetVisible, setFriendPresenceListening]);

  useEffect(() => {
    setRoundSurfaceActive(active);
    return () => setRoundSurfaceActive(false);
  }, [active, setRoundSurfaceActive]);
  const [myLocation, setMyLocation] = useState<MapCoordinate | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const realNearby = useMemo(
    () => presenceToNearby(openFriends, myLocation),
    [openFriends, myLocation],
  );
  // Both go through nearbySelectors — the filtering rule must never be
  // re-implemented here (see nearbySelectors.ts).
  const nearbyFriends = selectNearbyFriends(realNearby, radiusKm);
  const friendsWithoutLocation = selectFriendsWithoutLocation(realNearby);
  // An empty "In deiner Nähe" section has three different causes with three
  // different fixes — the sheet must never give radius advice to someone whose
  // real problem is an empty friend list (or that simply nobody is open).
  const nearbyEmptyReason: 'no-friends' | 'none-open' | 'out-of-range' | 'quiet' =
    friendProfiles.length === 0
      ? 'no-friends'
      : openFriends.length === 0
        ? 'none-open'
        : realNearby.some((friend) => typeof friend.distanceKm === 'number')
          ? 'out-of-range'
          : 'quiet';
  const [composerMode, setComposerMode] = useState<ActivityMode>('now');
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerPlace, setComposerPlace] = useState<SelectedPlace | undefined>();
  const [composerTitle, setComposerTitle] = useState<string | undefined>();
  const [composerActivityId, setComposerActivityId] = useState<string | undefined>();
  const [editingActivityId, setEditingActivityId] = useState<string | undefined>();
  const [composerInitialDraft, setComposerInitialDraft] = useState<ActivityDraft | undefined>();
  const [mapFocusCoordinate, setMapFocusCoordinate] = useState<MapCoordinate | undefined>();
  // Id of a just-published marker playing the "Wurf & Pop" launch. The canvas
  // hides the real marker and throws in an animated copy until it settles.
  const [launchMarkerId, setLaunchMarkerId] = useState<string>();
  const [selectionFocus, setSelectionFocus] = useState<{
    id: number;
    coordinate: MapCoordinate;
  }>();
  const [safetyMarkerFocus, setSafetyMarkerFocus] = useState<{
    id: number;
    coordinate: MapCoordinate;
  }>();
  const [safetyFitRequest, setSafetyFitRequest] = useState<{
    id: number;
    coordinates: MapCoordinate[];
  }>();
  const safetyFitSequenceRef = useRef(0);
  /** One-shot: the camera follows the first location fix, never a later one. */
  const didCenterOnOwnLocationRef = useRef(false);
  const selectionFocusSequenceRef = useRef(0);
  const safetyMarkerFocusSequenceRef = useRef(0);
  const wasHeimwegFocusActiveRef = useRef(false);
  const [safetyNow, setSafetyNow] = useState(() => Date.now());

  const openActivityEditor = useCallback(
    (activityId: string) => {
      const draft = getEditableDraft(activityId);
      if (!draft) return false;

      setSelection(null);
      setPostfachVisible(false);
      setChatActivity(null);
      setComposerActivityId(undefined);
      setEditingActivityId(activityId);
      setComposerInitialDraft(draft);
      setComposerMode(draft.mode);
      setComposerPlace(draft.place);
      setComposerTitle(draft.title);
      setComposerVisible(true);
      return true;
    },
    [getEditableDraft],
  );

  useEffect(() => {
    if (!active || !editActivityRequest) return;
    const opened = openActivityEditor(editActivityRequest.activityId);
    onEditActivityRequestHandled?.(editActivityRequest.requestId);
    if (!opened) {
      Alert.alert(
        'Bearbeiten nicht möglich',
        'Die Aktivität ist nicht mehr aktiv oder du bist nicht ihr Host.',
      );
    }
  }, [active, editActivityRequest, onEditActivityRequestHandled, openActivityEditor]);

  useEffect(() => {
    onDetailSheetVisibleChange?.(Boolean(selection));
  }, [onDetailSheetVisibleChange, selection]);

  useEffect(
    () => () => {
      onDetailSheetVisibleChange?.(false);
    },
    [onDetailSheetVisibleChange],
  );

  useEffect(() => {
    if (mapLocationPicker.active || heimwegFocusActive) return;
    const coordinate = coordinateFromSelection(selection);
    if (!coordinate) return;
    selectionFocusSequenceRef.current += 1;
    setSelectionFocus({ id: selectionFocusSequenceRef.current, coordinate });
  }, [heimwegFocusActive, mapLocationPicker.active, selection]);

  useEffect(() => {
    // Staleness only matters while the dedicated Heimweg focus is visible.
    // Keeping this clock alive behind the normal map caused a full map render
    // every 15 seconds even though no safety marker was on screen.
    if (!heimwegFocusActive || !friendSessions.length) return;
    setSafetyNow(Date.now());
    const timer = setInterval(() => setSafetyNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [heimwegFocusActive, friendSessions.length]);

  // Friends' running Heimwege as status-colored map markers. They are passed
  // to the canvas only while the dedicated Heimweg focus is active.
  const heimwegMarkers = useMemo(
    () =>
      friendSessions
        .filter((heimweg) => heimweg.location)
        .map((heimweg) => {
          const signal = deriveCompanionSignal(heimweg, safetyNow);
          // The map is the triage surface: a stale position must be readable
          // AS stale right on the marker ("die UI zeigt immer 'Letztes Update
          // vor …'", docs/safety-mode.md) — not only inside the sheet.
          const staleMinutes =
            signal === 'data_gap'
              ? Math.max(1, Math.floor((safetyNow - heimweg.updatedAt) / 60_000))
              : undefined;
          return {
            uid: heimweg.uid,
            displayName: heimweg.displayName,
            initials: heimweg.initials,
            coordinate: {
              latitude: heimweg.location!.lat,
              longitude: heimweg.location!.lng,
            },
            color:
              signal === 'help' || signal === 'no_response'
                ? '#FF5A5A'
                : signal === 'unwell' || signal === 'data_gap' || signal === 'timed_out'
                  ? '#E0A23E'
                  : '#6E8BF7',
            subLabel: staleMinutes ? `vor ${staleMinutes} Min.` : undefined,
          };
        }),
    [friendSessions, safetyNow],
  );

  // Entering the Heimweg-Fokus opens directly on a single shared walk. With
  // several simultaneous walks the map frames all of them instead. This only
  // happens on entry so companions can pan freely while they are watching.
  // Deliberately only on the rising edge: while watching, the user may pan
  // freely without the camera snapping back on every location tick.
  useEffect(() => {
    if (!heimwegFocusActive) {
      wasHeimwegFocusActiveRef.current = false;
      return;
    }
    if (wasHeimwegFocusActiveRef.current) return;
    // Triage on entry: with several walks the camera frames the most severe
    // tier only (red/no-response before unwell before blue) — the person in
    // trouble must never share the frame with three calm blue walks. The
    // others stay reachable via manual recenter.
    const now = Date.now();
    const severityOf = (item: (typeof friendSessions)[number]) => {
      const signal = deriveCompanionSignal(item, now);
      return signal === 'help' || signal === 'no_response' ? 2 : signal === 'unwell' ? 1 : 0;
    };
    const located = friendSessions.filter((item) => item.location);
    const topSeverity = located.reduce((max, item) => Math.max(max, severityOf(item)), 0);
    const coordinates = located
      .filter((item) => severityOf(item) === topSeverity)
      .map((item) => ({ latitude: item.location!.lat, longitude: item.location!.lng }));
    // Keep waiting if the first live point arrives shortly after the focus.
    // Marking the entry as handled too early would leave the camera behind.
    if (!coordinates.length) return;
    wasHeimwegFocusActiveRef.current = true;
    if (coordinates.length === 1) {
      setMapFocusCoordinate(coordinates[0]);
      setSafetyFitRequest(undefined);
      return;
    }
    setMapFocusCoordinate(undefined);
    safetyFitSequenceRef.current += 1;
    setSafetyFitRequest({ id: safetyFitSequenceRef.current, coordinates });
  }, [friendSessions, heimwegFocusActive]);

  // "Auf Karte zeigen" from the safety console / nearby rows.
  useEffect(() => {
    if (!mapFocusRequest) return;
    setMapFocusCoordinate({ latitude: mapFocusRequest.lat, longitude: mapFocusRequest.lng });
    clearMapFocusRequest();
  }, [mapFocusRequest, clearMapFocusRequest]);
  const selectedPlace = selection?.type === 'Place' ? selection : null;
  const selectedActivity =
    selection?.type === 'Avatar' || selection?.type === 'Cluster' ? selection : null;
  const selectedActivityJoined = selectedActivity ? isJoined(selectedActivity.id) : false;
  const canEditSelectedActivity = Boolean(
    selectedActivity && selectedActivity.hostId && selectedActivity.hostId === currentUid,
  );

  useEffect(() => {
    if (journeyJoinPromptActivityId && selectedActivity?.id !== journeyJoinPromptActivityId) {
      setJourneyJoinPromptActivityId(undefined);
    }
  }, [journeyJoinPromptActivityId, selectedActivity?.id]);

  // Once joined, show the current user in the detail sheet immediately while
  // the live document catches up. If it already lists them, leave it unchanged.
  const displayedSelection = useMemo(() => {
    if (
      !selection ||
      (selection.type !== 'Avatar' && selection.type !== 'Cluster') ||
      !selectedActivityJoined ||
      selection.participants.some((participant) => participant.userId === currentUid)
    ) {
      return selection;
    }
    return {
      ...selection,
      participantCount: selection.participantCount + 1,
      participants: [
        ...selection.participants,
        {
          userId: currentUid,
          displayName: user?.displayName ?? 'Du',
          initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
        },
      ],
    };
  }, [selection, selectedActivityJoined, currentUid, user?.displayName]);
  // Firebase maintains a location-free count in the existing activity feed on
  // journey start, arrival and stop. The map therefore needs no RTDB listener
  // for every marker.
  const journeyUnderwayCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    mapMarkers.forEach((marker) => {
      if (!isJoined(marker.id)) return;
      const underwayCount = Math.max(
        marker.journeyUnderwayCount ?? 0,
        getJourneySummary(markerToJourneyContext(marker)).underwayCount,
      );
      if (underwayCount > 0) counts[marker.id] = underwayCount;
    });
    markerClusters.forEach((cluster) => {
      if (!isJoined(cluster.id)) return;
      const underwayCount = Math.max(
        cluster.journeyUnderwayCount ?? 0,
        getJourneySummary(clusterToJourneyContext(cluster)).underwayCount,
      );
      if (underwayCount > 0) counts[cluster.id] = underwayCount;
    });
    return counts;
  }, [getJourneySummary, isJoined, mapMarkers, markerClusters]);
  const journeyFocusParticipants = useMemo(
    () => (journeyFocus ? getActivityJourneys(previewToJourneyContext(journeyFocus.activity)) : []),
    [getActivityJourneys, journeyFocus],
  );
  const journeyFocusLabel = useMemo(() => {
    if (!journeyFocus) return undefined;

    if (journeyFocus.participantId) {
      const participant = journeyFocusParticipants.find(
        (item) => item.userId === journeyFocus.participantId,
      );
      if (participant) {
        return `${journeyFocus.activity.title} · ${
          participant.isCurrentUser ? 'Du' : participant.displayName
        } ${participant.status === 'arrived' ? 'angekommen' : 'unterwegs'}`;
      }
    }

    const underwayCount = journeyFocusParticipants.filter(
      (participant) => participant.status === 'underway',
    ).length;
    return `${journeyFocus.activity.title} · ${underwayCount} unterwegs`;
  }, [journeyFocus, journeyFocusParticipants]);
  const activeJourneyLabel =
    activeJourney && !journeyFocus
      ? activeJourney.status === 'armed'
        ? `Anreise vorbereitet · ${activeJourney.title}`
        : `Du teilst · ${activeJourney.title}`
      : undefined;

  const openActivityById = useCallback(
    (activityId: string) => {
      const activity = findActivityById(activityId);
      if (!activity) return false;
      const preview = infoToActivityPreview(activity);
      setSelection({
        type: 'Avatar',
        hostName: preview.participants[0]?.displayName ?? 'Activity',
        ...preview,
      });
      return true;
    },
    [findActivityById],
  );

  const routeNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (
        !response ||
        isJourneyAutoShareResponse(response) ||
        !claimNotificationResponse('map', response)
      ) {
        return;
      }
      const data = response.notification.request.content.data;
      const kind = typeof data?.kind === 'string' ? data.kind : undefined;
      const activityId = typeof data?.activityId === 'string' ? data.activityId : undefined;
      const roomId = typeof data?.roomId === 'string' ? data.roomId : undefined;

      if (kind === 'friend_request') {
        setPostfachVisible(true);
        return;
      }

      if (kind?.startsWith('safety_')) {
        const ownerUid = typeof data?.safetyOwnerUid === 'string' ? data.safetyOwnerUid : undefined;
        const friendSession = ownerUid
          ? friendSessions.find((session) => session.uid === ownerUid)
          : undefined;
        if (friendSession) {
          setSelectedSafetyUid(friendSession.uid);
          setCompanionSheetVisible(true);
        } else if (ownSafetySession && (!ownerUid || ownSafetySession.uid === ownerUid)) {
          setConsoleMinimized(false);
        } else {
          setPostfachVisible(true);
        }
        return;
      }

      if (kind === 'chat_message') {
        const activity = activityId
          ? findActivityById(activityId)
          : roomId
            ? findActivityById(roomId)
            : null;
        setPostfachVisible(true);
        if (activity) setChatActivity(activity);
        return;
      }

      if (activityId && openActivityById(activityId)) return;
      setPostfachVisible(true);
    },
    [findActivityById, friendSessions, openActivityById, ownSafetySession, setConsoleMinimized],
  );
  const notificationResponseRouterRef = useRef(routeNotificationResponse);
  notificationResponseRouterRef.current = routeNotificationResponse;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      notificationResponseRouterRef.current(response),
    );
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => notificationResponseRouterRef.current(response))
      .catch(() => {});
    return () => subscription.remove();
  }, []);

  // ONE shared acquisition path for the camera AND distance ranking, so
  // "Zentrieren" can never disagree with what the map shows. The map is the
  // moment the OS permission prompt appears; a denial is surfaced via the
  // NearbySheet hint instead of silently rendering "0 offen" with no
  // explanation.
  const acquireOwnLocation = useCallback(
    async ({
      prompt = false,
      repromptAfterDenial = false,
      isCancelled = () => false,
    }: AcquireOwnLocationOptions = {}): Promise<OwnLocationResult> => {
      let permission = await Location.getForegroundPermissionsAsync();
      const mayAsk =
        permission.status === Location.PermissionStatus.UNDETERMINED ||
        (repromptAfterDenial && permission.canAskAgain);
      if (prompt && mayAsk) {
        // Shared request so every surface treats a denial the same way.
        await requestForegroundLocationPermission();
        permission = await Location.getForegroundPermissionsAsync();
      }
      if (isCancelled()) return { coordinate: null, granted: false };
      setLocationDenied(permission.status === Location.PermissionStatus.DENIED);
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        return { coordinate: null, granted: false };
      }

      const result: OwnLocationResult = { coordinate: null, granted: true };
      const publish = (coords: { latitude: number; longitude: number }) => {
        const own = { latitude: coords.latitude, longitude: coords.longitude };
        result.coordinate = own;
        setMyLocation(own);
        // Point the camera at the person ONCE, on the first fix. Without this
        // the map kept the DEFAULT_MAP_REGION (Berlin) forever even with
        // permission granted — the position was fetched for distance ranking
        // only and never reached the camera. Guarded by a ref so a later, more
        // accurate fix can never yank the map out from under someone who has
        // already started panning.
        if (!didCenterOnOwnLocationRef.current) {
          didCenterOnOwnLocationRef.current = true;
          setMapFocusCoordinate(own);
        }
      };

      // Take the OS's CACHED position first. `getCurrentPositionAsync` waits
      // for a fresh fix at the requested accuracy, which indoors or on a first
      // launch can take minutes — and until it returns, `myLocation` is null,
      // so the map AND the recenter button both fall back to Berlin. The
      // cached fix is normally seconds old and good enough to open the map on
      // the right city; the live fixes below then refine it silently.
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (isCancelled()) return result;
        if (last) publish(last.coords);
      } catch {
        // No cached fix — fall through to the live ones below.
      }
      // Coarse fix NEXT. `Accuracy.Low` (~1 km) resolves from wifi/cell in a
      // second or two, while `Balanced` waits for a GPS-grade fix that indoors
      // can take minutes. A kilometre of error is invisible at city zoom, so
      // this opens the map in the right place immediately and the accurate
      // pass below then corrects it for distance ranking.
      try {
        const coarse = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        if (isCancelled()) return result;
        publish(coarse.coords);
      } catch {
        // Fall through to the accurate request.
      }
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (isCancelled()) return result;
        publish(pos.coords);
      } catch {
        // No fix → friends who share still appear, just under "Ohne Näheangabe".
      }
      return result;
    },
    [],
  );

  // Runs as soon as the map is on screen — NOT only while the NearbySheet is
  // open. Gating this on the sheet meant anyone who never opened the sheet kept
  // `myLocation === null` forever, so the map sat on the Berlin fallback and
  // "Zentrieren" zoomed into Berlin. It re-runs when the sheet opens to refresh
  // the distance ranking; the camera stays put thanks to the one-shot ref.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void acquireOwnLocation({ prompt: true, isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [acquireOwnLocation, active, nearbySheetVisible, shareLocation]);

  const handleOpenPresencePress = useCallback(() => {
    if (!isOpen) goOpen();
    setNearbySheetVisible(true);
  }, [goOpen, isOpen]);

  function openComposer(
    mode: ActivityMode,
    place?: SelectedPlace,
    title?: string,
    activityId?: string,
  ) {
    setComposerMode(mode);
    setComposerPlace(place);
    setComposerTitle(title);
    setComposerActivityId(activityId);
    setComposerVisible(true);
  }

  async function handleStartSpontaneousRound(members: GroupMember[]) {
    try {
      await startSpontaneousRound(members);
      closeOpenStatus();
      setNearbySheetVisible(false);
      setRoundSheetVisible(true);
      haptics.success();
    } catch (error) {
      haptics.warning();
      Alert.alert(
        'Winken nicht moeglich',
        error instanceof Error ? error.message : 'Bitte versuche es gleich noch einmal.',
      );
      throw error;
    }
  }

  async function handleAcceptSpontaneousRound(roundId: string) {
    try {
      await acceptSpontaneousRound(roundId);
      // The server already deleted the remote presence in the same
      // transaction. Closing local persistence prevents it being published
      // again by the OpenStatus write-through effect.
      closeOpenStatus();
      setPostfachVisible(false);
      setRoundSheetVisible(true);
      haptics.success();
    } catch (error) {
      haptics.warning();
      Alert.alert(
        'Beitritt nicht moeglich',
        error instanceof Error ? error.message : 'Bitte versuche es gleich noch einmal.',
      );
    }
  }

  function openSpontaneousRoundChat() {
    if (!spontaneousRound || spontaneousRound.memberIds.length < 2) return;
    setRoundSheetVisible(false);
    setChatActivity({
      id: spontaneousRound.id,
      title: 'Spontane Runde',
      mode: 'open',
      participantCount: spontaneousRound.memberIds.length,
      participants: spontaneousRound.memberPreview.map((member) => ({
        userId: member.uid,
        displayName: member.displayName,
        initials: member.initials,
        avatarUrl: member.avatarUrl,
      })),
    });
  }

  // "Dazustoßen" on a joinable planning group: server re-checks audience and
  // capacity; on success we land directly in the group chat.
  async function handleJoinOpening(opening: GroupOpening) {
    try {
      await joinOpenGroup(opening.id);
    } catch (error) {
      Alert.alert(
        'Dazustoßen nicht möglich',
        error instanceof Error ? error.message : 'Bitte versuche es gleich noch einmal.',
      );
      return;
    }
    setNearbySheetVisible(false);
    setChatActivity({
      id: opening.id,
      title: opening.title,
      mode: 'open',
      participantCount: opening.memberCount + 1,
      participants: opening.memberPreview.map((member, index) => ({
        userId: `${opening.id}-member-${index}`,
        displayName: member.displayName,
        initials: member.initials,
      })),
    });
  }

  // A chat proposal pre-fills the composer. The submit action creates the
  // activity and the proposal is marked as planned.
  function createActivityFromProposal(
    roomId: string,
    messageId: string,
    proposal: { what?: string; where?: string },
  ) {
    markProposalPlanned(roomId, messageId);
    setPostfachVisible(false);
    setChatActivity(null);
    setSelection(null);
    const place: SelectedPlace | undefined = proposal.where
      ? { id: `proposal-${messageId}`, name: proposal.where, source: 'map' }
      : undefined;
    openComposer('soon', place, proposal.what, roomId);
  }

  // Direct "Aktivität erstellen" from the chat header — no proposal needed.
  // Prefills the composer with the group's vibe (if any); the chat room stays.
  function createActivityFromChat(roomId: string) {
    const vibe = getGroup(roomId)?.vibe;
    setPostfachVisible(false);
    setChatActivity(null);
    openComposer('soon', undefined, vibe, roomId);
  }

  // After creating: close the composer and land back on the map with the new
  // pin — do NOT jump into the (empty) chat; it stays reachable via the pin
  // and "Deine Aktivitäten".
  async function submitComposer(draft: ActivityDraft) {
    if (editingActivityId) {
      await updateActivityFromDraft(editingActivityId, draft);
      haptics.success();
      setComposerVisible(false);
      setEditingActivityId(undefined);
      setComposerInitialDraft(undefined);
      setComposerTitle(undefined);
      setComposerPlace(undefined);
      return;
    }

    const activity = createActivityFromDraft(draft, composerActivityId);

    // "Wurf & Pop": recentre on the new pin and throw the marker in from where
    // the composer sat. Only when we actually have a map pin (coordinates) — a
    // location-less activity has no marker to launch. Skipped under reduced motion.
    const launchLat = draft.place?.latitude;
    const launchLng = draft.place?.longitude;
    if (!reducedMotion && launchLat != null && launchLng != null) {
      setMapFocusCoordinate({ latitude: launchLat, longitude: launchLng });
      setLaunchMarkerId(activity.id);
      // Safety net: if the marker is filtered out (e.g. a full activity) the
      // overlay never runs and never reports completion — never leave the real
      // marker hidden. Clear the launch id after the animation's worst case.
      setTimeout(() => {
        setLaunchMarkerId((current) => (current === activity.id ? undefined : current));
      }, 2000);
    }

    // Optimistic success buzz, matching the optimistic marker throw.
    haptics.success();

    void activity.ready
      .then(() => {
        joinActivity(activity.id, {
          title: draft.title?.trim() || 'Activity',
          startsAt: draft.startsAt,
          endsAt: draft.endsAt,
        });
      })
      .catch((error: unknown) => {
        const detail =
          error instanceof Error && error.message
            ? error.message
            : 'Bitte versuche es gleich noch einmal.';
        console.warn('[activity] create failed:', error);
        haptics.warning();
        Alert.alert('Activity konnte nicht erstellt werden', detail);
      });
    setComposerVisible(false);
    setComposerActivityId(undefined);
    setComposerTitle(undefined);
    setComposerPlace(undefined);
  }

  // Host-only correction path: reopens the composer prefilled with the
  // activity's current data so a typo in name/time/place can be fixed later.
  function editSelectedActivity() {
    if (!selectedActivity) return;
    if (!openActivityEditor(selectedActivity.id)) {
      Alert.alert(
        'Bearbeiten nicht möglich',
        'Die Aktivität ist nicht mehr aktiv oder du bist nicht ihr Host.',
      );
    }
  }

  function openComposerFromSelection() {
    if (selectedPlace) {
      setSelection(null);
      openComposer('soon', placeSelectionToComposerPlace(selectedPlace));
      return;
    }

    openComposer('soon');
  }

  async function joinSelectedActivity() {
    if (!selectedActivity) return;
    const activity = selectedActivity;
    try {
      // Membership is authoritative. A chat is opened only after the activity
      // join succeeded, so a full or inaccessible activity never grants chat
      // access through a race between the two writes.
      const joined = await joinActivityParticipants(activity.id);
      if (!joined) {
        haptics.warning();
        Alert.alert('Activity voll', 'Leider ist in dieser Activity kein Platz mehr frei.');
        return;
      }
      joinActivity(activity.id, {
        title: activity.title,
        startsAt: activity.startsAt,
        endsAt: activity.endsAt,
      });
      haptics.success();
      void maybeAskForPush();
      const startsAt = activity.startsAt ? Date.parse(activity.startsAt) : NaN;
      const activityHasStarted =
        activity.mode === 'now' || (Number.isFinite(startsAt) && startsAt <= Date.now());
      if (activityHasStarted && journeyRemindersEnabled) {
        setJourneyJoinPromptActivityId(activity.id);
      }
    } catch {
      haptics.warning();
      Alert.alert('Beitritt nicht möglich', 'Bitte versuche es gleich noch einmal.');
    }
  }

  function leaveSelectedActivity() {
    if (!selectedActivity) return;
    const activityId = selectedActivity.id;
    Alert.alert(
      'Activity verlassen?',
      'Du kannst später erneut beitreten, solange noch Plätze frei sind.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Verlassen',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const left = await leaveActivityEntity(activityId);
                if (!left) {
                  Alert.alert('Nicht möglich', 'Als Host kannst du die Activity nur absagen.');
                  return;
                }
                leaveRoom(activityId);
                setSelection(null);
              } catch {
                Alert.alert('Verlassen fehlgeschlagen', 'Bitte versuche es gleich noch einmal.');
              }
            })();
          },
        },
      ],
    );
  }

  function cancelSelectedActivity() {
    if (!selectedActivity) return;
    const activityId = selectedActivity.id;
    Alert.alert(
      'Activity absagen?',
      'Die Activity verschwindet aus der Karte und kann nicht wieder aktiviert werden.',
      [
        { text: 'Weiter bearbeiten', style: 'cancel' },
        {
          text: 'Absagen',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await cancelActivityEntity(activityId);
                setSelection(null);
              } catch (error) {
                Alert.alert(
                  'Absagen fehlgeschlagen',
                  error instanceof Error ? error.message : 'Bitte versuche es gleich noch einmal.',
                );
              }
            })();
          },
        },
      ],
    );
  }

  function focusJourneyParticipant(
    activity: ActivitySelectionPreview,
    participantId?: string,
    participants: JourneyParticipant[] = getActivityJourneys(previewToJourneyContext(activity)),
  ) {
    const participant = participantId
      ? participants.find((item) => item.userId === participantId)
      : undefined;

    setJourneyFocus({ activity, participantId });
    setSelection(null);
    setMapFocusCoordinate(participant?.coordinate ?? activity.targetCoordinate);
  }

  function focusActiveJourney() {
    if (!activeJourney) return;

    const info = findActivityById(activeJourney.activityId);
    const activity = info
      ? infoToActivityPreview(info)
      : ({
          id: activeJourney.activityId,
          title: activeJourney.title,
          subtitle: 'Aktive Anreise',
          mode: 'soon',
          participantCount: 1,
          participants: [
            {
              userId: currentUid,
              displayName: user?.displayName ?? 'Du',
              initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
            },
          ],
          targetCoordinate: activeJourney.targetCoordinate,
          endsAt: activeJourney.endsAt,
        } satisfies ActivitySelectionPreview);

    focusJourneyParticipant(activity);
  }

  function focusJourneyMarker(participant: JourneyParticipant) {
    if (!journeyFocus) return;

    focusJourneyParticipant(journeyFocus.activity, participant.userId, journeyFocusParticipants);
  }

  function recenterMap() {
    setSelection(null);
    if (heimwegFocusActive) {
      const coordinates = friendSessions.flatMap((item) =>
        item.location ? [{ latitude: item.location.lat, longitude: item.location.lng }] : [],
      );
      if (coordinates.length) {
        safetyFitSequenceRef.current += 1;
        setSafetyFitRequest({ id: safetyFitSequenceRef.current, coordinates });
      }
      return;
    }
    // "Zentrieren" means the person, not the country — so it must NEVER fly to
    // the Berlin fallback. A fresh object every time on purpose: the canvas
    // animates on `focusCoordinate` identity, so re-using the `myLocation`
    // reference made a second press (after panning away) a silent no-op.
    if (myLocation) {
      setMapFocusCoordinate({ ...myLocation });
      return;
    }
    // No fix yet: ask for one NOW instead of moving the camera somewhere wrong.
    void (async () => {
      const { coordinate, granted } = await acquireOwnLocation({
        prompt: true,
        repromptAfterDenial: true,
      });
      if (coordinate) {
        setMapFocusCoordinate({ ...coordinate });
        return;
      }
      // An explicit tap must never end in silence — say why nothing happened.
      if (!granted) {
        showLocationPermissionAlert();
        return;
      }
      Alert.alert(
        'Standort noch nicht gefunden',
        'Dein Gerät konnte gerade keine Position bestimmen. Versuch es gleich noch einmal.',
      );
    })();
  }

  function openMapPicker(
    mode: ActivityMode,
    onPick: (place: SelectedPlace) => void,
    options: { focusCurrentLocation?: boolean } = {},
  ) {
    setSelection(null);
    mapLocationPicker.open(mode, onPick, options);
  }

  // The map search bar is a real entry point, not a decorative placeholder:
  // search results use the same picker as activity locations and then open the
  // place detail sheet so the user can navigate or create an activity there.
  function openPlaceSearch() {
    openMapPicker(
      'soon',
      (place) => {
        if (place.latitude == null || place.longitude == null) return;
        const coordinate = { latitude: place.latitude, longitude: place.longitude };
        setMapFocusCoordinate(coordinate);
        setSelection({
          type: 'Place',
          title: place.name,
          subtitle:
            place.address ??
            `Koordinate: ${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`,
          coordinate,
          placeId: place.id,
          source: 'poi',
        });
      },
      { focusCurrentLocation: false },
    );
  }

  return (
    <View style={{ flex: 1 }} className="bg-background">
      <MapCanvas
        currentUser={{
          userId: currentUid,
          displayName: user?.displayName ?? 'Du',
          initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
        }}
        focusCoordinate={
          mapLocationPicker.active ? mapLocationPicker.focusCoordinate : mapFocusCoordinate
        }
        launchMarkerId={launchMarkerId}
        onLaunchComplete={() => setLaunchMarkerId(undefined)}
        selectionFocus={heimwegFocusActive ? safetyMarkerFocus : selectionFocus}
        fitRequest={heimwegFocusActive ? safetyFitRequest : undefined}
        bottomOverlayHeight={safetySplitPanelHeight}
        journeyFocus={
          journeyFocus
            ? { activityId: journeyFocus.activity.id, participantId: journeyFocus.participantId }
            : undefined
        }
        journeyTargetCoordinate={journeyFocus?.activity.targetCoordinate}
        journeyParticipants={journeyFocusParticipants}
        heimwegMarkers={heimwegFocusActive ? heimwegMarkers : undefined}
        onHeimwegMarkerPress={(uid) => {
          const safetySession = friendSessions.find((item) => item.uid === uid);
          if (safetySession?.location) {
            safetyMarkerFocusSequenceRef.current += 1;
            setSafetyMarkerFocus({
              id: safetyMarkerFocusSequenceRef.current,
              coordinate: {
                latitude: safetySession.location.lat,
                longitude: safetySession.location.lng,
              },
            });
          }
          setSelectedSafetyUid(uid);
          setCompanionSheetVisible(true);
        }}
        hideActivities={heimwegFocusActive}
        journeyUnderwayCounts={journeyUnderwayCounts}
        selectedActivityId={
          selection?.type === 'Avatar' || selection?.type === 'Cluster' ? selection.id : undefined
        }
        pickingLocation={mapLocationPicker.active}
        onJourneyParticipantPress={focusJourneyMarker}
        onCanvasPress={() => {
          if (mapLocationPicker.active) return;
          setSelection(null);
        }}
        // The normal map never needs its viewport in React state. Wiring this
        // callback unconditionally made every completed pan/zoom rebuild the
        // full MapScreen and all marker descriptors.
        onRegionChange={
          mapLocationPicker.active
            ? (region) =>
                mapLocationPicker.updateCenter({
                  latitude: region.latitude,
                  longitude: region.longitude,
                })
            : undefined
        }
        onClusterPress={(cluster) => {
          if (mapLocationPicker.active || heimwegFocusActive) return;
          setSelection(clusterToSelection(cluster));
        }}
        onMarkerPress={(marker) => {
          if (mapLocationPicker.active || heimwegFocusActive) return;
          setSelection(markerToSelection(marker));
        }}
        onPlacePress={async (place) => {
          if (heimwegFocusActive) return;
          if (mapLocationPicker.active) {
            mapLocationPicker.selectMapPlace(place);
            return;
          }
          setSelection(await placeToSelection(place));
        }}
      />

      {mapLocationPicker.active ? (
        <MapLocationPickerOverlay
          coordinate={mapLocationPicker.coordinate}
          currentLocationLoading={mapLocationPicker.currentLocationLoading}
          loading={mapLocationPicker.resolving}
          searchLoading={mapLocationPicker.searchLoading}
          showSearchAttribution
          mode={mapLocationPicker.mode}
          searchQuery={mapLocationPicker.searchQuery}
          searchResults={mapLocationPicker.searchResults}
          selectedPlaceCandidate={mapLocationPicker.selectedPlaceCandidate}
          onCancel={mapLocationPicker.cancel}
          onConfirm={mapLocationPicker.confirm}
          onSearchQueryChange={mapLocationPicker.updateSearchQuery}
          onSearchSubmit={mapLocationPicker.submitSearch}
          onSelectSearchResult={mapLocationPicker.selectSearchResult}
          onUseCurrentLocation={mapLocationPicker.focusCurrentLocation}
        />
      ) : (
        <>
          <MapOverlay
            isOpen={isOpen}
            journeyFocusLabel={journeyFocusLabel}
            journeyParticipants={journeyFocusParticipants}
            activeJourneyLabel={activeJourneyLabel}
            onCreatePress={() => openComposer('now')}
            onSearchPress={openPlaceSearch}
            onRecenter={recenterMap}
            onNearbyPress={handleOpenPresencePress}
            onPostfachPress={() => setPostfachVisible(true)}
            onCalendarPress={() => onOpenCalendar?.()}
            spontaneousRound={spontaneousRound}
            spontaneousRoundUnreadCount={spontaneousRound ? getUnreadCount(spontaneousRound.id) : 0}
            onSpontaneousRoundPress={() => setRoundSheetVisible(true)}
            onClearJourneyFocus={() => setJourneyFocus(null)}
            onJourneyParticipantPress={(participantId) => {
              if (!journeyFocus) return;
              focusJourneyParticipant(
                journeyFocus.activity,
                participantId,
                journeyFocusParticipants,
              );
            }}
            onActiveJourneyPress={focusActiveJourney}
          />

          <SafetyStatusPill />

          <NearbySheet
            visible={nearbySheetVisible}
            friends={nearbyFriends}
            friendsWithoutLocation={friendsWithoutLocation}
            emptyReason={nearbyEmptyReason}
            locationDenied={locationDenied}
            onAddFriends={() => {
              setNearbySheetVisible(false);
              router.push('/friends');
            }}
            onClose={() => setNearbySheetVisible(false)}
            onStartSpontaneousRound={handleStartSpontaneousRound}
            onJoinOpening={handleJoinOpening}
          />

          <SpontaneousRoundSheet
            visible={roundSheetVisible}
            round={spontaneousRound}
            currentUid={currentUid}
            unreadCount={spontaneousRound ? getUnreadCount(spontaneousRound.id) : 0}
            onClose={() => setRoundSheetVisible(false)}
            onOpenChat={openSpontaneousRoundChat}
            onPlanNow={() => {
              if (!spontaneousRound) return;
              setRoundSheetVisible(false);
              openComposer('now', undefined, 'Spontane Runde', spontaneousRound.id);
            }}
            onPlanSoon={() => {
              if (!spontaneousRound) return;
              setRoundSheetVisible(false);
              openComposer('soon', undefined, 'Spontane Runde', spontaneousRound.id);
            }}
            onLeave={async () => {
              if (!spontaneousRound) return;
              await leaveSpontaneousRound(spontaneousRound.id);
            }}
          />

          {/* Companion actions for a tapped Heimweg marker (Heimweg-Fokus). */}
          <SafetyCompanionSheet
            visible={companionSheetVisible}
            focusedUid={selectedSafetyUid}
            onClose={() => {
              setCompanionSheetVisible(false);
              setSelectedSafetyUid(undefined);
            }}
          />
          <SafetyStartSheet
            visible={safetyStartVisible}
            onClose={() => setSafetyStartVisible(false)}
          />

          <PostfachSheet
            visible={postfachVisible}
            covered={chatActivity !== null}
            onClose={() => setPostfachVisible(false)}
            onEditActivity={(activity) => {
              if (!openActivityEditor(activity.id)) {
                Alert.alert(
                  'Bearbeiten nicht möglich',
                  'Die Aktivität ist nicht mehr aktiv oder du bist nicht ihr Host.',
                );
              }
            }}
            onOpenChat={(activity) => {
              setChatActivity(activity);
            }}
            onOpenActivity={(activityId) => {
              if (openActivityById(activityId)) setPostfachVisible(false);
            }}
            onOpenSafety={(ownerUid) => {
              setPostfachVisible(false);
              const friendSession = ownerUid
                ? friendSessions.find((session) => session.uid === ownerUid)
                : undefined;
              if (friendSession) {
                setSelectedSafetyUid(friendSession.uid);
                setCompanionSheetVisible(true);
              } else if (ownSafetySession) {
                setConsoleMinimized(false);
              }
            }}
            onAcceptSpontaneousRound={handleAcceptSpontaneousRound}
          />

          <MarkerDetailSheet
            selection={displayedSelection}
            visible={Boolean(selection)}
            joined={selectedActivityJoined}
            canEdit={canEditSelectedActivity}
            onJoin={selectedActivity ? joinSelectedActivity : undefined}
            onEdit={canEditSelectedActivity ? editSelectedActivity : undefined}
            onLeave={
              selectedActivityJoined && !canEditSelectedActivity ? leaveSelectedActivity : undefined
            }
            onCancel={canEditSelectedActivity ? cancelSelectedActivity : undefined}
            onCreateAtSelection={openComposerFromSelection}
            onOpenInMaps={
              selectedPlace ? () => openNativeMaps(selectedPlace, 'details') : undefined
            }
            onStartRoute={selectedPlace ? () => openNativeMaps(selectedPlace, 'route') : undefined}
            onFocusJourney={
              selectedActivity
                ? (participantId) => focusJourneyParticipant(selectedActivity, participantId)
                : undefined
            }
            onCreateActivity={createActivityFromProposal}
            journeyJoinPrompt={
              Boolean(selectedActivity) && journeyJoinPromptActivityId === selectedActivity?.id
            }
            onDismissJourneyJoinPrompt={() => setJourneyJoinPromptActivityId(undefined)}
            onClose={() => {
              setJourneyJoinPromptActivityId(undefined);
              setSelection(null);
            }}
          />
        </>
      )}

      <ActivityComposerSheet
        initialMode={composerMode}
        initialPlace={composerPlace}
        initialTitle={composerTitle}
        initialDraft={composerInitialDraft}
        editing={Boolean(editingActivityId)}
        suspended={mapLocationPicker.active}
        visible={composerVisible}
        onClose={() => {
          setComposerVisible(false);
          setComposerActivityId(undefined);
          setEditingActivityId(undefined);
          setComposerInitialDraft(undefined);
        }}
        onOpenMapPicker={openMapPicker}
        onSubmit={submitComposer}
      />

      <Modal
        visible={chatActivity !== null}
        animationType="slide"
        onRequestClose={() => setChatActivity(null)}
      >
        {chatActivity ? (
          <ActivityChatView
            activityId={chatActivity.id}
            title={chatActivity.title}
            count={chatActivity.participantCount}
            onBack={() => setChatActivity(null)}
            onCreateActivity={createActivityFromProposal}
            onCreateActivityDirect={() => createActivityFromChat(chatActivity.id)}
          />
        ) : null}
      </Modal>
    </View>
  );
}
