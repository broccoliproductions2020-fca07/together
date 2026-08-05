import { Pressable, StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { ActivityCategory, ActivityMode, MarkerAvatar } from '../types/map.types';
import { buildMarkerFaces } from '../utils/markerDetailLevel';
import { ActivityMarkerChrome } from './ActivityMarkerChrome';
import {
  ACTIVITY_MARKER_CAPTURE_HEIGHT,
  ACTIVITY_MARKER_CAPTURE_WIDTH,
} from './activityMarkerLayout';

export interface ClusterMarkerProps {
  avatars: MarkerAvatar[];
  count: number;
  mode: ActivityMode;
  /** Activity title shown under the marker. */
  label?: string;
  progress: SharedValue<number>;
  titlePriority?: boolean;
  maxParticipants?: number;
  category?: ActivityCategory;
  remainingFraction?: number;
  journeyUnderwayCount?: number;
  selected?: boolean;
  onPress?: () => void;
}

/** A group activity: up to four faces (2×2 → row) plus the activity title. */
export function ClusterMarker({
  avatars,
  count,
  mode,
  label,
  progress,
  titlePriority = false,
  category,
  remainingFraction,
  journeyUnderwayCount = 0,
  selected = false,
  onPress,
}: ClusterMarkerProps) {
  const faces = buildMarkerFaces(avatars, count);
  const content = (
    <ActivityMarkerChrome
      mode={mode}
      faces={faces}
      count={count}
      progress={progress}
      category={category}
      remainingFraction={remainingFraction}
      selected={selected}
      title={label}
      titlePriority={titlePriority || selected}
      journeyUnderwayCount={journeyUnderwayCount}
    />
  );

  if (!onPress)
    return (
      <View collapsable={false} style={styles.root}>
        {content}
      </View>
    );

  return (
    <Pressable
      accessibilityLabel={`${label ?? 'Gruppe'}, ${count} dabei`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      collapsable={false}
      onPress={onPress}
      style={styles.root}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    height: ACTIVITY_MARKER_CAPTURE_HEIGHT,
    width: ACTIVITY_MARKER_CAPTURE_WIDTH,
  },
});
