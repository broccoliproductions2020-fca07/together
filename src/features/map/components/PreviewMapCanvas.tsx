import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useActivityEntities } from '@/features/activities';
import { useActivityChatActivity } from '@/features/chat';
import type { JourneyParticipant } from '@/features/journey';

import type {
  MapCoordinate,
  MapMarker,
  MapPlaceSelection,
  MapRegion,
  MarkerAvatar,
  MarkerCluster,
} from '../types/map.types';
import { countdownBucket } from '../utils/countdown';
import { DEFAULT_MAP_REGION } from '../utils/defaultRegion';
import { colorWithAlpha, markerModeStyles } from '../utils/markerStyles';
import { participantDisplay } from '../utils/markerParticipants';
import {
  ACTIVITY_MARKER_ANCHOR,
  ACTIVITY_MARKER_CAPTURE_HEIGHT,
  ACTIVITY_MARKER_CAPTURE_WIDTH,
} from './activityMarkerLayout';
import { AvatarMarker } from './AvatarMarker';
import { ClusterMarker } from './ClusterMarker';
import { JourneyAvatarMarker } from './JourneyAvatarMarker';
import { LIVE_AURA_SIZE, LiveAura } from './MapLiveAuraOverlay';
import { MarkerLaunchOverlay, type MarkerLaunchRequest } from './MarkerLaunchOverlay';

export interface HeimwegMapMarker {
  uid: string;
  displayName: string;
  initials: string;
  coordinate: MapCoordinate;
  /** Status color (blue/orange/red) derived via deriveCompanionSignal. */
  color: string;
  /** Staleness hint ("vor 6 Min.") — set on a data gap so the map itself is
   * honest about outdated positions, not only the companion sheet. */
  subLabel?: string;
}

export interface PreviewMapCanvasProps {
  /** Native map only: show the device's own-location dot and its heading cone.
   * The browser preview deliberately has no device sensor layer. */
  showsOwnLocation?: boolean;
  /** First-party native location delivery, used to prepare the initial camera. */
  onOwnLocationChange?: (coordinate: MapCoordinate) => void;
  pickingLocation?: boolean;
  focusCoordinate?: MapCoordinate;
  /** The initial location may glide in after the boot curtain has lifted. */
  focusDuration?: number;
  /** Native renderer is mounted and can accept camera commands. */
  onMapReady?: () => void;
  /** A programmatic focus finished. Used only by the boot prewarm hand-off. */
  onFocusComplete?: (coordinate: MapCoordinate) => void;
  /**
   * Recentre on `focusCoordinate` WITHOUT changing the zoom. Set when the user
   * put the target there themselves (publishing an activity) — their current
   * zoom is a deliberate choice and must survive the camera move. Off by
   * default: a focus that jumps somewhere else needs a prescribed zoom.
   */
  focusKeepZoom?: boolean;
  /** One-shot camera focus that keeps a selected place above its detail sheet. */
  selectionFocus?: {
    id: number;
    coordinate: MapCoordinate;
    latitudeDelta?: number;
    longitudeDelta?: number;
  };
  /** Explicit camera fit request; id changes only on entry/manual recenter. */
  fitRequest?: { id: number; coordinates: MapCoordinate[] };
  /** Fixed lower control deck in the split Safety mode. */
  bottomOverlayHeight?: number;
  /** Live height of an open bottom sheet covering the map. Used ONLY to centre
   * a focused selection in the visible map strip rather than behind the sheet. */
  bottomSheetHeight?: number;
  onMarkerPress?: (marker: MapMarker) => void;
  /**
   * Friends who are open AND deliberately share their location. Kept separate
   * from the activity feed on purpose: presence is a status, it is never part of
   * `mapMarkers`, and it must be trivial to see at the call site that turning
   * sharing off removes the marker.
   */
  openPresenceMarkers?: MapMarker[];
  /**
   * Rounds still looking for a time. A separate prop for the same reason
   * presence is: a Terminfindung is NOT an activity, it has no fixed time and
   * no ring, and keeping it out of `mapMarkers` makes that impossible to blur.
   */
  planningMarkers?: MapMarker[];
  onClusterPress?: (cluster: MarkerCluster) => void;
  onPlacePress?: (place: MapPlaceSelection) => void;
  onCanvasPress?: () => void;
  onRegionChange?: (region: MapRegion) => void;
  /** A direct map gesture supersedes a pending device-location recenter. */
  onUserMapGesture?: () => void;
  journeyFocus?: { activityId: string; participantId?: string };
  journeyTargetCoordinate?: MapCoordinate;
  journeyParticipants?: JourneyParticipant[];
  /** Friends' running Heimweg sessions — rendered only by the dedicated
   * Heimweg-Fokus so the normal activity map stays calm. */
  heimwegMarkers?: HeimwegMapMarker[];
  onHeimwegMarkerPress?: (uid: string) => void;
  /** Heimweg-Fokus (docs/safety-mode.md): hide every activity/journey marker
   * so the map shows ONLY the shared walks. */
  hideActivities?: boolean;
  /** Live journey counts already known to the app. No extra map listener. */
  journeyUnderwayCounts?: Readonly<Record<string, number>>;
  currentUser?: MarkerAvatar;
  /** Activity currently open in the detail sheet — its marker gets a focus ring. */
  selectedActivityId?: string;
  onJourneyParticipantPress?: (participant: JourneyParticipant) => void;
  /** Newly published marker id to animate in with the "Wurf & Pop" transition;
   * its real marker stays hidden until `onLaunchComplete` fires. */
  launchMarkerId?: string;
  onLaunchComplete?: () => void;
  /** Cancelled marker id to pop off the map. Armed one frame BEFORE the entity
   * is dropped, so the canvas can still capture the node it has to animate. */
  dismissMarkerId?: string;
  onDismissComplete?: () => void;
  /**
   * Perspective (tilted) camera, driven only by the overlay button — never by a
   * gesture, and never persisted. North stays locked; while it is on, the
   * marker morph overlay is disabled because its flat lat/lng projection does
   * not survive a tilted camera. Ignored by the browser preview.
   */
}

type CanvasPoint = { x: number; y: number };

const CANVAS_LATITUDE_SPAN = 0.08;
const CANVAS_LONGITUDE_SPAN = 0.065;

/**
 * Browser-only projection for the decorative preview canvas. Points outside
 * its fixed viewport stay outside the canvas instead of being clamped to a
 * misleading location.
 */
function projectCoordinateToCanvas(coordinate: MapCoordinate): CanvasPoint {
  return {
    x: 50 + ((coordinate.longitude - DEFAULT_MAP_REGION.longitude) / CANVAS_LONGITUDE_SPAN) * 100,
    y: 50 - ((coordinate.latitude - DEFAULT_MAP_REGION.latitude) / CANVAS_LATITUDE_SPAN) * 100,
  };
}

function mapPosition(position: CanvasPoint) {
  return {
    left: `${position.x}%`,
    top: `${position.y}%`,
  } as const;
}

function activityMarkerPosition(position: CanvasPoint): StyleProp<ViewStyle> {
  return [
    styles.activityMarker,
    {
      left: `${position.x}%` as `${number}%`,
      marginLeft: -ACTIVITY_MARKER_CAPTURE_WIDTH / 2,
      marginTop: -(ACTIVITY_MARKER_CAPTURE_HEIGHT * ACTIVITY_MARKER_ANCHOR.y),
      top: `${position.y}%` as `${number}%`,
    },
  ];
}

function MapRoad({ className }: { className: string }) {
  return <View className={`absolute rounded-full bg-white/70 ${className}`} />;
}

function MapBlock({ className }: { className: string }) {
  return <View className={`absolute rounded-2xl bg-white/25 ${className}`} />;
}

const RING_SIZE = 56;

export function PreviewMapCanvas({
  pickingLocation = false,
  focusCoordinate,
  selectionFocus,
  onMarkerPress,
  onClusterPress,
  onCanvasPress,
  onRegionChange,
  onMapReady,
  journeyFocus,
  journeyTargetCoordinate,
  journeyParticipants = [],
  heimwegMarkers = [],
  onHeimwegMarkerPress,
  hideActivities = false,
  journeyUnderwayCounts,
  currentUser,
  selectedActivityId,
  onJourneyParticipantPress,
  launchMarkerId,
  onLaunchComplete,
}: PreviewMapCanvasProps) {
  const { mapMarkers, markerClusters } = useActivityEntities();
  const { isJoined, getUnreadCount } = useActivityChatActivity();
  const focusActivityId = journeyFocus?.activityId;
  const reducedMotion = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => onMapReady?.(), [onMapReady]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  // Pulsing navigation indicator
  const ringScale = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  // Web has no zoom morph — hold the markers at their mid (neighborhood) form.
  const webMorph = useSharedValue(0.5);

  // "Wurf & Pop" on publish in the browser preview. No camera exists here, so the marker lands
  // at its own on-canvas position instead of screen centre.
  const launchMarker = launchMarkerId
    ? mapMarkers.find((marker) => marker.id === launchMarkerId)
    : undefined;
  let launchRequest: MarkerLaunchRequest | null = null;
  if (launchMarker && size.width > 0 && size.height > 0) {
    const joined = isJoined(launchMarker.id);
    const display = participantDisplay(
      launchMarker.avatars,
      launchMarker.participantCount,
      {
        userId: launchMarker.userId,
        displayName: launchMarker.displayName,
        initials: launchMarker.initials,
        avatarUrl: launchMarker.avatarUrl,
      },
      joined,
      currentUser,
    );
    launchRequest = {
      id: launchMarker.id,
      accent: markerModeStyles[launchMarker.mode].color,
      land: {
        x: (projectCoordinateToCanvas(launchMarker.coordinate).x / 100) * size.width,
        y: (projectCoordinateToCanvas(launchMarker.coordinate).y / 100) * size.height,
      },
      node: (
        <AvatarMarker
          avatarUrl={launchMarker.avatarUrl}
          displayName={launchMarker.displayName}
          initials={launchMarker.initials}
          avatars={display.avatars}
          label={
            launchMarker.friendId
              ? launchMarker.displayName
              : (launchMarker.title ?? launchMarker.displayName)
          }
          progress={webMorph}
          mode={launchMarker.mode}
          participantCount={display.count}
          maxParticipants={launchMarker.maxParticipants}
          category={launchMarker.category}
          remainingFraction={countdownBucket(
            launchMarker.mode,
            launchMarker.startsAt,
            launchMarker.endsAt,
          )}
          selected={false}
        />
      ),
    };
  }

  const effectiveFocusCoordinate = selectionFocus?.coordinate ?? focusCoordinate;

  useEffect(() => {
    onRegionChange?.(
      effectiveFocusCoordinate
        ? {
            ...effectiveFocusCoordinate,
            latitudeDelta: DEFAULT_MAP_REGION.latitudeDelta,
            longitudeDelta: DEFAULT_MAP_REGION.longitudeDelta,
          }
        : DEFAULT_MAP_REGION,
    );
  }, [effectiveFocusCoordinate, onRegionChange]);

  useEffect(() => {
    if (!effectiveFocusCoordinate) return;

    // Pulse 3× then fade out
    ringScale.value = 0.15;
    ringOpacity.value = 1;
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }),
        withTiming(0.15, { duration: 80 }),
      ),
      3,
      false,
    );
    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 80 }),
      ),
      3,
      false,
    );
  }, [effectiveFocusCoordinate, ringOpacity, ringScale]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const navPos = effectiveFocusCoordinate
    ? projectCoordinateToCanvas(effectiveFocusCoordinate)
    : null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      className="overflow-hidden bg-[#dbe6dc]"
      onLayout={handleLayout}
    >
      <View className="absolute inset-0 bg-[#dbe6dc]" />
      <View className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-[#bdd9c8]" />
      <View className="absolute right-[-80px] top-48 h-64 w-64 rounded-full bg-[#cbd8e4]" />
      <View className="absolute bottom-[-120px] left-10 h-80 w-80 rounded-full bg-[#d8d2bd]" />

      <MapRoad className="left-[-40px] top-[18%] h-7 w-[120%] rotate-[-12deg]" />
      <MapRoad className="left-[8%] top-[-40px] h-[120%] w-6 rotate-[18deg]" />
      <MapRoad className="left-[34%] top-[-80px] h-[130%] w-5 rotate-[-25deg]" />
      <MapRoad className="left-[-60px] top-[58%] h-6 w-[130%] rotate-[8deg]" />
      <MapRoad className="left-[66%] top-[10%] h-[92%] w-5 rotate-[31deg]" />
      <MapRoad className="left-[4%] top-[82%] h-5 w-[90%] rotate-[-6deg]" />

      <MapBlock className="left-[22%] top-[30%] h-28 w-36" />
      <MapBlock className="left-[48%] top-[24%] h-24 w-28" />
      <MapBlock className="left-[12%] top-[54%] h-20 w-28" />
      <MapBlock className="left-[58%] top-[64%] h-24 w-32" />
      <MapBlock className="left-[70%] top-[22%] h-20 w-24" />

      <Pressable className="absolute inset-0" onPress={onCanvasPress} />

      {/* Navigation pulse — appears at the focused friend's canvas position */}
      {navPos ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              width: RING_SIZE,
              height: RING_SIZE,
              borderRadius: RING_SIZE / 2,
              borderWidth: 3,
              borderColor: markerModeStyles.open.color,
              backgroundColor: colorWithAlpha(markerModeStyles.open.color, 0.18),
              left: `${navPos.x}%`,
              top: `${navPos.y}%`,
              marginLeft: -RING_SIZE / 2,
              marginTop: -RING_SIZE / 2,
            },
            ringStyle,
          ]}
        />
      ) : null}

      {pickingLocation || hideActivities
        ? null
        : markerClusters
            .filter(
              (cluster) =>
                (!cluster.maxParticipants ||
                  cluster.count < cluster.maxParticipants ||
                  isJoined(cluster.id)) &&
                (!focusActivityId || cluster.id === focusActivityId),
            )
            .map((cluster) => {
              const joined = isJoined(cluster.id);
              const display = participantDisplay(
                cluster.avatars,
                cluster.count,
                undefined,
                joined,
                currentUser,
              );
              return (
                <View
                  key={cluster.id}
                  style={activityMarkerPosition(
                    focusActivityId === cluster.id && journeyTargetCoordinate
                      ? projectCoordinateToCanvas(journeyTargetCoordinate)
                      : projectCoordinateToCanvas(cluster.coordinate),
                  )}
                >
                  {cluster.mode === 'now' ||
                  selectedActivityId === cluster.id ||
                  (journeyUnderwayCounts?.[cluster.id] ?? 0) > 0 ? (
                    <LiveAura
                      color={markerModeStyles[cluster.mode].color}
                      selected={selectedActivityId === cluster.id}
                      style={styles.activityAura}
                    />
                  ) : null}
                  <ClusterMarker
                    avatars={display.avatars}
                    count={display.count}
                    label={cluster.label}
                    mode={cluster.mode}
                    progress={webMorph}
                    maxParticipants={cluster.maxParticipants}
                    category={cluster.category}
                    remainingFraction={countdownBucket(
                      cluster.mode,
                      cluster.startsAt,
                      cluster.endsAt,
                    )}
                    journeyUnderwayCount={journeyUnderwayCounts?.[cluster.id] ?? 0}
                    selected={selectedActivityId === cluster.id}
                    onPress={() => onClusterPress?.(cluster)}
                  />
                </View>
              );
            })}

      {pickingLocation || hideActivities
        ? null
        : mapMarkers
            .filter(
              (marker) =>
                (!marker.maxParticipants ||
                  (marker.participantCount ?? 0) < marker.maxParticipants ||
                  isJoined(marker.id)) &&
                (!focusActivityId || marker.id === focusActivityId) &&
                // Hidden while its "Wurf & Pop" launch plays; revealed on complete.
                marker.id !== launchMarkerId,
            )
            .map((marker) => {
              const joined = isJoined(marker.id);
              const display = participantDisplay(
                marker.avatars,
                marker.participantCount,
                {
                  userId: marker.userId,
                  displayName: marker.displayName,
                  initials: marker.initials,
                  avatarUrl: marker.avatarUrl,
                },
                joined,
                currentUser,
              );
              return (
                <View
                  key={marker.id}
                  style={activityMarkerPosition(
                    focusActivityId === marker.id && journeyTargetCoordinate
                      ? projectCoordinateToCanvas(journeyTargetCoordinate)
                      : projectCoordinateToCanvas(marker.coordinate),
                  )}
                >
                  {marker.mode === 'now' ||
                  selectedActivityId === marker.id ||
                  (journeyUnderwayCounts?.[marker.id] ?? 0) > 0 ? (
                    <LiveAura
                      color={markerModeStyles[marker.mode].color}
                      selected={selectedActivityId === marker.id}
                      style={styles.activityAura}
                    />
                  ) : null}
                  <AvatarMarker
                    avatarUrl={marker.avatarUrl}
                    displayName={marker.displayName}
                    initials={marker.initials}
                    avatars={display.avatars}
                    label={
                      marker.friendId ? marker.displayName : (marker.title ?? marker.displayName)
                    }
                    progress={webMorph}
                    mode={marker.mode}
                    unreadCount={joined ? getUnreadCount(marker.id) : 0}
                    participantCount={display.count}
                    maxParticipants={marker.maxParticipants}
                    category={marker.category}
                    remainingFraction={countdownBucket(marker.mode, marker.startsAt, marker.endsAt)}
                    journeyUnderwayCount={journeyUnderwayCounts?.[marker.id] ?? 0}
                    selected={selectedActivityId === marker.id}
                    onPress={() => onMarkerPress?.(marker)}
                  />
                </View>
              );
            })}

      {!pickingLocation && !hideActivities && focusActivityId
        ? journeyParticipants
            .filter((participant) => participant.coordinate)
            .map((participant) => (
              <View
                key={participant.userId}
                className="absolute -translate-x-14 -translate-y-14"
                style={mapPosition(projectCoordinateToCanvas(participant.coordinate!))}
              >
                <JourneyAvatarMarker
                  participant={participant}
                  highlighted={journeyFocus?.participantId === participant.userId}
                  onPress={() => onJourneyParticipantPress?.(participant)}
                />
              </View>
            ))
        : null}

      {/* Heimweg markers — shown only by the dedicated focus caller. */}
      {!pickingLocation
        ? heimwegMarkers.map((marker) => (
            <View
              key={`heimweg-${marker.uid}`}
              className="absolute -translate-x-14 -translate-y-14"
              style={mapPosition(projectCoordinateToCanvas(marker.coordinate))}
            >
              <JourneyAvatarMarker
                participant={{
                  userId: marker.uid,
                  displayName: marker.displayName,
                  initials: marker.initials,
                  status: 'underway',
                  distanceKm: 0,
                  updatedAt: '',
                }}
                color={marker.color}
                showStatusBadge={false}
                subLabel={marker.subLabel}
                onPress={onHeimwegMarkerPress ? () => onHeimwegMarkerPress(marker.uid) : undefined}
              />
            </View>
          ))
        : null}

      <MarkerLaunchOverlay
        request={launchRequest}
        width={size.width}
        height={size.height}
        reducedMotion={reducedMotion}
        onComplete={() => onLaunchComplete?.()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  activityAura: {
    left: (ACTIVITY_MARKER_CAPTURE_WIDTH - LIVE_AURA_SIZE) / 2,
    top: -8,
  },
  activityMarker: {
    height: ACTIVITY_MARKER_CAPTURE_HEIGHT,
    position: 'absolute',
    width: ACTIVITY_MARKER_CAPTURE_WIDTH,
  },
});
