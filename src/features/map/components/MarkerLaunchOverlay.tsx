import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import {
  ACTIVITY_MARKER_ANCHOR,
  ACTIVITY_MARKER_CAPTURE_HEIGHT,
  ACTIVITY_MARKER_CAPTURE_WIDTH,
} from './activityMarkerLayout';

export interface MarkerLaunchRequest {
  /** Activity/marker id being published — the real marker is hidden while this plays. */
  id: string;
  /** The live marker node (AvatarMarker/ClusterMarker) — identical to what lands. */
  node: ReactNode;
  /** Mode accent colour of the seed (matches the pressed "Erstellen" button). */
  accent: string;
  /** Anchor point (the marker's tail) lands exactly here, in canvas pixels. */
  land: { x: number; y: number };
}

const FLIGHT_MS = 720;
const MORPH_MS = 300; // seed → marker crossfade, over the first stretch of the arc
const SEED_WIDTH = 132;
const SEED_HEIGHT = 52;
const SEED_RADIUS = 18;
const MARKER_RADIUS = 16;
// The seed sits where the marker's bubble will be (not at the tail/anchor), so
// the crossfade has no vertical jump. ~30px is the shell centre from the box top.
const BUBBLE_OFFSET_Y = -ACTIVITY_MARKER_ANCHOR.y * ACTIVITY_MARKER_CAPTURE_HEIGHT + 30;
// Where the seed is born: bottom-centre, roughly where the composer's
// "Aktivität erstellen" button sat. Offsets from the canvas edges.
const START_BOTTOM_INSET = 96;

function arcHeightFor(dy: number) {
  // Taller throws get a taller arc; clamp so nearby pins still lob nicely.
  return Math.max(70, Math.min(230, Math.abs(dy) * 0.42 + 60));
}

interface MarkerLaunchOverlayProps {
  request: MarkerLaunchRequest | null;
  width: number;
  height: number;
  reducedMotion: boolean;
  onComplete: () => void;
}

/**
 * Plays the "Wurf & Pop" publish transition: the pressed button becomes a
 * marker seed that morphs, is thrown along an arc to its map position and pops.
 * Presentational only — the canvas decides the landing pixel (screen centre on
 * the native map, projected marker position in the browser preview) and hides the real
 * marker until `onComplete` fires.
 */
export function MarkerLaunchOverlay({
  request,
  width,
  height,
  reducedMotion,
  onComplete,
}: MarkerLaunchOverlayProps) {
  if (!request || width <= 0 || height <= 0) return null;

  return (
    <LaunchRun
      key={request.id}
      request={request}
      width={width}
      height={height}
      reducedMotion={reducedMotion}
      onComplete={onComplete}
    />
  );
}

function LaunchRun({
  request,
  width,
  height,
  reducedMotion,
  onComplete,
}: {
  request: MarkerLaunchRequest;
  width: number;
  height: number;
  reducedMotion: boolean;
  onComplete: () => void;
}) {
  const start = { x: width / 2, y: height - START_BOTTOM_INSET };
  const land = request.land;
  const arc = arcHeightFor(land.y - start.y);

  const flight = useSharedValue(0); // 0 → 1 along the parabola
  const morph = useSharedValue(0); // 0 seed → 1 marker
  const px = useSharedValue(1); // landing pop scaleX
  const py = useSharedValue(1); // landing pop scaleY
  const ring = useSharedValue(0); // impact ring 0 → 1

  useEffect(() => {
    if (reducedMotion) {
      const id = requestAnimationFrame(onComplete);
      return () => cancelAnimationFrame(id);
    }

    flight.value = 0;
    morph.value = 0;
    px.value = 1;
    py.value = 1;
    ring.value = 0;

    morph.value = withTiming(1, { duration: MORPH_MS, easing: Easing.out(Easing.cubic) });
    flight.value = withTiming(1, { duration: FLIGHT_MS, easing: Easing.linear }, (finished) => {
      'worklet';
      if (!finished) return;
      ring.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
      // Squash on impact, rebound past 1, settle — the "pop".
      px.value = withSequence(
        withTiming(1.22, { duration: 0 }),
        withTiming(0.9, { duration: 130, easing: Easing.out(Easing.cubic) }),
        withTiming(1.05, { duration: 110 }),
        withTiming(1, { duration: 130 }),
      );
      py.value = withSequence(
        withTiming(0.8, { duration: 0 }),
        withTiming(1.12, { duration: 130, easing: Easing.out(Easing.cubic) }),
        withTiming(0.96, { duration: 110 }),
        withTiming(1, { duration: 130 }, (done) => {
          'worklet';
          if (done) runOnJS(onComplete)();
        }),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The carrier is anchored at the marker's tail (the point that lands).
  const carrierStyle = useAnimatedStyle(() => {
    const t = flight.value;
    const x = start.x + (land.x - start.x) * t;
    const yLine = start.y + (land.y - start.y) * t;
    const y = yLine - arc * 4 * t * (1 - t);
    const grow = 0.92 + 0.08 * Math.min(1, t / 0.3);
    return {
      transform: [
        { translateX: x },
        { translateY: y },
        { scaleX: grow * px.value },
        { scaleY: grow * py.value },
      ],
    };
  });

  const seedStyle = useAnimatedStyle(() => {
    const m = morph.value;
    const scale = 1 - m * (1 - (MARKER_RADIUS * 2) / SEED_HEIGHT);
    return {
      opacity: 1 - m,
      borderRadius: SEED_RADIUS + (MARKER_RADIUS - SEED_RADIUS) * m,
      transform: [{ scale }],
    };
  });

  const nodeStyle = useAnimatedStyle(() => ({
    opacity: nodeOpacityFor(morph.value),
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.5,
    transform: [{ scale: 0.3 + ring.value * 2 }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          { left: land.x - 22, top: land.y - 22, borderColor: request.accent },
          ringStyle,
        ]}
      />
      <Animated.View pointerEvents="none" style={[styles.carrier, carrierStyle]}>
        <Animated.View
          style={[
            styles.seed,
            {
              width: SEED_WIDTH,
              height: SEED_HEIGHT,
              left: -SEED_WIDTH / 2,
              top: BUBBLE_OFFSET_Y - SEED_HEIGHT / 2,
              backgroundColor: request.accent,
            },
            seedStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.node,
            {
              left: -ACTIVITY_MARKER_ANCHOR.x * ACTIVITY_MARKER_CAPTURE_WIDTH,
              top: -ACTIVITY_MARKER_ANCHOR.y * ACTIVITY_MARKER_CAPTURE_HEIGHT,
            },
            nodeStyle,
          ]}
        >
          {request.node}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Node fades in over the back half of the morph, so the seed reads first. */
function nodeOpacityFor(m: number) {
  'worklet';
  return Math.max(0, Math.min(1, (m - 0.45) / 0.45));
}

const styles = StyleSheet.create({
  carrier: {
    height: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 0,
  },
  node: {
    height: ACTIVITY_MARKER_CAPTURE_HEIGHT,
    position: 'absolute',
    width: ACTIVITY_MARKER_CAPTURE_WIDTH,
  },
  ring: {
    borderRadius: 20,
    borderWidth: 2.5,
    height: 44,
    position: 'absolute',
    width: 44,
  },
  seed: {
    position: 'absolute',
  },
});
