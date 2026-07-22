import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { JourneyParticipant } from '@/features/journey';

import { MarkerGroundShadow } from './MarkerGroundShadow';
import { MarkerImage } from './markerCapture';

// Brand ink (global.css light foreground) — see AvatarMarker.
const INK = '#14211C';

interface JourneyAvatarMarkerProps {
  participant: JourneyParticipant;
  highlighted?: boolean;
  /** Overrides the status-derived ring color (Heimweg markers: blue/orange/red). */
  color?: string;
  /** Safety markers intentionally show only avatar + name. */
  showStatusBadge?: boolean;
  /** Second muted label line, e.g. staleness ("vor 6 Min.") on a data gap. */
  subLabel?: string;
  onPress?: () => void;
}

/**
 * Styled with StyleSheet only (never NativeWind `className`) and kept inside
 * fixed bounds: on Android the marker becomes a bitmap snapshot that drops
 * className styles and clips anything outside its box. See ClusterMarker for
 * the full explanation.
 */
export function JourneyAvatarMarker({
  participant,
  highlighted = false,
  color: colorOverride,
  showStatusBadge = true,
  subLabel,
  onPress,
}: JourneyAvatarMarkerProps) {
  const arrived = participant.status === 'arrived';
  const color = colorOverride ?? (arrived ? '#41C08D' : '#6E8BF7');

  return (
    <Pressable
      collapsable={false}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${participant.displayName} öffnen` : undefined}
      onPress={onPress}
      style={styles.root}
    >
      <View style={[styles.frame, { transform: [{ scale: highlighted ? 1.12 : 1 }] }]}>
        <MarkerGroundShadow width={66} height={66} cx={33} cy={35} r={30} />
        {/* Thin white halo between ring and map — separation on busy tiles. */}
        <View pointerEvents="none" style={styles.halo} />
        <View style={[styles.circle, { borderColor: color }]}>
          {participant.avatarUrl ? (
            <MarkerImage source={{ uri: participant.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.initials}>{participant.initials}</Text>
          )}
        </View>
        {showStatusBadge ? (
          <View style={[styles.statusBadge, { backgroundColor: color }]}>
            <Ionicons name={arrived ? 'checkmark' : 'navigate'} size={11} color="#ffffff" />
          </View>
        ) : null}
      </View>

      <View style={styles.label}>
        <Text style={styles.labelText} numberOfLines={1}>
          {participant.isCurrentUser ? 'Du' : participant.displayName}
        </Text>
        {subLabel ? <Text style={styles.subLabelText}>{subLabel}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatarImage: {
    borderRadius: 24,
    height: 48,
    width: 48,
  },
  circle: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 27,
    borderWidth: 3,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 54,
  },
  frame: {
    alignItems: 'center',
    height: 66,
    justifyContent: 'center',
    position: 'relative',
    width: 66,
  },
  halo: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    height: 60,
    position: 'absolute',
    width: 60,
  },
  initials: {
    color: INK,
    fontSize: 15,
    fontWeight: '700',
  },
  label: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(20,33,28,0.1)',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 2,
    maxWidth: 88,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  labelText: {
    color: INK,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  subLabelText: {
    color: '#6B6258',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
  root: {
    alignItems: 'center',
    height: 100,
    justifyContent: 'center',
    width: 100,
  },
  statusBadge: {
    alignItems: 'center',
    borderColor: '#ffffff',
    borderRadius: 11,
    borderWidth: 2,
    bottom: 4,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    width: 22,
  },
});
