import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { ActivityMode } from '../types/map.types';
import { ActivityMarkerChrome } from './ActivityMarkerChrome';
import {
  ACTIVITY_MARKER_CAPTURE_HEIGHT,
  ACTIVITY_MARKER_CAPTURE_WIDTH,
} from './activityMarkerLayout';

export function ActivityStackMarker({
  count,
  mode,
  progress,
  selected = false,
}: {
  count: number;
  mode: ActivityMode;
  progress: SharedValue<number>;
  selected?: boolean;
}) {
  return (
    <View collapsable={false} style={styles.root}>
      <ActivityMarkerChrome
        count={1}
        faces={[{ key: '__activities__', overflowLabel: String(count) }]}
        mode={mode}
        progress={progress}
        selected={selected}
        title={`${count} Activities`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: ACTIVITY_MARKER_CAPTURE_HEIGHT,
    width: ACTIVITY_MARKER_CAPTURE_WIDTH,
  },
});
