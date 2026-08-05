import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import type { ActivityCategory, ActivityMode } from '../types/map.types';
import { categoryMeta } from '../utils/activityCategories';
import {
  quadCenters,
  rowCenters,
  type FacePoint,
  type MarkerFace,
} from '../utils/markerDetailLevel';
import { colorWithAlpha, markerModeStyles } from '../utils/markerStyles';
import { MarkerImage } from './markerCapture';

import {
  ACTIVITY_MARKER_CAPTURE_HEIGHT,
  ACTIVITY_MARKER_CAPTURE_WIDTH,
} from './activityMarkerLayout';

import { TEXT_FIXED } from '@/shared/theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const INK = '#14211C';
const WARM_SURFACE = '#EFEAE1';
const CX = ACTIVITY_MARKER_CAPTURE_WIDTH / 2;

// Constant height: the marker only ever grows sideways as the map zooms in.
const SHELL_H = 48;
const SHELL_TOP = 6;
const CY = SHELL_TOP + SHELL_H / 2;
const GROUP_SQUIRCLE_RADIUS = 16;
const FACE_SQUIRCLE_RADIUS = 13;

// Mode ring / countdown geometry. One rounded rectangle follows the same
// squircle radius at every width, including the fully unfolded row.
const RING_STROKE = 2.5;
const RING_INNER_H = SHELL_H - RING_STROKE;

const GROUP_FACE_CITY = 16;
const GROUP_FACE_NEIGHBORHOOD = 18;
const GROUP_FACE_STREET = 42;
const SOLO_FACE_CITY = 43;
const SOLO_FACE_NEIGHBORHOOD = 43;
const SOLO_FACE_STREET = 43;
const ROW_STEP = 32; // restrained 10 px overlap at the unfolded 42 px size

/** Shell width per detail progress [city, neighborhood, street]. */
function shellWidths(faceCount: number, solo: boolean): [number, number, number] {
  // 43 px is exactly the 48 px shell's inner diameter after the 2.5 px ring.
  if (solo) return [SHELL_H, SHELL_H, SHELL_H];
  const streetSpan = GROUP_FACE_STREET + Math.max(0, faceCount - 1) * ROW_STEP + 10;
  return [50, 54, streetSpan];
}

export interface ActivityMarkerChromeProps {
  mode: ActivityMode;
  faces: MarkerFace[];
  /** Total participants — drives nothing visual directly; faces already encode +N. */
  count: number;
  /** Live morph driver in [0,1]: 0 = compact quad, 1 = unfolded row. Fed by the
   * map's zoom so the marker morphs during the pinch, not only after it ends. */
  progress: SharedValue<number>;
  category?: ActivityCategory;
  unreadCount?: number;
  /** Remaining share (0–1) of a running `now` activity → depleting mode ring. */
  remainingFraction?: number;
  selected?: boolean;
  /** Activity title (concrete activity) or friend name (presence pin). */
  title?: string;
  /** Show the title even at city zoom (selected / joined get priority). */
  titlePriority?: boolean;
  journeyUnderwayCount?: number;
}

/**
 * Zoom-aware activity marker. A constant-height shell morphs from a compact
 * squircle (2×2 quad of faces) to a wide squircle (a single overlapping row) as the
 * map zooms in. A lightweight overlay owns the live gesture; once it settles,
 * MapCanvas hands back to a cached PNG. Never more than four faces; a fifth+
 * collapses into a "+N" chip handed in via `faces`.
 */
export function ActivityMarkerChrome({
  mode,
  faces,
  count,
  progress,
  category,
  unreadCount = 0,
  remainingFraction,
  selected = false,
  title,
  titlePriority = false,
  journeyUnderwayCount = 0,
}: ActivityMarkerChromeProps) {
  const modeStyle = markerModeStyles[mode];
  const solo = count <= 1;
  const faceCount = Math.max(1, faces.length);
  const hasCountdown = remainingFraction != null;
  const shellRadius = GROUP_SQUIRCLE_RADIUS;

  const widths = shellWidths(faceCount, solo);
  const grid = quadCenters(faceCount, CX, CY);
  const row = rowCenters(faceCount, CX, CY, solo ? SOLO_FACE_STREET : GROUP_FACE_STREET, ROW_STEP);

  const shellW = useDerivedValue(() => interpolate(progress.value, [0, 0.5, 1], widths));
  const shellX = useDerivedValue(() => CX - shellW.value / 2);

  // Groups remain squircles at every width. Only a single-person marker is a
  // true circle; widening a group must never silently morph it into a pill.
  const shellStyle = useAnimatedStyle(() => ({
    left: shellX.value,
    width: shellW.value,
    borderRadius: shellRadius,
  }));
  const shadowStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: shellW.value / widths[2] }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: (shellW.value + 10) / (widths[2] + 10) }],
  }));
  const categoryStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, shellX.value - 4) }],
  }));
  const unreadStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: Math.min(ACTIVITY_MARKER_CAPTURE_WIDTH - 24, shellX.value + shellW.value - 20),
      },
    ],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titlePriority
      ? 1
      : interpolate(progress.value, [0.28, 0.55], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(progress.value, [0.28, 0.55], [-3, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  // Always mounted when a title exists; its opacity fades in with the zoom
  // (titleStyle) so there is no discrete pop at a level boundary.
  const showTitle = Boolean(title);

  return (
    <View collapsable={false} style={styles.root}>
      <Animated.View
        style={[
          styles.shadow,
          {
            left: CX - (widths[2] * 0.68) / 2,
            width: widths[2] * 0.68,
          },
          shadowStyle,
        ]}
        pointerEvents="none"
      />
      {selected ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              borderRadius: GROUP_SQUIRCLE_RADIUS + 5,
              left: CX - (widths[2] + 10) / 2,
              width: widths[2] + 10,
            },
            glowStyle,
            { backgroundColor: colorWithAlpha(modeStyle.color, 0.18) },
          ]}
        />
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.shell,
          shellStyle,
          hasCountdown
            ? null
            : {
                borderColor: modeStyle.color,
                borderWidth: selected ? 3 : RING_STROKE,
              },
        ]}
      />
      {hasCountdown ? (
        <CountdownRing
          accent={modeStyle.color}
          cornerRadius={shellRadius}
          remainingFraction={remainingFraction}
          selected={selected}
          width={shellW}
        />
      ) : null}

      {faces.map((face, index) => (
        <MorphFace
          key={face.key}
          face={face}
          grid={grid[index] ?? grid[grid.length - 1]}
          row={row[index] ?? row[row.length - 1]}
          progress={progress}
          sizeCity={solo ? SOLO_FACE_CITY : GROUP_FACE_CITY}
          sizeNeighborhood={solo ? SOLO_FACE_NEIGHBORHOOD : GROUP_FACE_NEIGHBORHOOD}
          sizeStreet={solo ? SOLO_FACE_STREET : GROUP_FACE_STREET}
          fontSize={solo ? 18 : 20}
          showBorder={!solo}
        />
      ))}

      {category ? (
        <Animated.View pointerEvents="none" style={[styles.categoryCoin, categoryStyle]}>
          <Ionicons name={categoryMeta(category).icon} size={11} color="#ffffff" />
        </Animated.View>
      ) : null}
      {unreadCount > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.unreadBadge, unreadStyle]}>
          <Text style={styles.unreadText} {...TEXT_FIXED}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </Animated.View>
      ) : null}

      {showTitle ? (
        <Animated.View pointerEvents="none" style={[styles.titleWrap, titleStyle]}>
          <View style={styles.titlePill}>
            <Text
              numberOfLines={selected ? 2 : 1}
              ellipsizeMode="tail"
              style={styles.titleText}
              {...TEXT_FIXED}
            >
              {title}
            </Text>
            {journeyUnderwayCount > 0 ? (
              <View style={styles.journeyPill}>
                <Text style={styles.journeyCount} {...TEXT_FIXED}>
                  {journeyUnderwayCount}
                </Text>
                <Ionicons name="car-outline" size={10} color="#ffffff" />
              </View>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function CountdownRing({
  accent,
  cornerRadius,
  remainingFraction,
  selected,
  width,
}: {
  accent: string;
  cornerRadius: number;
  remainingFraction: number;
  selected: boolean;
  width: SharedValue<number>;
}) {
  const ringTrackProps = useAnimatedProps(() => {
    const w = width.value - RING_STROKE;
    const rr = Math.min(RING_INNER_H / 2, cornerRadius - RING_STROKE / 2);
    return { x: CX - w / 2, width: w, rx: rr, ry: rr };
  });
  const ringCountdownProps = useAnimatedProps(() => {
    const w = width.value - RING_STROKE;
    const h = RING_INNER_H;
    const rr = Math.min(h / 2, cornerRadius - RING_STROKE / 2);
    // General rounded-rect perimeter (four corner quarter-circles = one circle).
    const perimeter = 2 * Math.max(0, w - 2 * rr) + 2 * Math.max(0, h - 2 * rr) + 2 * Math.PI * rr;
    const remaining = Math.max(0, Math.min(1, remainingFraction));
    return {
      x: CX - w / 2,
      width: w,
      rx: rr,
      ry: rr,
      strokeDasharray: `${perimeter * remaining} ${perimeter}`,
    };
  });

  return (
    <Svg
      pointerEvents="none"
      style={styles.ring}
      width={ACTIVITY_MARKER_CAPTURE_WIDTH}
      height={SHELL_TOP + SHELL_H + 2}
    >
      <AnimatedRect
        y={SHELL_TOP + RING_STROKE / 2}
        height={RING_INNER_H}
        fill="none"
        stroke={colorWithAlpha(accent, 0.25)}
        strokeWidth={selected ? 3 : RING_STROKE}
        animatedProps={ringTrackProps}
      />
      <AnimatedRect
        y={SHELL_TOP + RING_STROKE / 2}
        height={RING_INNER_H}
        fill="none"
        stroke={accent}
        strokeWidth={selected ? 3 : RING_STROKE}
        strokeLinecap="round"
        animatedProps={ringCountdownProps}
      />
    </Svg>
  );
}

interface MorphFaceProps {
  face: MarkerFace;
  grid: FacePoint;
  row: FacePoint;
  progress: SharedValue<number>;
  sizeCity: number;
  sizeNeighborhood: number;
  sizeStreet: number;
  fontSize: number;
  showBorder: boolean;
}

/** One avatar that slides from its 2×2 grid cell to its row slot as we zoom in. */
function MorphFace({
  face,
  grid,
  row,
  progress,
  sizeCity,
  sizeNeighborhood,
  sizeStreet,
  fontSize,
  showBorder,
}: MorphFaceProps) {
  const style = useAnimatedStyle(() => {
    const rowMix = interpolate(progress.value, [0.5, 1], [0, 1], Extrapolation.CLAMP);
    const size = interpolate(progress.value, [0, 0.5, 1], [sizeCity, sizeNeighborhood, sizeStreet]);
    const x = grid.x + (row.x - grid.x) * rowMix;
    const y = grid.y + (row.y - grid.y) * rowMix;
    return {
      transform: [
        { translateX: x - grid.x },
        { translateY: y - grid.y },
        { scale: size / sizeStreet },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.face,
        {
          borderRadius: FACE_SQUIRCLE_RADIUS,
          borderWidth: showBorder ? 1.5 : 0,
          height: sizeStreet,
          left: grid.x - sizeStreet / 2,
          top: grid.y - sizeStreet / 2,
          width: sizeStreet,
        },
        face.overflowLabel ? styles.overflowFace : null,
        style,
      ]}
    >
      {face.overflowLabel ? (
        <Text style={[styles.overflowText, { fontSize }]} {...TEXT_FIXED}>
          {face.overflowLabel}
        </Text>
      ) : face.avatarUrl ? (
        <MarkerImage source={{ uri: face.avatarUrl }} style={styles.faceImage} />
      ) : (
        <Text style={[styles.faceInitials, { fontSize }]} {...TEXT_FIXED}>
          {face.initials}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: ACTIVITY_MARKER_CAPTURE_HEIGHT,
    width: ACTIVITY_MARKER_CAPTURE_WIDTH,
  },
  shadow: {
    backgroundColor: 'rgba(20,33,28,0.22)',
    borderRadius: 6,
    height: 7,
    position: 'absolute',
    top: SHELL_TOP + SHELL_H - 3,
    zIndex: 0,
  },
  glow: {
    borderRadius: GROUP_SQUIRCLE_RADIUS + 5,
    height: SHELL_H + 10,
    position: 'absolute',
    top: SHELL_TOP - 5,
    zIndex: 0,
  },
  shell: {
    backgroundColor: '#ffffff',
    borderRadius: GROUP_SQUIRCLE_RADIUS,
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
    left: 0,
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
    left: 0,
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
