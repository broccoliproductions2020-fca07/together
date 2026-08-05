import { Pressable, StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { ActivityCategory, ActivityMode, MarkerAvatar } from '../types/map.types';
import { buildMarkerFaces } from '../utils/markerDetailLevel';
import { ActivityMarkerChrome } from './ActivityMarkerChrome';
import {
  ACTIVITY_MARKER_CAPTURE_HEIGHT,
  ACTIVITY_MARKER_CAPTURE_WIDTH,
} from './activityMarkerLayout';

export interface AvatarMarkerProps {
  initials: string;
  mode: ActivityMode;
  displayName: string;
  avatarUrl?: string;
  avatars?: MarkerAvatar[];
  /** Text under the marker — activity title (concrete) or friend name (presence). */
  label?: string;
  progress: SharedValue<number>;
  /** Keep the label visible even when zoomed out (selected / joined). */
  titlePriority?: boolean;
  unreadCount?: number;
  participantCount?: number;
  maxParticipants?: number;
  category?: ActivityCategory;
  remainingFraction?: number;
  journeyUnderwayCount?: number;
  selected?: boolean;
  onPress?: () => void;
}

/**
 * Concrete activity marker. The avatars answer "who / how many", the label
 * answers "what". Layout, morphing and level-of-detail live in
 * ActivityMarkerChrome; this only normalises the data.
 */
export function AvatarMarker({
  initials,
  mode,
  displayName,
  avatarUrl,
  avatars,
  label,
  progress,
  titlePriority = false,
  unreadCount = 0,
  participantCount,
  category,
  remainingFraction,
  journeyUnderwayCount = 0,
  selected = false,
  onPress,
}: AvatarMarkerProps) {
  const list: MarkerAvatar[] = avatars?.length
    ? avatars
    : [{ userId: displayName, displayName, initials, avatarUrl }];
  const count = Math.max(participantCount ?? 0, list.length, 1);
  const faces = buildMarkerFaces(list, count);
  const accessibilityLabel = unreadCount
    ? `${label ?? displayName}, ${unreadCount} ungelesene Nachrichten`
    : (label ?? displayName);

  const content = (
    <ActivityMarkerChrome
      mode={mode}
      faces={faces}
      count={count}
      progress={progress}
      category={category}
      unreadCount={unreadCount}
      remainingFraction={remainingFraction}
      selected={selected}
      title={label ?? displayName}
      titlePriority={titlePriority || selected}
      journeyUnderwayCount={journeyUnderwayCount}
    />
  );

  if (!onPress) {
    return (
      <View accessibilityLabel={accessibilityLabel} collapsable={false} style={styles.root}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
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
