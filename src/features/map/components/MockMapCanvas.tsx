import { useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
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
  MockMapPosition,
} from '../types/map.types';
import { countdownBucket } from '../utils/countdown';
import { berlinRegion, coordinateToMockPosition } from '../utils/mockCoordinates';
import { colorWithAlpha, markerModeStyles } from '../utils/markerStyles';
import { participantDisplay } from '../utils/markerParticipants';
import { ACTIVITY_MARKER_ANCHOR, ACTIVITY_MARKER_CAPTURE_SIZE } from './activityMarkerLayout';
import { AvatarMarker } from './AvatarMarker';
import { ClusterMarker } from './ClusterMarker';
import { JourneyAvatarMarker } from './JourneyAvatarMarker';
import { LiveAura } from './MapLiveAuraOverlay';

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

export interface MockMapCanvasProps {
  pickingLocation?: boolean;
  focusCoordinate?: MapCoordinate;
  /** One-shot camera focus that keeps a selected place above its detail sheet. */
  selectionFocus?: { id: number; coordinate: MapCoordinate };
  /** Explicit camera fit request; id changes only on entry/manual recenter. */
  fitRequest?: { id: number; coordinates: MapCoordinate[] };
  /** Fixed lower control deck in the split Safety mode. */
  bottomOverlayHeight?: number;
  onMarkerPress?: (marker: MapMarker) => void;
  onClusterPress?: (cluster: MarkerCluster) => void;
  onPlacePress?: (place: MapPlaceSelection) => void;
  onCanvasPress?: () => void;
  onRegionChange?: (region: MapRegion) => void;
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
}

function mapPosition(position: MockMapPosition) {
  return {
    left: `${position.x}%`,
    top: `${position.y}%`,
  } as const;
}

function activityMarkerPosition(position: MockMapPosition): StyleProp<ViewStyle> {
  return [
    styles.activityMarker,
    {
      left: `${position.x}%` as `${number}%`,
      marginLeft: -ACTIVITY_MARKER_CAPTURE_SIZE / 2,
      marginTop: -(ACTIVITY_MARKER_CAPTURE_SIZE * ACTIVITY_MARKER_ANCHOR.y),
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

export function MockMapCanvas({
  pickingLocation = false,
  focusCoordinate,
  selectionFocus,
  onMarkerPress,
  onClusterPress,
  onCanvasPress,
  onRegionChange,
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
}: MockMapCanvasProps) {
  const { mapMarkers, markerClusters } = useActivityEntities();
  const { isJoined, getUnreadCount } = useActivityChatActivity();
  const focusActivityId = journeyFocus?.activityId;

  // Pulsing navigation indicator
  const ringScale = useSharedValue(0);
  const ringOpacity = useSharedValue(0);

  const effectiveFocusCoordinate = selectionFocus?.coordinate ?? focusCoordinate;

  useEffect(() => {
    onRegionChange?.(
      effectiveFocusCoordinate
        ? {
            ...effectiveFocusCoordinate,
            latitudeDelta: berlinRegion.latitudeDelta,
            longitudeDelta: berlinRegion.longitudeDelta,
          }
        : berlinRegion,
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

  const navPos = effectiveFocusCoordinate ? coordinateToMockPosition(effectiveFocusCoordinate) : null;

  return (
    <View style={StyleSheet.absoluteFill} className="overflow-hidden bg-[#dbe6dc]">
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
                      ? coordinateToMockPosition(journeyTargetCoordinate)
                      : cluster.position,
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
                    detailLevel="neighborhood"
                    maxParticipants={cluster.maxParticipants}
                    category={cluster.category}
                    remainingFraction={countdownBucket(cluster.mode, cluster.startsAt, cluster.endsAt)}
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
                (!focusActivityId || marker.id === focusActivityId),
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
                      ? coordinateToMockPosition(journeyTargetCoordinate)
                      : marker.position,
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
                    label={marker.friendId ? marker.displayName : marker.title ?? marker.displayName}
                    detailLevel="neighborhood"
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
            .filter((participant) => participant.position || participant.coordinate)
            .map((participant) => (
              <View
                key={participant.userId}
                className="absolute -translate-x-14 -translate-y-14"
                style={mapPosition(
                  participant.coordinate
                    ? coordinateToMockPosition(participant.coordinate)
                    : participant.position!,
                )}
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
              style={mapPosition(coordinateToMockPosition(marker.coordinate))}
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
    </View>
  );
}

const styles = StyleSheet.create({
  activityAura: {
    left: 8,
    top: -8,
  },
  activityMarker: {
    height: ACTIVITY_MARKER_CAPTURE_SIZE,
    position: 'absolute',
    width: ACTIVITY_MARKER_CAPTURE_SIZE,
  },
});
