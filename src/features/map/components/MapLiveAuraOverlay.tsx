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
import { colorWithAlpha } from '../utils/markerStyles';

export interface LiveAuraTarget {
  id: string;
  coordinate: MapCoordinate;
  color: string;
  /** A selected marker may glow at any time; a normal `now` marker stays softer. */
  selected?: boolean;
  /** Coordinate points to the marker tail, while the aura belongs behind its bubble. */
  offsetY?: number;
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

const AURA_SIZE = 96;

/**
 * Real, UI-thread animation above the native map â€” deliberately outside
 * `<Marker>`. The rings start outside the avatar so they read as behind it even
 * though Android draws the overlay above the native map surface.
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
        return point
          ? { ...target, x: point.x, y: point.y + (target.offsetY ?? 0) }
          : undefined;
      }),
    ).then((points) => {
      if (!active) return;
      setProjected(points.filter((point): point is ProjectedAura => Boolean(point)));
    }).catch(() => {
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
      {projected.map((target) => (
        <LiveAura
          key={target.id}
          color={target.color}
          selected={target.selected}
          style={{ left: target.x - AURA_SIZE / 2, top: target.y - AURA_SIZE / 2 }}
        />
      ))}
    </View>
  );
}

/** Reusable for the web/mock map, where coordinates are already screen positions. */
export function LiveAura({
  color,
  selected = false,
  style,
}: {
  color: string;
  selected?: boolean;
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
    breathe.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.quad) }), -1, true);
    firstWave.value = withRepeat(withTiming(1, { duration: 2600, easing: ease }), -1, false);
    secondWave.value = withDelay(950, withRepeat(withTiming(1, { duration: 2600, easing: ease }), -1, false));

    return () => {
      cancelAnimation(breathe);
      cancelAnimation(firstWave);
      cancelAnimation(secondWave);
    };
  }, [breathe, firstWave, reducedMotion, secondWave]);

  const ambientStyle = useAnimatedStyle(() => ({
    opacity: selected ? 0.16 + breathe.value * 0.09 : 0.08 + breathe.value * 0.06,
    transform: [{ scale: 0.9 + breathe.value * 0.13 }],
  }));
  const firstWaveStyle = useAnimatedStyle(() => ({
    opacity: (selected ? 0.48 : 0.32) * (1 - firstWave.value),
    transform: [{ scale: 0.86 + firstWave.value * 0.54 }],
  }));
  const secondWaveStyle = useAnimatedStyle(() => ({
    opacity: (selected ? 0.34 : 0.22) * (1 - secondWave.value),
    transform: [{ scale: 0.9 + secondWave.value * 0.48 }],
  }));

  return (
    <View pointerEvents="none" style={[styles.aura, style]}>
      <Animated.View style={[styles.ambient, { backgroundColor: colorWithAlpha(color, 1) }, ambientStyle]} />
      <Animated.View style={[styles.wave, { borderColor: color }, firstWaveStyle]} />
      {!reducedMotion ? <Animated.View style={[styles.wave, { borderColor: color }, secondWaveStyle]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ambient: {
    borderRadius: 999,
    height: 76,
    left: 10,
    position: 'absolute',
    top: 10,
    width: 76,
  },
  aura: {
    height: AURA_SIZE,
    position: 'absolute',
    width: AURA_SIZE,
  },
  wave: {
    borderRadius: 999,
    borderWidth: 1.5,
    height: 84,
    left: 6,
    position: 'absolute',
    top: 6,
    width: 84,
  },
});
