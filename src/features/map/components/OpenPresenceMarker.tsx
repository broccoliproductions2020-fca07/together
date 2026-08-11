import { Image, StyleSheet, Text, View } from 'react-native';

/** The "offen" colour, same one the map pill and the OpenStatusCard use. A ring
 * in this blue is the entire signal — no pin, no label, no ring animation. */
const OPEN_COLOR = '#6E8BF7';

/** Visible avatar. The capture box around it is larger so the ring, its shadow
 * and the selected halo are never clipped by the PNG bounds. */
const AVATAR_SIZE = 48;
const RING_WIDTH = 2.5;
const SELECTED_RING_WIDTH = 3.5;
/** Capture canvas. Also the tappable marker area, comfortably over 44 pt. */
export const OPEN_PRESENCE_CAPTURE_SIZE = 64;

export interface OpenPresenceMarkerProps {
  initials: string;
  avatarUrl?: string;
  selected?: boolean;
}

/**
 * A friend who is OPEN and chose to share their location — a social status, not
 * an event.
 *
 * It deliberately shares nothing with the activity marker: no squircle, no pin
 * tail, no title, no participant count, no countdown ring. Open is "I have
 * time", and a marker that looks like an activity would promise a plan that
 * does not exist. All it says is: this person, available, here-ish.
 *
 * Rendered through the same capture pipeline as every other marker (a PNG fed
 * to `<Marker image>`), never as a React child of `<Marker>` — that is what
 * caused the Android/Fabric clipping.
 */
export function OpenPresenceMarker({
  initials,
  avatarUrl,
  selected = false,
}: OpenPresenceMarkerProps) {
  const ringWidth = selected ? SELECTED_RING_WIDTH : RING_WIDTH;

  return (
    <View style={styles.canvas}>
      {selected ? <View style={styles.halo} /> : null}
      <View style={[styles.avatar, { borderWidth: ringWidth }]}>
        {avatarUrl ? (
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: avatarUrl }}
            style={styles.image}
          />
        ) : (
          <Text style={styles.initials}>{initials}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: '#101722',
    borderColor: OPEN_COLOR,
    borderRadius: AVATAR_SIZE / 2,
    height: AVATAR_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: AVATAR_SIZE,
    // Readable on a bright map as well as a dark one.
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  canvas: {
    alignItems: 'center',
    height: OPEN_PRESENCE_CAPTURE_SIZE,
    justifyContent: 'center',
    width: OPEN_PRESENCE_CAPTURE_SIZE,
  },
  halo: {
    backgroundColor: 'rgba(110,139,247,0.22)',
    borderRadius: OPEN_PRESENCE_CAPTURE_SIZE / 2,
    height: AVATAR_SIZE + 12,
    position: 'absolute',
    width: AVATAR_SIZE + 12,
  },
  image: { height: '100%', width: '100%' },
  initials: {
    color: OPEN_COLOR,
    fontSize: 17,
    fontWeight: '800',
  },
});
