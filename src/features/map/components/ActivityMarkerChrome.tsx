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
import Svg, {
  Defs,
  Circle,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import type { ActivityCategory, ActivityMode } from '../types/map.types';
import { categoryMeta } from '../utils/activityCategories';
import {
  quadCenters,
  rowCenters,
  type FacePoint,
  type MarkerFace,
} from '../utils/markerDetailLevel';
import { colorWithAlpha, darkenColor, markerModeStyles } from '../utils/markerStyles';
import { MarkerImage } from './markerCapture';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

import {
  ACTIVITY_MARKER_CAPTURE_HEIGHT,
  ACTIVITY_MARKER_CAPTURE_WIDTH,
  ACTIVITY_MARKER_GROUND_MIN_WIDTH,
  ACTIVITY_MARKER_FIN_END_Y,
  ACTIVITY_MARKER_GROUND_HEIGHT,
  ACTIVITY_MARKER_GROUND_Y,
  ACTIVITY_MARKER_CITY_FACE,
  ACTIVITY_MARKER_FACE_RADIUS_RATIO,
  ACTIVITY_MARKER_GROUP_FACE_STREET,
  ACTIVITY_MARKER_QUAD_SPREAD,
  ACTIVITY_MARKER_ROW_STEP,
  ACTIVITY_MARKER_SHELL_HEIGHT,
  ACTIVITY_MARKER_SHELL_TOP,
  ACTIVITY_MARKER_SOLO_FACE,
  ACTIVITY_MARKER_TITLE_FONT_SIZE,
  ACTIVITY_MARKER_TITLE_LINE_HEIGHT,
  activityMarkerCardWidthForShell,
  activityMarkerFinTopY,
  activityMarkerGroundWidthForCard,
  activityMarkerPlanningDash,
  activityMarkerShellClockStart,
  activityMarkerShellPath,
  activityMarkerShellPerimeter,
  activityMarkerShellWidths,
  activityMarkerTitleHeight,
  activityMarkerTitleLineCount,
  activityMarkerTitleReveal,
  activityMarkerTitleWidth,
} from './activityMarkerLayout';

import { TEXT_FIXED } from '@/shared/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

const INK = '#101619';
/** Avatar plate. Cool near-neutral, not the old #EFEAE1 sandstone: warm beige
 * on a #F1F1F1 day map separated only by the card's coloured outline. */
const PLATE = '#E3E8ED';
const CX = ACTIVITY_MARKER_CAPTURE_WIDTH / 2;

// Constant height: the marker only ever grows sideways as the map zooms in.
// Height and radius live in activityMarkerLayout so the live aura can be the
// SAME squircle instead of a lookalike drawn from copied numbers.
const SHELL_H = ACTIVITY_MARKER_SHELL_HEIGHT;
const SHELL_TOP = ACTIVITY_MARKER_SHELL_TOP;
const CY = SHELL_TOP + SHELL_H / 2;

const RING_STROKE = 3;

/**
 * Sized against the shell so the category and unread controls stay legible at
 * map scale without competing with the avatar row.
 */
const CATEGORY_COIN = 22;
const UNREAD_BADGE = 18;
const BADGE_TOP_OVERHANG = 5;
const UNREAD_ANCHOR_WIDTH = 29;
const TITLE_GAP = 2;

const GROUP_FACE_CITY = ACTIVITY_MARKER_CITY_FACE;
const GROUP_FACE_NEIGHBORHOOD = 18;
const GROUP_FACE_STREET = ACTIVITY_MARKER_GROUP_FACE_STREET;
const SOLO_FACE = ACTIVITY_MARKER_SOLO_FACE;
const ROW_STEP = ACTIVITY_MARKER_ROW_STEP;

const shellWidths = activityMarkerShellWidths;

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
  /** A round still looking for a time. It keeps the future (`soon`) treatment
   * and wears the same ring, broken into dashes — see {@link PlanningRing}. */
  planning?: boolean;
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
  planning = false,
  journeyUnderwayCount = 0,
}: ActivityMarkerChromeProps) {
  const modeStyle = markerModeStyles[mode];
  const solo = count <= 1;
  const faceCount = Math.max(1, faces.length);
  const hasCountdown = remainingFraction != null;
  const showTitle = Boolean(title);
  const titleHeight = activityMarkerTitleHeight(title, journeyUnderwayCount);
  const titleLineCount = activityMarkerTitleLineCount(title, journeyUnderwayCount);
  const titleWidth = activityMarkerTitleWidth(title, journeyUnderwayCount);

  const widths = shellWidths(faceCount, solo);
  const grid = quadCenters(faceCount, CX, CY, ACTIVITY_MARKER_QUAD_SPREAD);
  const row = rowCenters(faceCount, CX, CY, solo ? SOLO_FACE : GROUP_FACE_STREET, ROW_STEP);

  const shellW = useDerivedValue(() => interpolate(progress.value, [0, 0.5, 1], widths));
  const shellX = useDerivedValue(() => CX - shellW.value / 2);
  const titleReveal = useDerivedValue(() =>
    activityMarkerTitleReveal(progress.value, titlePriority, showTitle),
  );
  const cardW = useDerivedValue(() =>
    activityMarkerCardWidthForShell(shellW.value, titleWidth, titleReveal.value),
  );
  const shellPathProps = useAnimatedProps(() => ({ d: activityMarkerShellPath(shellW.value) }));
  const categoryStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, shellX.value - CATEGORY_COIN / 2) }],
  }));
  const unreadStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: Math.min(
          ACTIVITY_MARKER_CAPTURE_WIDTH - UNREAD_ANCHOR_WIDTH,
          shellX.value + shellW.value + UNREAD_BADGE / 2 - UNREAD_ANCHOR_WIDTH,
        ),
      },
    ],
  }));
  const bodyStageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - titleReveal.value) * (titleHeight + TITLE_GAP) }],
  }));
  const titleBandStyle = useAnimatedStyle(() => ({
    height: titleHeight,
    left: CX - titleWidth / 2,
    opacity: titleReveal.value,
    top:
      SHELL_TOP +
      SHELL_H +
      TITLE_GAP -
      (1 - titleReveal.value) * (titleHeight + TITLE_GAP),
    width: titleWidth,
  }));

  return (
    <View collapsable={false} style={styles.root}>
      <MarkerGroundPlane accent={modeStyle.color} titleHeight={titleHeight} width={cardW} />
      <Animated.View pointerEvents="none" style={[styles.bodyStage, bodyStageStyle]}>
        <Svg
          pointerEvents="none"
          style={styles.boardSurface}
          width={ACTIVITY_MARKER_CAPTURE_WIDTH}
          height={ACTIVITY_MARKER_CAPTURE_HEIGHT}
        >
          <Defs>
            <LinearGradient id="activity-board-face" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="1" stopColor="#F1F3F6" />
            </LinearGradient>
          </Defs>
          {selected ? (
            <AnimatedPath
              animatedProps={shellPathProps}
              fill="none"
              stroke={colorWithAlpha(modeStyle.color, 0.14)}
              strokeWidth={8}
              strokeLinejoin="round"
            />
          ) : null}
          <AnimatedPath
            animatedProps={shellPathProps}
            fill="url(#activity-board-face)"
            stroke="rgba(15,20,23,0.05)"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </Svg>
        {hasCountdown ? (
          <CountdownRing
            accent={modeStyle.color}
            remainingFraction={remainingFraction}
            selected={selected}
            shellWidth={shellW}
          />
        ) : planning ? (
          <PlanningRing accent={modeStyle.color} selected={selected} shellWidth={shellW} />
        ) : null}

        {showTitle ? (
          <Animated.View pointerEvents="none" style={[styles.titleBand, titleBandStyle]}>
            <Text
              numberOfLines={titleLineCount}
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
                <Ionicons name="navigate" size={10} color="#ffffff" />
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {faces.map((face, index) => (
          <MorphFace
            key={face.key}
            face={face}
            grid={grid[index] ?? grid[grid.length - 1]}
            row={row[index] ?? row[row.length - 1]}
            progress={progress}
            sizeCity={solo ? SOLO_FACE : GROUP_FACE_CITY}
            sizeNeighborhood={solo ? SOLO_FACE : GROUP_FACE_NEIGHBORHOOD}
            sizeStreet={solo ? SOLO_FACE : GROUP_FACE_STREET}
            fontSize={solo ? 15 : 15}
            showBorder={!solo}
          />
        ))}

        {category ? (
          <Animated.View pointerEvents="none" style={[styles.categoryCoin, categoryStyle]}>
            <Ionicons name={categoryMeta(category).icon} size={14} color="#ffffff" />
          </Animated.View>
        ) : null}
        {unreadCount > 0 ? (
          <Animated.View pointerEvents="none" style={[styles.unreadAnchor, unreadStyle]}>
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText} {...TEXT_FIXED}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function MarkerGroundPlane({
  accent,
  titleHeight,
  width,
}: {
  accent: string;
  titleHeight: number;
  width: SharedValue<number>;
}) {
  const shadowProps = useAnimatedProps(() => {
    const cardWidth = width.value;
    const groundWidth = Number.isFinite(cardWidth)
      ? activityMarkerGroundWidthForCard(cardWidth)
      : ACTIVITY_MARKER_GROUND_MIN_WIDTH;

    return { rx: groundWidth / 2 };
  });
  const finTopY = activityMarkerFinTopY(titleHeight);
  const finPath = [
    `M ${CX - 2.4} ${finTopY}`,
    `L ${CX - 1.2} ${ACTIVITY_MARKER_FIN_END_Y}`,
    `L ${CX + 1.2} ${ACTIVITY_MARKER_FIN_END_Y}`,
    `L ${CX + 2.4} ${finTopY}`,
    'Z',
  ].join(' ');

  return (
    <Svg
      pointerEvents="none"
      style={styles.groundPlane}
      width={ACTIVITY_MARKER_CAPTURE_WIDTH}
      height={ACTIVITY_MARKER_CAPTURE_HEIGHT}
    >
      <Defs>
        <RadialGradient id="activity-cast-shadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={INK} stopOpacity={0.3} />
          <Stop offset="0.55" stopColor={INK} stopOpacity={0.11} />
          <Stop offset="1" stopColor={INK} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="activity-anchor-shadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={INK} stopOpacity={0.3} />
          <Stop offset="1" stopColor={INK} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <AnimatedEllipse
        animatedProps={shadowProps}
        cx={CX}
        cy={ACTIVITY_MARKER_GROUND_Y}
        rx={ACTIVITY_MARKER_GROUND_MIN_WIDTH / 2}
        ry={ACTIVITY_MARKER_GROUND_HEIGHT / 2}
        fill="url(#activity-cast-shadow)"
      />
      <Ellipse
        cx={CX}
        cy={ACTIVITY_MARKER_GROUND_Y}
        rx={9}
        ry={2.5}
        fill="url(#activity-anchor-shadow)"
      />
      {/* The stem is the card's own colour in shadow, not a stone plinth. */}
      <Path d={finPath} fill={darkenColor(accent, 0.8)} />
      <Circle
        cx={CX}
        cy={ACTIVITY_MARKER_GROUND_Y}
        r={2.4}
        fill={accent}
        stroke="#ffffff"
        strokeWidth={1}
      />
    </Svg>
  );
}

/**
 * The clock. It runs on the SHELL, not on the whole silhouette: a ring that has
 * to follow the transition and two different widths stops reading as a clock.
 * Twelve o'clock is the top centre, and it depletes clockwise — the dash starts
 * one full period past the path origin so the offset stays positive.
 */
function CountdownRing({
  accent,
  remainingFraction,
  selected,
  shellWidth,
}: {
  accent: string;
  remainingFraction: number;
  selected: boolean;
  shellWidth: SharedValue<number>;
}) {
  const stroke = selected ? RING_STROKE + 0.5 : RING_STROKE;
  const trackProps = useAnimatedProps(() => ({ d: activityMarkerShellPath(shellWidth.value) }));
  const clockProps = useAnimatedProps(() => {
    const remaining = Math.max(0, Math.min(1, remainingFraction));
    const perimeter = activityMarkerShellPerimeter(shellWidth.value);
    const dash = perimeter * remaining;
    return {
      d: activityMarkerShellPath(shellWidth.value),
      strokeDasharray: `${dash} ${perimeter}`,
      strokeDashoffset: dash + perimeter - activityMarkerShellClockStart(shellWidth.value),
    };
  });

  return (
    <Svg
      pointerEvents="none"
      style={styles.ring}
      width={ACTIVITY_MARKER_CAPTURE_WIDTH}
      height={ACTIVITY_MARKER_CAPTURE_HEIGHT}
    >
      <AnimatedPath
        animatedProps={trackProps}
        fill="none"
        stroke="rgba(255,255,255,0.94)"
        strokeWidth={stroke + 2}
      />
      <AnimatedPath
        animatedProps={trackProps}
        fill="none"
        stroke={colorWithAlpha(accent, 0.3)}
        strokeWidth={stroke}
      />
      <AnimatedPath
        animatedProps={clockProps}
        fill="none"
        stroke={accent}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * The clock of a round that has none yet.
 *
 * Same ring, same amber, same path — broken into dashes. A Terminfindung IS a
 * `soon` activity whose concrete time is still being found, so it must not
 * look like a different kind of thing on the map; what differs is exactly the
 * one fact that is undecided, drawn in the one element that carries time. When
 * the host locks a slot the ring simply closes and starts depleting.
 *
 * It replaced "no ring at all", which was true — the old rule read "kein Ring
 * heißt: keine feste Zeit" — but reads as something MISSING rather than as
 * something being decided, and gave the round no visible kinship with the
 * activity it is about to become.
 *
 * There is no faint continuous track under it, unlike the countdown: the track
 * exists there to show how much of a known window is already gone, and there is
 * no window here to be partly gone. The white halo is dashed with the same
 * pattern for the same reason — a solid halo would draw the closed ring this is
 * deliberately not.
 */
function PlanningRing({
  accent,
  selected,
  shellWidth,
}: {
  accent: string;
  selected: boolean;
  shellWidth: SharedValue<number>;
}) {
  const stroke = selected ? RING_STROKE + 0.5 : RING_STROKE;
  const dashProps = useAnimatedProps(() => {
    const { dash, gap } = activityMarkerPlanningDash(shellWidth.value, stroke);
    return {
      d: activityMarkerShellPath(shellWidth.value),
      strokeDasharray: `${dash} ${gap}`,
    };
  });

  return (
    <Svg
      pointerEvents="none"
      style={styles.ring}
      width={ACTIVITY_MARKER_CAPTURE_WIDTH}
      height={ACTIVITY_MARKER_CAPTURE_HEIGHT}
    >
      <AnimatedPath
        animatedProps={dashProps}
        fill="none"
        stroke="rgba(255,255,255,0.94)"
        strokeWidth={stroke + 2}
        strokeLinecap="round"
      />
      <AnimatedPath
        animatedProps={dashProps}
        fill="none"
        stroke={accent}
        strokeWidth={stroke}
        strokeLinecap="round"
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
          borderRadius: sizeStreet * ACTIVITY_MARKER_FACE_RADIUS_RATIO,
          borderWidth: showBorder ? 1.4 : 0,
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
  groundPlane: {
    left: 0,
    position: 'absolute',
    top: 0,
    zIndex: 1,
  },
  bodyStage: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
  },
  boardSurface: {
    left: 0,
    position: 'absolute',
    top: 0,
    zIndex: 2,
  },
  ring: {
    left: 0,
    position: 'absolute',
    top: 0,
    zIndex: 5,
  },
  face: {
    alignItems: 'center',
    backgroundColor: PLATE,
    borderColor: '#ffffff',
    borderWidth: 1.4,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    zIndex: 6,
  },
  overflowFace: { backgroundColor: INK },
  faceImage: { height: '100%', width: '100%' },
  faceInitials: { color: '#28323B', fontWeight: '800' },
  overflowText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  categoryCoin: {
    alignItems: 'center',
    backgroundColor: INK,
    borderColor: '#ffffff',
    borderRadius: CATEGORY_COIN / 2,
    borderWidth: 1.5,
    height: CATEGORY_COIN,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: SHELL_TOP - BADGE_TOP_OVERHANG,
    width: CATEGORY_COIN,
    zIndex: 7,
  },
  unreadAnchor: {
    alignItems: 'flex-end',
    height: UNREAD_BADGE,
    left: 0,
    position: 'absolute',
    top: SHELL_TOP - BADGE_TOP_OVERHANG,
    width: UNREAD_ANCHOR_WIDTH,
    zIndex: 7,
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    borderColor: '#ffffff',
    borderRadius: UNREAD_BADGE / 2,
    borderWidth: 1.5,
    height: UNREAD_BADGE,
    justifyContent: 'center',
    minWidth: UNREAD_BADGE,
    paddingHorizontal: 4,
  },
  unreadText: { color: '#ffffff', fontSize: 9.5, fontWeight: '800' },
  titleBand: {
    alignItems: 'center',
    backgroundColor: '#F1F3F6',
    borderColor: 'rgba(15,20,23,0.05)',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 0,
    position: 'absolute',
    zIndex: 6,
  },
  titleText: {
    color: '#151B20',
    flexShrink: 1,
    fontSize: ACTIVITY_MARKER_TITLE_FONT_SIZE,
    fontWeight: '700',
    lineHeight: ACTIVITY_MARKER_TITLE_LINE_HEIGHT,
    textAlign: 'center',
  },
  journeyPill: {
    alignItems: 'center',
    backgroundColor: SEMANTIC_COLOR.journey,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 2,
    marginLeft: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  journeyCount: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
});
