import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Linking, Modal, Platform, useWindowDimensions, View } from 'react-native';

import {
  ActivityComposerSheet,
  activitySupportsJourney,
  useActivityEntities,
  useFrequentPeople,
  writeFailureMessage,
  type ActivityDraft,
  type ActivityInfo,
  type SelectedPlace,
} from '@/features/activities';
import { useAuth } from '@/features/auth';
import {
  activityChatAccent,
  ActivityChatView,
  GROUP_CHAT_ACCENT,
  useActivityChatActivity,
  type GroupMember,
  type GroupOpening,
  type SpontaneousRoundInvitePreview,
} from '@/features/chat';
import {
  isJourneyDecisionResponse,
  useJourney,
  type JourneyActivityContext,
  type JourneyParticipant,
} from '@/features/journey';
import { useFriends } from '@/features/friends';
import { CalendarSheet } from '@/features/calendar';
import { PostfachSheet, type PostfachChatTarget } from '@/features/mailbox';
import { usePushNudge } from '@/features/notifications';
import { claimNotificationResponse } from '@/features/notifications/notificationResponse';
import {
  timePlanCreateInputFromDraft,
  timePlansToMapMarkers,
  timePlanningService,
  useInvitedTimePlans,
  type TimePlan,
  type TimePlanCreation,
  type TimePlanOfferGroup,
} from '@/features/time-planning';
import { type SheetOriginResolver } from '@/features/overlay/components/FloatingSheet';
import {
  MapOverlay,
  MarkerDetailSheet,
  NearbySheet,
  OpenStatusSheet,
  SpontaneousRoundInviteSheet,
  SpontaneousRoundSheet,
  type CoreJourneyIndicator,
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

import {
  ACTIVITY_MARKER_VISIBLE_ABOVE_ANCHOR,
  ACTIVITY_MARKER_VISIBLE_BELOW_ANCHOR,
} from '../components/activityMarkerLayout';
import type { MapCanvasHandle } from '../components/PreviewMapCanvas';
import { MapCanvas } from '../components/MapCanvas';
import { MapLocationPickerOverlay } from '../components/MapLocationPickerOverlay';
import { useMapBoot } from '../MapBootProvider';
import {
  useMapLocationPicker,
  type MapLocationPickerOpenOptions,
} from '../hooks/useMapLocationPicker';
import type {
  ActivityMode,
  ActivityStackItem,
  ActivitySelectionPreview,
  MapCoordinate,
  MapMarker,
  MapSelection,
} from '../types/map.types';
import {
  clusterToJourneyContext,
  coordinateFromSelection,
  infoToActivityPreview,
  markerToJourneyContext,
  openNativeMaps,
  openNativeMapsAt,
  placeSelectionToComposerPlace,
  placeToSelection,
  previewToJourneyContext,
} from '../utils/mapSelection';
import { focusPinShift, type FocusFrame } from '../utils/focusFraming';
import {
  selectFriendsWithoutLocation,
  selectNearbyFriends,
  selectOutsideRadiusCount,
} from '../utils/nearbySelectors';

const SERVER_ACTION_TIMEOUT_MS = 15_000;
const BOOT_LOCATION_REVEAL_DELAY_MS = 2_500;
const SELECTION_FOCUS_MEASUREMENT_SETTLE_MS = 32;
const SELECTION_FOCUS_DURATION_MS = 340;
/**
 * How far the selected pin must have drifted, in screen pixels, before a sheet
 * that grew after its first measurement earns a second camera move.
 *
 * A sheet reports its height as soon as it has one, and for anything that loads
 * asynchronously that first number describes a placeholder: a Terminfindung
 * reports its spinner (~130px of padding) and then grows past 1400px once the
 * windows arrive. Framing stayed calibrated for the spinner, so the pin the
 * sheet was opened for ended up under it — "often not even the centre".
 *
 * 24px because that is roughly a fingertip: below it the correction is smaller
 * than the thing being corrected, and a camera that twitches after every list
 * row settles is worse than one that is slightly off.
 */
const SELECTION_FOCUS_REFOCUS_SHIFT = 24;

function formatClock(timestamp: number) {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function waitForServerAction<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Die Verbindung antwortet gerade nicht.')),
      SERVER_ACTION_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export interface MapScreenProps {
  /** False only behind the boot curtain; the map is otherwise always the
   * visible surface. Tells the presence seam whether anyone can see it. */
  active?: boolean;
}

interface AcquireOwnLocationOptions {
  /** Show the OS permission dialog if it has never been answered. */
  prompt?: boolean;
  /** Explicit user actions may ask a second time after an earlier denial —
   * Android still shows the dialog, iOS does not and reports `canAskAgain:
   * false`. Background acquisition must never do this: it would re-nag on
   * every map visit. */
  repromptAfterDenial?: boolean;
  /** Boot prewarming owns the first camera move itself, after MapView is ready. */
  centerOnFirstFix?: boolean;
  onFirstCoordinate?: (coordinate: MapCoordinate) => void;
  isCancelled?: () => boolean;
}

/** `granted` is reported separately: "no coordinate" means a denied permission
 * OR a permission that is fine but has not produced a fix yet, and those two
 * need different answers on an explicit "Zentrieren" tap. */
interface OwnLocationResult {
  coordinate: MapCoordinate | null;
  granted: boolean;
}

const POI_RESULT_FOCUS = { latitudeDelta: 0.0025, longitudeDelta: 0.0022 };

const JOURNEY_IMMEDIATE_PROMPT_LEAD_MS = 60 * 60 * 1000;

function markerToStackItem(marker: MapMarker): ActivityStackItem {
  const participants = marker.avatars?.length
    ? marker.avatars
    : [
        {
          userId: marker.userId,
          displayName: marker.displayName,
          initials: marker.initials,
          avatarUrl: marker.avatarUrl,
        },
      ];
  return {
    id: marker.id,
    title: marker.title ?? marker.label ?? marker.displayName,
    mode: marker.mode,
    planning: marker.planning,
    timeLabel: marker.timeLabel,
    placeLabel: marker.placeLabel,
    participantCount: Math.max(marker.participantCount ?? 0, participants.length, 1),
    maxParticipants: marker.maxParticipants,
    participants,
  };
}

function timePlanSelection(planId: string, plans: TimePlan[]): MapSelection {
  const plan = plans.find((entry) => entry.id === planId);
  return {
    type: 'Planning',
    planId,
    title: plan?.title ?? 'Terminfindung',
    hostName: plan?.hostName ?? 'Jemand',
    ...(plan?.place?.label ? { placeLabel: plan.place.label } : {}),
    ...(plan?.place?.visibility === 'pin'
      ? { coordinate: { latitude: plan.place.latitude, longitude: plan.place.longitude } }
      : {}),
  };
}

function journeyCanStartNow(activity: JourneyActivityContext, now = Date.now()) {
  const startsAt = activity.startsAt ? Date.parse(activity.startsAt) : NaN;
  const target = activity.targetCoordinate;
  return (
    Number.isFinite(startsAt) &&
    startsAt <= now + JOURNEY_IMMEDIATE_PROMPT_LEAD_MS &&
    Number.isFinite(target?.latitude) &&
    Number.isFinite(target?.longitude)
  );
}

function journeyPromptBody(activity: JourneyActivityContext) {
  const startsAt = activity.startsAt ? Date.parse(activity.startsAt) : NaN;
  const minutesUntilStart = Number.isFinite(startsAt)
    ? Math.max(0, Math.round((startsAt - Date.now()) / 60_000))
    : 0;
  const timing =
    minutesUntilStart <= 1 ? 'beginnt jetzt' : `beginnt in ${minutesUntilStart} Minuten`;
  return `${activity.title} ${timing}. Dein Standort wird erst nach bestätigter Bewegung für die Teilnehmer sichtbar und am Ziel automatisch beendet.`;
}

/**
 * Map-first screen. The map fills the entire screen and every control floats
 * absolutely above it via `MapOverlay`; there is no bottom bar, panel or dark
 * container below the map.
 */
export function MapScreen({ active = true }: MapScreenProps) {
  const {
    initialLocationAttemptFinished,
    registerLocationPermissionRequest,
    reportMapRendererReady,
    reportLocationBootState,
  } = useMapBoot();
  const { height: viewportHeight } = useWindowDimensions();
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
    getSpontaneousRoundInvitePreview,
    declineSpontaneousRound,
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
    ownCoreActivity,
    nextOwnActivity,
  } = useActivityEntities();
  const {
    activeJourney,
    armJourney,
    getActivityJourneys,
    getActivityJourneyError,
    getJourneySummary,
    stopJourney,
    watchActivityJourney,
  } = useJourney();
  const {
    journeyRemindersEnabled,
    friends: friendProfiles,
    friendUids,
    closeFriendUids,
  } = useFriends();
  // On-device co-participation history — who you actually end up doing things
  // with. Feeds the nearby ranking only; it never leaves the phone.
  const frequentPeople = useFrequentPeople(friendUids);
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
  const mapLocationPicker = useMapLocationPicker({});
  const safetySplitPanelHeight =
    ownSafetySession && friendSessions.length > 0 && !consoleMinimized && !startingHeimweg
      ? getSafetySplitPanelHeight(viewportHeight)
      : 0;
  const [companionSheetVisible, setCompanionSheetVisible] = useState(false);
  const [selectedSafetyUid, setSelectedSafetyUid] = useState<string>();
  const [safetyStartVisible, setSafetyStartVisible] = useState(false);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  // A first location fix may arrive while a marker is being opened. Selection
  // wins that race: the person's deliberate tap must never be replaced by an
  // automatic focus on their own position.
  const selectionRef = useRef<MapSelection | null>(selection);
  selectionRef.current = selection;
  const [joiningActivityId, setJoiningActivityId] = useState<string | null>(null);
  const activityJoinRevisionRef = useRef(0);
  const activityJoinInFlightRef = useRef<string | null>(null);
  const selectedActivityIdRef = useRef<string | undefined>(undefined);
  const [journeyFocus, setJourneyFocus] = useState<{
    activity: ActivitySelectionPreview;
    participantId?: string;
  } | null>(null);
  const [nearbySheetVisible, setNearbySheetVisible] = useState(false);
  /** Your plans, as a card over the map — not a mode that replaces it. */
  const [calendarVisible, setCalendarVisible] = useState(false);
  /**
   * How to find the control the plans card was opened from. A REF, not state:
   * it is read inside an async resolver during the open and the close, and a
   * re-render in between must not hand the exit a different answer than the
   * entry got. The overlay stores a way to measure, never a measurement — the
   * card asks again when it leaves.
   */
  const calendarOriginRef = useRef<SheetOriginResolver | null>(null);
  /**
   * The pill the Nearby sheet morphs out of, and the single value both sides
   * of that morph run on: the sheet grows on it, the pill fades on its
   * inverse. Shared rather than signalled, so neither can be on screen without
   * the other having made room for it.
   */
  /** The core's own personal status sheet — your open window, not the friends list. */
  const [openStatusSheetVisible, setOpenStatusSheetVisible] = useState(false);
  const nearbyActionRevisionRef = useRef(0);
  const [postfachVisible, setPostfachVisible] = useState(false);
  // Only while the map surface is actually visible — same rule friend presence
  // follows. A round is map furniture and has no business listening from the
  // calendar or a Heimweg focus.
  const invitedTimePlans = useInvitedTimePlans(active);
  const planningMarkers = useMemo(
    () => timePlansToMapMarkers(invitedTimePlans),
    [invitedTimePlans],
  );
  // The open chat carries its resolved colour, so the same room looks the same
  // whether it was opened from the Postfach, a push, or the marker sheet.
  const [chatActivity, setChatActivity] = useState<PostfachChatTarget | null>(null);
  const [roundSheetVisible, setRoundSheetVisible] = useState(false);
  // Invitation confirmation. Held here rather than in the Postfach so the sheet
  // survives the Postfach closing on a successful join.
  const [inviteRoundId, setInviteRoundId] = useState<string>();
  const [invitePreview, setInvitePreview] = useState<SpontaneousRoundInvitePreview | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteJoining, setInviteJoining] = useState(false);
  /** Ticket for the in-flight preview call; only the newest may write state. */
  const invitePreviewRequestRef = useRef(0);
  /** Round id whose preview is currently in flight, so a repeat tap on the same
   * card is ignored instead of firing a second callable. */
  const invitePreviewPendingRef = useRef<string | null>(null);
  // Perspective view. Session-only by design: a tilted map is a momentary way
  // of looking at something, not a preference worth restoring days later.
  // Pill count is radius-based and viewport-independent — it does NOT change when
  // the user zooms or pans the map. See nearbySelectors.ts for the rationale.
  // The list comes from the signed-in user's live presence subscription.
  const {
    isOpen,
    expiresAt: openExpiresAt,
    goOpen,
    setExpiresAt: setOpenExpiresAt,
    openBlockedByActivity,
    shareLocation,
    openFriends,
    setFriendPresenceListening,
    close: closeOpenStatus,
  } = useOpenStatus();

  useEffect(() => {
    setFriendPresenceListening(active);
    return () => setFriendPresenceListening(false);
  }, [active, setFriendPresenceListening]);

  useEffect(() => {
    setRoundSurfaceActive(active);
    return () => setRoundSurfaceActive(false);
  }, [active, setRoundSurfaceActive]);
  const [myLocation, setMyLocation] = useState<MapCoordinate | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [locationBootstrapActive, setLocationBootstrapActive] = useState(false);
  const [mapRendererReady, setMapRendererReady] = useState(false);
  /**
   * The map's single exposed capability, forwarded to the detail sheet so its
   * card can grow out of the marker that was tapped. Nothing about the sheet
   * lives in the map; the map only answers where a coordinate currently is.
   */
  const mapCanvasRef = useRef<MapCanvasHandle | null>(null);
  const projectCoordinate = useCallback(
    async (coordinate: MapCoordinate) =>
      (await mapCanvasRef.current?.projectCoordinate(coordinate)) ?? null,
    [],
  );
  const realNearby = useMemo(
    () => presenceToNearby(openFriends, myLocation),
    [openFriends, myLocation],
  );
  /** Which open friend the Offen-Fenster should open on, set by a marker tap. */
  // Both go through nearbySelectors — the filtering AND ordering rules must
  // never be re-implemented here (see nearbySelectors.ts). The ranking context
  // is on-device only: who you have actually done things with, and who you
  // marked as close. No server call, no friend-graph query.
  const rankingContext = useMemo(
    () => ({ affinityUids: frequentPeople, closeFriendUids }),
    [frequentPeople, closeFriendUids],
  );
  const nearbyFriends = selectNearbyFriends(realNearby, radiusKm, rankingContext);
  const friendsWithoutLocation = selectFriendsWithoutLocation(realNearby, rankingContext);
  const outsideRadiusCount = selectOutsideRadiusCount(realNearby, radiusKm);
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
  const proposalToMarkRef = useRef<{ roomId: string; messageId: string } | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | undefined>();
  const [composerInitialDraft, setComposerInitialDraft] = useState<ActivityDraft | undefined>();
  const [mapFocusCoordinate, setMapFocusCoordinate] = useState<MapCoordinate | undefined>();
  const [recentering, setRecentering] = useState(false);
  const recenterRequestRevisionRef = useRef(0);
  // Whether that focus may change how far in the map is zoomed. Jumping to a
  // place the user was NOT looking at needs a prescribed zoom; recentring on
  // something they just placed themselves must not touch it.
  const [mapFocusKeepZoom, setMapFocusKeepZoom] = useState(false);
  const [mapFocusDuration, setMapFocusDuration] = useState(280);
  // Both halves of a camera request in one call — they must never drift apart,
  // and a stale `keepZoom` from an earlier focus would silently change how the
  // next one behaves.
  const focusMapOn = useCallback(
    (
      coordinate: MapCoordinate | undefined,
      options?: { keepZoom?: boolean; duration?: number },
    ) => {
      setMapFocusCoordinate(coordinate);
      setMapFocusKeepZoom(options?.keepZoom === true);
      setMapFocusDuration(options?.duration ?? 280);
    },
    [],
  );
  // Id of a just-published marker playing the "Wurf & Pop" launch. The canvas
  // hides the real marker and throws in an animated copy until it settles.
  const [launchMarkerId, setLaunchMarkerId] = useState<string>();
  const launchMarkerIdRef = useRef<string | undefined>(undefined);
  const launchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [detailSheetMeasurement, setDetailSheetMeasurement] = useState<{
    height: number;
    revision: number;
    selection: MapSelection | null;
  }>({ height: 0, revision: 0, selection: null });
  const detailSheetHeight =
    detailSheetMeasurement.selection === selection ? detailSheetMeasurement.height : 0;
  const [primaryTopOverlayHeight, setPrimaryTopOverlayHeight] = useState(0);
  const [safetyTopOverlayHeight, setSafetyTopOverlayHeight] = useState(0);
  const topOverlayHeight = Math.max(primaryTopOverlayHeight, safetyTopOverlayHeight);
  // Id of a just-cancelled marker playing its pop-off. Mirrors the launch id.
  const [dismissMarkerId, setDismissMarkerId] = useState<string>();
  const [dismissDetailImmediately, setDismissDetailImmediately] = useState(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** A reverse-geocoded POI answer may arrive after the user has already
   * picked something else. Only the newest place tap may open a detail sheet. */
  const placeSelectionRequestRef = useRef(0);

  useEffect(() => {
    // Selection can also change through navigation or a sheet action. Invalidate
    // an older reverse-geocoded POI answer in those cases as well.
    placeSelectionRequestRef.current += 1;
    if (selection) setDismissDetailImmediately(false);
  }, [selection]);
  const [selectionFocus, setSelectionFocus] = useState<{
    id: number;
    selection: MapSelection;
    coordinate: MapCoordinate;
    topCoveredHeight?: number;
    coveredHeight?: number;
    targetInsets?: { above: number; below: number };
    duration?: number;
    latitudeDelta?: number;
    longitudeDelta?: number;
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
  const initialLocationBootstrapStartedRef = useRef(false);
  const bootLocationAttemptRunningRef = useRef(false);
  const pendingBootFocusCoordinateRef = useRef<MapCoordinate | null>(null);
  const bootFocusCoordinateRef = useRef<MapCoordinate | null>(null);
  const bootLocationRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeOwnLocationReceivedRef = useRef(false);
  const selectionFocusSequenceRef = useRef(0);
  const selectionFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedSelectionRef = useRef<MapSelection | null>(null);
  /** Visible map frame the last selection focus was calculated for. */
  const focusedFrameRef = useRef<FocusFrame>({});
  /**
   * True once the user has moved the camera themselves since the last focus.
   * A re-focus corrects OUR framing; it must never pull someone back from a
   * place they panned to on purpose.
   */
  const userMovedMapSinceFocusRef = useRef(false);
  const safetyMarkerFocusSequenceRef = useRef(0);
  const wasHeimwegFocusActiveRef = useRef(false);
  const [safetyNow, setSafetyNow] = useState(() => Date.now());

  const finishInitialLocationBoot = useCallback(
    (state: 'camera-ready' | 'unavailable') => {
      if (!bootLocationAttemptRunningRef.current) return;
      bootLocationAttemptRunningRef.current = false;
      if (bootLocationRevealTimerRef.current) clearTimeout(bootLocationRevealTimerRef.current);
      bootLocationRevealTimerRef.current = null;
      setLocationBootstrapActive(false);

      if (state === 'unavailable') {
        didCenterOnOwnLocationRef.current = true;
        pendingBootFocusCoordinateRef.current = null;
        const bootFocus = bootFocusCoordinateRef.current;
        bootFocusCoordinateRef.current = null;
        if (bootFocus) {
          setMapFocusCoordinate((current) => (current === bootFocus ? undefined : current));
          setMapFocusKeepZoom(false);
        }
      } else {
        bootFocusCoordinateRef.current = null;
      }

      reportLocationBootState(state);
    },
    [reportLocationBootState],
  );

  const acceptInitialLocation = useCallback(
    (coordinate: MapCoordinate) => {
      setMyLocation(coordinate);
      if (!bootLocationAttemptRunningRef.current || didCenterOnOwnLocationRef.current) return;
      if (selectionRef.current) {
        finishInitialLocationBoot('camera-ready');
        return;
      }
      pendingBootFocusCoordinateRef.current = coordinate;
      if (!mapRendererReady) return;
      pendingBootFocusCoordinateRef.current = null;
      bootFocusCoordinateRef.current = coordinate;
      didCenterOnOwnLocationRef.current = true;
      focusMapOn(coordinate, { duration: 600 });
    },
    [finishInitialLocationBoot, focusMapOn, mapRendererReady],
  );

  const handleNativeOwnLocation = useCallback(
    (coordinate: MapCoordinate) => {
      if (nativeOwnLocationReceivedRef.current) return;
      nativeOwnLocationReceivedRef.current = true;
      acceptInitialLocation(coordinate);
    },
    [acceptInitialLocation],
  );

  useEffect(
    () => () => {
      bootLocationAttemptRunningRef.current = false;
      pendingBootFocusCoordinateRef.current = null;
      if (bootLocationRevealTimerRef.current) clearTimeout(bootLocationRevealTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const coordinate = pendingBootFocusCoordinateRef.current;
    if (!mapRendererReady || !coordinate || !bootLocationAttemptRunningRef.current) return;

    acceptInitialLocation(coordinate);
  }, [acceptInitialLocation, mapRendererReady]);

  const handleBootFocusComplete = useCallback(
    (coordinate: MapCoordinate) => {
      if (bootFocusCoordinateRef.current !== coordinate) return;
      finishInitialLocationBoot('camera-ready');
    },
    [finishInitialLocationBoot],
  );

  const openActivityEditor = useCallback(
    (activityId: string) => {
      const draft = getEditableDraft(activityId);
      if (!draft) return false;

      placeSelectionRequestRef.current += 1;
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

  const openComposer = useCallback(
    (mode: ActivityMode, place?: SelectedPlace, title?: string, activityId?: string) => {
      Keyboard.dismiss();
      setComposerMode(mode);
      setComposerPlace(place);
      setComposerTitle(title);
      setComposerActivityId(activityId);
      setComposerVisible(true);
    },
    [],
  );

  /**
   * Heimweg-Fokus owns the whole map. The calendar is a card ON that map, so it
   * has to step aside — it used to be a separate mode and the surface simply
   * rotated to the map instead.
   */
  useEffect(() => {
    if (heimwegFocusActive) setCalendarVisible(false);
  }, [heimwegFocusActive]);

  useEffect(() => {
    // Wait for the current sheet's resting height, then frame this selection.
    if (selectionFocusTimerRef.current) {
      clearTimeout(selectionFocusTimerRef.current);
      selectionFocusTimerRef.current = null;
    }
    if (!selection) {
      setSelectionFocus(undefined);
      focusedSelectionRef.current = null;
      focusedFrameRef.current = {};
      userMovedMapSinceFocusRef.current = false;
      return;
    }
    if (
      mapLocationPicker.active ||
      heimwegFocusActive ||
      detailSheetMeasurement.selection !== selection ||
      detailSheetMeasurement.height <= 0
    ) {
      return;
    }
    const coordinate = coordinateFromSelection(selection);
    if (!coordinate) return;
    const coveredHeight = detailSheetMeasurement.height;
    const firstFocus = focusedSelectionRef.current !== selection;
    const targetInsets =
      selection.type === 'Place'
        ? undefined
        : {
            above: ACTIVITY_MARKER_VISIBLE_ABOVE_ANCHOR,
            below: ACTIVITY_MARKER_VISIBLE_BELOW_ANCHOR,
          };
    const focusFrame: FocusFrame = {
      topCoveredHeight: topOverlayHeight,
      bottomCoveredHeight: coveredHeight,
      targetInsets,
    };
    /*
     * A selection is framed once when it opens — and framed AGAIN if the sheet
     * later turns out to cover something quite different from what it reported
     * first. The sheet keeps reporting (`onHeightChange` fires on every content
     * measurement); this used to drop every report after the first, which is
     * why an asynchronously-loading sheet left its own pin underneath itself.
     *
     * Two guards keep the second move from becoming a nuisance: it has to be
     * worth seeing (`SELECTION_FOCUS_REFOCUS_SHIFT`), and the camera has to
     * still be ours — one pan or pinch and the user owns it until they pick
     * something else.
     */
    if (!firstFocus) {
      if (userMovedMapSinceFocusRef.current) return;
      const shift = focusPinShift(focusedFrameRef.current, focusFrame, viewportHeight);
      if (shift < SELECTION_FOCUS_REFOCUS_SHIFT) return;
    }
    /*
     * The legibility floor is part of ARRIVING at a tapped POI, not of keeping
     * it framed: re-applying it would pull a camera the user has since zoomed
     * back out to a level they left on purpose.
     */
    const isPoiSelection = firstFocus && selection?.type === 'Place' && selection.source === 'poi';
    const measuredSelection = selection;
    selectionFocusTimerRef.current = setTimeout(() => {
      selectionFocusTimerRef.current = null;
      focusedSelectionRef.current = measuredSelection;
      focusedFrameRef.current = focusFrame;
      // The move about to happen is not the user's, so it must not count as one.
      userMovedMapSinceFocusRef.current = false;
      selectionFocusSequenceRef.current += 1;
      setSelectionFocus({
        id: selectionFocusSequenceRef.current,
        selection: measuredSelection,
        coordinate,
        topCoveredHeight: topOverlayHeight,
        coveredHeight,
        targetInsets,
        duration: SELECTION_FOCUS_DURATION_MS,
        ...(isPoiSelection ? POI_RESULT_FOCUS : {}),
      });
    }, SELECTION_FOCUS_MEASUREMENT_SETTLE_MS);
    return () => {
      if (!selectionFocusTimerRef.current) return;
      clearTimeout(selectionFocusTimerRef.current);
      selectionFocusTimerRef.current = null;
    };
  }, [
    detailSheetMeasurement,
    heimwegFocusActive,
    mapLocationPicker.active,
    selection,
    topOverlayHeight,
    viewportHeight,
  ]);

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
                  : '#3B82F6',
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
      focusMapOn(coordinates[0]);
      setSafetyFitRequest(undefined);
      return;
    }
    focusMapOn(undefined);
    safetyFitSequenceRef.current += 1;
    setSafetyFitRequest({ id: safetyFitSequenceRef.current, coordinates });
  }, [focusMapOn, friendSessions, heimwegFocusActive]);

  // "Auf Karte zeigen" from the safety console / nearby rows.
  useEffect(() => {
    if (!mapFocusRequest) return;
    focusMapOn({ latitude: mapFocusRequest.lat, longitude: mapFocusRequest.lng });
    clearMapFocusRequest();
  }, [focusMapOn, mapFocusRequest, clearMapFocusRequest]);
  const selectedPlace = selection?.type === 'Place' ? selection : null;
  const selectedActivitySnapshot =
    selection?.type === 'Avatar' || selection?.type === 'Cluster' ? selection : null;
  const selectedActivityInfo = selectedActivitySnapshot
    ? findActivityById(selectedActivitySnapshot.id)
    : null;
  const selectedActivity = useMemo(() => {
    if (!selectedActivitySnapshot || !selectedActivityInfo) return selectedActivitySnapshot;
    const preview = infoToActivityPreview(selectedActivityInfo);
    return selectedActivitySnapshot.type === 'Avatar'
      ? {
          type: 'Avatar' as const,
          hostName: preview.participants[0]?.displayName ?? selectedActivitySnapshot.hostName,
          ...preview,
        }
      : { type: 'Cluster' as const, ...preview };
  }, [selectedActivityInfo, selectedActivitySnapshot]);
  const selectedActivitySeenRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedActivitySnapshot) {
      selectedActivitySeenRef.current = undefined;
      return;
    }
    if (selectedActivityInfo) {
      selectedActivitySeenRef.current = selectedActivitySnapshot.id;
      return;
    }
    if (selectedActivitySeenRef.current !== selectedActivitySnapshot.id) return;
    selectedActivitySeenRef.current = undefined;
    setSelection(null);
    const ended =
      selectedActivitySnapshot.endsAt != null &&
      Date.parse(selectedActivitySnapshot.endsAt) <= Date.now();
    Alert.alert(
      ended ? 'Activity beendet' : 'Activity nicht mehr verfügbar',
      ended
        ? 'Die Activity ist inzwischen zu Ende.'
        : 'Die Activity wurde abgesagt oder ist für dich nicht mehr sichtbar.',
    );
  }, [selectedActivityInfo, selectedActivitySnapshot]);
  selectedActivityIdRef.current = selectedActivity?.id;
  const selectedActivityJoined = selectedActivity ? isJoined(selectedActivity.id) : false;
  // "Wie komme ich da hin?" is the same question for a place and for an
  // activity — both hand their coordinate to the OS maps app. An activity
  // without a pin (visibility `none`) has nothing to route to and gets nothing.
  const activityRouteTarget = selectedActivity?.targetCoordinate;
  const startRouteToSelection = useMemo(() => {
    if (selectedPlace) return () => openNativeMaps(selectedPlace, 'route');
    if (selectedActivity && activityRouteTarget) {
      const label = selectedActivity.placeLabel ?? selectedActivity.title;
      return () => openNativeMapsAt(activityRouteTarget, label, 'route');
    }
    return undefined;
  }, [activityRouteTarget, selectedActivity, selectedPlace]);
  const canEditSelectedActivity = Boolean(
    selectedActivity && selectedActivity.hostId && selectedActivity.hostId === currentUid,
  );
  // Who inherits when the host walks away: the longest-standing other
  // participant, which is what the callable picks too (participantUids[0] after
  // the removal). A host alone in their own Activity has nobody to hand it to —
  // there is no "leave" for them, only "absagen".
  const successorIfHostLeaves = canEditSelectedActivity
    ? selectedActivity?.participants.find((participant) => participant.userId !== currentUid)
    : undefined;

  const liveStackSelection = useMemo(() => {
    if (selection?.type !== 'ActivityStack') return null;
    const currentById = new Map(
      [...mapMarkers, ...planningMarkers].map((marker) => [marker.id, marker] as const),
    );
    return {
      ...selection,
      activities: selection.activities.flatMap((activity) => {
        const marker = currentById.get(activity.id);
        return marker ? [markerToStackItem(marker)] : [];
      }),
    };
  }, [mapMarkers, planningMarkers, selection]);

  useEffect(() => {
    if (selection?.type !== 'ActivityStack' || !liveStackSelection) return;
    if (liveStackSelection.activities.length === 0) {
      setSelection(null);
      return;
    }
    if (liveStackSelection.activities.length > 1) return;
    const remaining = [...mapMarkers, ...planningMarkers].find(
      (marker) => marker.id === liveStackSelection.activities[0].id,
    );
    if (!remaining) {
      setSelection(null);
      return;
    }
    setSelection(
      remaining.planning
        ? timePlanSelection(remaining.id, invitedTimePlans)
        : markerToSelection(remaining),
    );
  }, [
    invitedTimePlans,
    liveStackSelection,
    mapMarkers,
    markerToSelection,
    planningMarkers,
    selection,
  ]);

  // The detail is derived from the live entity. The only optimistic patch left
  // is the current user's face while the successful join snapshot is in flight.
  const displayedSelection = useMemo(() => {
    const current: MapSelection | null =
      selection?.type === 'ActivityStack'
        ? liveStackSelection
        : selectedActivitySnapshot
          ? selectedActivity
          : selection;
    if (
      !current ||
      (current.type !== 'Avatar' && current.type !== 'Cluster') ||
      !selectedActivityJoined ||
      current.participants.some((participant) => participant.userId === currentUid)
    ) {
      return current;
    }
    return {
      ...current,
      participantCount: current.participantCount + 1,
      participants: [
        ...current.participants,
        {
          userId: currentUid,
          displayName: user?.displayName ?? 'Du',
          initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
        },
      ],
    };
  }, [
    currentUid,
    liveStackSelection,
    selectedActivity,
    selectedActivityJoined,
    selectedActivitySnapshot,
    selection,
    user?.displayName,
  ]);
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
  const journeyFocusError = journeyFocus ? getActivityJourneyError(journeyFocus.activity.id) : null;
  useEffect(() => {
    if (!journeyFocus) return;
    return watchActivityJourney(previewToJourneyContext(journeyFocus.activity));
  }, [journeyFocus, watchActivityJourney]);
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
  // Suppressed during journey focus: that surface has its own focus pill, and
  // the Core would repeat what the screen is already entirely about.
  const coreJourney: CoreJourneyIndicator | null =
    activeJourney && !journeyFocus && activeJourney.status !== 'stopped'
      ? { title: activeJourney.title, status: activeJourney.status }
      : null;

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

  /**
   * Opening an activity that the feed may not know yet. Bounded retry — a
   * push can outrun the listener, and giving up silently after one lookup is
   * how a tapped notification does nothing at all.
   */
  const openActivityByIdRef = useRef<(id: string, onGiveUp: () => void) => void>(() => {});
  openActivityByIdRef.current = (activityId, onGiveUp) => {
    let attempt = 0;
    const tryOpen = () => {
      if (openActivityById(activityId)) return;
      attempt += 1;
      if (attempt >= 12) {
        onGiveUp();
        return;
      }
      setTimeout(tryOpen, 400);
    };
    tryOpen();
  };

  const routeNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (
        !response ||
        isJourneyDecisionResponse(response) ||
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
        const targetRoomId = activityId ?? roomId;
        const activity = targetRoomId ? findActivityById(targetRoomId) : null;
        setPostfachVisible(true);
        if (activity) {
          setChatActivity({
            id: activity.id,
            title: activity.title,
            accent: activityChatAccent(activity.mode),
            kind: 'activity',
            memberCount: activity.participantCount,
          });
        } else if (targetRoomId) {
          // A planning round has no activity entity. It is still a real room —
          // open it in the group colour instead of dropping the user in the
          // Postfach with no idea which chat the push was about.
          const group = getGroup(targetRoomId);
          if (group) {
            setChatActivity({
              id: group.id,
              title: group.title,
              accent: GROUP_CHAT_ACCENT,
              kind: 'group',
              memberCount: group.memberIds.length,
            });
          }
        }
        return;
      }

      if (activityId) {
        /**
         * A tap can arrive before the feed listener has answered — on a cold
         * start it usually does. Retry briefly instead of falling through.
         *
         * The Postfach fallback is only honest for a push that HAS an entry
         * there, and `activity_created` deliberately has none: it is push-only
         * so a large audience does not cost one durable write per person. Left
         * unhandled, tapping it would open an inbox that never mentions the
         * activity you tapped. Goes through the ref so a retry cannot fire a
         * stale `openActivityById` captured when this callback was created.
         */
        openActivityByIdRef.current(activityId, () => setPostfachVisible(true));
        return;
      }
      setPostfachVisible(true);
    },
    [findActivityById, friendSessions, getGroup, ownSafetySession, setConsoleMinimized],
  );
  const notificationResponseRouterRef = useRef(routeNotificationResponse);
  notificationResponseRouterRef.current = routeNotificationResponse;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      notificationResponseRouterRef.current(response);
      if (response && !isJourneyDecisionResponse(response)) {
        void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync()
      .then(handleResponse)
      .catch(() => {});
    return () => subscription.remove();
  }, []);

  // ONE shared acquisition path for the camera AND distance ranking, so
  // "Zentrieren" can never disagree with what the map shows. The map is the
  // explicit location action is the only moment an OS prompt may appear; a
  // denial is surfaced via the NearbySheet hint instead of silently rendering
  // "0 offen" with no explanation.
  const acquireOwnLocation = useCallback(
    async ({
      prompt = false,
      repromptAfterDenial = false,
      centerOnFirstFix = true,
      onFirstCoordinate,
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
      setLocationPermissionGranted(permission.status === Location.PermissionStatus.GRANTED);
      setLocationDenied(permission.status === Location.PermissionStatus.DENIED);
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        return { coordinate: null, granted: false };
      }

      const result: OwnLocationResult = { coordinate: null, granted: true };
      const publish = (coords: { latitude: number; longitude: number }) => {
        const own = { latitude: coords.latitude, longitude: coords.longitude };
        const isFirstCoordinate = result.coordinate === null;
        result.coordinate = own;
        setMyLocation(own);
        if (isFirstCoordinate) onFirstCoordinate?.(own);
        // Explicit location actions may focus once. Later fixes only refine
        // distance ranking and must never yank the map under a gesture.
        if (centerOnFirstFix && !didCenterOnOwnLocationRef.current) {
          didCenterOnOwnLocationRef.current = true;
          focusMapOn(own);
        }
      };

      // Take the OS's CACHED position first. `getCurrentPositionAsync` waits
      // for a fresh fix at the requested accuracy, which indoors or on a first
      // launch can take minutes. The cached fix is normally seconds old and
      // good enough to open an explicit action on the right city; live fixes
      // below then refine it silently.
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
    [focusMapOn],
  );

  // Prewarm only with an existing grant. The system dialog is reserved for the
  // explicit introduction above the map, never shown over the loading mark.
  const startInitialLocationBootstrap = useCallback(
    async (requestPermission: boolean) => {
      if (bootLocationAttemptRunningRef.current) return;
      bootLocationAttemptRunningRef.current = true;

      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        if (!requestPermission && permission.status === Location.PermissionStatus.UNDETERMINED) {
          bootLocationAttemptRunningRef.current = false;
          reportLocationBootState('needs-permission');
          return;
        }
        if (requestPermission && permission.status === Location.PermissionStatus.UNDETERMINED) {
          await requestForegroundLocationPermission();
          permission = await Location.getForegroundPermissionsAsync();
        }
      }

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationPermissionGranted(false);
        setLocationDenied(permission.status === Location.PermissionStatus.DENIED);
        finishInitialLocationBoot('unavailable');
        return;
      }

      setLocationPermissionGranted(true);
      setLocationBootstrapActive(true);
      reportLocationBootState('locating');
      bootLocationRevealTimerRef.current = setTimeout(() => {
        bootLocationRevealTimerRef.current = null;
        if (!bootLocationAttemptRunningRef.current || didCenterOnOwnLocationRef.current) return;
        setLocationBootstrapActive(false);
        reportLocationBootState('location-pending');
      }, BOOT_LOCATION_REVEAL_DELAY_MS);
      try {
        const cached = await Location.getLastKnownPositionAsync();
        if (cached && bootLocationAttemptRunningRef.current) {
          acceptInitialLocation({
            latitude: cached.coords.latitude,
            longitude: cached.coords.longitude,
          });
        }
      } catch {
        // The native map source below still obtains the first live position.
      }
    },
    [acceptInitialLocation, finishInitialLocationBoot, reportLocationBootState],
  );

  useEffect(() => {
    registerLocationPermissionRequest(() => {
      void startInitialLocationBootstrap(true).catch(() =>
        finishInitialLocationBoot('unavailable'),
      );
    });
    return () => registerLocationPermissionRequest(null);
  }, [finishInitialLocationBoot, registerLocationPermissionRequest, startInitialLocationBootstrap]);

  useEffect(() => {
    if (initialLocationBootstrapStartedRef.current) return;
    initialLocationBootstrapStartedRef.current = true;
    if (Platform.OS === 'web') {
      reportLocationBootState('unavailable');
      return;
    }
    void startInitialLocationBootstrap(false).catch(() => finishInitialLocationBoot('unavailable'));
  }, [finishInitialLocationBoot, reportLocationBootState, startInitialLocationBootstrap]);

  useEffect(() => {
    if (!active || !initialLocationAttemptFinished || (!nearbySheetVisible && !shareLocation)) {
      return;
    }
    let cancelled = false;
    void acquireOwnLocation({ prompt: false, isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [
    acquireOwnLocation,
    active,
    initialLocationAttemptFinished,
    nearbySheetVisible,
    shareLocation,
  ]);

  // Opens the friends list from the Core or the row inside the own-status sheet.
  const handleOpenPresencePress = useCallback(() => {
    setNearbySheetVisible(true);
  }, []);

  /**
   * The core's tap — and the ONE deliberate exception to the old
   * "goOpen has exactly one call site" rule.
   *
   * That rule existed because the surface which announced you used to be the
   * map pill, i.e. something a thumb could hit while panning. The core is the
   * opposite: a labelled, fixed personal control whose whole purpose is this
   * status, and its own gesture layer guarantees a drag or a hold can never
   * reach here (see TogetherCore — a touch past the tap slop, or one that
   * matured into the orbit, never calls `onTap`).
   *
   * Publishing first and refining after is the same order the OpenStatusCard
   * already used: every field is optional, so a form in front of "I have time"
   * would be friction in front of the one thing the app exists for. Going open
   * on the defaults requests NO location — `shareLocation` starts false, and
   * only the explicit toggle in the sheet asks the OS for a position.
   */
  const handleCoreStatusTap = useCallback(() => {
    if (!isOpen && !goOpen()) {
      const activityTitle = openBlockedByActivity?.title ?? 'Deine Activity';
      Alert.alert(
        'Offen gerade nicht möglich',
        `${activityTitle} läuft bereits oder beginnt gleich. Öffne den Plan, um ihn anzusehen.`,
      );
      return;
    }
    setOpenStatusSheetVisible(true);
  }, [goOpen, isOpen, openBlockedByActivity]);

  const constrainOpenForActivity = useCallback(
    (startsAt: string | undefined, title: string) => {
      if (!isOpen || !openExpiresAt || !startsAt) return;
      const start = Date.parse(startsAt);
      if (!Number.isFinite(start) || start >= openExpiresAt) return;
      if (start <= Date.now()) {
        closeOpenStatus();
        Alert.alert('Offen beendet', `„${title}“ läuft jetzt. Dein Offen-Status wurde beendet.`);
        return;
      }
      setOpenExpiresAt(start);
      Alert.alert(
        'Offen angepasst',
        `Du bist bis ${formatClock(start)} offen. Dann beginnt „${title}“.`,
      );
    },
    [closeOpenStatus, isOpen, openExpiresAt, setOpenExpiresAt],
  );

  function startTimePlan(draft: ActivityDraft, offers: TimePlanOfferGroup[]): TimePlanCreation {
    return timePlanningService.createTimePlan(
      { uid: currentUid },
      timePlanCreateInputFromDraft(draft, offers),
    );
  }

  /**
   * Opening an invitation must NOT join. Joining is answering, and answering
   * happens in the sheet — a tap here used to add the person as a member with
   * an empty availability, which is the one state the round cannot use.
   */
  /**
   * A freshly locked Activity exists on the server before the feed listener has
   * echoed it, so a single lookup finds nothing and the tap does nothing. Retry
   * briefly rather than swallow it.
   */
  function openActivityWhenKnown(activityId: string, attempt = 0) {
    if (openActivityById(activityId)) return;
    if (attempt >= 12) return;
    setTimeout(() => openActivityWhenKnown(activityId, attempt + 1), 400);
  }

  /**
   * A round opens the SAME detail sheet as anything else on the map. That is
   * the point: it is an ordinary selection, so it gets the ordinary container,
   * header and place row — only the time part differs.
   */
  function openTimePlan(planId: string) {
    setPostfachVisible(false);
    setSelection(timePlanSelection(planId, invitedTimePlans));
  }

  function closeNearbySheet() {
    nearbyActionRevisionRef.current += 1;
    setNearbySheetVisible(false);
  }

  async function handleStartSpontaneousRound(members: GroupMember[]): Promise<boolean> {
    const requestRevision = ++nearbyActionRevisionRef.current;
    try {
      await waitForServerAction(startSpontaneousRound(members));
      closeOpenStatus();
      if (requestRevision !== nearbyActionRevisionRef.current) return false;
      setNearbySheetVisible(false);
      setRoundSheetVisible(true);
      haptics.success();
      return true;
    } catch (error) {
      if (requestRevision !== nearbyActionRevisionRef.current) return false;
      haptics.warning();
      Alert.alert(
        'Winken nicht moeglich',
        error instanceof Error ? error.message : 'Bitte versuche es gleich noch einmal.',
      );
      return false;
    }
  }

  async function handleAcceptSpontaneousRound(
    roundId: string,
    isCurrent: () => boolean = () => true,
  ): Promise<boolean> {
    try {
      await waitForServerAction(acceptSpontaneousRound(roundId));
      // The server already deleted the remote presence in the same
      // transaction. Closing local persistence prevents it being published
      // again by the OpenStatus write-through effect.
      closeOpenStatus();
      if (!isCurrent()) return false;
      setPostfachVisible(false);
      setRoundSheetVisible(true);
      haptics.success();
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      haptics.warning();
      Alert.alert(
        'Beitritt nicht moeglich',
        error instanceof Error ? error.message : 'Bitte versuche es gleich noch einmal.',
      );
      return false;
    }
  }

  /**
   * The invitation step. The preview callable fires HERE — on one deliberate
   * card tap — and nowhere else: prefetching it for every inbox card would turn
   * an inbox render into N server calls and hand out identities the recipient
   * never asked to see.
   */
  async function openSpontaneousRoundInvite(roundId: string) {
    // Double-tap on the same card is not a second intent.
    if (invitePreviewPendingRef.current === roundId) return;

    // Every open takes a ticket; only the newest one may write state. Without
    // this, opening invite A, closing it and opening B let A's slower answer
    // land last and paint A's people into B's sheet — the wrong faces under the
    // wrong name, on the one screen whose entire job is showing you who is in.
    const requestId = ++invitePreviewRequestRef.current;
    invitePreviewPendingRef.current = roundId;

    setInviteRoundId(roundId);
    setInvitePreview(null);
    setInviteLoading(true);
    try {
      const preview = await getSpontaneousRoundInvitePreview(roundId);
      if (requestId !== invitePreviewRequestRef.current) return;
      if (!preview) {
        // Gone, taken, or expired — all the same to the recipient. One honest
        // sentence, no retry loop: retrying cannot bring the round back.
        closeSpontaneousRoundInvite();
        Alert.alert('Runde nicht mehr verfügbar', 'Diese Runde ist nicht mehr verfügbar.');
        return;
      }
      setInvitePreview(preview);
    } catch (error) {
      if (requestId !== invitePreviewRequestRef.current) return;
      closeSpontaneousRoundInvite();
      Alert.alert('Runde nicht mehr verfügbar', 'Diese Runde ist nicht mehr verfügbar.');
    } finally {
      if (requestId === invitePreviewRequestRef.current) {
        invitePreviewPendingRef.current = null;
        setInviteLoading(false);
      }
    }
  }

  function closeSpontaneousRoundInvite() {
    // Closing invalidates whatever is still in flight, so a late answer for the
    // sheet you just dismissed cannot reopen or repaint it.
    invitePreviewRequestRef.current += 1;
    invitePreviewPendingRef.current = null;
    setInviteRoundId(undefined);
    setInvitePreview(null);
    setInviteLoading(false);
    setInviteJoining(false);
  }

  async function acceptSpontaneousRoundInvite() {
    if (!inviteRoundId || inviteJoining) return;
    const requestRevision = ++invitePreviewRequestRef.current;
    const roundId = inviteRoundId;
    setInviteJoining(true);
    const joined = await handleAcceptSpontaneousRound(
      roundId,
      () => requestRevision === invitePreviewRequestRef.current,
    );
    // On failure the sheet stays open behind the alert: the round may still be
    // there next second, and closing would strand the person with no way back.
    if (requestRevision !== invitePreviewRequestRef.current) return;
    if (joined) closeSpontaneousRoundInvite();
    else setInviteJoining(false);
  }

  async function declineSpontaneousRoundInvite() {
    if (!inviteRoundId || inviteJoining) return;
    const roundId = inviteRoundId;
    // Closes first, on purpose. Declining is a normal answer, so it gets no
    // spinner, no confirmation and no "are you sure" — and the starter is never
    // told. The backend removes the private card; the inbox updates on its own.
    closeSpontaneousRoundInvite();
    try {
      await declineSpontaneousRound(roundId);
    } catch {
      // Silent by design. The person has already moved on, and an error toast
      // about an invitation they just turned down would be pure noise.
    }
  }

  function openSpontaneousRoundChat() {
    if (!spontaneousRound || spontaneousRound.memberIds.length < 2) return;
    setRoundSheetVisible(false);
    setChatActivity({
      id: spontaneousRound.id,
      title: 'Spontane Runde',
      accent: GROUP_CHAT_ACCENT,
      kind: 'group',
      memberCount: spontaneousRound.memberIds.length,
    });
  }

  // "Dazustoßen" on a joinable planning group: server re-checks audience and
  // capacity; on success we land directly in the group chat.
  async function handleJoinOpening(opening: GroupOpening): Promise<boolean> {
    const requestRevision = ++nearbyActionRevisionRef.current;
    try {
      await waitForServerAction(joinOpenGroup(opening.id));
    } catch (error) {
      if (requestRevision !== nearbyActionRevisionRef.current) return false;
      Alert.alert(
        'Dazustoßen nicht möglich',
        error instanceof Error ? error.message : 'Bitte versuche es gleich noch einmal.',
      );
      return false;
    }
    if (requestRevision !== nearbyActionRevisionRef.current) return false;
    setNearbySheetVisible(false);
    setChatActivity({
      id: opening.id,
      title: opening.title,
      accent: GROUP_CHAT_ACCENT,
      kind: 'group',
      memberCount: opening.memberCount + 1,
    });
    return true;
  }

  // A chat proposal pre-fills the composer. It is only marked as planned once
  // the new activity's server write has actually been accepted.
  function createActivityFromProposal(
    roomId: string,
    messageId: string,
    proposal: { what?: string; where?: string },
  ) {
    proposalToMarkRef.current = { roomId, messageId };
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
  const startJourneyFromPrompt = useCallback(
    async (activity: JourneyActivityContext, force = false) => {
      try {
        const result = await armJourney(activity, force ? { force: true } : undefined);
        if (result.ok) {
          haptics.success();
          return;
        }
        if (result.conflict) {
          Alert.alert(
            'Anreise wechseln?',
            `Du teilst gerade deine Anreise zu ${result.conflict.title}.`,
            [
              { text: 'Bleiben', style: 'cancel' },
              {
                text: 'Wechseln',
                style: 'destructive',
                onPress: () => void startJourneyFromPrompt(activity, true),
              },
            ],
          );
          return;
        }
        const message =
          result.reason === 'location-permission'
            ? 'Erlaube den Standort, damit die Anreise starten kann.'
            : result.reason === 'background-unavailable'
              ? 'Automatische Anreise ist auf diesem Gerät nicht verfügbar.'
              : result.reason === 'destination-required'
                ? 'Diese Activity braucht einen Ort auf der Karte.'
                : result.reason === 'activity-unavailable'
                  ? 'Die Activity oder ihre Anreise ist nicht mehr verfügbar.'
                  : 'Dein Standort ist gerade nicht verfügbar. Gleich nochmal versuchen.';
        Alert.alert(
          'Anreise konnte nicht gestartet werden',
          message,
          result.reason === 'location-permission'
            ? [
                { text: 'Abbrechen', style: 'cancel' },
                {
                  text: 'Einstellungen öffnen',
                  onPress: () => void Linking.openSettings(),
                },
              ]
            : undefined,
        );
      } catch {
        Alert.alert(
          'Anreise konnte nicht gestartet werden',
          'Bitte versuche es gleich noch einmal.',
        );
      }
    },
    [armJourney],
  );

  const offerJourneyShareNow = useCallback(
    (activity: JourneyActivityContext) => {
      Alert.alert('Anreise teilen?', journeyPromptBody(activity), [
        { text: 'Nein', style: 'cancel' },
        {
          text: 'Ja, teilen',
          onPress: () => void startJourneyFromPrompt(activity),
        },
      ]);
    },
    [startJourneyFromPrompt],
  );

  async function resolveCurrentLocationDraft(draft: ActivityDraft): Promise<ActivityDraft> {
    const latitude = draft.place?.latitude;
    const longitude = draft.place?.longitude;
    const hasResolvedPlace =
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude);

    // "Aktueller Standort" is the composer's default, not an intentional
    // no-location choice. Resolve it only on the explicit publish tap so a
    // draft never starts tracking or storing a coordinate just by being opened.
    if (draft.locationChoice !== 'current' || hasResolvedPlace) return draft;

    const location = myLocation
      ? { coordinate: myLocation, granted: true }
      : await acquireOwnLocation({ prompt: true, repromptAfterDenial: true });
    if (!location.coordinate) {
      throw new Error(
        location.granted
          ? 'Dein Standort konnte gerade nicht bestimmt werden. Bitte versuche es gleich noch einmal.'
          : 'Erlaube den Standort, damit wir deine Activity an deinem aktuellen Ort platzieren können.',
      );
    }

    return {
      ...draft,
      place: {
        id: `current-${location.coordinate.latitude.toFixed(5)}-${location.coordinate.longitude.toFixed(5)}`,
        name: draft.place?.name?.trim() || 'Aktueller Standort',
        latitude: location.coordinate.latitude,
        longitude: location.coordinate.longitude,
        source: 'current',
      },
      locationChoice: 'current',
      locationPrecision: 'exact',
    };
  }

  async function submitComposer(draft: ActivityDraft) {
    if (editingActivityId) {
      // Same resolver as a fresh publish. An edit used to skip it, so a draft
      // whose place was still the unresolved "Aktueller Standort" saved with
      // `visibility: 'none'` — the activity lost its pin by being edited.
      const resolvedEdit = await resolveCurrentLocationDraft(draft);
      await updateActivityFromDraft(editingActivityId, resolvedEdit);
      constrainOpenForActivity(resolvedEdit.startsAt, resolvedEdit.title?.trim() || 'Activity');
      haptics.success();
      setComposerVisible(false);
      setEditingActivityId(undefined);
      setComposerInitialDraft(undefined);
      setComposerTitle(undefined);
      setComposerPlace(undefined);
      return;
    }

    const proposalToMark = proposalToMarkRef.current;
    proposalToMarkRef.current = null;
    const resolvedDraft = await resolveCurrentLocationDraft(draft);
    const activity = createActivityFromDraft(resolvedDraft, composerActivityId);

    const launchLat = resolvedDraft.place?.latitude;
    const launchLng = resolvedDraft.place?.longitude;

    // The provider already created a local twin under this exact id. Firebase
    // remains authoritative, but its callable must not cover the gesture that
    // just created the activity.
    haptics.success();
    setComposerVisible(false);
    setComposerActivityId(undefined);
    setComposerTitle(undefined);
    setComposerPlace(undefined);

    // First reveal the map, then start the existing launch overlay. With
    // reduced motion the overlay completes on the next frame, so this still
    // means "marker is on the map" without inventing a separate delay.
    if (launchLat != null && launchLng != null) {
      // Recentre on the new pin, but keep the zoom EXACTLY as it is. Whoever
      // just placed this activity chose that zoom while doing it — pulling the
      // camera to a prescribed level right after the tap throws away the view
      // they were working in, and reads as the map jumping away from them.
      focusMapOn({ latitude: launchLat, longitude: launchLng }, { keepZoom: true });
      launchMarkerIdRef.current = activity.id;
      requestAnimationFrame(() => {
        setLaunchMarkerId(activity.id);
        // Safety net: if the marker never materialises, reveal the real one.
        if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
        launchTimeoutRef.current = setTimeout(() => {
          launchTimeoutRef.current = undefined;
          setLaunchMarkerId((current) => (current === activity.id ? undefined : current));
          if (launchMarkerIdRef.current === activity.id) {
            launchMarkerIdRef.current = undefined;
          }
        }, 6000);
      });
    }

    // Chat setup depends on the confirmed server activity, so it continues in
    // the background after the animation has started. There is deliberately NO
    // Anreise prompt here: you just chose this place yourself, so being asked
    // whether you are on your way to it is a question you already answered.
    // The offer belongs to JOINING someone else's activity.
    void activity.ready
      .then((result) => {
        constrainOpenForActivity(resolvedDraft.startsAt, resolvedDraft.title?.trim() || 'Activity');
        // The local marker remains visible while an offline create is queued,
        // but chat setup is deliberately server-confirmed.
        if (result === 'queued') return;
        joinActivity(activity.id, {
          title: resolvedDraft.title?.trim() || 'Activity',
          startsAt: resolvedDraft.startsAt,
          endsAt: resolvedDraft.endsAt,
        });
        if (proposalToMark) {
          void markProposalPlanned(proposalToMark.roomId, proposalToMark.messageId).catch(() => {});
        }
      })
      .catch((error: unknown) => {
        if (launchMarkerIdRef.current === activity.id) {
          launchMarkerIdRef.current = undefined;
          setLaunchMarkerId((current) => (current === activity.id ? undefined : current));
        }
        haptics.warning();
        Alert.alert(
          'Erstellen fehlgeschlagen',
          writeFailureMessage(error, 'Die Activity wurde nicht erstellt.'),
        );
      });
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

  function openComposerFromSelection(place: Extract<MapSelection, { type: 'Place' }>) {
    setSelection(null);
    openComposer('soon', placeSelectionToComposerPlace(place));
  }

  async function joinSelectedActivity() {
    if (!selectedActivity) return;
    const activity = selectedActivity;
    if (activityJoinInFlightRef.current === activity.id) return;
    const requestRevision = ++activityJoinRevisionRef.current;
    activityJoinInFlightRef.current = activity.id;
    setJoiningActivityId(activity.id);
    try {
      // Membership is authoritative. A chat is opened only after the activity
      // join succeeded, so a full or inaccessible activity never grants chat
      // access through a race between the two writes.
      const joined = await waitForServerAction(joinActivityParticipants(activity.id));
      if (
        requestRevision !== activityJoinRevisionRef.current ||
        selectedActivityIdRef.current !== activity.id
      ) {
        return;
      }
      if (!joined) {
        haptics.warning();
        Alert.alert('Activity voll', 'Leider ist in dieser Activity kein Platz mehr frei.');
        return;
      }
      constrainOpenForActivity(activity.startsAt, activity.title);
      joinActivity(activity.id, {
        title: activity.title,
        startsAt: activity.startsAt,
        endsAt: activity.endsAt,
      });
      haptics.success();
      const journey = previewToJourneyContext(activity);
      const shouldOfferJourney =
        activitySupportsJourney(activity.plannedMode, activity.targetCoordinate) &&
        journeyRemindersEnabled &&
        journeyCanStartNow(journey);
      if (shouldOfferJourney) {
        offerJourneyShareNow(journey);
      } else {
        void maybeAskForPush();
      }
    } catch (error) {
      if (
        requestRevision !== activityJoinRevisionRef.current ||
        selectedActivityIdRef.current !== activity.id
      ) {
        return;
      }
      haptics.warning();
      Alert.alert(
        'Beitritt nicht möglich',
        error instanceof Error ? error.message : 'Bitte versuche es gleich noch einmal.',
      );
    } finally {
      if (requestRevision === activityJoinRevisionRef.current) {
        activityJoinInFlightRef.current = null;
        setJoiningActivityId(null);
      }
    }
  }

  function leaveSelectedActivity() {
    if (!selectedActivity) return;
    const activityId = selectedActivity.id;
    // Leaving as host hands the Activity on; it never ends it. Naming the heir
    // in the confirm is the whole point — handing your plan to someone must not
    // be something you find out about afterwards.
    const successor = successorIfHostLeaves;
    Alert.alert(
      'Activity verlassen?',
      successor
        ? `Du gibst die Activity ab — ${successor.displayName} übernimmt als Host und sie läuft ohne dich weiter.`
        : 'Du kannst später erneut beitreten, solange noch Plätze frei sind.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Verlassen',
          style: 'destructive',
          onPress: () => {
            haptics.medium();
            setSelection(null);
            void (async () => {
              if (activeJourney?.activityId === activityId) {
                await stopJourney(activityId).catch(() => {});
              }
              await leaveActivityEntity(activityId);
              await leaveRoom(activityId);
            })().catch((error: unknown) => {
              haptics.warning();
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

  function cancelSelectedActivity() {
    if (!selectedActivity) return;
    const activityId = selectedActivity.id;
    const coordinate = selectedActivity.targetCoordinate;
    Alert.alert(
      'Activity absagen?',
      'Die Activity endet für alle — sie verschwindet aus der Karte und kann nicht wieder aktiviert werden.',
      [
        { text: 'Weiter bearbeiten', style: 'cancel' },
        {
          text: 'Absagen',
          style: 'destructive',
          onPress: () => {
            // The confirm IS the decision — sheet closed, pin popped, done. The
            // callable runs behind the animation and only ever speaks up to
            // take the cancellation back.
            haptics.medium();
            setDismissDetailImmediately(true);
            setSelection(null);
            setDismissMarkerId(activityId);
            if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
            dismissTimeoutRef.current = setTimeout(() => {
              dismissTimeoutRef.current = undefined;
              setDismissMarkerId((current) => (current === activityId ? undefined : current));
            }, 4000);

            // One frame later: the canvas has captured the marker it must pop,
            // and only then may the entity disappear underneath it.
            requestAnimationFrame(() => {
              void (async () => {
                if (activeJourney?.activityId === activityId) {
                  await stopJourney(activityId).catch(() => {});
                }
                await cancelActivityEntity(activityId);
              })().catch((error: unknown) => {
                // The entity is already back (the provider rolled it back) —
                // bring it back on screen too, so the alert has a subject.
                setDismissMarkerId(undefined);
                // The marker was on screen a moment ago — bringing it back is
                // not a jump, so the zoom stays where the user had it.
                if (coordinate) focusMapOn(coordinate, { keepZoom: true });
                haptics.warning();
                Alert.alert(
                  'Absagen fehlgeschlagen',
                  writeFailureMessage(error, 'Deine Activity ist wieder da.'),
                );
              });
            });
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
    // Someone underway can be anywhere — prescribed zoom, because the zoom you
    // were at says nothing about where they are.
    focusMapOn(participant?.coordinate ?? activity.targetCoordinate);
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
    // "Zentrieren" means the person, not the neutral overview. A fresh object
    // every time on purpose: the canvas
    // animates on `focusCoordinate` identity, so re-using the `myLocation`
    // reference made a second press (after panning away) a silent no-op.
    //
    // Zoom is kept: the button answers WHERE, not HOW CLOSE. You are already
    // looking at this area — panning away and tapping back does not tell the
    // app anything about how far in you want to be, and snapping to a fixed
    // level threw away a zoom the user had set on purpose.
    if (myLocation) {
      focusMapOn({ ...myLocation }, { keepZoom: true });
      return;
    }
    // No fix yet: ask for one NOW instead of moving the camera somewhere wrong.
    const requestRevision = ++recenterRequestRevisionRef.current;
    setRecentering(true);
    void (async () => {
      const timeout = setTimeout(() => {
        if (requestRevision !== recenterRequestRevisionRef.current) return;
        recenterRequestRevisionRef.current += 1;
        setRecentering(false);
        Alert.alert(
          'Standortsuche dauert länger',
          'Die Karte wurde nicht bewegt. Du kannst es gleich noch einmal versuchen.',
        );
      }, 12_000);
      let result: Awaited<ReturnType<typeof acquireOwnLocation>>;
      try {
        result = await acquireOwnLocation({
          prompt: true,
          repromptAfterDenial: true,
        });
      } catch {
        clearTimeout(timeout);
        if (requestRevision !== recenterRequestRevisionRef.current) return;
        setRecentering(false);
        Alert.alert('Standort noch nicht gefunden', 'Versuch es gleich noch einmal.');
        return;
      }
      clearTimeout(timeout);
      if (requestRevision !== recenterRequestRevisionRef.current) return;
      setRecentering(false);
      const { coordinate, granted } = result;
      if (coordinate) {
        focusMapOn({ ...coordinate }, { keepZoom: true });
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
    options: MapLocationPickerOpenOptions = {},
  ) {
    Keyboard.dismiss();
    setSelection(null);
    // Every place that comes back out of the picker also moves the camera, from
    // whichever entry point it was chosen. Otherwise the composer reopens saying
    // "Café Central" over a map still showing somewhere else — and the location
    // you just picked is the one thing you would want to check.
    mapLocationPicker.open(
      mode,
      (place) => {
        Keyboard.dismiss();
        if (options.focusMapOnPick !== false && place.latitude != null && place.longitude != null) {
          focusMapOn({ latitude: place.latitude, longitude: place.longitude });
        }
        onPick(place);
      },
      {
        ...options,
        // A search should rank cafes/bars near the user instead of near the
        // neutral overview. This is an in-memory bias only.
        initialCoordinate: options.initialCoordinate ?? myLocation ?? undefined,
      },
    );
  }

  // The map search bar is a real entry point, not a decorative placeholder, and
  // it is the THIRD way into the composer (after the FAB and a POI tap). Tapping
  // a result lands exactly where tapping that POI on the map would: camera on
  // the place, PlaceContent open, "Aktivität hier starten" one tap away — hence
  // `autoConfirm`. Making people confirm a result they just tapped would answer
  // the same question twice, and the two POI routes would diverge for no reason.
  function openPlaceSearch() {
    openMapPicker(
      'soon',
      (place) => {
        if (place.latitude == null || place.longitude == null) return;
        setSelection({
          type: 'Place',
          title: place.name,
          // No coordinate fallback: a lat/lng pair under a place name is a
          // developer readout, not something a person picking a spot can use.
          subtitle: place.address,
          coordinate: { latitude: place.latitude, longitude: place.longitude },
          placeId: place.id,
          source: 'poi',
        });
      },
      {
        focusCurrentLocation: false,
        autoConfirm: true,
        focusMapOnPick: false,
        searchMode: true,
      },
    );
  }

  return (
    <View style={{ flex: 1 }} className="bg-background">
      <MapCanvas
        ref={mapCanvasRef}
        // A granted foreground permission is the only prerequisite for the
        // native source. It starts under the boot curtain, never with a prompt.
        onMapReady={() => {
          setMapRendererReady(true);
          reportMapRendererReady();
        }}
        onFocusComplete={handleBootFocusComplete}
        showsOwnLocation={(active || locationBootstrapActive) && locationPermissionGranted}
        onOwnLocationChange={handleNativeOwnLocation}
        currentUser={{
          userId: currentUid,
          displayName: user?.displayName ?? 'Du',
          initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
        }}
        focusCoordinate={
          mapLocationPicker.active ? mapLocationPicker.focusCoordinate : mapFocusCoordinate
        }
        focusKeepZoom={mapLocationPicker.active ? false : mapFocusKeepZoom}
        focusDuration={mapFocusDuration}
        launchMarkerId={launchMarkerId}
        onLaunchComplete={() => {
          if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
          launchTimeoutRef.current = undefined;
          launchMarkerIdRef.current = undefined;
          setLaunchMarkerId(undefined);
        }}
        dismissMarkerId={dismissMarkerId}
        onDismissComplete={() => {
          if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
          dismissTimeoutRef.current = undefined;
          setDismissMarkerId(undefined);
        }}
        selectionFocus={
          heimwegFocusActive
            ? safetyMarkerFocus
            : selectionFocus?.selection === selection
              ? selectionFocus
              : undefined
        }
        fitRequest={heimwegFocusActive ? safetyFitRequest : undefined}
        topOverlayHeight={topOverlayHeight}
        bottomOverlayHeight={safetySplitPanelHeight}
        bottomSheetHeight={selection ? detailSheetHeight : 0}
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
          selection?.type === 'Avatar' ||
          selection?.type === 'Cluster' ||
          selection?.type === 'ActivityStack'
            ? selection.id
            : selection?.type === 'Planning'
              ? selection.planId
              : undefined
        }
        pickingLocation={mapLocationPicker.active}
        onJourneyParticipantPress={focusJourneyMarker}
        onCanvasPress={() => {
          if (mapLocationPicker.active) {
            Keyboard.dismiss();
            return;
          }
          placeSelectionRequestRef.current += 1;
          setSelection(null);
        }}
        onUserMapGesture={() => {
          // From here the camera belongs to the user: a sheet that grows later
          // may no longer drag the view back to its own idea of centred.
          userMovedMapSinceFocusRef.current = true;
          if (bootLocationAttemptRunningRef.current && !didCenterOnOwnLocationRef.current) {
            didCenterOnOwnLocationRef.current = true;
            pendingBootFocusCoordinateRef.current = null;
          }
          if (!recentering) return;
          recenterRequestRevisionRef.current += 1;
          setRecentering(false);
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
          placeSelectionRequestRef.current += 1;
          setSelection(clusterToSelection(cluster));
        }}
        onActivityStackPress={(markers, coordinate, id) => {
          if (mapLocationPicker.active || heimwegFocusActive) return;
          placeSelectionRequestRef.current += 1;
          setSelection({
            type: 'ActivityStack',
            id,
            title: `${markers.length} Activities`,
            coordinate,
            activities: markers.map(markerToStackItem),
          });
        }}
        planningMarkers={planningMarkers}
        onMarkerPress={(marker) => {
          // A round is not an activity: it has no participants and no time, so
          // `markerToSelection` would build a detail sheet full of blanks.
          if (marker.planning) {
            openTimePlan(marker.id);
            return;
          }
          if (mapLocationPicker.active || heimwegFocusActive) return;
          placeSelectionRequestRef.current += 1;
          setSelection(markerToSelection(marker));
        }}
        onPlacePress={async (place) => {
          if (heimwegFocusActive) return;
          if (mapLocationPicker.active) {
            mapLocationPicker.selectMapPlace(place);
            return;
          }
          const request = ++placeSelectionRequestRef.current;
          const nextSelection = await placeToSelection(place);
          if (
            request !== placeSelectionRequestRef.current ||
            mapLocationPicker.active ||
            heimwegFocusActive
          ) {
            return;
          }
          setSelection(nextSelection);
        }}
      />

      {mapLocationPicker.active ? (
        <MapLocationPickerOverlay
          coordinate={mapLocationPicker.coordinate}
          currentLocationLoading={mapLocationPicker.currentLocationLoading}
          loading={mapLocationPicker.resolving}
          searchLoading={mapLocationPicker.searchLoading}
          searchError={mapLocationPicker.searchError}
          searchCompleted={mapLocationPicker.searchCompleted}
          searchMode={mapLocationPicker.searchMode}
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
            onTopOcclusionHeightChange={setPrimaryTopOverlayHeight}
            isOpen={isOpen}
            coreActivity={ownCoreActivity}
            nextActivity={nextOwnActivity}
            journeyFocusLabel={journeyFocusLabel}
            journeyFocusError={journeyFocusError}
            journeyParticipants={journeyFocusParticipants}
            activeJourney={coreJourney}
            onCreateActivity={(mode) => openComposer(mode)}
            onSearchPress={openPlaceSearch}
            onRecenter={recenterMap}
            recentering={recentering}
            onOpenStatusPress={handleCoreStatusTap}
            onCoreActivityPress={openActivityById}
            nearbyCount={nearbyFriends.length}
            onNearbyPress={handleOpenPresencePress}
            onPostfachPress={() => setPostfachVisible(true)}
            onCalendarPress={(origin) => {
              calendarOriginRef.current = origin;
              setCalendarVisible(true);
            }}
            spontaneousRound={spontaneousRound}
            spontaneousRoundUnreadCount={spontaneousRound ? getUnreadCount(spontaneousRound.id) : 0}
            onSpontaneousRoundPress={() => setRoundSheetVisible(true)}
            onClearJourneyFocus={() => {
              setJourneyFocus(null);
            }}
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

          <SafetyStatusPill onTopOcclusionHeightChange={setSafetyTopOverlayHeight} />

          {/* Your own open window. Deliberately a separate surface from the
              NearbySheet below: one is about you, the other about your
              friends, and the row inside it links across rather than merging
              the two. */}
          <OpenStatusSheet
            visible={openStatusSheetVisible}
            onClose={() => setOpenStatusSheetVisible(false)}
            onOpenNearby={() => {
              setOpenStatusSheetVisible(false);
              setNearbySheetVisible(true);
            }}
          />

          <NearbySheet
            visible={nearbySheetVisible}
            friends={nearbyFriends}
            friendsWithoutLocation={friendsWithoutLocation}
            outsideRadiusCount={outsideRadiusCount}
            emptyReason={nearbyEmptyReason}
            locationDenied={locationDenied}
            onAddFriends={() => {
              closeNearbySheet();
              router.push('/friends');
            }}
            onOpenStatus={() => {
              closeNearbySheet();
              handleCoreStatusTap();
            }}
            onClose={closeNearbySheet}
            onStartSpontaneousRound={handleStartSpontaneousRound}
            onJoinOpening={handleJoinOpening}
          />

          <SpontaneousRoundInviteSheet
            visible={Boolean(inviteRoundId)}
            preview={invitePreview}
            loading={inviteLoading}
            joining={inviteJoining}
            onAccept={() => void acceptSpontaneousRoundInvite()}
            onDecline={() => void declineSpontaneousRoundInvite()}
            onClose={closeSpontaneousRoundInvite}
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
            onBrowseActivities={() => setPostfachVisible(false)}
            onEditActivity={(activity) => {
              if (!openActivityEditor(activity.id)) {
                Alert.alert(
                  'Bearbeiten nicht möglich',
                  'Die Aktivität ist nicht mehr aktiv oder du bist nicht ihr Host.',
                );
              }
            }}
            onOpenChat={(target) => {
              setChatActivity(target);
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
            onOpenSpontaneousRoundInvite={openSpontaneousRoundInvite}
            onOpenTimePlan={(planId) => openTimePlan(planId)}
          />

          {/* Your plans. A card like the activity overview, opened from the
              Core's "Pläne" target and closed by its own header button — there
              is no calendar mode and no return control at the bottom edge. */}
          <CalendarSheet
            visible={calendarVisible}
            resolveOrigin={() => calendarOriginRef.current?.() ?? Promise.resolve(null)}
            onClose={() => setCalendarVisible(false)}
            onEditActivity={(activityId) => {
              if (!openActivityEditor(activityId)) {
                Alert.alert(
                  'Bearbeiten nicht möglich',
                  'Die Aktivität ist nicht mehr aktiv oder du bist nicht ihr Host.',
                );
                return;
              }
              // The composer can send you to the map to pick a place, so the
              // calendar has to be out of the way before it opens — a card
              // covering the map while the picker owns it is a dead end.
              setCalendarVisible(false);
            }}
            onOpenChat={setChatActivity}
          />

          <MarkerDetailSheet
            projectCoordinate={projectCoordinate}
            topMapOcclusionHeight={topOverlayHeight}
            onOpenPlannedActivity={(activityId: string) => openActivityWhenKnown(activityId)}
            onOpenStackItem={(id, planning) => {
              if (planning) openTimePlan(id);
              else openActivityById(id);
            }}
            selection={displayedSelection}
            visible={Boolean(selection)}
            joined={selectedActivityJoined}
            joining={selectedActivity ? joiningActivityId === selectedActivity.id : false}
            canEdit={canEditSelectedActivity}
            onJoin={selectedActivity ? joinSelectedActivity : undefined}
            onEdit={canEditSelectedActivity ? editSelectedActivity : undefined}
            onLeave={
              selectedActivityJoined && (!canEditSelectedActivity || successorIfHostLeaves)
                ? leaveSelectedActivity
                : undefined
            }
            onCancel={canEditSelectedActivity ? cancelSelectedActivity : undefined}
            instantClose={dismissDetailImmediately}
            onCreateAtSelection={
              selectedPlace ? () => openComposerFromSelection(selectedPlace) : undefined
            }
            onOpenInMaps={
              selectedPlace ? () => openNativeMaps(selectedPlace, 'details') : undefined
            }
            onStartRoute={startRouteToSelection}
            onFocusJourney={
              selectedActivity
                ? (participantId) => focusJourneyParticipant(selectedActivity, participantId)
                : undefined
            }
            onCreateActivity={createActivityFromProposal}
            onHeightChange={(height) => {
              setDetailSheetMeasurement((current) => ({
                height,
                revision: current.revision + 1,
                selection,
              }));
            }}
            onClose={() => {
              activityJoinRevisionRef.current += 1;
              activityJoinInFlightRef.current = null;
              setJoiningActivityId(null);
              setDismissDetailImmediately(false);
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
        // Ranking bias for the inline place search. Without it a fresh composer
        // — whose default place carries no coordinate on purpose — would rank
        // "Prater" worldwide, while the full-screen picker always has the map
        // centre to lean on.
        searchCenter={myLocation ?? undefined}
        onClose={() => {
          setComposerVisible(false);
          setComposerActivityId(undefined);
          proposalToMarkRef.current = null;
          setEditingActivityId(undefined);
          setComposerInitialDraft(undefined);
        }}
        onOpenMapPicker={openMapPicker}
        onSubmit={submitComposer}
        onStartTimePlan={startTimePlan}
        onTimePlanCreated={(creation) => {
          setComposerVisible(false);
          setComposerActivityId(undefined);
          setComposerTitle(undefined);
          setComposerPlace(undefined);
          proposalToMarkRef.current = null;
          openTimePlan(creation.id);
          haptics.success();
          void creation.ready.catch((error: unknown) => {
            setSelection((current) =>
              current?.type === 'Planning' && current.planId === creation.id ? null : current,
            );
            haptics.warning();
            Alert.alert(
              'Terminfindung nicht angelegt',
              error instanceof Error
                ? error.message
                : 'Die Zeitvorschläge konnten nicht gespeichert werden. Bitte versuche es erneut.',
            );
          });
        }}
      />

      <Modal
        visible={chatActivity !== null}
        animationType="slide"
        onRequestClose={() => setChatActivity(null)}
      >
        {chatActivity ? (
          <ActivityChatView
            activityId={chatActivity.id}
            accent={chatActivity.accent}
            title={chatActivity.title}
            count={chatActivity.memberCount}
            onBack={() => setChatActivity(null)}
            onCreateActivity={createActivityFromProposal}
            onCreateActivityDirect={() => createActivityFromChat(chatActivity.id)}
          />
        ) : null}
      </Modal>
    </View>
  );
}
