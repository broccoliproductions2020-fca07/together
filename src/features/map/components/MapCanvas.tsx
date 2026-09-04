import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import MapView, {
  Marker,
  type LongPressEvent,
  type MapPressEvent,
  type PoiClickEvent,
  type Region,
  type UserLocationChangeEvent,
} from 'react-native-maps';

import { MAP_PROVIDER } from '../utils/mapProvider';


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
import type { MapCoordinate, MapMarker } from '../types/map.types';
import { countdownBucket } from '../utils/countdown';
import {
  focusCameraCenterFromProjection,
  focusCameraOffset,
  focusTargetY,
  type FocusFrame,
} from '../utils/focusFraming';
import {
  activityStackCoordinate,
  activityStackId,
  groupMarkersByProjectedCollision,
  type MarkerCollisionBox,
  type MarkerCollisionCandidate,
  type ProjectedMarkerPoint,
} from '../utils/markerCollision';
import { markerModeStyles } from '../utils/markerStyles';
import { participantDisplay } from '../utils/markerParticipants';
import { visibleMarkerFaceCount, zoomProgressForDelta } from '../utils/markerDetailLevel';
import { MAP_PERSPECTIVE_PITCH } from '../utils/mapPerspective';
import {
  CAPTURE_ZOOM_OUT,
  QUIET_CAPTURE_STYLE,
  QUIET_MAP_CAPTURE,
} from '../utils/quietCaptureStyle';
import { DEFAULT_MAP_REGION } from '../utils/defaultRegion';
import { AvatarMarker } from './AvatarMarker';
import { ActivityStackMarker } from './ActivityStackMarker';
import { ClusterMarker } from './ClusterMarker';
import { JourneyAvatarMarker } from './JourneyAvatarMarker';
import {
  ACTIVITY_MARKER_ANCHOR,
  ACTIVITY_MARKER_CAPTURE_HEIGHT,
  ACTIVITY_MARKER_CAPTURE_WIDTH,
  ACTIVITY_MARKER_GROUND_HEIGHT,
  ACTIVITY_MARKER_GROUND_Y,
  ACTIVITY_MARKER_SHELL_TOP,
  activityMarkerCardWidth,
} from './activityMarkerLayout';
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
// The provider decision itself lives in utils/mapProvider so the composer's
// place preview cannot pick a different renderer than the main map.

/**
 * The sheet covers the screen's BOTTOM, not geographic south. A latitude-only
 * correction drifts sideways once someone rotates the map, because south is no
 * longer screen-down. Move the camera along the rotated screen axis instead.
 */
function focusCenterInVisibleMap(
  coordinate: MapCoordinate,
  latitudeDelta: number,
  longitudeDelta: number,
  frame: FocusFrame,
  viewportHeight: number,
  heading: number,
): MapCoordinate {
  const offset = focusCameraOffset(frame, viewportHeight);
  if (offset === 0) return coordinate;

  const radians = (heading * Math.PI) / 180;
  return {
    latitude: coordinate.latitude + latitudeDelta * offset * Math.cos(radians),
    longitude: coordinate.longitude + longitudeDelta * offset * Math.sin(radians),
  };
}

function zoomForLongitudeDelta(longitudeDelta: number, viewportWidth: number) {
  if (longitudeDelta <= 0 || viewportWidth <= 0) return undefined;
  const zoom = Math.log2((360 * viewportWidth) / (longitudeDelta * 256));
  return Math.max(3, Math.min(20, zoom));
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
  /** Pixel bounds of the captured PNG. iOS renders the raster as a normal
   * React Native image because Google Maps' native `image` loader is broken in
   * bridgeless Fabric builds. */
  rasterSize: { width: number; height: number };
  /** Activity pins point to their tail; Journey/Safety avatars remain centered. */
  anchor?: { x: number; y: number };
  node: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  morphable?: boolean;
  /**
   * Native marker stacking. A concrete activity must never be hidden behind a
   * presence dot that happens to sit on the same corner — an activity is a plan,
   * open is only a status. Selection wins over both so the thing you just tapped
   * is the thing you can see.
   */
  zIndex?: number;
}

/** Marker layers, low to high. */
const Z_ACTIVITY = 2;
const Z_SELECTED = 3;

// iOS+Google under Fabric never loads the `image` prop: react-native-maps
// resolves it through `[RCTBridge currentBridge]`, which is nil in bridgeless
// mode, so the marker stays blank without raising an error. Passing the same
// captured PNG as a child view sidesteps that loader entirely. Android keeps
// the prop — there the child path is the one that clips.
const MARKER_IMAGE_AS_CHILD = Platform.OS === 'ios';

/**
 * Collision geometry shared by single markers and the stacks that replace
 * them. Neither value depends on a marker, and the stack has to be measured
 * against the same box as its members or grouping would compare two rulers.
 */
const MARKER_COLLISION_HEIGHT =
  ACTIVITY_MARKER_GROUND_Y + ACTIVITY_MARKER_GROUND_HEIGHT - ACTIVITY_MARKER_SHELL_TOP;
const MARKER_COLLISION_ANCHOR: ProjectedMarkerPoint = {
  x: 0.5,
  y: (ACTIVITY_MARKER_GROUND_Y - ACTIVITY_MARKER_SHELL_TOP) / MARKER_COLLISION_HEIGHT,
};

// Frame count for the captured avatar morph (2×2 quad → unfolded row when an
// activity has several people). These captures ARE the animation: each step is
// a distinct PNG rendered from the node at that `zoomProgress`. Lowering it
// makes the reordering coarse — do not "optimise" this to cut native image
// swaps while zooming, the swaps are the frames.
const ACTIVITY_MARKER_VISUAL_VERSION = 'squircle-ring-160-v13';
const ZOOM_FRAME_EPSILON = 0.0005;
const MORPH_VIEWPORT_RADIUS = 2.5;
const MORPH_SETTLE_POINTS = [0, 0.5, 1] as const;
const MORPH_SETTLE_TRIGGER = 0.055;
const MORPH_SETTLE_EPSILON = 0.008;
/**
 * How many markers may run as live overlays at once. Each one is a real view
 * tree animating on the UI thread; the whole point of the raster markers is to
 * keep that count small. The selected marker always makes the cut, then the
 * ones nearest the centre of the map — the only ones the eye tracks during a
 * pinch anyway.
 */
const MORPH_MAX_OVERLAYS = 4;
/**
 * Hard ceiling on how long the raster markers may stay hidden behind the
 * overlay after a gesture ends. A stalled capture must degrade to "no
 * animation", never to "no marker".
 */
const MORPH_HANDOFF_TIMEOUT_MS = 900;
/** One extra viewport catches edge collisions without projecting off-screen feed items. */
const COLLISION_VIEWPORT_RADIUS = 1;

function collisionGroupSignature(groups: MarkerCollisionCandidate[][]) {
  return groups
    .map((group) =>
      group
        .map(({ marker }) => marker.id)
        .sort()
        .join(','),
    )
    .sort()
    .join('|');
}

/**
 * The ONE zoom the camera uses whenever it jumps to a single place the user
 * was not already looking at: `focusCoordinate` without `focusKeepZoom`, and
 * the single-coordinate branch of a fit request. Do not add a second value —
 * a Safety focus and "auf Karte zeigen" on the same friend arriving at
 * different zooms is what makes a map feel arbitrary.
 *
 * Tighter than the previous 0.012/0.01 for one concrete reason: Google renders
 * POI labels only above a zoom threshold, and the old value sat just under it —
 * so a place sent to the camera arrived centred but unnamed.
 */
/** `CAPTURE_ZOOM_OUT` is 1 outside a capture run — see `quietCaptureStyle`. */
const PLACE_FOCUS_LATITUDE_DELTA = 0.006 * CAPTURE_ZOOM_OUT;
const PLACE_FOCUS_LONGITUDE_DELTA = 0.005 * CAPTURE_ZOOM_OUT;

const PERSPECTIVE_DURATION = 420;

/**
 * The marker handoff between the raster PNG and the live morph overlay.
 *
 * Both representations must OVERLAP at every switch — the previous version
 * flipped `markerMorphVisible` and the native `opacity` in one commit, so the
 * JS overlay disappeared on the spot while the native marker was still loading
 * its new bitmap. That one-frame gap is the blink.
 *
 *  idle    → nothing running, raster markers own the map
 *  arming  → overlay mounted, raster STILL visible (waiting for real layout)
 *  live    → overlay laid out and painting, raster hidden
 *  handoff → new raster ready and shown again UNDER the overlay, which is
 *            removed a couple of frames later
 */
type MorphPhase = 'idle' | 'arming' | 'live' | 'handoff';

/** Squared degree distance — only ever used to rank, never to measure. */
function centerRank(descriptor: MarkerDescriptor, region: Region) {
  const dLat =
    (descriptor.coordinate.latitude - region.latitude) / Math.max(region.latitudeDelta, 1e-6);
  const dLng =
    (descriptor.coordinate.longitude - region.longitude) / Math.max(region.longitudeDelta, 1e-6);
  return dLat * dLat + dLng * dLng;
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

  /**
   * Screen position of a coordinate, for hosts that need to anchor something to
   * a marker — a detail sheet growing out of the one that was tapped.
   *
   * Asked live rather than cached, because the answer is only true for the
   * CURRENT camera: between opening and closing a sheet the map may have
   * panned, rotated or tilted. The renderer can also reject projection while it
   * is busy, which is why this resolves to `null` instead of throwing — a null
   * origin is already a meaningful answer everywhere it is consumed.
   */
  useImperativeHandle(
    props.ref,
    () => ({
      projectCoordinate: async (coordinate) => {
        try {
          const point = await mapRef.current?.pointForCoordinate(coordinate);
          return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
        } catch {
          return null;
        }
      },
    }),
    [props.ref],
  );
  const regionRef = useRef<Region>(DEFAULT_MAP_REGION);
  const collisionRegionRef = useRef<Region>(DEFAULT_MAP_REGION);
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
  const [morphPhase, setMorphPhase] = useState<MorphPhase>('idle');
  const [activeMorphIds, setActiveMorphIds] = useState<string[]>([]);
  // True only while the perspective camera is actually travelling. The aura
  // projects through `pointForCoordinate`, which reports the CURRENT camera —
  // sampling it mid-flight puts the glow somewhere the marker is not.
  const [cameraBusy, setCameraBusy] = useState(false);
  const cameraSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pitchRestoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraCommandRevisionRef = useRef(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
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
  /**
   * Capture runs quieten the ground (see `quietCaptureStyle`). APPENDED, never
   * merged: the solar palettes blend by array index and must stay untouched.
   */
  const shownMapStyle = useMemo(
    () => (QUIET_MAP_CAPTURE ? [...appliedMapStyle, ...QUIET_CAPTURE_STYLE] : appliedMapStyle),
    [appliedMapStyle],
  );
  const focusActivityId = props.journeyFocus?.activityId;

  /** The captured image belongs to one of three settled geometry stages. */
  const morphStage = Math.round(settledMorphProgressRef.current * 2) / 2;

  const renderableMarkers = [
    ...mapMarkers,
    ...(focusActivityId ? [] : (props.planningMarkers ?? [])),
  ].filter(
    (marker) =>
      marker.mode !== 'open' &&
      (!marker.maxParticipants ||
        (marker.participantCount ?? 0) < marker.maxParticipants ||
        isJoined(marker.id)) &&
      (!focusActivityId || marker.id === focusActivityId),
  );
  const collisionCandidates: MarkerCollisionCandidate[] = renderableMarkers.map((marker) => {
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
      props.currentUser,
    );
    const faceCount = visibleMarkerFaceCount(display.avatars, display.count);
    const title = marker.title ?? marker.displayName;
    const titlePriority = joined;
    const journeyCount = props.journeyUnderwayCounts?.[marker.id] ?? 0;
    return {
      marker,
      // What this marker ACTUALLY covers. It used to be floored at the width of
      // a fully-labelled stack pin, which is 31 px wider at street zoom — so
      // two pins stayed merged until there was 31 px more room between them
      // than either needed. The stack's own width is accounted for by
      // `stackCollisionBox` below, on the groups that really become one.
      width: activityMarkerCardWidth(
        faceCount,
        display.count <= 1,
        morphStage,
        titlePriority,
        title,
        journeyCount,
      ),
      height: MARKER_COLLISION_HEIGHT,
      anchor: MARKER_COLLISION_ANCHOR,
    };
  });
  const collisionProjectionKey = collisionCandidates
    .map(
      ({ marker, width, height, anchor }) =>
        `${marker.id}:${marker.coordinate.latitude}:${marker.coordinate.longitude}:${width}:${height}:${anchor?.x ?? 0.5}:${anchor?.y ?? 0.5}`,
    )
    .join('|');
  const [projectedMarkerPoints, setProjectedMarkerPoints] = useState<
    Record<string, ProjectedMarkerPoint>
  >({});

  /**
   * The box a merged group occupies, mirroring exactly what
   * `ActivityStackMarker` renders: one overflow face, solo shell, the count as
   * its title. Kept in step with that component — a stack measured smaller than
   * it draws would overlap its neighbours.
   */
  const stackCollisionBox = (members: MarkerCollisionCandidate[]): MarkerCollisionBox => ({
    width: activityMarkerCardWidth(1, true, morphStage, false, `${members.length} Activities`),
    height: MARKER_COLLISION_HEIGHT,
    anchor: MARKER_COLLISION_ANCHOR,
  });

  const independentCollisionIds = props.selectedActivityId
    ? new Set([props.selectedActivityId])
    : new Set<string>();
  const markerCollisionGroups = groupMarkersByProjectedCollision(
    collisionCandidates,
    projectedMarkerPoints,
    independentCollisionIds,
    stackCollisionBox,
  );
  const collisionCandidatesRef = useRef(collisionCandidates);
  const collisionProjectionKeyRef = useRef(collisionProjectionKey);
  const independentCollisionIdsRef = useRef(independentCollisionIds);
  const stackCollisionBoxRef = useRef(stackCollisionBox);
  const collisionGroupSignatureRef = useRef(collisionGroupSignature(markerCollisionGroups));
  const collisionProjectionFrameRef = useRef<number | null>(null);
  const collisionProjectionInFlightRef = useRef(false);
  const collisionProjectionPendingRef = useRef(false);
  const collisionProjectionActiveRef = useRef(true);
  const mapReadyRef = useRef(mapReady);

  collisionCandidatesRef.current = collisionCandidates;
  collisionProjectionKeyRef.current = collisionProjectionKey;
  independentCollisionIdsRef.current = independentCollisionIds;
  stackCollisionBoxRef.current = stackCollisionBox;
  collisionGroupSignatureRef.current = collisionGroupSignature(markerCollisionGroups);
  mapReadyRef.current = mapReady;

  const requestCollisionProjection = useCallback(() => {
    collisionProjectionPendingRef.current = true;
    if (collisionProjectionFrameRef.current != null || collisionProjectionInFlightRef.current) {
      return;
    }

    const projectLatest = () => {
      collisionProjectionFrameRef.current = null;
      if (!collisionProjectionActiveRef.current || !mapReadyRef.current) return;

      collisionProjectionPendingRef.current = false;
      const allCandidates = collisionCandidatesRef.current;
      const projectionKey = collisionProjectionKeyRef.current;
      const map = mapRef.current;

      if (!map || allCandidates.length === 0) {
        collisionGroupSignatureRef.current = '';
        setProjectedMarkerPoints((current) => (Object.keys(current).length === 0 ? current : {}));
        return;
      }

      const liveRegion = collisionRegionRef.current;
      const candidates = allCandidates.filter(
        ({ marker }) =>
          Math.abs(marker.coordinate.latitude - liveRegion.latitude) <=
            liveRegion.latitudeDelta * COLLISION_VIEWPORT_RADIUS &&
          Math.abs(marker.coordinate.longitude - liveRegion.longitude) <=
            liveRegion.longitudeDelta * COLLISION_VIEWPORT_RADIUS,
      );

      collisionProjectionInFlightRef.current = true;
      void Promise.all(
        candidates.map(async ({ marker }) => {
          try {
            const point = await map.pointForCoordinate(marker.coordinate);
            return point && Number.isFinite(point.x) && Number.isFinite(point.y)
              ? ([marker.id, point] as const)
              : null;
          } catch {
            return null;
          }
        }),
      )
        .then((entries) => {
          if (
            !collisionProjectionActiveRef.current ||
            projectionKey !== collisionProjectionKeyRef.current ||
            entries.some((entry) => entry == null)
          ) {
            return;
          }

          const points = Object.fromEntries(
            entries as Array<readonly [string, ProjectedMarkerPoint]>,
          );
          const groups = groupMarkersByProjectedCollision(
            allCandidates,
            points,
            independentCollisionIdsRef.current,
            stackCollisionBoxRef.current,
          );
          const signature = collisionGroupSignature(groups);
          if (signature === collisionGroupSignatureRef.current) return;

          collisionGroupSignatureRef.current = signature;
          setProjectedMarkerPoints(points);
        })
        .finally(() => {
          collisionProjectionInFlightRef.current = false;
          if (
            collisionProjectionActiveRef.current &&
            collisionProjectionPendingRef.current &&
            collisionProjectionFrameRef.current == null
          ) {
            collisionProjectionFrameRef.current = requestAnimationFrame(projectLatest);
          }
        });
    };

    collisionProjectionFrameRef.current = requestAnimationFrame(projectLatest);
  }, []);

  useEffect(() => {
    collisionProjectionActiveRef.current = true;
    return () => {
      collisionProjectionActiveRef.current = false;
      if (collisionProjectionFrameRef.current != null) {
        cancelAnimationFrame(collisionProjectionFrameRef.current);
        collisionProjectionFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    requestCollisionProjection();
  }, [
    collisionProjectionKey,
    mapReady,
    props.selectedActivityId,
    requestCollisionProjection,
    viewport.height,
    viewport.width,
  ]);

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
    collisionRegionRef.current = region;
    updateMorphCamera(region);
    if (completedZoom) {
      settlingZoomRef.current = false;
      zoomingRef.current = false;
      gestureFallbackTargetRef.current = null;
      settledMorphProgressRef.current = progress;
      zoomProgress.value = progress;
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
  // ever retries and the camera stays on the neutral initial region. Depending on
  // mapReady replays the pending focus the moment the map can accept it.
  // Whatever currently hides the bottom of the map — an open detail sheet, the
  // Safety split deck. Read at focus time, so the camera compensates for what is
  // actually on screen at that moment.
  const coveredHeight = Math.max(props.bottomOverlayHeight ?? 0, props.bottomSheetHeight ?? 0);
  const focusFrame: FocusFrame = {
    topCoveredHeight: props.topOverlayHeight ?? 0,
    bottomCoveredHeight: coveredHeight,
  };
  const focusFrameRef = useRef(focusFrame);
  focusFrameRef.current = focusFrame;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // The permanent tilted camera is kept in a ref because callbacks run after
  // programmatic viewport changes.
  const pitchedRef = useRef(true);

  /**
   * The heading the USER turned the map to, in degrees. Only gesture-driven
   * region changes write it — a programmatic `animateToRegion` levels the camera
   * to north as a side effect, and reading the heading back from that would
   * quietly erase the rotation we are trying to preserve.
   */
  const userHeadingRef = useRef(0);

  const markCameraBusy = (duration: number) => {
    setCameraBusy(true);
    if (cameraSettleTimer.current) clearTimeout(cameraSettleTimer.current);
    cameraSettleTimer.current = setTimeout(() => {
      cameraSettleTimer.current = null;
      setCameraBusy(false);
    }, duration + 90);
  };

  /**
   * `animateToRegion` and `fitToCoordinates` both describe a flat, north-up
   * viewport, so the renderer levels the camera AND turns it back to north.
   * Re-applying pitch and heading afterwards keeps the chosen perspective and
   * the user's rotation across recenter, focus and fit — without giving up
   * those well-tested framing helpers.
   *
   * Runs whenever there is something to restore: a pitch, a heading, or both.
   * It used to bail unless pitched, which is why a rotated 2D map snapped back
   * to north the moment anything focused a marker.
   */
  const restoreCameraAfter = (delay: number) => {
    if (pitchRestoreTimer.current) clearTimeout(pitchRestoreTimer.current);
    pitchRestoreTimer.current = setTimeout(() => {
      pitchRestoreTimer.current = null;
      cameraCommandRevisionRef.current += 1;
      mapRef.current?.animateCamera(
        { pitch: MAP_PERSPECTIVE_PITCH, heading: userHeadingRef.current },
        { duration: 220 },
      );
      markCameraBusy(220);
    }, delay);
  };

  const focusCamera = (
    coordinate: MapCoordinate,
    latitudeDelta: number,
    longitudeDelta: number,
    duration: number,
    keepZoom = false,
    frame = focusFrameRef.current,
  ) => {
    const map = mapRef.current;
    if (!map) return;
    const revision = ++cameraCommandRevisionRef.current;
    const cameraDuration = reducedMotion ? 0 : duration;
    const animate = (
      zoom?: number,
      heading = userHeadingRef.current,
      projectedCenter?: MapCoordinate,
    ) => {
      if (revision !== cameraCommandRevisionRef.current || mapRef.current !== map) return;
      map.animateCamera(
        {
          center:
            projectedCenter ??
            focusCenterInVisibleMap(
              coordinate,
              latitudeDelta,
              longitudeDelta,
              frame,
              viewportRef.current.height,
              heading,
            ),
          heading,
          pitch: MAP_PERSPECTIVE_PITCH,
          ...(zoom == null ? {} : { zoom }),
        },
        { duration: cameraDuration },
      );
      markCameraBusy(cameraDuration);
    };

    if (!keepZoom) {
      animate(zoomForLongitudeDelta(longitudeDelta, viewport.width));
      return revision;
    }

    // A partial camera update may be interpreted differently by each provider.
    // Reusing the native camera value makes "keep zoom" exact.
    void map.getCamera().then(
      (camera) => {
        if (revision !== cameraCommandRevisionRef.current || mapRef.current !== map) return;

        /*
         * A growing sheet may request a corrected frame while the previous
         * camera animation is still travelling. `getCamera()` and
         * `coordinateForPoint()` must describe the SAME native frame; sampling
         * both concurrently mixed two positions and made repeated opens walk
         * the marker farther down the screen. Freeze the sampled camera before
         * asking the native projection, then launch the one visible movement.
         */
        map.animateCamera(camera, { duration: 0 });
        requestAnimationFrame(() => {
          if (revision !== cameraCommandRevisionRef.current || mapRef.current !== map) return;
          void map
            .coordinateForPoint({
              x: viewportRef.current.width / 2,
              y: focusTargetY(frame, viewportRef.current.height),
            })
            .then(
              (coordinateAtTargetPoint) =>
                animate(
                  Number.isFinite(camera.zoom) ? camera.zoom : undefined,
                  Number.isFinite(camera.heading) ? (camera.heading ?? 0) : userHeadingRef.current,
                  focusCameraCenterFromProjection(
                    camera.center,
                    coordinate,
                    coordinateAtTargetPoint,
                  ),
                ),
              () =>
                animate(
                  Number.isFinite(camera.zoom) ? camera.zoom : undefined,
                  Number.isFinite(camera.heading) ? (camera.heading ?? 0) : userHeadingRef.current,
                ),
            );
        });
      },
      () => animate(),
    );
    return revision;
  };

  const cancelCameraCommand = (revision: number | undefined) => {
    if (revision == null || revision !== cameraCommandRevisionRef.current) return;
    const map = mapRef.current;
    const cancellationRevision = ++cameraCommandRevisionRef.current;
    if (!map) return;

    void map.getCamera().then((camera) => {
      if (cancellationRevision !== cameraCommandRevisionRef.current || mapRef.current !== map) {
        return;
      }
      map.animateCamera(camera, { duration: 0 });
      if (cameraSettleTimer.current) clearTimeout(cameraSettleTimer.current);
      cameraSettleTimer.current = null;
      setCameraBusy(false);
    });
  };

  useEffect(
    () => () => {
      cameraCommandRevisionRef.current += 1;
      if (cameraSettleTimer.current) clearTimeout(cameraSettleTimer.current);
      if (pitchRestoreTimer.current) clearTimeout(pitchRestoreTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!mapReady) return;
    // Establish the permanent tilt without resetting a heading the user may
    // already have chosen while the map was becoming ready.
    cameraCommandRevisionRef.current += 1;
    mapRef.current?.animateCamera(
      { pitch: MAP_PERSPECTIVE_PITCH, heading: userHeadingRef.current },
      { duration: PERSPECTIVE_DURATION },
    );
    markCameraBusy(PERSPECTIVE_DURATION);
    // markCameraBusy is deliberately not a dependency: this is a one-shot camera
    // move, and adding it would re-tilt on every unrelated render.
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !props.focusCoordinate) return;
    // Two different jobs behind one prop. Landing somewhere the user was NOT
    // looking (own location on first fix, "auf Karte zeigen") gets a prescribed
    // zoom, because whatever they were at says nothing about the new place.
    // Recentring on something they placed themselves keeps their zoom exactly —
    // pulling the camera to a fixed level right after the tap throws away the
    // view they were deliberately working in.
    const region = regionRef.current;
    const focusDuration = props.focusDuration ?? 280;
    focusCamera(
      props.focusCoordinate,
      props.focusKeepZoom ? region.latitudeDelta : PLACE_FOCUS_LATITUDE_DELTA,
      props.focusKeepZoom ? region.longitudeDelta : PLACE_FOCUS_LONGITUDE_DELTA,
      focusDuration,
      props.focusKeepZoom,
    );
    const focused = props.focusCoordinate;
    const completionTimer = setTimeout(() => props.onFocusComplete?.(focused), focusDuration + 90);
    return () => clearTimeout(completionTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, props.focusCoordinate, viewport.width]);

  useEffect(() => {
    if (!mapReady || !props.selectionFocus) return;

    const region = regionRef.current;
    // A requested delta is a "get at least this close" floor, never a target:
    // it exists so a tapped POI is legible, and someone already closer than
    // that is by definition looking at it. Taking it literally pulled the
    // camera back OUT from under a user who had zoomed in on purpose — the
    // same complaint the publish path had. No request → keep the zoom exactly.
    const revision = focusCamera(
      props.selectionFocus.coordinate,
      Math.min(props.selectionFocus.latitudeDelta ?? Infinity, region.latitudeDelta),
      Math.min(props.selectionFocus.longitudeDelta ?? Infinity, region.longitudeDelta),
      props.selectionFocus.duration ?? 340,
      props.selectionFocus.latitudeDelta == null && props.selectionFocus.longitudeDelta == null,
      {
        topCoveredHeight:
          props.selectionFocus.topCoveredHeight ?? focusFrameRef.current.topCoveredHeight,
        bottomCoveredHeight:
          props.selectionFocus.coveredHeight ?? focusFrameRef.current.bottomCoveredHeight,
        targetInsets: props.selectionFocus.targetInsets,
      },
    );
    return () => cancelCameraCommand(revision);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, props.selectionFocus, viewport.width]);

  useEffect(() => {
    const coordinates = props.fitRequest?.coordinates ?? [];
    if (!mapReady || !coordinates.length) return;
    if (coordinates.length === 1) {
      // One coordinate is not a "fit" at all, it is a focus — so it goes
      // through the same helper and lands on the SAME prescribed zoom as every
      // other jump. It used to carry its own 0.012/0.01, which meant a Safety
      // focus on one friend arrived at a different zoom than "auf Karte
      // zeigen" on the same person. Two numbers for one job is how a map
      // starts feeling arbitrary.
      //
      // focusCamera also sets heading and pitch in the same animation, so this
      // needs no restoreCameraAfter, and it shifts the camera clear of the
      // Safety deck the way every other focus does.
      focusCamera(coordinates[0], PLACE_FOCUS_LATITUDE_DELTA, PLACE_FOCUS_LONGITUDE_DELTA, 320);
      return;
    }
    cameraCommandRevisionRef.current += 1;
    mapRef.current?.fitToCoordinates(coordinates, {
      animated: true,
      edgePadding: {
        top: 150,
        right: 72,
        bottom: Math.max(260, (props.bottomOverlayHeight ?? 0) + 48),
        left: 72,
      },
    });
    restoreCameraAfter(360);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, props.bottomOverlayHeight, props.fitRequest]);

  // Build one descriptor per marker. Each carries the off-screen `node` to
  // capture and a `captureKey` encoding its full visual state; the map then
  // renders `<Marker image>` from the captured PNG (see markerCapture.tsx for
  // why — react-native-maps clips custom marker Views on Android/Fabric).
  const descriptors: MarkerDescriptor[] = [];

  // Countdown ring: `countdownBucket` (utils/countdown.ts) quantizes the
  // remaining share of a running `now` activity to 8 steps, so the cached
  // marker image only re-captures on a step change (the provider's minute mode
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
          captureKey: `${ACTIVITY_MARKER_VISUAL_VERSION}:z${morphStage}:cluster:${joined ? getUnreadCount(cluster.id) : 0}:${display.count}:${cluster.mode}:${cluster.maxParticipants ?? 0}:${cluster.category ?? ''}:${bucket ?? ''}:${avatarKey}:${props.journeyUnderwayCounts?.[cluster.id] ?? 0}:${selected}:${cluster.label ?? ''}`,
          coordinate:
            focusActivityId === cluster.id && props.journeyTargetCoordinate
              ? props.journeyTargetCoordinate
              : cluster.coordinate,
          rasterSize: {
            width: ACTIVITY_MARKER_CAPTURE_WIDTH,
            height: ACTIVITY_MARKER_CAPTURE_HEIGHT,
          },
          anchor: ACTIVITY_MARKER_ANCHOR,
          morphable: true,
          onPress: () => props.onClusterPress?.(cluster),
          accessibilityLabel: `${cluster.label}, ${display.count} dabei`,
          zIndex: selected ? Z_SELECTED : Z_ACTIVITY,
          node: (
            <ClusterMarker
              unreadCount={joined ? getUnreadCount(cluster.id) : 0}
              avatars={display.avatars}
              count={display.count}
              label={cluster.label}
              mode={cluster.mode}
              progress={zoomProgress}
              titlePriority={joined}
              maxParticipants={cluster.maxParticipants}
              category={cluster.category}
              remainingFraction={bucket}
              journeyUnderwayCount={props.journeyUnderwayCounts?.[cluster.id] ?? 0}
              selected={selected}
            />
          ),
        });
      });

    markerCollisionGroups.forEach((group) => {
      const groupedMarkers = group
        .map(({ marker }) => marker)
        .sort((left, right) => {
          const leftRank = left.planning ? 2 : left.mode === 'now' ? 0 : 1;
          const rightRank = right.planning ? 2 : right.mode === 'now' ? 0 : 1;
          return (
            leftRank - rightRank ||
            Date.parse(left.startsAt ?? '') - Date.parse(right.startsAt ?? '') ||
            (left.title ?? left.displayName).localeCompare(right.title ?? right.displayName)
          );
        });
      if (groupedMarkers.length > 1) {
        const id = activityStackId(groupedMarkers);
        const coordinate = activityStackCoordinate(groupedMarkers);
        const selected = props.selectedActivityId === id;
        const mode: MapMarker['mode'] = groupedMarkers.some((marker) => marker.mode === 'now')
          ? 'now'
          : 'soon';
        descriptors.push({
          id,
          // Stack membership changes continuously at a collision boundary, but
          // its bitmap only depends on these visual values. Sharing the capture
          // keeps a newly formed stack from waiting on an identical fresh PNG.
          captureKey: `${ACTIVITY_MARKER_VISUAL_VERSION}:z${morphStage}:activity-stack:${groupedMarkers.length}:${mode}:${selected}`,
          coordinate,
          rasterSize: {
            width: ACTIVITY_MARKER_CAPTURE_WIDTH,
            height: ACTIVITY_MARKER_CAPTURE_HEIGHT,
          },
          anchor: ACTIVITY_MARKER_ANCHOR,
          morphable: true,
          accessibilityLabel: `${groupedMarkers.length} Activities an dieser Stelle`,
          onPress: () => props.onActivityStackPress?.(groupedMarkers, coordinate, id),
          zIndex: selected ? Z_SELECTED : Z_ACTIVITY,
          node: (
            <ActivityStackMarker
              count={groupedMarkers.length}
              mode={mode}
              progress={zoomProgress}
              selected={selected}
            />
          ),
        });
        return;
      }

      const marker = groupedMarkers[0];
      if (!marker) return;
      const joined = isJoined(marker.id);
      const selected = props.selectedActivityId === marker.id;
      const unreadCount = joined ? getUnreadCount(marker.id) : 0;
      const bucket = marker.planning
        ? undefined
        : countdownBucket(marker.mode, marker.startsAt, marker.endsAt);
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
        captureKey: `${ACTIVITY_MARKER_VISUAL_VERSION}:z${morphStage}:avatar:${marker.mode}:${marker.avatarUrl ?? marker.initials}:${marker.displayName}:${avatarKey}:${joined}:${unreadCount}:${display.count}:${marker.maxParticipants ?? 0}:${marker.category ?? ''}:${bucket ?? ''}:${marker.planning ? 'plan' : ''}:${props.journeyUnderwayCounts?.[marker.id] ?? 0}:${selected}:${marker.title ?? ''}:${marker.friendId ?? ''}`,
        coordinate:
          focusActivityId === marker.id && props.journeyTargetCoordinate
            ? props.journeyTargetCoordinate
            : marker.coordinate,
        rasterSize: {
          width: ACTIVITY_MARKER_CAPTURE_WIDTH,
          height: ACTIVITY_MARKER_CAPTURE_HEIGHT,
        },
        anchor: ACTIVITY_MARKER_ANCHOR,
        morphable: true,
        onPress: () => props.onMarkerPress?.(marker),
        accessibilityLabel: `${marker.title ?? marker.displayName}, ${
          marker.planning ? 'Terminfindung' : marker.mode === 'now' ? 'jetzt' : 'bald'
        }, ${display.count} dabei`,
        zIndex: selected ? Z_SELECTED : Z_ACTIVITY,
        node: (
          <AvatarMarker
            avatarUrl={marker.avatarUrl}
            displayName={marker.displayName}
            initials={marker.initials}
            avatars={display.avatars}
            label={marker.title ?? marker.displayName}
            progress={zoomProgress}
            titlePriority={joined}
            mode={marker.mode}
            planning={marker.planning}
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
          rasterSize: { width: 100, height: 100 },
          onPress: () => props.onJourneyParticipantPress?.(participant),
          accessibilityLabel: `${participant.displayName}, auf dem Weg`,
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
        rasterSize: { width: 100, height: 100 },
        accessibilityLabel: `${marker.displayName}, Heimweg${marker.subLabel ? `, ${marker.subLabel}` : ''}`,
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

  const { uris, imageUriFor, renderCaptureLayer } = useMarkerImages(
    descriptors.map((descriptor) => descriptor.id),
  );


  const activeMorphIdSet = new Set(activeMorphIds);
  const morphDescriptors = descriptors.filter((descriptor) => activeMorphIdSet.has(descriptor.id));
  // `activeMorphIds` can outlive its descriptors (a marker leaves the feed
  // mid-gesture). An empty list makes `.every()` vacuously true, which used to
  // end the handoff early — require the overlay to actually still have targets.
  const morphImagesReady =
    morphDescriptors.length === activeMorphIds.length &&
    morphDescriptors.every((descriptor) => Boolean(uris[descriptor.captureKey]));

  // live/arming → handoff: the new rasters exist, so show them again UNDERNEATH
  // the still-visible overlay. Nothing changes on screen at this point; it only
  // guarantees the native markers are mounted with their final image before
  // anything is taken away.
  //
  // `arming` is accepted too: a flick short enough to end before the overlay
  // reported layout must not strand the phase machine.
  useEffect(() => {
    if (morphPhase !== 'live' && morphPhase !== 'arming') return;
    if (mapZooming || !morphImagesReady) return;
    setMorphPhase('handoff');
  }, [mapZooming, morphPhase, morphImagesReady]);

  // Safety net. `morphImagesReady` depends on an async capture that can fail,
  // stall, or lose its descriptor when a marker leaves the feed mid-gesture.
  // Without this, the raster markers would stay hidden indefinitely — a far
  // worse failure than the blink this whole machine exists to prevent.
  useEffect(() => {
    if (morphPhase !== 'live' && morphPhase !== 'arming') return;
    if (mapZooming) return;
    const timer = setTimeout(() => setMorphPhase('handoff'), MORPH_HANDOFF_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [mapZooming, morphPhase]);

  // handoff → idle: give the native side two frames to actually paint the new
  // bitmap, THEN drop the overlay. One frame was not enough on Android, where
  // `<Marker image>` loads its icon asynchronously.
  useEffect(() => {
    if (morphPhase !== 'handoff') return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setMorphPhase('idle');
        setActiveMorphIds([]);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second) cancelAnimationFrame(second);
    };
  }, [morphPhase]);

  // arming → live is driven by the overlay's own onLayout, so the raster marker
  // is never hidden before the overlay has really been laid out.
  const handleMorphOverlayReady = () => {
    setMorphPhase((phase) => (phase === 'arming' ? 'live' : phase));
  };

  // Belt and braces for the same transition: if a layout event is ever delayed,
  // two frames of BOTH representations is the acceptable failure, not a whole
  // gesture of them. Whichever signal lands first wins.
  useEffect(() => {
    if (morphPhase !== 'arming') return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setMorphPhase((phase) => (phase === 'arming' ? 'live' : phase));
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second) cancelAnimationFrame(second);
    };
  }, [morphPhase]);

  // The ONLY state in which a native marker may be invisible.
  const rasterHiddenForMorph = morphPhase === 'live';
  const morphOverlayVisible = morphPhase !== 'idle';

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
        // Android reads userInterfaceStyle only while creating the native map;
        // its runtime setter is a no-op in react-native-maps. Remounting keeps
        // the style switch reliable without moving the user to another place.
        key={Platform.OS === 'android' ? `map-${colorScheme}` : 'map'}
        ref={mapRef}
        provider={MAP_PROVIDER}
        mapType="standard"
        // Ignored on the Apple fallback (PROVIDER_DEFAULT) — see MAP_PROVIDER above.
        customMapStyle={shownMapStyle}
        // Sets `overrideUserInterfaceStyle` on the native Google map view. With
        // an empty customMapStyle this is what renders Google's OWN dark map,
        // which no style JSON can reproduce.
        userInterfaceStyle={colorScheme}
        initialRegion={regionRef.current}
        loadingEnabled
        mapPadding={{ top: 0, right: 0, bottom: props.bottomOverlayHeight ?? 0, left: 0 }}
        poiClickEnabled={!props.hideActivities}
        pitchEnabled={false}
        scrollEnabled
        // Two-finger rotate, in both the flat and the pitched view. The camera
        // helpers below re-apply the resulting heading after every programmatic
        // move, so a turned map stays turned.
        rotateEnabled
        // The ONLY way back to north once the map is off-axis. Google draws it
        // only while heading ≠ 0 and hides it again on reset, so it costs
        // nothing in the normal north-up state — but without it a rotated map
        // is a place users can get stuck.
        showsCompass={false}
        // The native My Location layer draws its blue dot and a heading cone
        // from the device's sensor. It is local-only and runs only while the
        // map is visible or during the hidden boot prewarm.
        showsUserLocation={props.showsOwnLocation === true}
        onUserLocationChange={(event: UserLocationChangeEvent) => {
          const coordinate = event.nativeEvent.coordinate;
          if (
            !coordinate ||
            !Number.isFinite(coordinate.latitude) ||
            !Number.isFinite(coordinate.longitude)
          ) {
            return;
          }
          props.onOwnLocationChange?.({
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
          });
        }}
        // Android only (ignored on iOS): a one-second normal update cadence is
        // visually immediate while avoiding a needless high-priority stream.
        userLocationPriority={Platform.OS === 'android' ? 'balanced' : undefined}
        userLocationUpdateInterval={Platform.OS === 'android' ? 1000 : undefined}
        userLocationFastestInterval={Platform.OS === 'android' ? 500 : undefined}
        // Google's building footprints. Was `false`, which is why the map read
        // as empty ground with roads on it — no palette change can bring back
        // geometry the MapView is not drawing.
        showsBuildings
        showsIndoors={false}
        showsMyLocationButton={false}
        showsPointsOfInterests={!props.hideActivities}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
        zoomEnabled
        onMapReady={() => {
          setMapReady(true);
          props.onMapReady?.();
        }}
        onPanDrag={() => {
          cameraCommandRevisionRef.current += 1;
          props.onUserMapGesture?.();
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
          collisionRegionRef.current = region;
          requestCollisionProjection();
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
            setMapZooming(true);
            // No live overlay with reduced motion, and none while the camera is
            // pitched: the overlay projects with a flat lat/lng model that does
            // not hold on a tilted map, and a marker in the wrong place is worse
            // than a marker that simply does not animate. The raster markers
            // keep running in both cases, so nothing blinks either way.
            if (!reducedMotion && !pitchedRef.current) {
              const centreRegion = regionRef.current;
              const candidates = descriptors
                .filter(
                  (descriptor) =>
                    descriptor.morphable && isNearMorphViewport(descriptor, centreRegion),
                )
                .sort((left, right) => {
                  const leftSelected = props.selectedActivityId === left.id ? 0 : 1;
                  const rightSelected = props.selectedActivityId === right.id ? 0 : 1;
                  if (leftSelected !== rightSelected) return leftSelected - rightSelected;
                  return centerRank(left, centreRegion) - centerRank(right, centreRegion);
                })
                .slice(0, MORPH_MAX_OVERLAYS)
                .map((descriptor) => descriptor.id);
              if (candidates.length) {
                setActiveMorphIds(candidates);
                // Deliberately NOT 'live': the raster markers stay visible until
                // the overlay reports its own layout.
                setMorphPhase('arming');
              }
            }
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
          if (zoomFrame || zoomingRef.current || morphPhase !== 'idle') {
            updateMorphCamera(region);
          }
          if (!movingRef.current) {
            movingRef.current = true;
            setMapMoving(true);
          }
        }}
        onRegionChangeComplete={(region: Region, details?: { isGesture?: boolean }) => {
          collisionRegionRef.current = region;
          requestCollisionProjection();
          // Remember the heading only when the USER turned the map. A
          // programmatic animateToRegion levels the camera to north as a side
          // effect, so reading it back there would erase the very rotation the
          // restore is meant to re-apply.
          if (details?.isGesture !== false) {
            void mapRef.current?.getCamera().then((camera) => {
              if (camera) userHeadingRef.current = camera.heading ?? 0;
            });
          }
          if (details?.isGesture === true) props.onUserMapGesture?.();

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
              accessible
              accessibilityLabel={descriptor.accessibilityLabel}
              accessibilityRole="button"
              anchor={descriptor.anchor ?? { x: 0.5, y: 0.5 }}
              coordinate={descriptor.coordinate}
              image={MARKER_IMAGE_AS_CHILD ? undefined : { uri }}
              onPress={
                descriptor.onPress
                  ? (event) => {
                      event.stopPropagation();
                      descriptor.onPress?.();
                    }
                  : undefined
              }
              tracksViewChanges={MARKER_IMAGE_AS_CHILD}
              zIndex={descriptor.zIndex ?? Z_ACTIVITY}
              opacity={
                props.launchMarkerId === descriptor.id ||
                (descriptor.morphable &&
                  rasterHiddenForMorph &&
                  activeMorphIdSet.has(descriptor.id))
                  ? 0
                  : 1
              }
            >
              {MARKER_IMAGE_AS_CHILD ? (
                // react-native-maps#5980: Fabric flattens a wrapper view that
                // carries no drawing of its own, so the marker measures the
                // inner node instead and renders nothing. collapsable={false}
                // keeps the wrapper alive and is the documented fix.
                <View collapsable={false} style={descriptor.rasterSize}>
                  <Image source={{ uri }} style={descriptor.rasterSize} />
                </View>
              ) : null}
            </Marker>
          );
        })}
      </MapView>
      <MapMarkerMorphOverlay
        camera={morphCamera}
        height={viewport.height}
        onReady={handleMorphOverlayReady}
        targets={morphDescriptors}
        visible={morphOverlayVisible}
        width={viewport.width}
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

