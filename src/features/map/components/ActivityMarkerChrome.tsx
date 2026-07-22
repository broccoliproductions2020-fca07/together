import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import type { ActivityCategory, ActivityMode } from '../types/map.types';
import { categoryMeta } from '../utils/activityCategories';
import {
  DETAIL_PROGRESS,
  quadCenters,
  rowCenters,
  type FacePoint,
  type MapMarkerDetailLevel,
  type MarkerFace,
} from '../utils/markerDetailLevel';
import { colorWithAlpha, markerModeStyles } from '../utils/markerStyles';
import { MarkerImage } from './markerCapture';

import { ACTIVITY_MARKER_CAPTURE_SIZE } from './activityMarkerLayout';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const INK = '#14211C';
const WARM_SURFACE = '#EFEAE1';
const CX = ACTIVITY_MARKER_CAPTURE_SIZE / 2;

// Constant height: the marker only ever grows sideways as the map zooms in.
const SHELL_H = 48;
const SHELL_TOP = 6;
const CY = SHELL_TOP + SHELL_H / 2;
const SHELL_RADIUS = SHELL_H / 2; // pill ends; a circle while width ≈ height

// Mode ring / countdown geometry. The stadium (rounded-rect) stroke is a clean
// circle while width ≈ height and a capsule border once the shell unfolds, so a
// single primitive draws the ring at every zoom level.
const RING_STROKE = 2.5;
const RING_INNER_H = SHELL_H - RING_STROKE;
const RING_RX = RING_INNER_H / 2;

const GROUP_FACE_CITY = 20;
const GROUP_FACE_STREET = 28;
const SOLO_FACE_CITY = 36;
const SOLO_FACE_STREET = 42;
const ROW_STEP = 20; // overlap of the unfolded row
const MORPH_MS = 300;

/** Shell width per detail progress [city, neighborhood, street]. */
function shellWidths(faceCount: number, solo: boolean): [number, number, number] {
  if (solo) return [46, 50, 54];
  const streetSpan = GROUP_FACE_STREET + Math.max(0, faceCount - 1) * ROW_STEP + 10;
  return [50, 54, streetSpan];
}

export interface ActivityMarkerChromeProps {
  mode: ActivityMode;
  faces: MarkerFace[];
  /** Total participants — drives nothing visual directly; faces already encode +N. */
  count: number;
  detailLevel: MapMarkerDetailLevel;
  category?: ActivityCategory;
  unreadCount?: number;
  /** Remaining share (0–1) of a running `now` activity → depleting mode ring. */
  remainingFraction?: number;
  selected?: boolean;
  /** Activity title (concrete activity) or friend name (presence pin). */
  title?: string;
  /** Show the title even at city zoom (selected / joined / now get priority). */
  titlePriority?: boolean;
  journeyUnderwayCount?: number;
}

/**
 * Zoom-aware activity marker. A constant-height shell morphs from a compact
 * circle (2×2 quad of faces) to a wide capsule (a single overlapping row) as the
 * map zooms in. The animation runs on the UI thread and is captured onto the
 * native marker during LiveActivityMapMarker's tracking window, so there is no
 * per-frame work once a level settles. Never more than four faces; a fifth+
 * collapses into a "+N" chip handed in via `faces`.
 */
export function ActivityMarkerChrome({
  mode,
  faces,
  count,
  detailLevel,
  category,
  unreadCount = 0,
  remainingFraction,
  selected = false,
  title,
  titlePriority = false,
  journeyUnderwayCount = 0,
}: ActivityMarkerChromeProps) {
  const reducedMotion = useReducedMotion();
  const modeStyle = markerModeStyles[mode];
  const solo = count <= 1;
  const faceCount = Math.max(1, faces.length);
  const hasCountdown = remainingFraction != null;

  const progress = useSharedValue(DETAIL_PROGRESS[detailLevel]);
  useEffect(() => {
    progress.value = withTiming(DETAIL_PROGRESS[detailLevel], {
      duration: reducedMotion ? 0 : MORPH_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [detailLevel, progress, reducedMotion]);

  const widths = shellWidths(faceCount, solo);
  const grid = quadCenters(faceCount, CX, CY);
  const row = rowCenters(
    faceCount,
    CX,
    CY,
    solo ? SOLO_FACE_STREET : GROUP_FACE_STREET,
    ROW_STEP,
  );

  const shellW = useDerivedValue(() => interpolate(progress.value, [0, 0.5, 1], widths));
  const shellX = useDerivedValue(() => CX - shellW.value / 2);

  const shellStyle = useAnimatedStyle(() => ({ left: shellX.value, width: shellW.value }));
  const shadowStyle = useAnimatedStyle(() => ({
    left: CX - (shellW.value * 0.68) / 2,
    width: shellW.value * 0.68,
  }));
  const glowStyle = useAnimatedStyle(() => ({
    left: shellX.value - 5,
    width: shellW.value + 10,
  }));
  const categoryStyle = useAnimatedStyle(() => ({ left: shellX.value - 4 }));
  const unreadStyle = useAnimatedStyle(() => ({ left: shellX.value + shellW.value - 20 }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titlePriority
      ? 1
      : interpolate(progress.value, [0.28, 0.55], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0.28, 0.55],
          [-3, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const ringTrackProps = useAnimatedProps(() => {
    const w = shellW.value - RING_STROKE;
    return { x: CX - w / 2, width: w };
  });
  const ringCountdownProps = useAnimatedProps(() => {
    const w = shellW.value - RING_STROKE;
    const straight = 2 * Math.max(0, w - RING_INNER_H);
    const perimeter = straight + Math.PI * RING_INNER_H;
    const remaining = Math.max(0, Math.min(1, remainingFraction ?? 0));
    return { x: CX - w / 2, width: w, strokeDasharray: `${perimeter * remaining} ${perimeter}` };
  });

  const showTitle = Boolean(title) && (titlePriority || detailLevel !== 'city');

  return (
    <View collapsable={false} style={styles.root}>
      <Animated.View style={[styles.shadow, shadowStyle]} pointerEvents="none" />
      {selected ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            glowStyle,
            { backgroundColor: colorWithAlpha(modeStyle.color, 0.18) },
          ]}
        />
      ) : null}

      <Animated.View pointerEvents="none" style={[styles.shell, shellStyle]} />
      <Svg
        pointerEvents="none"
        style={styles.ring}
        width={ACTIVITY_MARKER_CAPTURE_SIZE}
        height={SHELL_TOP + SHELL_H + 2}
      >
        <AnimatedRect
          y={SHELL_TOP + RING_STROKE / 2}
          height={RING_INNER_H}
          rx={RING_RX}
          ry={RING_RX}
          fill="none"
          stroke={hasCountdown ? colorWithAlpha(modeStyle.color, 0.25) : modeStyle.color}
          strokeWidth={selected ? 3 : RING_STROKE}
          animatedProps={ringTrackProps}
        />
        {hasCountdown ? (
          <AnimatedRect
            y={SHELL_TOP + RING_STROKE / 2}
            height={RING_INNER_H}
            rx={RING_RX}
            ry={RING_RX}
            fill="none"
            stroke={modeStyle.color}
            strokeWidth={selected ? 3 : RING_STROKE}
            strokeLinecap="round"
            animatedProps={ringCountdownProps}
          />
        ) : null}
      </Svg>

      {faces.map((face, index) => (
        <MorphFace
          key={face.key}
          face={face}
          grid={grid[index] ?? grid[grid.length - 1]}
          row={row[index] ?? row[row.length - 1]}
          progress={progress}
          sizeCity={solo ? SOLO_FACE_CITY : GROUP_FACE_CITY}
          sizeStreet={solo ? SOLO_FACE_STREET : GROUP_FACE_STREET}
          fontSize={solo ? 16 : 10}
        />
      ))}

      {category ? (
        <Animated.View pointerEvents="none" style={[styles.categoryCoin, categoryStyle]}>
          <Ionicons name={categoryMeta(category).icon} size={11} color="#ffffff" />
        </Animated.View>
      ) : null}
      {unreadCount > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.unreadBadge, unreadStyle]}>
          <Text style={styles.unreadText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </Animated.View>
      ) : null}

      {showTitle ? (
        <Animated.View pointerEvents="none" style={[styles.titleWrap, titleStyle]}>
          <View style={styles.titlePill}>
            <Text numberOfLines={selected ? 2 : 1} ellipsizeMode="tail" style={styles.titleText}>
              {title}
            </Text>
            {journeyUnderwayCount > 0 ? (
              <View style={styles.journeyPill}>
                <Text style={styles.journeyCount}>{journeyUnderwayCount}</Text>
                <Ionicons name="car-outline" size={10} color="#ffffff" />
              </View>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

interface MorphFaceProps {
  face: MarkerFace;
  grid: FacePoint;
  row: FacePoint;
  progress: SharedValue<number>;
  sizeCity: number;
  sizeStreet: number;
  fontSize: number;
}

/** One avatar that slides from its 2×2 grid cell to its row slot as we zoom in. */
function MorphFace({ face, grid, row, progress, sizeCity, sizeStreet, fontSize }: MorphFaceProps) {
  const style = useAnimatedStyle(() => {
    const rowMix = interpolate(progress.value, [0.5, 1], [0, 1], Extrapolation.CLAMP);
    const size = interpolate(progress.value, [0, 1], [sizeCity, sizeStreet]);
    const x = grid.x + (row.x - grid.x) * rowMix;
    const y = grid.y + (row.y - grid.y) * rowMix;
    return {
      left: x - size / 2,
      top: y - size / 2,
      width: size,
      height: size,
      borderRadius: size / 2,
    };
  });

  return (
    <Animated.View
      style={[styles.face, face.overflowLabel ? styles.overflowFace : null, style]}
    >
      {face.overflowLabel ? (
        <Text style={styles.overflowText}>{face.overflowLabel}</Text>
      ) : face.avatarUrl ? (
        <MarkerImage source={{ uri: face.avatarUrl }} style={styles.faceImage} />
      ) : (
        <Text style={[styles.faceInitials, { fontSize }]}>{face.initials}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { height: ACTIVITY_MARKER_CAPTURE_SIZE, width: ACTIVITY_MARKER_CAPTURE_SIZE },
  shadow: {
    backgroundColor: 'rgba(20,33,28,0.22)',
    borderRadius: 6,
    height: 7,
    position: 'absolute',
    top: SHELL_TOP + SHELL_H - 3,
    zIndex: 0,
  },
  glow: {
    borderRadius: SHELL_RADIUS + 5,
    height: SHELL_H + 10,
    position: 'absolute',
    top: SHELL_TOP - 5,
    zIndex: 0,
  },
  shell: {
    backgroundColor: '#ffffff',
    borderRadius: SHELL_RADIUS,
    height: SHELL_H,
    position: 'absolute',
    top: SHELL_TOP,
    zIndex: 1,
  },
  ring: {
    left: 0,
    position: 'absolute',
    top: 0,
    zIndex: 1,
  },
  face: {
    alignItems: 'center',
    backgroundColor: WARM_SURFACE,
    borderColor: '#ffffff',
    borderWidth: 1.5,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    zIndex: 2,
  },
  overflowFace: { backgroundColor: INK },
  faceImage: { height: '100%', width: '100%' },
  faceInitials: { color: INK, fontWeight: '800' },
  overflowText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  categoryCoin: {
    alignItems: 'center',
    backgroundColor: INK,
    borderColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    top: SHELL_TOP - 4,
    width: 24,
    zIndex: 4,
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    borderColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 5,
    position: 'absolute',
    top: SHELL_TOP - 4,
    zIndex: 4,
  },
  unreadText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  titleWrap: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: SHELL_TOP + SHELL_H + 3,
    zIndex: 3,
  },
  titlePill: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(20,33,28,0.1)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    maxWidth: 150,
    minHeight: 22,
    paddingHorizontal: 9,
  },
  titleText: { color: INK, flexShrink: 1, fontSize: 11, fontWeight: '700' },
  journeyPill: {
    alignItems: 'center',
    backgroundColor: INK,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 2,
    marginLeft: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  journeyCount: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
});
