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

export interface MarkerDismissRequest {
  /** Activity/marker id being cancelled. */
  id: string;
  /** The marker node captured before the entity disappeared. */
  node: ReactNode;
  /** Mode accent colour — the ring matches the one the landing pop leaves. */
  accent: string;
  /** Anchor point (the marker's tail) in canvas pixels, where it stood. */
  at: { x: number; y: number };
}

// Inhale, then collapse: the exact mirror of the landing squash-and-rebound in
// MarkerLaunchOverlay, so throwing a pin in and popping it out read as one
// gesture in two directions.
const INHALE_MS = 120;
const COLLAPSE_MS = 250;
const RING_MS = 420;

interface MarkerDismissOverlayProps {
  request: MarkerDismissRequest | null;
  reducedMotion: boolean;
  onComplete: () => void;
}

/**
 * Plays the cancel transition: the pin swells for a beat and bursts, leaving the
 * same impact ring the launch lands with. Presentational only — the entity is
 * already gone from the data by the time this plays, which is the point: the map
 * must never wait for a server round-trip to acknowledge a tap.
 */
export function MarkerDismissOverlay({
  request,
  reducedMotion,
  onComplete,
}: MarkerDismissOverlayProps) {
  if (!request) return null;

  return (
    <DismissRun
      key={request.id}
      request={request}
      reducedMotion={reducedMotion}
      onComplete={onComplete}
    />
  );
}

function DismissRun({
  request,
  reducedMotion,
  onComplete,
}: {
  request: MarkerDismissRequest;
  reducedMotion: boolean;
  onComplete: () => void;
}) {
  const pop = useSharedValue(1); // marker scale
  const fade = useSharedValue(1);
  const ring = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      const id = requestAnimationFrame(onComplete);
      return () => cancelAnimationFrame(id);
    }

    ring.value = withTiming(1, { duration: RING_MS, easing: Easing.out(Easing.cubic) });
    fade.value = withSequence(
      withTiming(1, { duration: INHALE_MS + 40 }),
      withTiming(0, { duration: COLLAPSE_MS - 40, easing: Easing.in(Easing.quad) }),
    );
    pop.value = withSequence(
      withTiming(1.18, { duration: INHALE_MS, easing: Easing.out(Easing.cubic) }),
      withTiming(0.04, { duration: COLLAPSE_MS, easing: Easing.in(Easing.cubic) }, (done) => {
        'worklet';
        if (done) runOnJS(onComplete)();
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carrierStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: request.at.x }, { translateY: request.at.y }, { scale: pop.value }],
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
          { left: request.at.x - 22, top: request.at.y - 22, borderColor: request.accent },
          ringStyle,
        ]}
      />
      <Animated.View pointerEvents="none" style={[styles.carrier, carrierStyle]}>
        <View
          style={[
            styles.node,
            {
              left: -ACTIVITY_MARKER_ANCHOR.x * ACTIVITY_MARKER_CAPTURE_WIDTH,
              top: -ACTIVITY_MARKER_ANCHOR.y * ACTIVITY_MARKER_CAPTURE_HEIGHT,
            },
          ]}
        >
          {request.node}
        </View>
      </Animated.View>
    </View>
  );
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
});
