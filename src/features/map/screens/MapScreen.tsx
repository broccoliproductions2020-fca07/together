import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Platform, useWindowDimensions, View } from 'react-native';

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
  type JourneyActivityContext,
  type JourneyParticipant,
} from '@/features/journey';
import { useFriends } from '@/features/friends';
import { ActivitiesSheet, MapOverlay, MarkerDetailSheet, NearbySheet } from '@/features/overlay';
import { placeService } from '@/features/places';
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
import { BACKEND } from '@/shared/services/firebase';

import { MapCanvas } from '../components/MapCanvas';
import { MapLocationPickerOverlay } from '../components/MapLocationPickerOverlay';
import type {
  ActivityMode,
  ActivitySelectionPreview,
  MapCoordinate,
  MapMarker,
  MapPlaceSelection,
  MapSelection,
  MarkerCluster,
  MockMapPosition,
} from '../types/map.types';
import { berlinRegion, mockPositionToCoordinate } from '../utils/mockCoordinates';
import { selectFriendsWithoutLocation, selectNearbyFriends } from '../utils/nearbySelectors';

type PlaceSelection = Extract<MapSelection, { type: 'Place' }>;

const UNKNOWN_PLACE_TITLE = 'Ort ohne Namen';
const CANDIDATE_CLEAR_DISTANCE = 0.00025;

function nativeMapsUrl(place: PlaceSelection, intent: 'details' | 'route') {
  const { latitude, longitude } = place.coordinate;
  const encodedTitle = encodeURIComponent(place.title);
  const encodedCoordinate = `${latitude},${longitude}`;

  if (Platform.OS === 'ios') {
    return intent === 'route'
      ? `http://maps.apple.com/?daddr=${encodedCoordinate}&q=${encodedTitle}`
      : `http://maps.apple.com/?ll=${encodedCoordinate}&q=${encodedTitle}`;
  }

  if (intent === 'route') {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodedCoordinate}&travelmode=walking`;
  }

  return `geo:${encodedCoordinate}?q=${encodedCoordinate}(${encodedTitle})`;
}

function openNativeMaps(place: PlaceSelection, intent: 'details' | 'route') {
  void Linking.openURL(nativeMapsUrl(place, intent));
}

function compactAddressParts(parts: (string | null | undefined)[]) {
  const uniqueParts = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return [...new Set(uniqueParts)].join(', ');
}

function formatReverseGeocodedAddress(address: Location.LocationGeocodedAddress) {
  const streetLine = compactAddressParts([address.street, address.streetNumber]);
  const areaLine = compactAddressParts([address.district, address.city]);

  return (
    address.name?.trim() ||
    address.formattedAddress?.trim() ||
    compactAddressParts([streetLine, areaLine, address.country])
  );
}

async function reverseGeocodePlaceTitle(coordinate: MapCoordinate) {
  try {
    const [address] = await Location.reverseGeocodeAsync(coordinate);
    return address ? formatReverseGeocodedAddress(address) : null;
  } catch {
    return null;
  }
}

async function placeToSelection(place: MapPlaceSelection): Promise<MapSelection> {
  const coordinate = `${place.coordinate.latitude.toFixed(5)}, ${place.coordinate.longitude.toFixed(5)}`;
  const rawTitle = place.title.trim();
  const hasPoiName = place.source === 'poi' && rawTitle !== UNKNOWN_PLACE_TITLE;
  const reverseGeocodedTitle = hasPoiName ? null : await reverseGeocodePlaceTitle(place.coordinate);
  const title = hasPoiName ? rawTitle : reverseGeocodedTitle || UNKNOWN_PLACE_TITLE;
  const sourceHint = hasPoiName
    ? 'Von der Karte erkannt. Kostenlose Basisdaten, keine Places-API-Abfrage.'
    : reverseGeocodedTitle
      ? 'Kostenlos aus der Koordinate als Adresse erkannt. Kein Places-API-Konto nötig.'
      : 'Die Karte hat keinen Ortsnamen geliefert. Tippe direkt auf einen Ortsnamen/POI oder öffne Karten.';

  return {
    type: 'Place',
    title,
    subtitle: `${sourceHint} Koordinate: ${coordinate}`,
    coordinate: place.coordinate,
    placeId: place.placeId,
    source: place.source,
  };
}

function placeSelectionToComposerPlace(place: PlaceSelection): SelectedPlace {
  return {
    id: place.placeId ?? `${place.coordinate.latitude}-${place.coordinate.longitude}`,
    name: place.title === UNKNOWN_PLACE_TITLE ? 'Markierter Ort' : place.title,
    address: place.subtitle,
    latitude: place.coordinate.latitude,
    longitude: place.coordinate.longitude,
    source: 'map',
  };
}

async function coordinateToComposerPlace(coordinate: MapCoordinate): Promise<SelectedPlace> {
  const title = await reverseGeocodePlaceTitle(coordinate);
  const coordinateLabel = `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;

  return {
    id: `map-center-${coordinate.latitude.toFixed(5)}-${coordinate.longitude.toFixed(5)}`,
    name: title || 'Markierter Ort',
    address: title ? `${title} · ${coordinateLabel}` : `Koordinate: ${coordinateLabel}`,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    source: 'map',
  };
}

function distanceBetweenCoordinates(a: MapCoordinate, b: MapCoordinate) {
  return Math.abs(a.latitude - b.latitude) + Math.abs(a.longitude - b.longitude);
}

function coordinateFromPosition(position?: MockMapPosition) {
  return position ? mockPositionToCoordinate(position) : undefined;
}

function coordinateFromSelection(selection: MapSelection | null) {
  if (!selection) return undefined;
  if (selection.type === 'Place') return selection.coordinate;
  if (selection.type === 'Avatar' || selection.type === 'Cluster') {
    return selection.targetCoordinate ?? coordinateFromPosition(selection.targetPosition);
  }
  return undefined;
}

function infoToActivityPreview(info: ActivityInfo): ActivitySelectionPreview {
  return {
    id: info.id,
    title: info.title,
    subtitle: info.description ?? `${info.participantCount} Teilnehmer`,
    mode: info.mode,
    participantCount: info.participantCount,
    participants: info.participants,
    targetCoordinate: coordinateFromPosition(info.targetPosition),
    targetPosition: info.targetPosition,
    timeLabel: info.timeLabel,
    placeLabel: info.placeLabel,
    startsAt: info.startsAt,
    endsAt: info.endsAt,
  };
}

function previewToJourneyContext(activity: ActivitySelectionPreview): JourneyActivityContext {
  return {
    id: activity.id,
    title: activity.title,
    participants: activity.participants,
    targetCoordinate: activity.targetCoordinate,
    targetPosition: activity.targetPosition,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
  };
}

function markerToJourneyContext(marker: MapMarker): JourneyActivityContext {
  return {
    id: marker.id,
    title: marker.title ?? marker.label ?? marker.displayName,
    participants: marker.avatars?.length
      ? marker.avatars
      : [
          {
            userId: marker.userId,
            displayName: marker.displayName,
            initials: marker.initials,
            avatarUrl: marker.avatarUrl,
          },
        ],
    targetCoordinate: mockPositionToCoordinate(marker.position),
    targetPosition: marker.position,
    startsAt: marker.startsAt,
    endsAt: marker.endsAt,
  };
}

function clusterToJourneyContext(cluster: MarkerCluster): JourneyActivityContext {
  return {
    id: cluster.id,
    title: cluster.label,
    participants: cluster.avatars,
    targetCoordinate: mockPositionToCoordinate(cluster.position),
    targetPosition: cluster.position,
    startsAt: cluster.startsAt,
    endsAt: cluster.endsAt,
  };
}

export interface MapScreenProps {
  /** MainSurface keeps map layers mounted for transitions; this tells the
   * presence seam whether the map is actually visible to the user. */
  active?: boolean;
  onLocationPickerActiveChange?: (active: boolean) => void;
  /** The activity/place detail is rendered inline over the map so marker taps
   * can switch directly. Let the parent retract its global mode switch while
   * that sheet owns the lower edge. */
  onDetailSheetVisibleChange?: (visible: boolean) => void;
  /** Opens the calendar surface (top-bar calendar button; calendar is not in the mode pill). */
  onOpenCalendar?: () => void;
}

/**
 * Map-first screen. The map fills the entire screen and every control floats
 * absolutely above it via `MapOverlay`; there is no bottom bar, panel or dark
 * container below the map.
 */
export function MapScreen({
  active = true,
  onLocationPickerActiveChange,
  onDetailSheetVisibleChange,
  onOpenCalendar,
}: MapScreenProps) {
  const { height: viewportHeight } = useWindowDimensions();
  const { user } = useAuth();
  const currentUid = user?.id ?? 'u_you';
  const { radiusKm } = useNearbyRadius();
  const {
    isJoined,
    joinActivity,
    leaveRoom,
    createGroup,
    getGroup,
    markProposalPlanned,
    joinOpenGroup,
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
  const { journeyRemindersEnabled } = useFriends();
  const {
    friendSessions,
    mapFocusRequest,
    clearMapFocusRequest,
    heimwegFocusActive,
    session: ownSafetySession,
    consoleMinimized,
    startingHeimweg,
  } = useSafety();
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
  const [activitiesSheetVisible, setActivitiesSheetVisible] = useState(false);
  const [chatActivity, setChatActivity] = useState<ActivityInfo | null>(null);
  // Pill count is radius-based and viewport-independent — it does NOT change when
  // the user zooms or pans the map. See nearbySelectors.ts for the rationale.
  // In firebase mode the list is REAL open friends (presence seam); mock mode
  // keeps the demo friends so the app still works fully offline.
  const { openFriends, setFriendPresenceListening } = useOpenStatus();

  useEffect(() => {
    setFriendPresenceListening(active);
    return () => setFriendPresenceListening(false);
  }, [active, setFriendPresenceListening]);
  const [myLocation, setMyLocation] = useState<MapCoordinate | null>(null);
  const realNearby = useMemo(() => {
    // Fallback to the Berlin demo center when we don't have the device location
    // yet, so sharing friends still get a distance (and the pill counts) instead
    // of all collapsing to "Ohne Standort".
    const origin = myLocation ?? {
      latitude: berlinRegion.latitude,
      longitude: berlinRegion.longitude,
    };
    return presenceToNearby(openFriends, origin);
  }, [openFriends, myLocation]);
  const useRealPresence = BACKEND === 'firebase';
  const nearbyFriends = useRealPresence
    ? realNearby
        .filter((f) => f.locationVisibility === 'pin' && (f.distanceKm ?? Infinity) <= radiusKm)
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    : selectNearbyFriends(radiusKm);
  const friendsWithoutLocation = useRealPresence
    ? realNearby.filter((f) => f.locationVisibility === 'none')
    : selectFriendsWithoutLocation();
  const nearbyCount = nearbyFriends.length;
  const [composerMode, setComposerMode] = useState<ActivityMode>('now');
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerPlace, setComposerPlace] = useState<SelectedPlace | undefined>();
  const [composerTitle, setComposerTitle] = useState<string | undefined>();
  const [composerActivityId, setComposerActivityId] = useState<string | undefined>();
  const [editingActivityId, setEditingActivityId] = useState<string | undefined>();
  const [composerInitialDraft, setComposerInitialDraft] = useState<ActivityDraft | undefined>();
  const [mapPickerActive, setMapPickerActive] = useState(false);
  const [mapPickerResolving, setMapPickerResolving] = useState(false);
  const [mapPickerCurrentLocationLoading, setMapPickerCurrentLocationLoading] = useState(false);
  const [mapPickerMode, setMapPickerMode] = useState<ActivityMode>('open');
  const [mapPickerSearchQuery, setMapPickerSearchQuery] = useState('');
  const [mapPickerSearchResults, setMapPickerSearchResults] = useState<SelectedPlace[]>([]);
  const [mapPickerSearchLoading, setMapPickerSearchLoading] = useState(false);
  const [mapPickerSelectedPlaceCandidate, setMapPickerSelectedPlaceCandidate] = useState<
    SelectedPlace | undefined
  >();
  const [mapPickerCoordinate, setMapPickerCoordinate] = useState<MapCoordinate>({
    latitude: berlinRegion.latitude,
    longitude: berlinRegion.longitude,
  });
  const [mapPickerFocusCoordinate, setMapPickerFocusCoordinate] = useState<
    MapCoordinate | undefined
  >();
  const [mapFocusCoordinate, setMapFocusCoordinate] = useState<MapCoordinate | undefined>();
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
  const selectionFocusSequenceRef = useRef(0);
  const safetyMarkerFocusSequenceRef = useRef(0);
  const wasHeimwegFocusActiveRef = useRef(false);
  const [safetyNow, setSafetyNow] = useState(() => Date.now());

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
    if (mapPickerActive || heimwegFocusActive) return;
    const coordinate = coordinateFromSelection(selection);
    if (!coordinate) return;
    selectionFocusSequenceRef.current += 1;
    setSelectionFocus({ id: selectionFocusSequenceRef.current, coordinate });
  }, [heimwegFocusActive, mapPickerActive, selection]);

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
  const pendingMapPickRef = useRef<((place: SelectedPlace) => void) | null>(null);
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

  // Once joined, show the current user in the detail sheet's participant list +
  // count immediately (optimistic — works for demo seeds and before the backend
  // round-trip). If the persisted doc already lists them, leave it untouched.
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
  // Firebase maintains a location-free count in the existing Activity feed on
  // journey start/arrival/stop. The map therefore needs no RTDB listener per
  // marker; the mock keeps deriving its count from its local journey room.
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

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const openActivityFromNotification = (response: Notifications.NotificationResponse | null) => {
      if (response && isJourneyAutoShareResponse(response)) return;
      const activityId = response?.notification.request.content.data?.activityId;
      if (typeof activityId !== 'string') return;
      const activity = findActivityById(activityId);
      if (!activity) return;
      const preview = infoToActivityPreview(activity);
      setSelection({
        type: 'Avatar',
        hostName: preview.participants[0]?.displayName ?? 'Activity',
        ...preview,
      });
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(
      openActivityFromNotification,
    );
    void Notifications.getLastNotificationResponseAsync().then(openActivityFromNotification);
    return () => subscription.remove();
  }, [findActivityById]);

  useEffect(() => {
    const query = mapPickerSearchQuery.trim();
    if (!mapPickerActive || query.length < 2) {
      setMapPickerSearchResults([]);
      setMapPickerSearchLoading(false);
      return;
    }
    let cancelled = false;
    setMapPickerSearchLoading(true);
    const timer = setTimeout(() => {
      void placeService
        .search({ query, center: mapPickerCoordinate, radiusMeters: 10_000 })
        .then((results) => {
          if (!cancelled) {
            setMapPickerSearchResults(results);
            setMapPickerSearchLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setMapPickerSearchResults([]);
            setMapPickerSearchLoading(false);
          }
        });
    }, 240);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mapPickerActive, mapPickerCoordinate, mapPickerSearchQuery]);

  const updateMapPickerCenter = useCallback((coordinate: MapCoordinate) => {
    setMapPickerCoordinate(coordinate);
    setMapPickerSelectedPlaceCandidate((candidate) => {
      if (candidate?.latitude == null || candidate.longitude == null) return candidate;

      const candidateCoordinate = {
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      };

      return distanceBetweenCoordinates(coordinate, candidateCoordinate) > CANDIDATE_CLEAR_DISTANCE
        ? undefined
        : candidate;
    });
  }, []);

  useEffect(() => {
    onLocationPickerActiveChange?.(mapPickerActive);
  }, [mapPickerActive, onLocationPickerActiveChange]);

  // Best-effort own location (silent — no prompt here) so real presence friends
  // can be distance-ranked. Without it, sharing friends fall back to list-only.
  useEffect(() => {
    if (!useRealPresence) return;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== Location.PermissionStatus.GRANTED) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setMyLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
      } catch {
        // No location → friends who share still appear, just under "Ohne Standort".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useRealPresence]);

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

  async function handleStartPlanning(members: GroupMember[]) {
    const id = await createGroup(members);
    const names = members.map((member) => member.displayName);
    setNearbySheetVisible(false);
    setChatActivity({
      id,
      title: names.length ? `Mit ${names.slice(0, 3).join(', ')}` : 'Gemeinsam planen',
      mode: 'open',
      participantCount: members.length + 1,
      participants: [
        {
          userId: currentUid,
          displayName: user?.displayName ?? 'Du',
          initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
        },
        ...members.map((member) => ({
          userId: member.id,
          displayName: member.displayName,
          initials: member.displayName
            .split(' ')
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
        })),
      ],
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

  // Chat proposal → real activity: prefill the composer with what/where and
  // mark the proposal as planned. Composer submit stays the (mock) creation.
  function createActivityFromProposal(
    roomId: string,
    messageId: string,
    proposal: { what?: string; where?: string },
  ) {
    markProposalPlanned(roomId, messageId);
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
    setChatActivity(null);
    openComposer('soon', undefined, vibe, roomId);
  }

  // After creating: close the composer and land back on the map with the new
  // pin — do NOT jump into the (empty) chat; it stays reachable via the pin
  // and "Deine Aktivitäten".
  function submitComposer(draft: ActivityDraft) {
    if (editingActivityId) {
      updateActivityFromDraft(editingActivityId, draft);
      setComposerVisible(false);
      setEditingActivityId(undefined);
      setComposerInitialDraft(undefined);
      setComposerTitle(undefined);
      setComposerPlace(undefined);
      return;
    }

    const activity = createActivityFromDraft(draft, composerActivityId);
    void activity.ready
      .then(() => {
        joinActivity(activity.id, {
          title: draft.title?.trim() || 'Activity',
          startsAt: draft.startsAt,
          endsAt: draft.endsAt,
        });
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error && error.message
          ? error.message
          : 'Bitte versuche es gleich noch einmal.';
        console.warn('[activity] create failed:', error);
        Alert.alert(
          'Activity konnte nicht erstellt werden',
          detail,
        );
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
    const draft = getEditableDraft(selectedActivity.id);
    if (!draft) return;

    setSelection(null);
    setEditingActivityId(selectedActivity.id);
    setComposerInitialDraft(draft);
    setComposerMode(draft.mode);
    setComposerPlace(draft.place);
    setComposerTitle(draft.title);
    setComposerVisible(true);
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
        Alert.alert('Activity voll', 'Leider ist in dieser Activity kein Platz mehr frei.');
        return;
      }
      joinActivity(activity.id, {
        title: activity.title,
        startsAt: activity.startsAt,
        endsAt: activity.endsAt,
      });
      const startsAt = activity.startsAt ? Date.parse(activity.startsAt) : NaN;
      const activityHasStarted =
        activity.mode === 'now' || (Number.isFinite(startsAt) && startsAt <= Date.now());
      if (activityHasStarted && journeyRemindersEnabled) {
        setJourneyJoinPromptActivityId(activity.id);
      }
    } catch {
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
            cancelActivityEntity(activityId);
            setSelection(null);
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
    setMapFocusCoordinate(
      participant?.coordinate ??
        coordinateFromPosition(participant?.position) ??
        activity.targetCoordinate ??
        coordinateFromPosition(activity.targetPosition),
    );
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
          targetCoordinate: coordinateFromPosition(activeJourney.targetPosition),
          targetPosition: activeJourney.targetPosition,
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
    setMapFocusCoordinate({
      latitude: berlinRegion.latitude,
      longitude: berlinRegion.longitude,
    });
  }

  function openMapPicker(
    mode: ActivityMode,
    onPick: (place: SelectedPlace) => void,
    options: { focusCurrentLocation?: boolean } = {},
  ) {
    pendingMapPickRef.current = onPick;
    setMapPickerMode(mode);
    setMapPickerSearchQuery('');
    setMapPickerSearchResults([]);
    setMapPickerSearchLoading(false);
    setMapPickerSelectedPlaceCandidate(undefined);
    setSelection(null);
    setMapPickerResolving(false);
    setMapPickerCurrentLocationLoading(false);
    setMapPickerActive(true);
    if (options.focusCurrentLocation !== false) void focusCurrentLocation();
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

  function cancelMapPicker() {
    pendingMapPickRef.current = null;
    setMapPickerResolving(false);
    setMapPickerCurrentLocationLoading(false);
    setMapPickerSearchQuery('');
    setMapPickerSearchResults([]);
    setMapPickerSearchLoading(false);
    setMapPickerSelectedPlaceCandidate(undefined);
    setMapPickerActive(false);
  }

  function selectMapPickerSearchResult(place: SelectedPlace) {
    if (place.latitude == null || place.longitude == null) return;

    const candidate = { ...place, source: 'map' as const };
    const coordinate = { latitude: place.latitude, longitude: place.longitude };

    setMapPickerSelectedPlaceCandidate(candidate);
    setMapPickerSearchQuery(place.name);
    setMapPickerSearchResults([]);
    setMapPickerSearchLoading(false);
    setMapPickerCoordinate(coordinate);
    setMapPickerFocusCoordinate(coordinate);
  }

  async function focusCurrentLocation() {
    if (mapPickerCurrentLocationLoading) return;

    setMapPickerCurrentLocationLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) return;

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const address = await reverseGeocodePlaceTitle(coordinate);

      setMapPickerCoordinate(coordinate);
      setMapPickerFocusCoordinate(coordinate);
      setMapPickerSelectedPlaceCandidate({
        id: `current-${coordinate.latitude.toFixed(5)}-${coordinate.longitude.toFixed(5)}`,
        name: 'Aktueller Standort',
        address: address ?? 'Aktuelle Position',
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        source: 'current',
      });
      setMapPickerSearchQuery('');
      setMapPickerSearchResults([]);
      setMapPickerSearchLoading(false);
    } finally {
      setMapPickerCurrentLocationLoading(false);
    }
  }

  async function confirmMapPicker() {
    if (mapPickerResolving) return;

    setMapPickerResolving(true);
    const place =
      mapPickerSelectedPlaceCandidate ?? (await coordinateToComposerPlace(mapPickerCoordinate));
    pendingMapPickRef.current?.(place);
    pendingMapPickRef.current = null;
    setMapPickerResolving(false);
    setMapPickerSearchQuery('');
    setMapPickerSearchResults([]);
    setMapPickerSearchLoading(false);
    setMapPickerSelectedPlaceCandidate(undefined);
    setMapPickerActive(false);
  }

  return (
    <View style={{ flex: 1 }} className="bg-background">
      <MapCanvas
        currentUser={{
          userId: currentUid,
          displayName: user?.displayName ?? 'Du',
          initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
        }}
        focusCoordinate={mapPickerActive ? mapPickerFocusCoordinate : mapFocusCoordinate}
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
        pickingLocation={mapPickerActive}
        onJourneyParticipantPress={focusJourneyMarker}
        onCanvasPress={() => {
          if (mapPickerActive) return;
          setSelection(null);
        }}
        // The normal map never needs its viewport in React state. Wiring this
        // callback unconditionally made every completed pan/zoom rebuild the
        // full MapScreen and all marker descriptors.
        onRegionChange={
          mapPickerActive
            ? (region) =>
                updateMapPickerCenter({ latitude: region.latitude, longitude: region.longitude })
            : undefined
        }
        onClusterPress={(cluster) => {
          if (mapPickerActive || heimwegFocusActive) return;
          setSelection(clusterToSelection(cluster));
        }}
        onMarkerPress={(marker) => {
          if (mapPickerActive || heimwegFocusActive) return;
          setSelection(markerToSelection(marker));
        }}
        onPlacePress={async (place) => {
          if (mapPickerActive || heimwegFocusActive) return;
          setSelection(await placeToSelection(place));
        }}
      />

      {mapPickerActive ? (
        <MapLocationPickerOverlay
          coordinate={mapPickerCoordinate}
          currentLocationLoading={mapPickerCurrentLocationLoading}
          loading={mapPickerResolving}
          searchLoading={mapPickerSearchLoading}
          mode={mapPickerMode}
          searchQuery={mapPickerSearchQuery}
          searchResults={mapPickerSearchResults}
          selectedPlaceCandidate={mapPickerSelectedPlaceCandidate}
          onCancel={cancelMapPicker}
          onConfirm={confirmMapPicker}
          onSearchQueryChange={setMapPickerSearchQuery}
          onSelectSearchResult={selectMapPickerSearchResult}
          onUseCurrentLocation={focusCurrentLocation}
        />
      ) : (
        <>
          <MapOverlay
            nearbyCount={nearbyCount}
            journeyFocusLabel={journeyFocusLabel}
            journeyParticipants={journeyFocusParticipants}
            activeJourneyLabel={activeJourneyLabel}
            onCreatePress={() => openComposer('now')}
            onSearchPress={openPlaceSearch}
            onRecenter={recenterMap}
            onNearbyPress={() => setNearbySheetVisible(true)}
            onActivitiesPress={() => setActivitiesSheetVisible(true)}
            onCalendarPress={() => onOpenCalendar?.()}
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
            onClose={() => setNearbySheetVisible(false)}
            onStartPlanning={handleStartPlanning}
            onJoinOpening={handleJoinOpening}
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

          <ActivitiesSheet
            visible={activitiesSheetVisible}
            onClose={() => setActivitiesSheetVisible(false)}
            onOpenChat={(activity) => {
              setActivitiesSheetVisible(false);
              setChatActivity(activity);
            }}
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
        suspended={mapPickerActive}
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
