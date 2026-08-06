import Constants from 'expo-constants';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, UIManager, View, type LayoutChangeEvent } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  type LongPressEvent,
  type MapPressEvent,
  type PoiClickEvent,
  type Region,
} from 'react-native-maps';

import {
  cancelAnimation,
  Easing,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useActivityEntities } from '@/features/activities';
import { useActivityChatActivity } from '@/features/chat';

import { useMapStyle } from '../mapStyle/useMapStyle';
import type { MapCoordinate } from '../types/map.types';
import { countdownBucket } from '../utils/countdown';
import { markerModeStyles } from '../utils/markerStyles';
import { participantDisplay } from '../utils/markerParticipants';
import { zoomProgressForDelta } from '../utils/markerDetailLevel';
import { DEFAULT_MAP_REGION } from '../utils/defaultRegion';
import { AvatarMarker } from './AvatarMarker';
import { ClusterMarker } from './ClusterMarker';
import { JourneyAvatarMarker } from './JourneyAvatarMarker';
import { ACTIVITY_MARKER_ANCHOR, ACTIVITY_MARKER_AURA_OFFSET_Y } from './activityMarkerLayout';
import { MapLiveAuraOverlay, type LiveAuraTarget } from './MapLiveAuraOverlay';
import { MapMarkerMorphOverlay, type MorphCameraValues } from './MapMarkerMorphOverlay';
import { MarkerDismissOverlay, type MarkerDismissRequest } from './MarkerDismissOverlay';
import { MarkerLaunchOverlay, type MarkerLaunchRequest } from './MarkerLaunchOverlay';
import { useMarkerImages } from './markerCapture';
import { PreviewMapCanvas, type PreviewMapCanvasProps } from './PreviewMapCanvas';

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
  Platform.OS === 'android' || IOS_HAS_GOOGLE_RENDERER ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

/**
 * "Centred" means centred in the map the user can actually SEE.
 *
 * A sheet covering the lower part of the screen moves the visible centre up, so
 * the camera centre has to move the opposite way — south by half the covered
 * height. This used to be a hard-coded 0.28 of the viewport, calibrated for one
 * particular sheet; every other sheet (and no sheet at all) then put the pin
 * somewhere between slightly and badly off. Deriving it from the real covered
 * height is self-calibrating: 0 obstruction → dead centre, and a sheet covering
 * 56% of the screen reproduces exactly the old 0.28.
 *
 * Capped at 80% because past that there is no meaningful map strip left to
 * centre anything in, and the correction would fling the target off-screen.
 */
function focusCenterOffset(coveredHeight: number, viewportHeight: number) {
  if (viewportHeight <= 0) return 0;
  const covered = Math.max(0, Math.min(coveredHeight, viewportHeight * 0.8));
  return covered / (2 * viewportHeight);
}

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
  morphable?: boolean;
}

// Frame count for the captured avatar morph (2×2 quad → unfolded row when an
// activity has several people). These captures ARE the animation: each step is
// a distinct PNG rendered from the node at that `zoomProgress`. Lowering it
// makes the reordering coarse — do not "optimise" this to cut native image
// swaps while zooming, the swaps are the frames.
const MORPH_CAPTURE_STEPS = 8;
const ACTIVITY_MARKER_VISUAL_VERSION = 'avatar-squircle-160-v3';
const ZOOM_FRAME_EPSILON = 0.0005;
const MORPH_VIEWPORT_RADIUS = 2.5;
const MORPH_SETTLE_POINTS = [0, 0.5, 1] as const;
const MORPH_SETTLE_TRIGGER = 0.055;
const MORPH_SETTLE_EPSILON = 0.008;

function morphCaptureStep(progress: number) {
  return Math.round(Math.max(0, Math.min(1, progress)) * MORPH_CAPTURE_STEPS);
}

function isNearMorphViewport(descriptor: MarkerDescriptor, region: Region) {
  return (
    Math.abs(descriptor.coordinate.latitude - region.latitude) <=
      region.latitudeDelta * MORPH_VIEWPORT_RADIUS &&
    Math.abs(descriptor.coordinate.longitude - region.longitude) <=
      region.longitudeDelta * MORPH_VIEWPORT_RADIUS
  );
}

function markerSettleTarget(start: number, current: number) {
  const delta = current - start;
  if (Math.abs(delta) < MORPH_SETTLE_TRIGGER) return start;
  if (delta > 0) {
    return MORPH_SETTLE_POINTS.find((point) => point >= current - MORPH_SETTLE_EPSILON) ?? 1;
  }
  return (
    [...MORPH_SETTLE_POINTS].reverse().find((point) => point <= current + MORPH_SETTLE_EPSILON) ?? 0
  );
}

function markerSettleDuration(
  remainingProgress: number,
  progressVelocity: number,
  reducedMotion: boolean,
) {
  if (reducedMotion) return 0;
  const speed = Math.abs(progressVelocity);
  const duration =
    speed > 0.05 ? (remainingProgress / speed) * 1000 : 170 + remainingProgress * 220;
  return Math.round(Math.max(120, Math.min(280, duration)));
}

/**
 * MapCanvas is the single rendering swap point. Native builds use
 * react-native-maps; the browser preview projects the same real coordinates
 * onto its decorative canvas.
 */
export function MapCanvas(props: PreviewMapCanvasProps) {
  const mapRef = useRef<MapView | null>(null);
  const regionRef = useRef<Region>(DEFAULT_MAP_REGION);
  const zoomingRef = useRef(false);
  const settlingZoomRef = useRef(false);
  const settleTargetRef = useRef(zoomProgressForDelta(DEFAULT_MAP_REGION.latitudeDelta));
  const pendingSettleRegionRef = useRef<Region>(DEFAULT_MAP_REGION);
  const settledMorphProgressRef = useRef(zoomProgressForDelta(DEFAULT_MAP_REGION.latitudeDelta));
  const gestureRawStartProgressRef = useRef(settledMorphProgressRef.current);
  const gestureVisualStartProgressRef = useRef(settledMorphProgressRef.current);
  const gestureFallbackTargetRef = useRef<number | null>(null);
  const gestureLastProgressRef = useRef(settledMorphProgressRef.current);
  const gestureLastTimestampRef = useRef(0);
  const gestureProgressVelocityRef = useRef(0);
  const movingRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapMoving, setMapMoving] = useState(false);
  const [mapZooming, setMapZooming] = useState(false);
  const [markerMorphVisible, setMarkerMorphVisible] = useState(false);
  const [activeMorphIds, setActiveMorphIds] = useState<string[]>([]);
  const [settledMorphStep, setSettledMorphStep] = useState(() =>
    morphCaptureStep(zoomProgressForDelta(DEFAULT_MAP_REGION.latitudeDelta)),
  );
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [auraProjectionKey, setAuraProjectionKey] = useState(0);
  const reducedMotion = useReducedMotion();
  // Camera projection and marker shape deliberately use separate shared values.
  // That lets the marker finish its morph after release without forcing the
  // expensive native map itself to keep zooming.
  const morphFrame = useSharedValue({
    latitude: DEFAULT_MAP_REGION.latitude,
    longitude: DEFAULT_MAP_REGION.longitude,
    latitudeDelta: DEFAULT_MAP_REGION.latitudeDelta,
    longitudeDelta: DEFAULT_MAP_REGION.longitudeDelta,
  });
  const zoomProgress = useSharedValue(zoomProgressForDelta(DEFAULT_MAP_REGION.latitudeDelta));
  const morphCamera: MorphCameraValues = {
    frame: morphFrame,
  };
  const { mapMarkers, markerClusters } = useActivityEntities();
  const { isJoined, getUnreadCount } = useActivityChatActivity();
  const { mapStyle, colorScheme } = useMapStyle();
  // Applying a customMapStyle repaints the native map. That is invisible on a
  // still map, but lands as a hitch if it happens mid-pan or mid-pinch — the
  // one moment the eye is tracking the map closely. So the solar palette is
  // held while a gesture is running and applied on the next settle. Nothing is
  // dropped: only the LATEST style is kept, and the sun moves far slower than
  // any gesture lasts.
  const [appliedMapStyle, setAppliedMapStyle] = useState(mapStyle);
  useEffect(() => {
    if (mapMoving || mapZooming) return;
    setAppliedMapStyle(mapStyle);
  }, [mapStyle, mapMoving, mapZooming]);
  const focusActivityId = props.journeyFocus?.activityId;
  const { uris, imageUriFor, renderCaptureLayer } = useMarkerImages();

  const updateMorphCamera = (region: Region) => {
    morphFrame.value = {
      latitude: region.latitude,
      longitude: region.longitude,
      latitudeDelta: region.latitudeDelta,
      longitudeDelta: region.longitudeDelta,
    };
  };

  const finishRegionChange = (region: Region, progress: number, completedZoom: boolean) => {
    regionRef.current = region;
    updateMorphCamera(region);
    if (completedZoom) {
      settlingZoomRef.current = false;
      zoomingRef.current = false;
      gestureFallbackTargetRef.current = null;
      settledMorphProgressRef.current = progress;
      zoomProgress.value = progress;
      setSettledMorphStep(morphCaptureStep(progress));
      setMapZooming(false);
    }
    props.onRegionChange?.({
      latitude: region.latitude,
      longitude: region.longitude,
      latitudeDelta: region.latitudeDelta,
      longitudeDelta: region.longitudeDelta,
    });
    movingRef.current = false;
    setMapMoving(false);
    setAuraProjectionKey((current) => current + 1);
  };

  const finishMarkerSettle = (target: number) => {
    // A new pinch may have cancelled this timing before its UI-thread callback
    // reached JS. Never let that stale callback end the newer gesture.
    if (!settlingZoomRef.current || settleTargetRef.current !== target) return;
    finishRegionChange(pendingSettleRegionRef.current, target, true);
  };

  const handleViewportLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  // `mapReady` is part of the guard AND the deps on purpose. The first location
  // fix usually resolves from a cached position before the native map has
  // finished initialising, so animating then hits a null/unready mapRef and is
  // silently dropped — and because focusCoordinate never changes again, nothing
  // ever retries and the camera stays on the Berlin initialRegion. Depending on
  // mapReady replays the pending focus the moment the map can accept it.
  // Whatever currently hides the bottom of the map — an open detail sheet, the
  // Safety split deck. Read at focus time, so the camera compensates for what is
  // actually on screen at that moment.
  const coveredHeight = Math.max(props.bottomOverlayHeight ?? 0, props.bottomSheetHeight ?? 0);
  const coveredRef = useRef(coveredHeight);
  coveredRef.current = coveredHeight;
  const viewportRef = useRef(viewport.height);
  viewportRef.current = viewport.height;

  useEffect(() => {
    if (!mapReady || !props.focusCoordinate) return;

    const latitudeDelta = 0.012;
    mapRef.current?.animateToRegion(
      {
        latitude:
          props.focusCoordinate.latitude -
          latitudeDelta * focusCenterOffset(coveredRef.current, viewportRef.current),
        longitude: props.focusCoordinate.longitude,
        latitudeDelta,
        longitudeDelta: 0.01,
      },
      280,
    );
  }, [mapReady, props.focusCoordinate]);

  useEffect(() => {
    if (!mapReady || !props.selectionFocus) return;

    const region = regionRef.current;
    mapRef.current?.animateToRegion(
      {
        latitude:
          props.selectionFocus.coordinate.latitude -
          region.latitudeDelta * focusCenterOffset(coveredRef.current, viewportRef.current),
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
          captureKey: `${ACTIVITY_MARKER_VISUAL_VERSION}:cluster:${display.count}:${cluster.mode}:${cluster.maxParticipants ?? 0}:${cluster.category ?? ''}:${bucket ?? ''}:${avatarKey}:${props.journeyUnderwayCounts?.[cluster.id] ?? 0}:${selected}:${cluster.label ?? ''}:morph:${settledMorphStep}`,
          coordinate:
            focusActivityId === cluster.id && props.journeyTargetCoordinate
              ? props.journeyTargetCoordinate
              : cluster.coordinate,
          anchor: ACTIVITY_MARKER_ANCHOR,
          morphable: true,
          onPress: () => props.onClusterPress?.(cluster),
          node: (
            <ClusterMarker
              avatars={display.avatars}
              count={display.count}
              label={cluster.label}
              mode={cluster.mode}
              progress={zoomProgress}
              titlePriority={selected || joined}
              maxParticipants={cluster.maxParticipants}
              category={cluster.category}
              remainingFraction={bucket}
              journeyUnderwayCount={props.journeyUnderwayCounts?.[cluster.id] ?? 0}
              selected={selected}
            />
          ),
        });
        if (
          cluster.mode === 'now' ||
          selected ||
          (props.journeyUnderwayCounts?.[cluster.id] ?? 0) > 0
        ) {
          auraTargets.push({
            id: cluster.id,
            coordinate:
              focusActivityId === cluster.id && props.journeyTargetCoordinate
                ? props.journeyTargetCoordinate
                : cluster.coordinate,
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
          captureKey: `${ACTIVITY_MARKER_VISUAL_VERSION}:avatar:${marker.mode}:${marker.avatarUrl ?? marker.initials}:${marker.displayName}:${avatarKey}:${joined}:${unreadCount}:${display.count}:${marker.maxParticipants ?? 0}:${marker.category ?? ''}:${bucket ?? ''}:${props.journeyUnderwayCounts?.[marker.id] ?? 0}:${selected}:${marker.title ?? ''}:${marker.friendId ?? ''}:morph:${settledMorphStep}`,
          coordinate:
            focusActivityId === marker.id && props.journeyTargetCoordinate
              ? props.journeyTargetCoordinate
              : marker.coordinate,
          anchor: ACTIVITY_MARKER_ANCHOR,
          morphable: true,
          onPress: () => props.onMarkerPress?.(marker),
          node: (
            <AvatarMarker
              avatarUrl={marker.avatarUrl}
              displayName={marker.displayName}
              initials={marker.initials}
              avatars={display.avatars}
              label={marker.friendId ? marker.displayName : (marker.title ?? marker.displayName)}
              progress={zoomProgress}
              titlePriority={selected || joined}
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
        if (
          marker.mode === 'now' ||
          selected ||
          (props.journeyUnderwayCounts?.[marker.id] ?? 0) > 0
        ) {
          auraTargets.push({
            id: marker.id,
            coordinate:
              focusActivityId === marker.id && props.journeyTargetCoordinate
                ? props.journeyTargetCoordinate
                : marker.coordinate,
            color: markerModeStyles[marker.mode].color,
            offsetY: ACTIVITY_MARKER_AURA_OFFSET_Y,
            selected,
          });
        }
      });
  }

  if (!props.pickingLocation && !props.hideActivities && focusActivityId) {
    (props.journeyParticipants ?? [])
      .filter((participant) => participant.coordinate)
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
          coordinate: participant.coordinate!,
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

  const activeMorphIdSet = new Set(activeMorphIds);
  const morphDescriptors = descriptors.filter((descriptor) => activeMorphIdSet.has(descriptor.id));
  const morphImagesReady = morphDescriptors.every((descriptor) =>
    Boolean(uris[descriptor.captureKey]),
  );

  useEffect(() => {
    if (!markerMorphVisible || mapZooming || !morphImagesReady) return;
    const frame = requestAnimationFrame(() => {
      setMarkerMorphVisible(false);
      setActiveMorphIds([]);
    });
    return () => cancelAnimationFrame(frame);
  }, [mapZooming, markerMorphVisible, morphImagesReady]);

  // Cancel "Pop": the pin bursts the moment the user confirms, never when the
  // server answers. `dismissMarkerId` is armed one frame BEFORE the activity is
  // dropped from the entity list — that frame is the only window in which the
  // node and its map position still exist, so the run is captured here and then
  // outlives the data it was built from.
  const [dismissRun, setDismissRun] = useState<MarkerDismissRequest | null>(null);
  const previousDescriptors = useRef<MarkerDescriptor[]>([]);
  const dismissId = props.dismissMarkerId;
  useEffect(() => {
    if (!dismissId) {
      setDismissRun(null);
      return;
    }
    // The previous frame is the fallback: should the entity removal ever land in
    // the same commit as the arming, this render no longer lists the marker.
    const descriptor =
      descriptors.find((item) => item.id === dismissId) ??
      previousDescriptors.current.find((item) => item.id === dismissId);
    const map = mapRef.current;
    if (!descriptor || !map) return;
    const source = mapMarkers.find((marker) => marker.id === dismissId);

    let active = true;
    void map
      .pointForCoordinate(descriptor.coordinate)
      .then((point) => {
        if (!active || !point) return;
        setDismissRun({
          id: dismissId,
          node: descriptor.node,
          accent: markerModeStyles[source?.mode ?? 'soon'].color,
          at: point,
        });
      })
      .catch(() => {
        // The renderer can reject projection while the map is busy. Without a
        // position there is nothing to pop — the pin is gone either way.
      });
    return () => {
      active = false;
    };
    // Keyed on the id ALONE on purpose: re-running on a later frame would look
    // for a marker the optimistic cancel has already removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissId]);

  // Declared AFTER the effect above so that effect still sees the frame before
  // this one. One assignment per render, no allocation.
  useEffect(() => {
    previousDescriptors.current = descriptors;
  });

  if (Platform.OS === 'web') {
    return <PreviewMapCanvas {...props} />;
  }

  // Publish "Wurf & Pop": a just-created marker is thrown in from the composer.
  // The map has recentred on it (MapScreen), so it lands at screen centre. We
  // reuse the marker's own live node so the flying pin is identical to the one
  // that settles, and hide the real raster marker until the launch completes.
  const launchDescriptor = props.launchMarkerId
    ? descriptors.find((descriptor) => descriptor.id === props.launchMarkerId)
    : undefined;
  const launchSource = props.launchMarkerId
    ? (mapMarkers.find((marker) => marker.id === props.launchMarkerId) ??
      markerClusters.find((cluster) => cluster.id === props.launchMarkerId))
    : undefined;
  const launchRequest: MarkerLaunchRequest | null =
    launchDescriptor && launchSource
      ? {
          id: launchDescriptor.id,
          node: launchDescriptor.node,
          accent: markerModeStyles[launchSource.mode].color,
          land: { x: viewport.width / 2, y: viewport.height / 2 },
        }
      : null;

  return (
    <View onLayout={handleViewportLayout} style={StyleSheet.absoluteFill}>
      {renderCaptureLayer(
        descriptors.map((descriptor) => ({
          markerId: descriptor.id,
          captureKey: descriptor.captureKey,
          node: descriptor.node,
        })),
      )}
      <MapView
        ref={mapRef}
        provider={MAP_PROVIDER}
        mapType="standard"
        // Ignored on the Apple fallback (PROVIDER_DEFAULT) — see MAP_PROVIDER above.
        customMapStyle={appliedMapStyle}
        // Sets `overrideUserInterfaceStyle` on the native Google map view. With
        // an empty customMapStyle this is what renders Google's OWN dark map,
        // which no style JSON can reproduce.
        userInterfaceStyle={colorScheme}
        initialRegion={DEFAULT_MAP_REGION}
        loadingEnabled
        mapPadding={{ top: 0, right: 0, bottom: props.bottomOverlayHeight ?? 0, left: 0 }}
        poiClickEnabled={!props.hideActivities}
        pitchEnabled={false}
        scrollEnabled
        rotateEnabled={false}
        // Google's building footprints. Was `false`, which is why the map read
        // as empty ground with roads on it — no palette change can bring back
        // geometry the MapView is not drawing.
        showsBuildings
        showsCompass={false}
        showsIndoors={false}
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
          if (props.hideActivities) return;
          props.onPlacePress?.(placeFromPoi(event));
        }}
        onRegionChange={(region: Region) => {
          // Compare to the last SETTLED viewport, not just the previous frame.
          // Otherwise a deliberately slow pinch can move less than the epsilon
          // per callback and never be recognized as zooming at all.
          const settled = regionRef.current;
          const latitudeZoomChange =
            Math.abs(region.latitudeDelta - settled.latitudeDelta) /
            Math.max(settled.latitudeDelta, 0.000001);
          const longitudeZoomChange =
            Math.abs(region.longitudeDelta - settled.longitudeDelta) /
            Math.max(settled.longitudeDelta, 0.000001);
          const zoomFrame = Math.max(latitudeZoomChange, longitudeZoomChange) > ZOOM_FRAME_EPSILON;
          const rawProgress = zoomProgressForDelta(region.latitudeDelta);

          // A fresh pinch can take over an in-flight marker-only settle. Start
          // from its exact current visual value so there is no jump backwards.
          if (zoomFrame && settlingZoomRef.current) {
            const interruptedProgress = zoomProgress.value;
            cancelAnimation(zoomProgress);
            settlingZoomRef.current = false;
            gestureFallbackTargetRef.current = settleTargetRef.current;
            gestureRawStartProgressRef.current = zoomProgressForDelta(
              regionRef.current.latitudeDelta,
            );
            gestureVisualStartProgressRef.current = interruptedProgress;
            gestureLastProgressRef.current = interruptedProgress;
            gestureLastTimestampRef.current = Date.now();
            gestureProgressVelocityRef.current = 0;
          }

          if (zoomFrame && !zoomingRef.current) {
            zoomingRef.current = true;
            gestureRawStartProgressRef.current = zoomProgressForDelta(settled.latitudeDelta);
            gestureVisualStartProgressRef.current = settledMorphProgressRef.current;
            gestureFallbackTargetRef.current = null;
            gestureLastProgressRef.current = settledMorphProgressRef.current;
            gestureLastTimestampRef.current = Date.now();
            gestureProgressVelocityRef.current = 0;
            setActiveMorphIds(
              descriptors
                .filter(
                  (descriptor) =>
                    descriptor.morphable && isNearMorphViewport(descriptor, regionRef.current),
                )
                .map((descriptor) => descriptor.id),
            );
            setMapZooming(true);
            setMarkerMorphVisible(true);
          }

          if (zoomingRef.current && !settlingZoomRef.current) {
            const liveProgress = Math.max(
              0,
              Math.min(
                1,
                gestureVisualStartProgressRef.current +
                  rawProgress -
                  gestureRawStartProgressRef.current,
              ),
            );
            const now = Date.now();
            const elapsed = now - gestureLastTimestampRef.current;
            if (elapsed > 0) {
              const instantVelocity =
                ((liveProgress - gestureLastProgressRef.current) / elapsed) * 1000;
              gestureProgressVelocityRef.current =
                gestureProgressVelocityRef.current * 0.65 + instantVelocity * 0.35;
              gestureLastProgressRef.current = liveProgress;
              gestureLastTimestampRef.current = now;
            }
            zoomProgress.value = liveProgress;
          }
          // Keep the short-lived overlay spatially attached even when the user
          // starts panning immediately while the settled PNG is still capturing.
          if (zoomFrame || zoomingRef.current || markerMorphVisible) {
            updateMorphCamera(region);
          }
          if (!movingRef.current) {
            movingRef.current = true;
            setMapMoving(true);
          }
        }}
        onRegionChangeComplete={(region: Region) => {
          const rawProgress = zoomProgressForDelta(region.latitudeDelta);
          updateMorphCamera(region);

          if (settlingZoomRef.current) {
            // The user may pan while the marker finishes. Keep its projection
            // current without interrupting the independent shape animation.
            pendingSettleRegionRef.current = region;
            regionRef.current = region;
            return;
          }

          if (zoomingRef.current) {
            const liveProgress = Math.max(
              0,
              Math.min(
                1,
                gestureVisualStartProgressRef.current +
                  rawProgress -
                  gestureRawStartProgressRef.current,
              ),
            );
            zoomProgress.value = liveProgress;
            let target = markerSettleTarget(gestureVisualStartProgressRef.current, liveProgress);
            if (
              Math.abs(liveProgress - gestureVisualStartProgressRef.current) <
                MORPH_SETTLE_TRIGGER &&
              gestureFallbackTargetRef.current != null
            ) {
              target = gestureFallbackTargetRef.current;
            }
            const remaining = Math.abs(target - liveProgress);
            pendingSettleRegionRef.current = region;
            regionRef.current = region;
            settleTargetRef.current = target;

            if (remaining > MORPH_SETTLE_EPSILON && !reducedMotion) {
              settlingZoomRef.current = true;
              zoomProgress.value = withTiming(
                target,
                {
                  duration: markerSettleDuration(
                    remaining,
                    gestureProgressVelocityRef.current,
                    reducedMotion,
                  ),
                  easing: Easing.out(Easing.cubic),
                },
                (finished) => {
                  if (finished) runOnJS(finishMarkerSettle)(target);
                },
              );
              return;
            }
            zoomProgress.value = target;
            finishRegionChange(region, target, true);
            return;
          }

          // A pure pan keeps the already-settled marker layout and only updates
          // the camera projection. No marker image needs to be regenerated.
          finishRegionChange(region, settledMorphProgressRef.current, false);
        }}
        onPress={(event: MapPressEvent) => {
          if (event.nativeEvent.action === 'marker-press') return;
          props.onCanvasPress?.();
        }}
      >
        {descriptors.map((descriptor) => {
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
              opacity={
                props.launchMarkerId === descriptor.id ||
                (descriptor.morphable && markerMorphVisible && activeMorphIdSet.has(descriptor.id))
                  ? 0
                  : 1
              }
            />
          );
        })}
      </MapView>
      <MapMarkerMorphOverlay
        camera={morphCamera}
        height={viewport.height}
        targets={morphDescriptors}
        visible={markerMorphVisible}
        width={viewport.width}
      />
      <MapLiveAuraOverlay
        mapReady={mapReady}
        mapRef={mapRef}
        moving={mapMoving}
        projectionKey={auraProjectionKey}
        targets={visibleAuraTargets}
      />
      <MarkerLaunchOverlay
        request={launchRequest}
        width={viewport.width}
        height={viewport.height}
        reducedMotion={reducedMotion}
        onComplete={() => props.onLaunchComplete?.()}
      />
      <MarkerDismissOverlay
        request={dismissRun}
        reducedMotion={reducedMotion}
        onComplete={() => props.onDismissComplete?.()}
      />
    </View>
  );
}
