import Constants from 'expo-constants';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, UIManager, View } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  type LongPressEvent,
  type MapPressEvent,
  type PoiClickEvent,
  type Region,
} from 'react-native-maps';

import { useActivityEntities } from '@/features/activities';
import { useActivityChatActivity } from '@/features/chat';

import { useMapStyle } from '../mapStyle/useMapStyle';
import type { MapCoordinate } from '../types/map.types';
import { countdownBucket } from '../utils/countdown';
import { darkMapStyle } from '../utils/mapStyle';
import { markerModeStyles } from '../utils/markerStyles';
import { participantDisplay } from '../utils/markerParticipants';
import {
  detailLevelForDelta,
  initialDetailLevel,
  type MapMarkerDetailLevel,
} from '../utils/markerDetailLevel';
import { berlinRegion, mockPositionToCoordinate } from '../utils/mockCoordinates';
import { AvatarMarker } from './AvatarMarker';
import { ClusterMarker } from './ClusterMarker';
import { JourneyAvatarMarker } from './JourneyAvatarMarker';
import {
  ACTIVITY_MARKER_ANCHOR,
  ACTIVITY_MARKER_AURA_OFFSET_Y,
  ACTIVITY_MARKER_CAPTURE_SIZE,
} from './activityMarkerLayout';
import { MapLiveAuraOverlay, type LiveAuraTarget } from './MapLiveAuraOverlay';
import { useMarkerImages } from './markerCapture';
import { MockMapCanvas, type MockMapCanvasProps } from './MockMapCanvas';

/**
 * Map provider decision ("Option A", see docs/backend-plan.md → Karten/Orte):
 * Google Maps on BOTH platforms, because POI tapping (`onPoiClick`) — the core
 * "tap a place → create an activity there" flow — only works with the Google
 * provider (verified: react-native-maps implements it only in AirGoogleMaps).
 *
 * - Android: always Google (react-native-maps' Android backend IS Google Maps).
 * - iOS dev/production build with the native Google renderer: Google.
 * - iOS in Expo Go: falls back to Apple Maps — Expo Go ships no Google Maps SDK
 *   on iOS and would crash otherwise. POI labels are not tappable there; use
 *   long-press or search instead.
 */
const IS_EXPO_GO = Constants.appOwnership === 'expo';
// `ios.config.googleMapsApiKey` is deliberately not exposed to JS at runtime,
// so checking Expo config would always select Apple Maps. Ask the native layer
// instead. This also keeps older preview builds safe: without AirGoogleMap
// they cleanly retain the Apple Maps fallback.
const IOS_HAS_GOOGLE_RENDERER =
  Platform.OS === 'ios' && !IS_EXPO_GO && UIManager.hasViewManagerConfig('AIRGoogleMap');
const MAP_PROVIDER =
  Platform.OS === 'android' || IOS_HAS_GOOGLE_RENDERER
    ? PROVIDER_GOOGLE
    : PROVIDER_DEFAULT;

// The detail sheet covers the lower portion of the map. Moving the map center
// south by this share places the selected location in the visual center of the
// remaining upper map instead of behind the sheet.
const DETAIL_SHEET_CENTER_OFFSET = 0.28;

function placeFromLongPress(event: LongPressEvent) {
  const { latitude, longitude } = event.nativeEvent.coordinate;

  return {
    id: `coordinate-${latitude.toFixed(5)}-${longitude.toFixed(5)}`,
    title: 'Ort ohne Namen',
    coordinate: { latitude, longitude },
    source: 'long-press' as const,
  };
}

function placeFromPoi(event: PoiClickEvent) {
  return {
    id: event.nativeEvent.placeId,
    title: event.nativeEvent.name?.trim() || 'Ort ohne Namen',
    coordinate: event.nativeEvent.coordinate,
    placeId: event.nativeEvent.placeId,
    source: 'poi' as const,
  };
}

interface MarkerDescriptor {
  /** Stable React identity (marker/cluster id) — never changes on appearance. */
  id: string;
  /** Encodes full visual state; drives the captured-image cache. */
  captureKey: string;
  coordinate: MapCoordinate;
  /** Activity pins point to their tail; Journey/Safety avatars remain centered. */
  anchor?: { x: number; y: number };
  node: ReactNode;
  onPress?: () => void;
  renderMode?: 'image' | 'live';
}

const LIVE_ACTIVITY_MARKERS = false;
const LIVE_MARKER_SETTLE_MS = 1800;

/**
 * Direct custom-view marker for the current Fabric renderer. Tracking is only
 * enabled while a visual state settles; leaving it on permanently makes Google
 * Maps re-snapshot every marker continuously and quickly degrades pan/zoom.
 */
function LiveActivityMapMarker({ descriptor }: { descriptor: MarkerDescriptor }) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), LIVE_MARKER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [descriptor.captureKey]);

  return (
    <Marker
      anchor={descriptor.anchor ?? { x: 0.5, y: 0.5 }}
      coordinate={descriptor.coordinate}
      onPress={descriptor.onPress}
      tracksViewChanges={tracksViewChanges}
    >
      <View collapsable={false} style={styles.liveMarkerHost}>
        {descriptor.node}
      </View>
    </Marker>
  );
}

/**
 * MapCanvas is the single swap point for map rendering.
 * Native platforms use react-native-maps for real pan/zoom. Mock `{ x, y }`
 * positions are mapped to Berlin test coordinates until backend data provides
 * real latitude/longitude values.
 */
export function MapCanvas(props: MockMapCanvasProps) {
  const mapRef = useRef<MapView | null>(null);
  const regionRef = useRef<Region>(berlinRegion);
  const [mapReady, setMapReady] = useState(false);
  const [mapMoving, setMapMoving] = useState(false);
  const [auraProjectionKey, setAuraProjectionKey] = useState(0);
  // Level-of-detail for markers. Changes ONLY when a hysteresis band is crossed
  // (below, in onRegionChangeComplete), so normal panning never re-renders.
  const [detailLevel, setDetailLevel] = useState<MapMarkerDetailLevel>(() =>
    initialDetailLevel(berlinRegion.latitudeDelta),
  );
  const { mapMarkers, markerClusters } = useActivityEntities();
  const { isJoined, getUnreadCount } = useActivityChatActivity();
  const { effectiveStyle } = useMapStyle();
  const focusActivityId = props.journeyFocus?.activityId;
  const { imageUriFor, renderCaptureLayer } = useMarkerImages();

  useEffect(() => {
    if (!props.focusCoordinate) return;

    mapRef.current?.animateToRegion(
      {
        latitude: props.focusCoordinate.latitude,
        longitude: props.focusCoordinate.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.01,
      },
      280,
    );
  }, [props.focusCoordinate]);

  useEffect(() => {
    if (!mapReady || !props.selectionFocus) return;

    const region = regionRef.current;
    mapRef.current?.animateToRegion(
      {
        latitude:
          props.selectionFocus.coordinate.latitude -
          region.latitudeDelta * DETAIL_SHEET_CENTER_OFFSET,
        longitude: props.selectionFocus.coordinate.longitude,
        latitudeDelta: region.latitudeDelta,
        longitudeDelta: region.longitudeDelta,
      },
      300,
    );
  }, [mapReady, props.selectionFocus]);

  useEffect(() => {
    const coordinates = props.fitRequest?.coordinates ?? [];
    if (!mapReady || !coordinates.length) return;
    if (coordinates.length === 1) {
      mapRef.current?.animateToRegion(
        {
          ...coordinates[0],
          latitudeDelta: 0.012,
          longitudeDelta: 0.01,
        },
        320,
      );
      return;
    }
    mapRef.current?.fitToCoordinates(coordinates, {
      animated: true,
      edgePadding: {
        top: 150,
        right: 72,
        bottom: Math.max(260, (props.bottomOverlayHeight ?? 0) + 48),
        left: 72,
      },
    });
  }, [mapReady, props.bottomOverlayHeight, props.fitRequest]);

  if (Platform.OS === 'web') {
    return <MockMapCanvas {...props} />;
  }

  // Build one descriptor per marker. Each carries the off-screen `node` to
  // capture and a `captureKey` encoding its full visual state; the map then
  // renders `<Marker image>` from the captured PNG (see markerCapture.tsx for
  // why — react-native-maps clips custom marker Views on Android/Fabric).
  const descriptors: MarkerDescriptor[] = [];
  const auraTargets: LiveAuraTarget[] = [];

  // Countdown ring: `countdownBucket` (utils/countdown.ts) quantizes the
  // remaining share of a running `now` activity to 8 steps, so the cached
  // marker image only re-captures on a step change (the provider's 30s mode
  // tick re-renders this component and advances the step).
  // hideActivities = Heimweg-Fokus: the map shows ONLY the shared walks.
  if (!props.pickingLocation && !props.hideActivities) {
    markerClusters
      .filter(
        (cluster) =>
          (!cluster.maxParticipants ||
            cluster.count < cluster.maxParticipants ||
            isJoined(cluster.id)) &&
          (!focusActivityId || cluster.id === focusActivityId),
      )
      .forEach((cluster) => {
        const joined = isJoined(cluster.id);
        const selected = props.selectedActivityId === cluster.id;
        const display = participantDisplay(
          cluster.avatars,
          cluster.count,
          undefined,
          joined,
          props.currentUser,
        );
        const avatarKey = display.avatars
          .slice(0, 4)
          .map((avatar) => avatar.avatarUrl ?? avatar.initials)
          .join(',');
        const bucket = countdownBucket(cluster.mode, cluster.startsAt, cluster.endsAt);
        descriptors.push({
          id: cluster.id,
          captureKey: `cluster:${display.count}:${cluster.mode}:${cluster.maxParticipants ?? 0}:${cluster.category ?? ''}:${bucket ?? ''}:${avatarKey}:${props.journeyUnderwayCounts?.[cluster.id] ?? 0}:${selected}:${detailLevel}:${cluster.label ?? ''}`,
          coordinate:
            focusActivityId === cluster.id && props.journeyTargetCoordinate
              ? props.journeyTargetCoordinate
              : mockPositionToCoordinate(cluster.position),
          anchor: ACTIVITY_MARKER_ANCHOR,
          renderMode: LIVE_ACTIVITY_MARKERS ? 'live' : 'image',
          onPress: () => props.onClusterPress?.(cluster),
          node: (
              <ClusterMarker
              avatars={display.avatars}
              count={display.count}
              label={cluster.label}
              mode={cluster.mode}
              detailLevel={detailLevel}
              titlePriority={selected || joined || cluster.mode === 'now'}
              maxParticipants={cluster.maxParticipants}
              category={cluster.category}
              remainingFraction={bucket}
              journeyUnderwayCount={props.journeyUnderwayCounts?.[cluster.id] ?? 0}
                selected={selected}
            />
          ),
        });
        if (cluster.mode === 'now' || selected || (props.journeyUnderwayCounts?.[cluster.id] ?? 0) > 0) {
          auraTargets.push({
            id: cluster.id,
            coordinate:
              focusActivityId === cluster.id && props.journeyTargetCoordinate
                ? props.journeyTargetCoordinate
                : mockPositionToCoordinate(cluster.position),
            color: markerModeStyles[cluster.mode].color,
            offsetY: ACTIVITY_MARKER_AURA_OFFSET_Y,
            selected,
          });
        }
      });

    mapMarkers
      .filter(
        (marker) =>
          (!marker.maxParticipants ||
            (marker.participantCount ?? 0) < marker.maxParticipants ||
            isJoined(marker.id)) &&
          (!focusActivityId || marker.id === focusActivityId),
      )
      .forEach((marker) => {
        const joined = isJoined(marker.id);
        const selected = props.selectedActivityId === marker.id;
        const unreadCount = joined ? getUnreadCount(marker.id) : 0;
        const bucket = countdownBucket(marker.mode, marker.startsAt, marker.endsAt);
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
          props.currentUser,
        );
        const avatarKey = display.avatars
          .slice(0, 4)
          .map((avatar) => `${avatar.userId}:${avatar.avatarUrl ?? avatar.initials}`)
          .join(',');
        descriptors.push({
          id: marker.id,
          captureKey: `avatar:${marker.mode}:${marker.avatarUrl ?? marker.initials}:${marker.displayName}:${avatarKey}:${joined}:${unreadCount}:${display.count}:${marker.maxParticipants ?? 0}:${marker.category ?? ''}:${bucket ?? ''}:${props.journeyUnderwayCounts?.[marker.id] ?? 0}:${selected}:${detailLevel}:${marker.title ?? ''}:${marker.friendId ?? ''}`,
          coordinate:
            focusActivityId === marker.id && props.journeyTargetCoordinate
              ? props.journeyTargetCoordinate
              : mockPositionToCoordinate(marker.position),
          anchor: ACTIVITY_MARKER_ANCHOR,
          renderMode: LIVE_ACTIVITY_MARKERS ? 'live' : 'image',
          onPress: () => props.onMarkerPress?.(marker),
          node: (
            <AvatarMarker
              avatarUrl={marker.avatarUrl}
              displayName={marker.displayName}
              initials={marker.initials}
              avatars={display.avatars}
              label={marker.friendId ? marker.displayName : marker.title ?? marker.displayName}
              detailLevel={detailLevel}
              titlePriority={selected || joined || marker.mode === 'now'}
              mode={marker.mode}
              unreadCount={unreadCount}
              participantCount={display.count}
              maxParticipants={marker.maxParticipants}
              category={marker.category}
              remainingFraction={bucket}
              journeyUnderwayCount={props.journeyUnderwayCounts?.[marker.id] ?? 0}
              selected={selected}
            />
          ),
        });
        if (marker.mode === 'now' || selected || (props.journeyUnderwayCounts?.[marker.id] ?? 0) > 0) {
          auraTargets.push({
            id: marker.id,
            coordinate:
              focusActivityId === marker.id && props.journeyTargetCoordinate
                ? props.journeyTargetCoordinate
                : mockPositionToCoordinate(marker.position),
            color: markerModeStyles[marker.mode].color,
            offsetY: ACTIVITY_MARKER_AURA_OFFSET_Y,
            selected,
          });
        }
      });
  }

  if (!props.pickingLocation && !props.hideActivities && focusActivityId) {
    (props.journeyParticipants ?? [])
      .filter((participant) => participant.position)
      .forEach((participant) => {
        const highlighted = props.journeyFocus?.participantId === participant.userId;
        descriptors.push({
          id: `journey-${participant.userId}`,
          // Visual state ONLY — never the coordinate or distance. Both change on
          // every live location tick without altering how the marker looks, and
          // keying on them forced a fresh off-screen capture per tick (battery
          // for nothing during an active Anreise). The position goes to
          // `<Marker coordinate>` separately.
          captureKey: `journey:${participant.userId}:${participant.status}:${participant.avatarUrl ?? participant.initials}:${highlighted}`,
          coordinate: participant.coordinate ?? mockPositionToCoordinate(participant.position!),
          onPress: () => props.onJourneyParticipantPress?.(participant),
          node: <JourneyAvatarMarker participant={participant} highlighted={highlighted} />,
        });
      });
  }

  // Heimweg markers exist only in the dedicated Heimweg-Fokus. The normal map
  // stays reserved for concrete activities; status color drives the captureKey
  // so a change re-captures the focused marker.
  if (!props.pickingLocation) {
    (props.heimwegMarkers ?? []).forEach((marker) => {
      descriptors.push({
        id: `heimweg-${marker.uid}`,
        captureKey: `heimweg:${marker.uid}:${marker.color}:${marker.initials}:${marker.displayName}:${marker.subLabel ?? ''}`,
        coordinate: marker.coordinate,
        onPress: props.onHeimwegMarkerPress
          ? () => props.onHeimwegMarkerPress?.(marker.uid)
          : undefined,
        node: (
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
          />
        ),
      });
    });
  }

  const visibleAuraTargets = auraTargets
    .sort((left, right) => Number(Boolean(right.selected)) - Number(Boolean(left.selected)))
    .slice(0, 4);

  return (
    <View style={StyleSheet.absoluteFill}>
      {renderCaptureLayer(
        descriptors
          .filter((descriptor) => descriptor.renderMode !== 'live')
          .map((descriptor) => ({
            markerId: descriptor.id,
            captureKey: descriptor.captureKey,
            node: descriptor.node,
          })),
      )}
      <MapView
        ref={mapRef}
        provider={MAP_PROVIDER}
        mapType={effectiveStyle === 'satellite' ? 'hybrid' : 'standard'}
        customMapStyle={effectiveStyle === 'night' ? darkMapStyle : undefined}
        initialRegion={berlinRegion}
        loadingEnabled
        mapPadding={{ top: 0, right: 0, bottom: props.bottomOverlayHeight ?? 0, left: 0 }}
        poiClickEnabled={!props.hideActivities}
        scrollEnabled
        rotateEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        showsPointsOfInterests={!props.hideActivities}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
        zoomEnabled
        onMapReady={() => {
          setMapReady(true);
          setAuraProjectionKey((current) => current + 1);
        }}
        onLongPress={(event: LongPressEvent) => {
          if (props.pickingLocation || props.hideActivities) return;
          props.onPlacePress?.(placeFromLongPress(event));
        }}
        onPoiClick={(event: PoiClickEvent) => {
          if (props.pickingLocation || props.hideActivities) return;
          props.onPlacePress?.(placeFromPoi(event));
        }}
        onRegionChange={() => {
          // Native map movement and a React overlay have independent clocks.
          // Hide the aura while panning, then reproject exactly once on settle.
          setMapMoving((currentlyMoving) => (currentlyMoving ? currentlyMoving : true));
        }}
        onRegionChangeComplete={(region: Region) => {
          // Keep the current native viewport without putting it in React state.
          // We use it only for the next detail-sheet focus, so panning remains
          // free of costly MapScreen renders.
          regionRef.current = region;
          // Cross a zoom band → re-render markers at the new detail level. The
          // hysteresis in detailLevelForDelta keeps this from firing near a
          // boundary; identical levels return the same value → no state change.
          setDetailLevel((current) => detailLevelForDelta(current, region.latitudeDelta));
          props.onRegionChange?.({
            latitude: region.latitude,
            longitude: region.longitude,
            latitudeDelta: region.latitudeDelta,
            longitudeDelta: region.longitudeDelta,
          });
          setMapMoving(false);
          setAuraProjectionKey((current) => current + 1);
        }}
        onPress={(event: MapPressEvent) => {
          if (event.nativeEvent.action === 'marker-press') return;
          props.onCanvasPress?.();
        }}
      >
        {descriptors.map((descriptor) => {
          if (descriptor.renderMode === 'live') {
            return <LiveActivityMapMarker key={descriptor.id} descriptor={descriptor} />;
          }

          // Keep the current raster marker on the map while a changed state
          // (for example a countdown-ring step) is captured off-screen.
          // Rendering `null` here created a visible blink every time the
          // captureKey advanced.
          const uri = imageUriFor(descriptor.id, descriptor.captureKey);
          if (!uri) return null;
          return (
            <Marker
              key={descriptor.id}
              anchor={descriptor.anchor ?? { x: 0.5, y: 0.5 }}
              coordinate={descriptor.coordinate}
              image={{ uri }}
              onPress={descriptor.onPress}
            />
          );
        })}
      </MapView>
      <MapLiveAuraOverlay
        mapReady={mapReady}
        mapRef={mapRef}
        moving={mapMoving}
        projectionKey={auraProjectionKey}
        targets={visibleAuraTargets}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  liveMarkerHost: {
    height: ACTIVITY_MARKER_CAPTURE_SIZE,
    width: ACTIVITY_MARKER_CAPTURE_SIZE,
  },
});
