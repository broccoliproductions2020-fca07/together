import { useEffect, useState, type RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type MapView from 'react-native-maps';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { MapCoordinate } from '../types/map.types';
import { ACTIVITY_MARKER_SHELL_HEIGHT, ACTIVITY_MARKER_SHELL_RADIUS } from './activityMarkerLayout';

export interface LiveAuraTarget {
  id: string;
  coordinate: MapCoordinate;
  color: string;
  /** A selected marker may glow at any time; a normal `now` marker stays softer. */
  selected?: boolean;
  /** Coordinate points to the marker tail, while the aura belongs behind its bubble. */
  offsetY?: number;
  /** Settled shell width, so the pulse is the marker's own squircle, not a circle. */
  width?: number;
}

interface MapLiveAuraOverlayProps {
  mapRef: RefObject<MapView | null>;
  mapReady: boolean;
  moving: boolean;
  projectionKey: number;
  targets: LiveAuraTarget[];
}

interface ProjectedAura extends LiveAuraTarget {
  x: number;
  y: number;
}

/**
 * How far a wave travels beyond the marker outline, as a share of the shell.
 * The box has to hold the largest wave at its widest, or the ring gets clipped.
 */
const WAVE_MAX_SCALE = 1.62;

/** Thickness of the steady halo hugging the marker outline. */
const HALO_WIDTH = 7;

/** Padding around the shell so a wave at WAVE_MAX_SCALE still fits in the box. */
const auraBox = (width: number) => ({
  width: width * WAVE_MAX_SCALE,
  height: ACTIVITY_MARKER_SHELL_HEIGHT * WAVE_MAX_SCALE,
});

/** Legacy square box — the browser preview and journey pins still use it. */
export const LIVE_AURA_SIZE = Math.round(ACTIVITY_MARKER_SHELL_HEIGHT * WAVE_MAX_SCALE);

/**
 * Real, UI-thread animation above the native map — deliberately outside
 * `<Marker>`. The waves are the marker's OWN squircle: same height, same width,
 * same corner radius, sharing one geometry source with `ActivityMarkerChrome`
 * so the two can never drift into "circle behind a squircle".
 *
 * They grow from the shell's centre but are only ever drawn from its edge
 * outwards — a wave starts at scale 1.0, i.e. exactly on the outline, so the
 * marker never has a ring crawling across its own face.
 */
export function MapLiveAuraOverlay({
  mapRef,
  mapReady,
  moving,
  projectionKey,
  targets,
}: MapLiveAuraOverlayProps) {
  const [projected, setProjected] = useState<ProjectedAura[]>([]);

  useEffect(() => {
    let active = true;
    if (!mapReady || moving || targets.length === 0 || !mapRef.current) {
      if (!moving) setProjected([]);
      return () => {
        active = false;
      };
    }

    void Promise.all(
      targets.map(async (target) => {
        const point = await mapRef.current?.pointForCoordinate(target.coordinate);
        return point ? { ...target, x: point.x, y: point.y + (target.offsetY ?? 0) } : undefined;
      }),
    )
      .then((points) => {
        if (!active) return;
        setProjected(points.filter((point): point is ProjectedAura => Boolean(point)));
      })
      .catch(() => {
        // A renderer can briefly reject projection while the native map mounts.
        // The next settled region retries; never leave an unhandled promise behind.
        if (active) setProjected([]);
      });

    return () => {
      active = false;
    };
  }, [mapReady, mapRef, moving, projectionKey, targets]);

  if (moving || projected.length === 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {projected.map((target) => {
        const box = auraBox(target.width ?? ACTIVITY_MARKER_SHELL_HEIGHT);
        return (
          <LiveAura
            key={target.id}
            color={target.color}
            selected={target.selected}
            width={target.width}
            style={{ left: target.x - box.width / 2, top: target.y - box.height / 2 }}
          />
        );
      })}
    </View>
  );
}

/** Reusable for the browser preview, where coordinates are already screen positions. */
export function LiveAura({
  color,
  selected = false,
  width = ACTIVITY_MARKER_SHELL_HEIGHT,
  style,
}: {
  color: string;
  selected?: boolean;
  /** Settled marker width. Defaults to the square (solo) shell. */
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const firstWave = useSharedValue(0);
  const secondWave = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(breathe);
    cancelAnimation(firstWave);
    cancelAnimation(secondWave);
    if (reducedMotion) {
      breathe.value = 0.5;
      firstWave.value = 1;
      secondWave.value = 1;
      return;
    }

    const ease = Easing.out(Easing.cubic);
    breathe.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    firstWave.value = withRepeat(withTiming(1, { duration: 3400, easing: ease }), -1, false);
    secondWave.value = withDelay(
      1400,
      withRepeat(withTiming(1, { duration: 3400, easing: ease }), -1, false),
    );

    return () => {
      cancelAnimation(breathe);
      cancelAnimation(firstWave);
      cancelAnimation(secondWave);
    };
  }, [breathe, firstWave, reducedMotion, secondWave]);

  const box = auraBox(width);
  const shellH = ACTIVITY_MARKER_SHELL_HEIGHT;
  // The shell's own rectangle, centred in the box. Waves are exactly this and
  // scale outwards from its centre, so "same shape, starts at the edge" holds
  // at every marker width without a second set of numbers to keep in sync.
  const shellRect = {
    position: 'absolute' as const,
    width,
    height: shellH,
    left: (box.width - width) / 2,
    top: (box.height - shellH) / 2,
    borderRadius: ACTIVITY_MARKER_SHELL_RADIUS,
  };
  // A halo whose INNER edge lands on the outline: RN draws borders inside the
  // box, so the box is grown by 2×width and the radius by 1×, which puts the
  // stroke entirely outside the marker instead of over its face.
  const haloWidth = HALO_WIDTH;
  const haloRect = {
    position: 'absolute' as const,
    width: width + haloWidth * 2,
    height: shellH + haloWidth * 2,
    left: (box.width - width) / 2 - haloWidth,
    top: (box.height - shellH) / 2 - haloWidth,
    borderRadius: ACTIVITY_MARKER_SHELL_RADIUS + haloWidth,
    borderWidth: haloWidth,
  };

  const haloStyle = useAnimatedStyle(() => ({
    opacity: selected ? 0.3 + breathe.value * 0.1 : 0.17 + breathe.value * 0.07,
  }));
  // Scale starts at exactly 1 — the wave is born ON the outline and only ever
  // travels outwards. Anything below 1 would draw a ring across the faces.
  // The arithmetic is inlined on purpose: a helper defined in the component
  // body is a plain JS function, and calling one inside a worklet throws on the
  // UI thread rather than falling back to something that still renders.
  const firstWaveStyle = useAnimatedStyle(() => ({
    opacity: (selected ? 0.62 : 0.42) * (1 - firstWave.value),
    transform: [{ scale: 1 + firstWave.value * (WAVE_MAX_SCALE - 1) }],
  }));
  const secondWaveStyle = useAnimatedStyle(() => ({
    opacity: (selected ? 0.44 : 0.28) * (1 - secondWave.value),
    transform: [{ scale: 1 + secondWave.value * (WAVE_MAX_SCALE - 1.14) }],
  }));

  return (
    <View pointerEvents="none" style={[{ position: 'absolute', ...box }, style]}>
      <Animated.View style={[haloRect, { borderColor: color }, haloStyle]} />
      <Animated.View style={[shellRect, styles.wave, { borderColor: color }, firstWaveStyle]} />
      {!reducedMotion ? (
        <Animated.View style={[shellRect, styles.wave, { borderColor: color }, secondWaveStyle]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wave: {
    borderWidth: 2,
  },
});
