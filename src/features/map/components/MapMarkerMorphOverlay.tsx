import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { MapCoordinate } from '../types/map.types';
import {
  ACTIVITY_MARKER_CAPTURE_HEIGHT,
  ACTIVITY_MARKER_CAPTURE_WIDTH,
} from './activityMarkerLayout';

export interface MorphCameraFrame {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MorphCameraValues {
  frame: SharedValue<MorphCameraFrame>;
}

export interface MarkerMorphTarget {
  id: string;
  coordinate: MapCoordinate;
  anchor?: { x: number; y: number };
  node: ReactNode;
}

interface MapMarkerMorphOverlayProps {
  camera: MorphCameraValues;
  height: number;
  targets: MarkerMorphTarget[];
  visible: boolean;
  width: number;
}

/** Draws gesture-time markers outside react-native-maps' 40 ms bitmap tracker. */
export function MapMarkerMorphOverlay({
  camera,
  height,
  targets,
  visible,
  width,
}: MapMarkerMorphOverlayProps) {
  if (!visible || width <= 0 || height <= 0 || targets.length === 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {targets.map((target) => (
        <ProjectedMorphMarker
          key={target.id}
          anchor={target.anchor}
          camera={camera}
          coordinate={target.coordinate}
          height={height}
          width={width}
        >
          {target.node}
        </ProjectedMorphMarker>
      ))}
    </View>
  );
}

function ProjectedMorphMarker({
  anchor = { x: 0.5, y: 0.5 },
  camera,
  children,
  coordinate,
  height,
  width,
}: {
  anchor?: { x: number; y: number };
  camera: MorphCameraValues;
  children: ReactNode;
  coordinate: MapCoordinate;
  height: number;
  width: number;
}) {
  const positionStyle = useAnimatedStyle(() => {
    const frame = camera.frame.value;
    const latitudeDelta = Math.max(frame.latitudeDelta, 0.000001);
    const longitudeDelta = Math.max(frame.longitudeDelta, 0.000001);
    const x =
      width / 2 +
      ((coordinate.longitude - frame.longitude) / longitudeDelta) * width -
      anchor.x * ACTIVITY_MARKER_CAPTURE_WIDTH;
    const y =
      height / 2 -
      ((coordinate.latitude - frame.latitude) / latitudeDelta) * height -
      anchor.y * ACTIVITY_MARKER_CAPTURE_HEIGHT;
    const outside =
      x < -ACTIVITY_MARKER_CAPTURE_WIDTH ||
      x > width ||
      y < -ACTIVITY_MARKER_CAPTURE_HEIGHT ||
      y > height;

    return {
      opacity: outside ? 0 : 1,
      transform: [{ translateX: x }, { translateY: y }],
    };
  }, [anchor.x, anchor.y, coordinate.latitude, coordinate.longitude, height, width]);

  return (
    <Animated.View pointerEvents="none" style={[styles.marker, positionStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  marker: {
    height: ACTIVITY_MARKER_CAPTURE_HEIGHT,
    left: 0,
    position: 'absolute',
    top: 0,
    width: ACTIVITY_MARKER_CAPTURE_WIDTH,
  },
});
