import { Ionicons } from '@expo/vector-icons';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type Ref,
} from 'react';
import {
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  FeGaussianBlur,
  Filter,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';
import { TogetherMark } from '@/shared/components/brand/TogetherMark';
import type { CoreActivitySummary } from '@/features/activities';
import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';
import { onColorTextColor } from '@/shared/utils/contrastColor';
import { haptics } from '@/shared/utils/haptics';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

import {
  createCoreGesturePathState,
  isCoreCloseLane,
  isCoreReturnLane,
  polarOffset,
  previewTrackAngle,
  resolveGestureTrackArmedIndex,
} from '../core/coreSelection';
import {
  CORE_ACCENT,
  CORE_ACTIVITY_ANGLES,
  CORE_ACTIVITY_WEIGHTS,
  CORE_ACTIVITY_CARD_HEIGHT,
  CORE_ACTIVITY_CARD_WIDTH,
  CORE_ACTIVITY_RADIUS,
  CORE_ACTIVITY_RADIUS_MIN,
  CORE_ACTIVITY_TARGETS,
  CORE_ORBIT_RADIUS,
  CORE_PRIMARY_INDEX,
  CORE_ROOT_ANGLES,
  CORE_ROOT_TARGETS,
  CORE_ROOT_WEIGHTS,
  rootTargetAccent,
  type CoreActivityId,
  type CoreStatus,
  type CoreTargetId,
} from '../core/coreTargets';
import { useOverlayColors } from './overlayTheme';

/** Long-press threshold. Shorter than a platform long press on purpose: the
 *  orbit is primary navigation, not a hidden context menu. */
const HOLD_MS = 280;
/**
 * How long the opening hold stays invisible.
 *
 * The hold ring must not flash on every tap, and a tap is by definition shorter
 * than `HOLD_MS`. Waiting most of the way through means only a touch that is
 * genuinely becoming a hold ever draws one.
 */
const HOLD_REVEAL_MS = 150;
/** Past this the touch is going somewhere else, so the opening hold is off. */
const HOLD_CANCEL_SLOP = 40;
/**
 * How long the thumb must REST on "Aktivität" before Jetzt/Soon unfold.
 *
 * Deliberately long, and deliberately measured from the last movement rather
 * than from the moment the target armed: "Aktivität" sits in the middle of the
 * arc, so every sweep from the left half to the right half crosses it. A timer
 * that starts on arming fires during that sweep and opens a level the user was
 * only passing through. `STILL_SLOP` is what turns this into a real dwell.
 */
const DWELL_MS = 520;
/** Movement above this restarts the dwell — the thumb has to actually settle. */
const STILL_SLOP = 5;
/** Past this the touch is a drag, and a drag must never publish an open status. */
const TAP_SLOP = 12;
/**
 * A screen-reader activation arrives as a synthetic press with no touch, so the
 * pan gesture never runs for it; a real touch is the opposite, because the pan
 * claims the responder and cancels the Pressable. They therefore never both
 * fire — this window makes that structural rather than merely likely.
 */
const SYNTHETIC_PRESS_GUARD_MS = 400;
const RETURN_DWELL_MS = 460;
const ROOT_CLOSE_RETRACT_MS = 150;

/** Deliberate return uses its own cautionary accent, never an activity colour. */
const CORE_RETURN_ACCENT = '#F0646A';
/**
 * The colour of "nothing is chosen yet".
 *
 * Deliberately not `CORE_ACCENT.open`: that blue means the user's open presence
 * everywhere else in the app, and a neutral, unchosen hold is not a state — it
 * is the absence of one.
 */
const CORE_NEUTRAL_ACCENT = '#9FB3C9';

const IDLE_CORE_SIZE = 64;
/**
 * The Core while it carries a status.
 *
 * A circle is an expensive container for text: its area grows with the square
 * of the diameter, the usable line width only linearly. This step from 88 buys
 * roughly four more characters per title line — worth it because activity names
 * are free text, but the reason not to keep going.
 *
 * Growing it moves the Nearby pill: see `NEARBY_PILL_BOTTOM` in `MapOverlay`.
 */
const OPEN_CORE_SIZE = 96;
/**
 * Clear space between the Core's rim and the status ring, which sits OUTSIDE
 * the button. Flush on the edge it read as a border of the Core; outside, with
 * air between them, it is plainly a separate thing measuring the Core's time.
 *
 * The ring's outermost paint lands `CORE_RING_GAP + stroke/2 + (stroke +
 * RING_GLOW_EXTRA)/2` beyond the rim — about 10 px at the current values. There
 * is roughly 20 px of clear space above the Core before the Nearby pill starts
 * (the Core's circle tops out at `insets.bottom + 92`, the pill sits at 112),
 * so this must stay well under that.
 */
const CORE_RING_GAP = 3;
/** How much wider the soft halo is than the arc it sits under. */
const RING_GLOW_EXTRA = 5;
/**
 * Clear space between the ring and the text inside it.
 *
 * Bigger than it looks like it needs to be, because a rectangular block of text
 * sits inside a CIRCLE: the sides of the middle line have the most room and the
 * corners of the top and bottom lines have the least, so a clearance measured
 * at the equator lets the outer lines graze the ring.
 */
const CORE_RING_TEXT_CLEARANCE = 30;
/**
 * The activity title gets its own, much wider clearance.
 *
 * A block of text sits in a CIRCLE, so how much width a line has depends on how
 * far it is from the middle. The title is the middle line — at ±15 px the chord
 * is 82 px, against 63 px out at ±30 where the label and meta sit. One shared
 * clearance has to serve the tightest line and therefore starves the widest
 * one: the title was running at 58 px, which is about nine characters.
 *
 * At 74 px over two lines it holds roughly 22 — the length real activity names
 * actually have.
 */
const CORE_TITLE_CLEARANCE = 14;
/**
 * The three roles inside the Core, and the only two sizes it uses.
 *
 * What matters is the STEP between them. Everything used to sit at 12 / 12 / 11
 * — a ratio of 1.09 — so the eye was handed three equally loud things and had
 * nowhere to land; that, not a lack of ornament, is what made the Core read as
 * flat. 14 against 11 is 1.27, enough to be a hierarchy while still holding
 * about 22 characters of title over two lines. Going to 16 would read louder
 * and cost four characters, which is the wrong trade for free-text names.
 */
const CORE_HERO_SIZE = TYPE.label.fontSize;
const CORE_HERO_LINE = 16;
const CORE_SUPPORT_SIZE = TYPE.micro.fontSize;
const CORE_SUPPORT_LINE = 14;
/**
 * The hero is neutral, never the accent — the ring outside already carries that
 * colour, and a second accent element at the centre competes with it instead of
 * being framed by it. Colour marks the STATE (the label row), brightness marks
 * the IMPORTANCE (hero over support).
 */
const CORE_INK = '#F2EFE9';
const CORE_INK_SUPPORT = 'rgba(242,239,233,0.62)';
// Holding turns the Core into a genuinely roomy thumb pad. Selection still
// uses direction, while the larger surface makes that small movement feel
// controlled rather than cramped.
const HOLD_CORE_SIZE = 172;
const ITEM_SIZE = 52;
/** The map controls withdraw while the Core orbit owns this area. */
const RIGHT_COLUMN_CLEARANCE = 36;
/** Keeps a visible gap between the enlarged Core and the root targets. */
const MIN_ORBIT_RADIUS = 116;
/**
 * The rail is an input range, not the visual orbit radius. Requiring a thumb
 * to travel all the way to the outer icon was what made the far-left action
 * feel unreachable. Four root actions now span just 60 px inside the pad.
 */
const ROOT_RAIL_TRAVEL = 60;
/** Breathing room between the outermost target and the edge of the glass lens. */
const LENS_PADDING = 26;
/** Empty space kept under the core so the lens can fade out below it. */
const BOX_FOOT = 70;

/** Total travel time of the bloom. Per-item windows are carved out of this. */
const BLOOM_MS = 430;
const BLOOM_CLOSE_MS = 190;
/**
 * Head start the retracting orbit gets before the chosen surface opens.
 *
 * Deliberately shorter than `BLOOM_CLOSE_MS`: the two motions must not overlap
 * while both are travelling, but a clean gap between them reads as lag. This is
 * the one number to tune if the handover still feels off — larger separates
 * them further, smaller brings the collision back.
 */
const HANDOFF_MS = 150;
/** Delay, as a fraction of the bloom, per ring of targets away from the centre. */
const BLOOM_STAGGER = 0.13;
const CORE_SPRING = { damping: 18, mass: 0.7, stiffness: 260 };
const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const canUseNativeCoreGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

type CoreMode = 'idle' | 'joystick' | 'persistent';
type CoreLevel = 'root' | 'activity';
type CoreReturnPhase = 'idle' | 'pending';

/**
 * What the orbit is doing, for the surfaces around it.
 *
 * `held` and `parked` both claim the space, but only a parked orbit has no
 * finger on it — which is the only state where a tap somewhere else can be read
 * as "close this".
 */
export type CoreOrbitState = 'closed' | 'held' | 'parked';

export interface TogetherCoreHandle {
  /** Retracts a parked orbit. What a tap outside it has to be able to do. */
  close: () => void;
}

interface CoreGeometryBox {
  width: number;
  height: number;
  cx: number;
  cy: number;
  lensRadius: number;
}

/**
 * A running Anreise, shown IN the Core rather than as its own pill.
 *
 * It outranks every other state the Core can show, because it is the only one
 * where the phone is doing something on your behalf while you are not looking:
 * background location is either armed or actively transmitting. The two stages
 * stay distinguishable — consent given is not the same as position leaving the
 * device, and collapsing them would overstate what is happening.
 */
export interface CoreJourneyIndicator {
  title: string;
  status: 'armed' | 'underway' | 'arrived';
}

export interface TogetherCoreProps {
  status: CoreStatus;
  /** A running or upcoming plan derived from the already-active activity feed. */
  activity?: CoreActivitySummary | null;
  /** Takes over the Core's readout while an Anreise is armed or underway. */
  journey?: CoreJourneyIndicator | null;
  /** Drives the indigo countdown ring while open. */
  expiresAt: number | null;
  openedAt: number | null;
  /** Optional refinement of the user's own open status. */
  openVibeLabel?: string | null;
  /** True only when friends can actually receive the coarse map pin. */
  locationShared?: boolean;
  postfachBadgeCount?: number;
  /** Personal status control: publish on the defaults AND open the sheet. */
  onTap: () => void;
  /** Every root target except `activity`, which expands instead of confirming. */
  onSelectTarget: (id: Exclude<CoreTargetId, 'activity'>) => void;
  onSelectActivityMode: (mode: CoreActivityId) => void;
  onOrbitStateChange?: (state: CoreOrbitState) => void;
  holdHintVisible?: boolean;
  onHoldHintDismiss?: () => void;
  ref?: Ref<TogetherCoreHandle>;
}

function formatClock(ts: number): string {
  const date = new Date(ts);
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function formatIsoClock(value: string | undefined): string | null {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? formatClock(timestamp) : null;
}

/**
 * The open window as a depleting ring — the same clock language the `now`
 * activity markers and the old open pill spoke, so an expiring status reads the
 * same wherever it shows up.
 */
function CoreStatusRing({
  progress,
  size,
  accent,
}: {
  progress: number;
  size: number;
  accent: string;
}) {
  const stroke = 4;
  /**
   * The ring sits OUTSIDE the button, separated from its rim by `CORE_RING_GAP`.
   * Inside, it read as a border of the Core; outside, it is plainly a separate
   * thing measuring the Core's time.
   *
   * The canvas therefore has to be bigger than the button and offset back over
   * it — `StyleSheet.absoluteFill` would clip everything past the rim. The
   * overhang counts the widest thing painted, which is the soft halo at
   * `stroke + GLOW_EXTRA`, not the arc itself.
   */
  const radius = size / 2 + CORE_RING_GAP + stroke / 2;
  const overhang = Math.ceil(CORE_RING_GAP + stroke / 2 + (stroke + RING_GLOW_EXTRA) / 2);
  const box = size + overhang * 2;
  const center = box / 2;
  const circumference = 2 * Math.PI * radius;
  const left = Math.max(0, Math.min(1, progress));
  const endAngle = -Math.PI / 2 + Math.PI * 2 * left;
  const endX = center + radius * Math.cos(endAngle);
  const endY = center + radius * Math.sin(endAngle);

  return (
    <View
      pointerEvents="none"
      style={{ height: box, left: -overhang, position: 'absolute', top: -overhang, width: box }}
    >
      <Svg width={box} height={box}>
        {/*
          No track behind the arc. Elapsed time is time that is GONE — drawing a
          grey placeholder for it turns the ring into a gauge with a fixed
          frame, where the honest reading is that the ring is simply shorter
          than it was. It also kept a hard circle on screen in the states that
          have no ring at all, which made the Core look permanently ringed.
        */}
        {left > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={accent}
            strokeOpacity={0.22}
            strokeWidth={stroke + RING_GLOW_EXTRA}
            strokeLinecap="round"
            strokeDasharray={`${circumference * left} ${circumference}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * left} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
        {left > 0.02 ? <Circle cx={endX} cy={endY} r={stroke / 1.45} fill={accent} /> : null}
      </Svg>
    </View>
  );
}

/**
 * The state's identity line: glyph plus word, both in the state's accent.
 *
 * The glyphs are not invented here. `flash` and `calendar-clear` are already
 * what the composer's mode switch and the Core's own menu use for Jetzt and
 * Soon, and `navigate` was the Anreise pill's — so the control that CREATES a
 * state and the readout that REPORTS it now carry the same mark. `ellipse` for
 * Offen follows the universal presence convention: a lit dot means available.
 */
function CoreStateLabel({
  icon,
  label,
  accent,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  accent: string;
}) {
  return (
    <View style={styles.coreStateLabelRow}>
      <Ionicons name={icon} size={12} color={accent} />
      <Text
        {...TEXT_CAPPED}
        numberOfLines={1}
        style={[styles.coreStateLabelText, { color: accent }]}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * The Core has one dark glass body, not ornamental rings. Native Liquid Glass
 * supplies real refraction where iOS offers it; the SVG fallback keeps a
 * readable translucent material rather than burying the map under flat paint.
 */
function CoreSurfaceOptics({
  size,
  accent,
  orbitOpen,
}: {
  size: number;
  accent: string;
  orbitOpen: boolean;
}) {
  const radius = size / 2;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {canUseNativeCoreGlass ? (
        <GlassView
          colorScheme="dark"
          glassEffectStyle="regular"
          isInteractive
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          tintColor="rgba(12,22,30,0.22)"
        />
      ) : null}
      <Svg style={StyleSheet.absoluteFill} width={size} height={size}>
        <Defs>
          <RadialGradient id="coreSurfaceDepth" cx={size * 0.24} cy={size * 0.14} r={size * 1.02}>
            <Stop offset="0" stopColor="#E7F4FF" stopOpacity={orbitOpen ? 0.16 : 0.2} />
            <Stop offset="0.3" stopColor="#25485D" stopOpacity={0.26} />
            <Stop offset="0.7" stopColor="#091118" stopOpacity={0.44} />
            <Stop offset="1" stopColor="#03070A" stopOpacity={0.68} />
          </RadialGradient>
          <RadialGradient id="coreSurfaceState" cx={size * 0.52} cy={size * 0.76} r={size * 0.8}>
            <Stop offset="0" stopColor={accent} stopOpacity={orbitOpen ? 0.22 : 0.3} />
            <Stop offset="0.58" stopColor={accent} stopOpacity={0.09} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="coreSurfaceSheen" x1={0} y1={0} x2={0} y2={size}>
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.12} />
            <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity={0.025} />
            <Stop offset="0.62" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect
          x={0}
          y={0}
          width={size}
          height={size}
          rx={radius}
          fill={canUseNativeCoreGlass ? 'rgba(5,10,14,0.14)' : 'rgba(5,10,14,0.24)'}
        />
        <Rect x={0} y={0} width={size} height={size} rx={radius} fill="url(#coreSurfaceDepth)" />
        <Rect x={0} y={0} width={size} height={size} rx={radius} fill="url(#coreSurfaceState)" />
        <Rect x={0} y={0} width={size} height={size} rx={radius} fill="url(#coreSurfaceSheen)" />
        <Rect
          x={0.5}
          y={0.5}
          width={size - 1}
          height={size - 1}
          rx={radius - 0.5}
          fill="none"
          stroke="rgba(232,246,255,0.22)"
          strokeWidth={1}
        />
      </Svg>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The ONE hold indicator, wherever the Core measures a hold.
 *
 * Same ring, same stroke, same start at twelve o'clock, same clockwise fill —
 * around the "Aktivität" chip while it unfolds Jetzt/Soon, around the Core
 * while a return or a close fills, and around the resting Core while the hold
 * that opens the orbit matures. One form means one thing: keep going and this
 * completes. Three shapes for one promise was the reason the gestures felt
 * unrelated even though they are the same interaction.
 *
 * The fill duration is NEVER shortened by reduced motion. It is not decoration:
 * it is the gesture's own clock, and the action fires from this animation's
 * completion callback, so the ring and the outcome cannot disagree.
 */
function HoldProgressRing({
  size,
  progress,
  accent,
  inset = 6,
  stroke = 4,
}: {
  size: number;
  progress: SharedValue<number>;
  accent: string;
  inset?: number;
  stroke?: number;
}) {
  const visualSize = size + inset * 2;
  const radius = (visualSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - Math.max(0, Math.min(1, progress.value))),
  }));
  // Opacity only — never a scale. The ring is drawn once at these exact radii
  // and must stay on them: a transform here is applied to the rasterised SVG,
  // so any fractional scale both resamples the stroke (soft for the whole fill,
  // crisp only on the final frame) and walks the stroke outwards as it grows.
  // The old `0.9 + progress * 0.1` moved this 64px ring's radius 3px out over
  // the fill, and compounded with the OrbitItem scale it wrapped around.
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 5),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.holdRing,
        { height: visualSize, left: -inset, top: -inset, width: visualSize },
        style,
      ]}
    >
      <Svg width={visualSize} height={visualSize}>
        <Circle
          cx={visualSize / 2}
          cy={visualSize / 2}
          r={radius}
          fill="none"
          stroke={accent}
          strokeOpacity={0.24}
          strokeWidth={stroke}
        />
        <AnimatedCircle
          cx={visualSize / 2}
          cy={visualSize / 2}
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          transform={`rotate(-90 ${visualSize / 2} ${visualSize / 2})`}
          animatedProps={animatedProps}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * The lit rim — one shape, blurred.
 *
 * Four constructions were tried before this one, and each failed for a reason
 * worth keeping written down, because each looks reasonable on paper:
 *
 * - **Many strokes.** Round caps add half the stroke width to each end, so at
 *   4.1 px apart and up to 7.5 px wide, three piled onto every point — and
 *   translucent paint compounds rather than adds. The pile depth changed along
 *   the arc because the widths did, so it beaded.
 * - **Soft dabs.** Same family, same trap: to reach a bright peak each dab must
 *   be near-opaque, and near-opaque dabs show their own outlines.
 * - **A few filled rings.** Smooth along the arc at last, but their inner and
 *   outer edges are hard, so the eye reads three concrete radii. Softening them
 *   with more rings needs about fifty before the steps drop below sight.
 * - **Two crossed gradients under a mask.** Correct, and genuinely smooth — but
 *   four gradients and two masks to describe one patch of light.
 *
 * What it actually is: a bell whose FLAT SIDE IS THE BUTTON'S OWN CURVE, filled
 * flat, with its edge blurred away. The bell gives the falloff along the rim
 * because the shape simply gets thinner towards its shoulders, and a thin shape
 * under a blur goes faint on its own. The blur gives the falloff across the rim.
 * One path, one filter, no gradients, no mask, and nothing that can seam —
 * blurring an edge is the one operation with no steps in it by definition.
 */
const MENISCUS_RIM = HOLD_CORE_SIZE / 2;
/** The bell stands on this radius. Slightly inside the rim, so it sits ON it. */
const MENISCUS_FOOT = 84;
/** Softens both edges. The one number that trades reach against crispness. */
const MENISCUS_BLUR = 3.4;
const MENISCUS_BLEED = 26;
const MENISCUS_CANVAS = HOLD_CORE_SIZE + MENISCUS_BLEED * 2;
const MENISCUS_LIGHT = CORE_ACCENT.now;
/** Resting: a low, wide, dim haze. Committed: tall, tight and bright. */
const MENISCUS_REST = { height: 6, sigma: 1.3, opacity: 0.42 };
const MENISCUS_FOCUS = { height: 12, sigma: 0.62, opacity: 0.98 };

/**
 * The bell, as a closed path. Both edges are sampled rather than drawn as an
 * arc: an `A` command back along the foot needs sweep flags that flip with the
 * span, and there is nothing to gain from being clever here — at 64 steps the
 * chord error is under a twentieth of a pixel.
 */
function meniscusBell(centre: number, foot: number, height: number, sigma: number): string {
  // Where the bell drops under half a pixel — past that the blur eats it anyway.
  // Derived from the HEIGHT, not from sigma alone: a fixed multiple of sigma had
  // the low, wide resting bell running 328° around the Core and overlapping
  // itself at the bottom. Capped below a full half-turn for the same reason.
  const span = Math.min(
    Math.PI * 0.95,
    sigma * Math.sqrt(Math.log(Math.max(1.2, height / 0.4)) / 2.2),
  );
  const steps = 64;
  const at = (phi: number, radius: number) =>
    `${(centre + Math.sin(phi) * radius).toFixed(2)} ${(centre - Math.cos(phi) * radius).toFixed(2)}`;
  const parts: string[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const phi = -span + (step / steps) * span * 2;
    const radius = foot + height * Math.exp(-((phi / sigma) * (phi / sigma)) * 2.2);
    parts.push(`${step ? 'L' : 'M'} ${at(phi, radius)}`);
  }
  for (let step = steps; step >= 0; step -= 1) {
    parts.push(`L ${at(-span + (step / steps) * span * 2, foot)}`);
  }
  return `${parts.join(' ')} Z`;
}

const MeniscusProfile = memo(function MeniscusProfile({
  id,
  shape,
}: {
  id: string;
  shape: { height: number; sigma: number; opacity: number };
}) {
  const size = MENISCUS_CANVAS;
  const centre = size / 2;

  return (
    <Svg width={size} height={size}>
      <Defs>
        {/* Generous region: the default one clips a blur this wide. */}
        <Filter id={id} x="-35%" y="-35%" width="170%" height="170%">
          <FeGaussianBlur stdDeviation={MENISCUS_BLUR} />
        </Filter>
      </Defs>
      <Path
        d={meniscusBell(centre, MENISCUS_FOOT, shape.height, shape.sigma)}
        fill={MENISCUS_LIGHT}
        fillOpacity={shape.opacity}
        filter={`url(#${id})`}
      />
    </Svg>
  );
});

/**
 * The live-movement indicator: the Core's own rim, lit where the thumb points.
 *
 * It shows ONE thing — where your hand is, right now. It deliberately does not
 * show what is armed: the target chips already say that, and repeating it here
 * made the same event happen twice in two places. So there is no pull toward
 * the armed angle, no mark on it, and the colour is CONSTANT — a colour that
 * changed on arming would be that same snap a third time.
 *
 * The one thing about the movement that does change it is DECISIVENESS: a
 * committed thumb crossfades to the tight profile, resting in the dead zone
 * leaves the broad, undirected one. Nothing reacts to SPEED. A version that
 * smeared the light while sweeping was tried and removed — it looked alive and
 * cost the indicator its only job, because a light that spreads while you move
 * is least readable exactly when you are asking it where you are.
 *
 * It costs no surface. It is the border the Core already draws, which is the
 * whole reason it beat every version that lived somewhere of its own: on this
 * screen, somewhere of its own always means the map.
 */
function CoreMeniscus({
  coreSize,
  trackAngle,
  commit,
  reveal,
  suppress,
}: {
  /** Only used to keep the fixed canvas centred on the Core as it grows. */
  coreSize: number;
  trackAngle: SharedValue<number>;
  commit: SharedValue<number>;
  /** The orbit's own open clock. */
  reveal: SharedValue<number>;
  /** Going back, closing, or closed: the rim has nothing to say in any of them. */
  suppress: SharedValue<number>;
}) {
  const offset = (coreSize - MENISCUS_CANVAS) / 2;

  const aimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(trackAngle.value * 180) / Math.PI}deg` }],
  }));
  // Both gates stay inlined: a helper declared in the component body is a plain
  // JS function, and calling it from a worklet throws on the UI thread.
  const restStyle = useAnimatedStyle(() => ({
    opacity: (1 - commit.value) * Math.min(1, reveal.value * 2) * (1 - suppress.value),
  }));
  const focusStyle = useAnimatedStyle(() => ({
    opacity: commit.value * Math.min(1, reveal.value * 2) * (1 - suppress.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.meniscus,
        { height: MENISCUS_CANVAS, left: offset, top: offset, width: MENISCUS_CANVAS },
        aimStyle,
      ]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, restStyle]}>
        <MeniscusProfile id="coreMeniscusRest" shape={MENISCUS_REST} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, focusStyle]}>
        <MeniscusProfile id="coreMeniscusFocus" shape={MENISCUS_FOCUS} />
      </Animated.View>
    </Animated.View>
  );
}

/** A quiet magnetic-capture cue before a target becomes the active choice. */
function TargetIntentHalo({
  width,
  height,
  borderRadius,
  offset,
  progress,
  retract,
  stagger,
  joystickX,
  joystickY,
}: {
  width: number;
  height: number;
  borderRadius: number;
  offset: { x: number; y: number };
  progress: SharedValue<number>;
  retract?: SharedValue<number>;
  stagger: number;
  joystickX: SharedValue<number>;
  joystickY: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const span = Math.max(0.001, 1 - stagger);
    const raw = Math.max(0, Math.min(1, (progress.value - stagger) / span));
    const distance = Math.hypot(offset.x, offset.y) || 1;
    const intent = Math.max(
      0,
      (joystickX.value * offset.x + joystickY.value * offset.y) / distance,
    );
    // A small dead zone prevents the whole menu glowing while the thumb is
    // simply resting. Beyond it, the halo becomes a continuous capture meter.
    const capture = Math.max(0, Math.min(1, (intent - 0.18) / 0.82));
    const visible = Math.min(1, raw * 2.1) * (1 - (retract?.value ?? 0));

    return {
      opacity: visible * capture * 0.68,
      transform: [{ scale: 0.88 + capture * 0.2 }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.targetIntentHalo, { borderRadius, height, width }, style]}
    />
  );
}

/** A brief split guide makes the two activity outcomes legible as they arrive. */
function ActivityChoiceGuideBranch({
  box,
  offset,
  progress,
  stagger,
  accent,
}: {
  box: CoreGeometryBox;
  offset: { x: number; y: number };
  progress: SharedValue<number>;
  stagger: number;
  accent: string;
}) {
  const startX = box.cx;
  const startY = box.cy - HOLD_CORE_SIZE / 2 + 15;
  const endX = box.cx + offset.x * 0.7;
  const endY = box.cy + offset.y * 0.74;
  const path = `M ${startX} ${startY} Q ${box.cx + offset.x * 0.16} ${startY - 20} ${endX} ${endY}`;
  const pathLength = Math.hypot(endX - startX, endY - startY) * 1.28;
  const animatedProps = useAnimatedProps(() => {
    const span = Math.max(0.001, 1 - stagger);
    const raw = Math.max(0, Math.min(1, (progress.value - stagger) / span));
    const arrival = Math.max(0, 1 - Math.abs(raw - 0.8) * 5);
    return {
      strokeDashoffset: pathLength * (1 - raw),
      strokeOpacity: Math.min(1, raw * 4) * (0.18 + arrival * 0.72),
    };
  });

  return (
    <AnimatedPath
      d={path}
      fill="none"
      stroke={accent}
      strokeLinecap="round"
      strokeWidth={2.5}
      strokeDasharray={`${pathLength} ${pathLength}`}
      animatedProps={animatedProps}
    />
  );
}

function ActivityChoiceGuide({
  box,
  offsets,
  progress,
}: {
  box: CoreGeometryBox;
  offsets: readonly { x: number; y: number }[];
  progress: SharedValue<number>;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={box.width} height={box.height}>
        {CORE_ACTIVITY_TARGETS.map((target, index) => {
          const offset = offsets[index];
          if (!offset) return null;
          return (
            <ActivityChoiceGuideBranch
              key={target.id}
              box={box}
              offset={offset}
              progress={progress}
              stagger={index * 0.09}
              accent={target.accent}
            />
          );
        })}
      </Svg>
    </View>
  );
}

/**
 * The lower action hint: it is a broad physical zone, not the narrow curve.
 * Only the level-two return fills it; root close happens on release.
 *
 * Both marks stay inside the Core. The lower arc is intentionally inset from
 * its rim so the gesture can be started comfortably in the whole lower zone.
 */
function CoreReturnLane({
  coreSize,
  activation,
  progress,
}: {
  coreSize: number;
  activation: SharedValue<number>;
  progress: SharedValue<number>;
}) {
  const centre = coreSize / 2;
  const radius = centre - 13;
  const halfChord = coreSize * 0.22;
  const edgeY = centre + Math.sqrt(radius * radius - halfChord * halfChord);
  // Counter-clockwise from the lower left to lower right traces the bottom
  // segment of this same circle in SVG's screen-coordinate space.
  const path = `M ${centre - halfChord} ${edgeY} A ${radius} ${radius} 0 0 0 ${centre + halfChord} ${edgeY}`;
  const arcLength = radius * 2 * Math.asin(halfChord / radius);
  const activeStyle = useAnimatedStyle(() => ({ opacity: activation.value }));
  const progressProps = useAnimatedProps(() => ({
    strokeDashoffset: arcLength * (1 - Math.max(0, Math.min(1, progress.value))),
  }));

  return (
    <View pointerEvents="none" style={[styles.returnRail, { height: coreSize, width: coreSize }]}>
      <Svg width={coreSize} height={coreSize}>
        <Path
          d={path}
          fill="none"
          stroke="rgba(242,239,233,0.32)"
          strokeLinecap="round"
          strokeWidth={3}
        />
      </Svg>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, activeStyle]}>
        <Svg width={coreSize} height={coreSize}>
          <Path
            d={path}
            fill="none"
            stroke={CORE_RETURN_ACCENT}
            strokeOpacity={0.26}
            strokeLinecap="round"
            strokeWidth={4}
          />
          <AnimatedPath
            d={path}
            fill="none"
            stroke={CORE_RETURN_ACCENT}
            strokeLinecap="round"
            strokeWidth={4.5}
            strokeDasharray={`${arcLength} ${arcLength}`}
            animatedProps={progressProps}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * The core's own backdrop.
 *
 * Deliberately NOT a flat wash: four stops with an accent-tinted centre, so the
 * targets sit in a pool of light that belongs to the core rather than a grey
 * rectangle someone dropped behind them. It is still strictly local — darkening
 * the whole map to open a menu would hide the markers the menu exists to act
 * on, and a full-screen scrim is also a touch blocker.
 */
const CoreLens = memo(function CoreLens({ box, accent }: { box: CoreGeometryBox; accent: string }) {
  // The canvas is a SQUARE centred on the core, and that is load-bearing. It
  // used to be the full container box, which reaches much further above the
  // core than below it, so the falloff was cut off a third of the way down
  // while the top faded out properly. Scaling that canvas open from the core
  // then moved the clipped bottom edge — closer to the origin — slower than the
  // soft top edge, and the pool visibly bloomed upwards. Anything asymmetric
  // here brings the same artefact back.
  const size = box.lensRadius * 2;

  return (
    <Svg pointerEvents="none" width={size} height={size}>
      <Defs>
        {/* userSpaceOnUse keeps the falloff circular; object-bounding-box units
            would stretch it into an ellipse if this box ever stops being square. */}
        <RadialGradient
          id="coreLens"
          gradientUnits="userSpaceOnUse"
          cx={box.lensRadius}
          cy={box.lensRadius}
          r={box.lensRadius}
        >
          <Stop offset="0" stopColor="#05080A" stopOpacity={0.74} />
          <Stop offset="0.34" stopColor="#070C10" stopOpacity={0.56} />
          <Stop offset="0.68" stopColor="#080D12" stopOpacity={0.26} />
          <Stop offset="1" stopColor="#080D12" stopOpacity={0} />
        </RadialGradient>
        {/* A second, tighter pass in the core's own state colour. It is what
            makes the pool feel lit from the middle instead of merely dark. */}
        <RadialGradient
          id="coreLensTint"
          gradientUnits="userSpaceOnUse"
          cx={box.lensRadius}
          cy={box.lensRadius}
          r={box.lensRadius * 0.82}
        >
          <Stop offset="0" stopColor={accent} stopOpacity={0.22} />
          <Stop offset="0.45" stopColor={accent} stopOpacity={0.08} />
          <Stop offset="1" stopColor={accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#coreLens)" />
      <Rect width="100%" height="100%" fill="url(#coreLensTint)" />
    </Svg>
  );
});

interface OrbitItemProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel: string;
  offset: { x: number; y: number };
  box: CoreGeometryBox;
  /** Master bloom clock, 0 → parked in the core, 1 → fully out. Linear. */
  progress: SharedValue<number>;
  /** Retraction driver: root items ride this back into the core. */
  retract: SharedValue<number>;
  /** Fraction of the bloom this item waits before it starts travelling. */
  stagger: number;
  joystickX: SharedValue<number>;
  joystickY: SharedValue<number>;
  active: boolean;
  accent: string | null;
  dwellProgress?: SharedValue<number>;
  badge?: number;
  interactive: boolean;
  onPress: () => void;
}

function OrbitItem({
  icon,
  accessibilityLabel,
  offset,
  box,
  progress,
  retract,
  stagger,
  joystickX,
  joystickY,
  active,
  accent,
  dwellProgress,
  badge = 0,
  interactive,
  onPress,
}: OrbitItemProps) {
  const colors = useOverlayColors();

  const style = useAnimatedStyle(() => {
    // Per-item window carved out of the shared clock. Doing the stagger here
    // instead of with one shared value per item keeps the hook count fixed
    // while still giving every target its own start time.
    const span = Math.max(0.001, 1 - stagger);
    const raw = Math.max(0, Math.min(1, (progress.value - stagger) / span));

    // Back-out overshoot, inlined: a worklet cannot call a helper declared in
    // the component body. This is what makes the target arrive and settle
    // rather than merely appear.
    const u = raw - 1;
    const eased = 1 + 2.15 * u * u * u + 1.15 * u * u;

    // The travel curves. Starting the offset rotated and unwinding it as the
    // item flies means the targets sweep OUT of the core along an arc, which
    // reads as one control opening instead of separate chips being dealt.
    const swirl = (1 - eased) * 0.42;
    const cos = Math.cos(swirl);
    const sin = Math.sin(swirl);
    const travel = eased * (1 - retract.value);
    const x = (offset.x * cos - offset.y * sin) * travel;
    const y = (offset.x * sin + offset.y * cos) * travel;

    // Leaning into the thumb is signalled by `TargetIntentHalo` ALONE, never by
    // scaling this chip. The chip carries an Ionicons glyph, which is rastered
    // at layout size — the old `* (1 + intent * 0.07)` held the target the
    // thumb pointed at on a fractional scale for as long as it stayed selected,
    // which is exactly when it is being looked at. The halo is a plain bordered
    // View with nothing rastered inside it, so it can scale for free.

    // The icon counter-rotates as it rides out and settles level. Small on
    // purpose — 26° reads as the chip having been flicked into place, where
    // anything larger turns a menu into a spinner.
    const spin = (1 - eased) * -26;

    return {
      opacity: Math.min(1, raw * 2.1) * (1 - retract.value),
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${spin}deg` },
        // Settles on exactly 1 and stays there, so the resting and selected
        // chip are both pixel-aligned.
        { scale: 0.34 + 0.66 * eased },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[
        styles.orbitSlot,
        { left: box.cx - ITEM_SIZE / 2, top: box.cy - ITEM_SIZE / 2 },
        style,
      ]}
    >
      <TargetIntentHalo
        width={ITEM_SIZE}
        height={ITEM_SIZE}
        borderRadius={ITEM_SIZE / 2}
        offset={offset}
        progress={progress}
        retract={retract}
        stagger={stagger}
        joystickX={joystickX}
        joystickY={joystickY}
      />
      <Pressable
        accessibilityRole="button"
        // The badge is a number a sighted user reads off the chip; spoken, it
        // has to be part of the label or it does not exist.
        accessibilityLabel={badge > 0 ? `${accessibilityLabel}, ${badge} neu` : accessibilityLabel}
        accessibilityState={{ selected: active }}
        disabled={!interactive}
        onPress={onPress}
        style={[
          styles.orbitSurface,
          {
            backgroundColor: accent ?? (active ? 'rgba(255,255,255,0.20)' : 'rgba(14,20,18,0.72)'),
            borderColor: accent ?? (active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.14)'),
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={22}
          color={accent ? onColorTextColor(accent) : active ? colors.icon : colors.iconMuted}
        />
        {badge > 0 ? (
          <View pointerEvents="none" style={styles.badge}>
            <Text {...TEXT_CAPPED} style={styles.badgeText}>
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {dwellProgress ? (
        <HoldProgressRing size={ITEM_SIZE} progress={dwellProgress} accent={CORE_ACCENT.now} />
      ) : null}
    </Animated.View>
  );
}

interface ActivityCardProps {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel: string;
  accent: string;
  active: boolean;
  offset: { x: number; y: number };
  box: CoreGeometryBox;
  progress: SharedValue<number>;
  stagger: number;
  joystickX: SharedValue<number>;
  joystickY: SharedValue<number>;
  interactive: boolean;
  onPress: () => void;
}

/**
 * Jetzt / Soon, in the app's own clothes.
 *
 * These used to be SVG pie wedges, which exist nowhere else in Together. The
 * composer's `ActivityModeSwitch` is the canonical way this app offers exactly
 * these two choices, so the card borrows its whole vocabulary: the squircle,
 * the filled-glyph `AnimatedToggleIcon` with its selection pop, the mode accent
 * as the fill, and `onColorTextColor` for a foreground that stays legible on
 * green and amber (white fails WCAG on both).
 */
function ActivityCard({
  label,
  icon,
  accessibilityLabel,
  accent,
  active,
  offset,
  box,
  progress,
  stagger,
  joystickX,
  joystickY,
  interactive,
  onPress,
}: ActivityCardProps) {
  const style = useAnimatedStyle(() => {
    const span = Math.max(0.001, 1 - stagger);
    const raw = Math.max(0, Math.min(1, (progress.value - stagger) / span));
    const u = raw - 1;
    const eased = 1 + 2.15 * u * u * u + 1.15 * u * u;

    // Same flick as the root icons, but each card tilts AWAY from the core, so
    // the pair opens outwards like a hand of two rather than twisting in step.
    const spin = (1 - eased) * (offset.x < 0 ? 9 : -9);

    return {
      opacity: Math.min(1, raw * 2.1),
      transform: [
        { translateX: offset.x * eased },
        { translateY: offset.y * eased },
        { rotate: `${spin}deg` },
        // Intent is the halo's job here too — see `OrbitItem`. This card holds a
        // glyph and a label, so a held fractional scale softened both for as
        // long as the thumb pointed at it. Settles on exactly 1.
        { scale: 0.62 + 0.38 * eased },
      ],
    };
  });

  const foreground = active ? onColorTextColor(accent) : '#F2EFE9';

  return (
    <Animated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[
        styles.activityCardSlot,
        {
          left: box.cx - CORE_ACTIVITY_CARD_WIDTH / 2,
          top: box.cy - CORE_ACTIVITY_CARD_HEIGHT / 2,
        },
        style,
      ]}
    >
      <TargetIntentHalo
        width={CORE_ACTIVITY_CARD_WIDTH}
        height={CORE_ACTIVITY_CARD_HEIGHT}
        borderRadius={20}
        offset={offset}
        progress={progress}
        stagger={stagger}
        joystickX={joystickX}
        joystickY={joystickY}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: active }}
        disabled={!interactive}
        onPress={onPress}
        style={[
          styles.activityCard,
          {
            backgroundColor: active ? accent : 'rgba(12,18,24,0.86)',
            borderColor: active ? accent : 'rgba(255,255,255,0.16)',
          },
        ]}
      >
        <AnimatedToggleIcon
          icon={icon}
          active={active}
          size={24}
          activeColor={foreground}
          inactiveColor={accent}
        />
        <Text {...TEXT_CAPPED} style={[styles.activityCardLabel, { color: foreground }]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The Together Core — the personal control at the bottom of the map.
 *
 * Two gestures, two meanings, and they can never both fire:
 * - a TAP is the personal status (publish on the defaults, open the sheet);
 * - a HOLD opens the orbit and turns the same spot into a thumb joystick.
 *
 * Releasing inside the neutral zone confirms nothing and closes the orbit. A
 * release over an armed target runs the exact same handler as tapping it.
 *
 * It knows nothing about Firebase, the router or any service: every outcome
 * leaves through a typed callback, so the adapter above stays the one place
 * where this control meets the app's real functions.
 */
export function TogetherCore({
  status,
  activity = null,
  journey = null,
  expiresAt,
  openedAt,
  openVibeLabel = null,
  locationShared = false,
  postfachBadgeCount = 0,
  onTap,
  onSelectTarget,
  onSelectActivityMode,
  onOrbitStateChange,
  holdHintVisible = false,
  onHoldHintDismiss,
  ref,
}: TogetherCoreProps) {
  const reducedMotion = useReducedMotion();
  const colors = useOverlayColors();
  const { width } = useWindowDimensions();

  const [mode, setMode] = useState<CoreMode>('idle');
  const [level, setLevel] = useState<CoreLevel>('root');
  const [armed, setArmed] = useState<number | null>(null);
  const [returning, setReturning] = useState(false);
  const [rootClosing, setRootClosing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /**
   * Outlives `mode` by exactly one closing animation. Unmounting the targets
   * the moment the orbit closes would delete them mid-retraction, so they would
   * blink out instead of riding their paths back into the core.
   */
  const [orbitMounted, setOrbitMounted] = useState(false);

  const progress = useSharedValue(0);
  const retract = useSharedValue(0);
  const subProgress = useSharedValue(0);
  const press = useSharedValue(0);
  const coreExpansion = useSharedValue(0);
  const activityExpansion = useSharedValue(0);
  const selectionPulse = useSharedValue(0);
  const statePulse = useSharedValue(0);
  const burst = useSharedValue(0);
  const joystickX = useSharedValue(0);
  const joystickY = useSharedValue(0);
  const returnActivation = useSharedValue(0);
  const returnProgress = useSharedValue(0);
  const closeActivation = useSharedValue(0);
  /**
   * Holds the rim light down while the orbit is closed or closing.
   *
   * Without it, closing through the lower zone flashed the light back on: the
   * zone's own suppression released in 110 ms while the orbit's clock took
   * 190 ms to fall, so for one moment nothing was hiding the rim any more and
   * the menu had not finished leaving. Starts at 1, because closed is where the
   * Core begins.
   */
  const closingMute = useSharedValue(1);
  const activityDwellProgress = useSharedValue(0);
  const openHoldProgress = useSharedValue(0);
  // The two halves of the position indicator: `trackAngle` is the live thumb
  // direction, `armAngle` the snapped one. Keeping them apart is what makes the
  // snap visible as a snap instead of a discontinuity.
  const trackAngle = useSharedValue(0);
  const armAngle = useSharedValue(0);
  const armStrength = useSharedValue(0);
  const commit = useSharedValue(0);

  // Refs, not state: these change inside gesture callbacks and have to be
  // readable synchronously in the same tick.
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  const movedRef = useRef(false);
  const armedRef = useRef<number | null>(null);
  const levelRef = useRef<CoreLevel>('root');
  const modeRef = useRef<CoreMode>('idle');
  const lastGestureActionRef = useRef(0);
  const lastSampleRef = useRef({ x: 0, y: 0 });
  /** The newest thumb offset. What a level change latches the next arming to. */
  const currentPointRef = useRef({ x: 0, y: 0 });
  /**
   * Where inside the Core the touch landed, relative to its centre.
   *
   * The gesture reports movement relative to the finger, which is right for
   * selection but wrong for the return lane: that lane is drawn at a fixed spot
   * on the Core, so it has to be tested against the Core's own centre.
   */
  const touchOriginRef = useRef({ x: 0, y: 0 });
  const pathRef = useRef(createCoreGesturePathState());
  const returnPhaseRef = useRef<CoreReturnPhase>('idle');
  const returnVisualRef = useRef(false);
  const rootClosePreviewRef = useRef(false);
  /**
   * The lower zone acts only once the thumb has been OUTSIDE it during this
   * touch.
   *
   * The zone is anchored to the Core, but selection is measured from the
   * finger, and release used to be judged on position alone. That combination
   * could not tell three different intentions apart: "I grabbed the Core low",
   * "I have just come back from the sub-level and my thumb is still here", and
   * "I deliberately moved down here". Requiring the thumb to leave once makes
   * the zone something you ENTER rather than something you occupy, which is the
   * only one of the three that means anything.
   */
  const lowerZoneEligibleRef = useRef(false);
  /** Makes the raw touch-up fallback and Pan finalization safely idempotent. */
  const finalizedTouchRef = useRef(false);
  /** Is a finger currently down on the core? Gates the hold timer. */
  const touchActiveRef = useRef(false);
  const handoffRef = useRef<(() => void) | null>(null);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Hands the screen over to the surface a confirmed target opens.
   *
   * The confirm used to close the orbit and open the surface in the SAME frame,
   * so the targets flew inwards to the core while the sheet rose past them out
   * of the bottom edge — two motions crossing in opposite directions over the
   * same half of the screen, each making the other hard to read. Neither is at
   * fault; running them together is.
   *
   * Sequenced, but overlapping on purpose: the wait is shorter than the
   * retraction, so the surface starts while the orbit is on its last few frames
   * home. Fully sequential would read as a stall, and there is nothing to wait
   * for once the eye has seen where the menu went.
   */
  const handOff = useCallback(
    (run: () => void) => {
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
      const pending = handoffRef.current;
      handoffRef.current = null;
      pending?.();
      if (reducedMotion) {
        run();
        return;
      }
      handoffRef.current = run;
      handoffTimerRef.current = setTimeout(() => {
        handoffTimerRef.current = null;
        const queued = handoffRef.current;
        handoffRef.current = null;
        queued?.();
      }, HANDOFF_MS);
    },
    [reducedMotion],
  );

  /** A new touch must never race a surface that is still on its way in. */
  const flushHandoff = useCallback(() => {
    if (!handoffRef.current) return;
    if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    handoffTimerRef.current = null;
    const queued = handoffRef.current;
    handoffRef.current = null;
    queued();
  }, []);

  /**
   * Fresh gesture grammar.
   *
   * `latchHere` is what a LEVEL change passes: the thumb has not moved, so the
   * new level's angles would otherwise be read against the old level's resting
   * position and arm a target nobody chose. Latching to the current point makes
   * the next arming require a deliberate move.
   */
  const resetGesturePath = useCallback((latchHere = false) => {
    pathRef.current = createCoreGesturePathState(latchHere ? { ...currentPointRef.current } : null);
  }, []);

  const timing = useCallback(
    (ms: number) => ({ duration: reducedMotion ? 0 : ms, easing: EASE_OUT }),
    [reducedMotion],
  );

  /**
   * The orbit shrinks on narrow screens instead of sliding under the layers and
   * recenter buttons: those are map controls that must stay reachable, and a
   * menu that covers them would be exactly the blocking overlay this design
   * avoids.
   */
  const orbitRadius = useMemo(() => {
    const widest = Math.max(...CORE_ROOT_ANGLES.map((angle) => Math.abs(Math.sin(angle))));
    const room = width / 2 - RIGHT_COLUMN_CLEARANCE - ITEM_SIZE / 2;
    if (widest <= 0) return CORE_ORBIT_RADIUS;
    return Math.max(MIN_ORBIT_RADIUS, Math.min(CORE_ORBIT_RADIUS, room / widest));
  }, [width]);

  const activityRadius = useMemo(() => {
    const widest = Math.max(...CORE_ACTIVITY_ANGLES.map((angle) => Math.abs(Math.sin(angle))));
    const room = width / 2 - RIGHT_COLUMN_CLEARANCE - CORE_ACTIVITY_CARD_WIDTH / 2;
    if (widest <= 0) return CORE_ACTIVITY_RADIUS;
    return Math.max(CORE_ACTIVITY_RADIUS_MIN, Math.min(CORE_ACTIVITY_RADIUS, room / widest));
  }, [width]);

  const box = useMemo<CoreGeometryBox>(() => {
    // The lens is sized to the ROOT orbit only. The activity cards reach past
    // it and carry their own opaque surface, so growing the darkened pool to
    // contain them would dim a large part of the map for nothing.
    //
    // Nothing else may claim space here either. The position indicator lives on
    // the Core's own rim precisely so this box never has to grow: every pixel it
    // would gain is a pixel of map.
    const lensRadius = orbitRadius + ITEM_SIZE / 2 + LENS_PADDING;
    const activityReach = activityRadius + CORE_ACTIVITY_CARD_HEIGHT / 2;
    const cy = Math.max(lensRadius, activityReach) + 8;
    return { width, height: cy + BOX_FOOT, cx: width / 2, cy, lensRadius };
  }, [activityRadius, orbitRadius, width]);

  const rootOffsets = useMemo(
    () => CORE_ROOT_ANGLES.map((angle) => polarOffset(angle, orbitRadius)),
    [orbitRadius],
  );
  const activityOffsets = useMemo(
    () => CORE_ACTIVITY_ANGLES.map((angle) => polarOffset(angle, activityRadius)),
    [activityRadius],
  );
  const rootRailReach = ROOT_RAIL_TRAVEL;
  const activityRailReach = useMemo(
    () => Math.max(1, ...activityOffsets.map((offset) => Math.abs(offset.x))),
    [activityOffsets],
  );

  const resetActivityDwell = useCallback(() => {
    cancelAnimation(activityDwellProgress);
    activityDwellProgress.value = withTiming(0, {
      duration: reducedMotion ? 0 : 100,
      easing: EASE_OUT,
    });
  }, [activityDwellProgress, reducedMotion]);

  const cancelOpenHold = useCallback(() => {
    cancelAnimation(openHoldProgress);
    openHoldProgress.value = withTiming(0, { duration: reducedMotion ? 0 : 90, easing: EASE_OUT });
  }, [openHoldProgress, reducedMotion]);

  const clearTimers = useCallback(() => {
    cancelOpenHold();
    resetActivityDwell();
  }, [cancelOpenHold, resetActivityDwell]);

  const setReturnVisual = useCallback(
    (next: boolean) => {
      if (returnVisualRef.current === next) return;
      returnVisualRef.current = next;
      setReturning(next);
      returnActivation.value = withTiming(next ? 1 : 0, {
        duration: reducedMotion ? 0 : 110,
        easing: EASE_OUT,
      });
    },
    [reducedMotion, returnActivation],
  );

  const clearReturnIntent = useCallback(() => {
    // Phase first: the cancelled fill calls back on the UI thread, and
    // `completeReturn` only acts while the phase still says `pending`.
    returnPhaseRef.current = 'idle';
    cancelAnimation(returnProgress);
    returnProgress.value = withTiming(0, {
      duration: reducedMotion ? 0 : 100,
      easing: EASE_OUT,
    });
    setReturnVisual(false);
  }, [reducedMotion, returnProgress, setReturnVisual]);

  const clearRootClosePreview = useCallback(
    (keepTargetsRetracted = false) => {
      if (!rootClosePreviewRef.current) return;
      rootClosePreviewRef.current = false;
      setRootClosing(false);
      closeActivation.value = withTiming(0, {
        duration: reducedMotion ? 0 : 110,
        easing: EASE_OUT,
      });
      if (!keepTargetsRetracted && modeRef.current !== 'idle') {
        if (levelRef.current === 'root') {
          retract.value = withTiming(0, timing(ROOT_CLOSE_RETRACT_MS));
        } else {
          subProgress.value = withTiming(1, timing(ROOT_CLOSE_RETRACT_MS));
        }
      }
    },
    [closeActivation, reducedMotion, retract, subProgress, timing],
  );

  const beginRootClosePreview = useCallback(() => {
    if (modeRef.current === 'idle' || rootClosePreviewRef.current) {
      return;
    }
    rootClosePreviewRef.current = true;
    setRootClosing(true);
    closeActivation.value = withTiming(1, {
      duration: reducedMotion ? 0 : 110,
      easing: EASE_OUT,
    });
    haptics.selection();
    if (levelRef.current === 'root') {
      retract.value = withTiming(1, timing(ROOT_CLOSE_RETRACT_MS));
    } else {
      subProgress.value = withTiming(0, timing(ROOT_CLOSE_RETRACT_MS));
    }
  }, [closeActivation, reducedMotion, retract, subProgress, timing]);

  useEffect(
    () => () => {
      clearTimers();
      clearReturnIntent();
      clearRootClosePreview();
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    },
    [clearReturnIntent, clearRootClosePreview, clearTimers],
  );

  useEffect(() => {
    if (status !== 'open' && status !== 'now') return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [activity?.endsAt, expiresAt, status]);

  useEffect(() => {
    statePulse.value = 0;
    statePulse.value = withSequence(
      withTiming(1, { duration: reducedMotion ? 0 : 190, easing: EASE_OUT }),
      withTiming(0, { duration: reducedMotion ? 0 : 760, easing: EASE_OUT }),
    );
  }, [activity?.id, activity?.mode, reducedMotion, statePulse, status]);

  // Reports the MODE, not the mount. `orbitMounted` outlives the close by one
  // retraction so the targets can ride their paths back in — driving the map's
  // own controls from it made them return 230 ms after the menu had visibly
  // let go of the space.
  useEffect(() => {
    onOrbitStateChange?.(mode === 'idle' ? 'closed' : mode === 'persistent' ? 'parked' : 'held');
  }, [mode, onOrbitStateChange]);

  const applyMode = useCallback((next: CoreMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  /**
   * Moves the SNAPPED half of the indicator onto whatever is armed.
   *
   * The spring is what makes arrival read as capture: it overshoots a little and
   * settles. It used to be issued here and then silently overwritten in the same
   * tick by the continuous follower below — same shared value, last write wins —
   * so the snap this control is built around never actually played.
   */
  const aimArmed = useCallback(
    (index: number | null) => {
      const angles = levelRef.current === 'activity' ? CORE_ACTIVITY_ANGLES : CORE_ROOT_ANGLES;
      armStrength.value = withTiming(index == null ? 0 : 1, {
        duration: reducedMotion ? 0 : 130,
        easing: EASE_OUT,
      });
      if (index == null) return;
      const target = angles[index] ?? 0;
      armAngle.value = reducedMotion
        ? target
        : withSpring(target, { damping: 12, mass: 0.5, stiffness: 340 });
    },
    [armAngle, armStrength, reducedMotion],
  );

  /**
   * Moves the CONTINUOUS half. Deliberately kept as its own shared value: the
   * distance between the two is the hysteresis, and drawing that distance is
   * the whole point of the indicator.
   */
  const followTrack = useCallback(
    (angle: number | null) => {
      if (angle == null) return;
      // A short linear smooth only bridges irregular gesture samples. It must
      // stay short — this mark represents the finger, so any real lag here is
      // felt as the control not keeping up.
      trackAngle.value = reducedMotion
        ? angle
        : withTiming(angle, { duration: 55, easing: Easing.linear });
    },
    [reducedMotion, trackAngle],
  );

  /** Interpolates the locked track coordinate onto the visible target angles. */
  const trackAngleFor = useCallback((position: number | null, angles: readonly number[]) => {
    if (position == null || angles.length === 0) return null;
    const last = angles.length - 1;
    const clamped = Math.max(0, Math.min(last, position));
    const lower = Math.floor(clamped);
    const upper = Math.min(last, lower + 1);
    const start = angles[lower] ?? 0;
    const end = angles[upper] ?? start;
    return start + (end - start) * (clamped - lower);
  }, []);

  /**
   * Everything the indicator shows, back to "nothing chosen".
   *
   * Both angles glide to the apex rather than jumping: a level change happens
   * under a finger that has not moved, so a teleporting head would read as the
   * control twitching on its own.
   */
  const resetIndicator = useCallback(() => {
    const settle = { duration: reducedMotion ? 0 : 140, easing: EASE_OUT };
    armStrength.value = withTiming(0, settle);
    commit.value = withTiming(0, settle);
    trackAngle.value = withTiming(0, settle);
    armAngle.value = withTiming(0, settle);
  }, [armAngle, armStrength, commit, reducedMotion, trackAngle]);

  const closeOrbit = useCallback(
    (keepTargetsRetracted = false) => {
      clearTimers();
      clearReturnIntent();
      clearRootClosePreview(keepTargetsRetracted);
      heldRef.current = false;
      armedRef.current = null;
      resetGesturePath();
      levelRef.current = 'root';
      setArmed(null);
      setLevel('root');
      applyMode('idle');
      joystickX.value = withTiming(0, timing(110));
      joystickY.value = withTiming(0, timing(110));
      selectionPulse.value = withTiming(0, timing(100));
      // Leads the retraction slightly, so the light goes out and THEN the menu
      // folds away. It can only ever rise again on the next open.
      closingMute.value = withTiming(1, timing(90));
      resetIndicator();
      burst.value = 0;
      progress.value = withTiming(0, {
        duration: reducedMotion ? 0 : BLOOM_CLOSE_MS,
        easing: Easing.in(Easing.cubic),
      });
      coreExpansion.value = withTiming(0, timing(150));
      activityExpansion.value = withTiming(0, timing(130));
      retract.value = keepTargetsRetracted ? 1 : withTiming(0, timing(190));
      subProgress.value = withTiming(0, {
        duration: reducedMotion ? 0 : BLOOM_CLOSE_MS,
        easing: Easing.in(Easing.cubic),
      });
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = setTimeout(() => setOrbitMounted(false), reducedMotion ? 0 : 230);
    },
    [
      activityExpansion,
      applyMode,
      burst,
      clearTimers,
      clearReturnIntent,
      clearRootClosePreview,
      closingMute,
      coreExpansion,
      joystickX,
      joystickY,
      progress,
      reducedMotion,
      resetGesturePath,
      resetIndicator,
      retract,
      selectionPulse,
      subProgress,
      timing,
    ],
  );

  // The only thing the outside may do to a parked orbit: retract it. Everything
  // that CHOOSES still leaves through the typed callbacks.
  useImperativeHandle(ref, () => ({ close: closeOrbit }), [closeOrbit, ref]);

  const enterActivityLevel = useCallback(() => {
    if (levelRef.current === 'activity') return;
    resetActivityDwell();
    levelRef.current = 'activity';
    clearReturnIntent();
    // Selection restarts one level down — but NOT from the thumb's unchanged
    // position. "Aktivität" sits at −22° and "Jetzt" at −26°, so re-reading the
    // resting thumb against the new level armed Jetzt on the very next sample:
    // the hold that exists to REVEAL the two options went on to create one, and
    // whether it did came down to whether one more jitter event arrived. The
    // latch makes the next arming require a deliberate move.
    armedRef.current = null;
    resetGesturePath(true);
    setLevel('activity');
    setArmed(null);
    haptics.medium();
    resetIndicator();
    activityExpansion.value = withSpring(1, reducedMotion ? { duration: 0 } : CORE_SPRING);
    // Root targets fall back into the core first, and the two cards bloom out
    // of the space they leave behind — one continuous move, not a cross-fade.
    retract.value = withTiming(1, timing(170));
    subProgress.value = withDelay(
      70,
      withTiming(1, { duration: reducedMotion ? 0 : BLOOM_MS, easing: Easing.linear }),
    );
  }, [
    activityExpansion,
    clearReturnIntent,
    reducedMotion,
    resetActivityDwell,
    resetGesturePath,
    resetIndicator,
    retract,
    subProgress,
    timing,
  ]);

  const leaveActivityLevel = useCallback(() => {
    if (levelRef.current === 'root') return;
    levelRef.current = 'root';
    armedRef.current = null;
    // Same latch as on the way down, for the same reason.
    resetGesturePath(true);
    setLevel('root');
    setArmed(null);
    haptics.light();
    resetIndicator();
    activityExpansion.value = withTiming(0, timing(130));
    subProgress.value = withTiming(0, {
      duration: reducedMotion ? 0 : 150,
      easing: Easing.in(Easing.cubic),
    });
    retract.value = withDelay(
      70,
      withTiming(0, { duration: reducedMotion ? 0 : BLOOM_MS, easing: Easing.linear }),
    );
  }, [
    activityExpansion,
    reducedMotion,
    resetGesturePath,
    resetIndicator,
    retract,
    subProgress,
    timing,
  ]);

  const isCurrentThumbInReturnLane = useCallback(() => {
    const { x, y } = currentPointRef.current;
    return isCoreReturnLane(touchOriginRef.current.x + x, touchOriginRef.current.y + y);
  }, []);

  const isCurrentThumbInCloseLane = useCallback(() => {
    const { x, y } = currentPointRef.current;
    return isCoreCloseLane(touchOriginRef.current.x + x, touchOriginRef.current.y + y);
  }, []);

  const completeReturn = useCallback(() => {
    if (returnPhaseRef.current !== 'pending' || levelRef.current !== 'activity') return;

    const wasParked = modeRef.current === 'persistent';
    returnPhaseRef.current = 'idle';
    setReturnVisual(false);
    // The ring has done its job. It used to be left standing at full, so a
    // completed return left a full red ring drawn on the Core.
    cancelAnimation(returnProgress);
    returnProgress.value = withTiming(0, {
      duration: reducedMotion ? 0 : 140,
      easing: EASE_OUT,
    });
    // The thumb is still sitting in the lower zone it just used. Without this
    // the same unchanged position immediately reads as "close", and letting go
    // after going back one level shut the whole menu.
    lowerZoneEligibleRef.current = false;
    heldRef.current = !wasParked && touchActiveRef.current;
    leaveActivityLevel();
    applyMode(wasParked ? 'persistent' : 'joystick');
  }, [applyMode, leaveActivityLevel, reducedMotion, returnProgress, setReturnVisual]);

  const beginReturn = useCallback(() => {
    if (returnPhaseRef.current === 'pending') return;
    resetActivityDwell();
    returnPhaseRef.current = 'pending';
    setReturnVisual(true);
    cancelAnimation(returnProgress);
    returnProgress.value = 0;
    haptics.selection();
    // The ring IS the timer. A parallel setTimeout of the same length used to
    // run alongside it, and under JS load the two disagreed — the ring filled
    // and nothing happened, which is the one thing a hold indicator may never
    // do. Reduced motion does not shorten it: this is the gesture's clock.
    returnProgress.value = withTiming(
      1,
      { duration: RETURN_DWELL_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(completeReturn)();
      },
    );
  }, [completeReturn, resetActivityDwell, returnProgress, setReturnVisual]);

  const openOrbit = useCallback(
    (next: Exclude<CoreMode, 'idle'>) => {
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
      clearReturnIntent();
      clearRootClosePreview();
      setOrbitMounted(true);
      heldRef.current = next === 'joystick';
      applyMode(next);
      haptics.medium();
      onHoldHintDismiss?.();
      aimArmed(null);
      commit.value = 0;
      armAngle.value = 0;
      trackAngle.value = 0;
      closingMute.value = 0;
      // Opening always starts from a fully un-retracted root fan. This is not
      // belt-and-braces: closing through the lower zone deliberately LEAVES the
      // targets retracted so they do not fly back out under a closing menu, and
      // nothing else ever set them back. The next open then showed an empty
      // orbit — with selection still live underneath it, because selection is
      // computed from angles and never asked whether anything was visible.
      retract.value = 0;
      subProgress.value = 0;

      // The iris: the core is pressed in, snaps open, and throws one ring of
      // light outwards that the targets then ride out on.
      coreExpansion.value = withSequence(
        withTiming(0.24, { duration: reducedMotion ? 0 : 55, easing: EASE_OUT }),
        withSpring(1, reducedMotion ? { duration: 0 } : CORE_SPRING),
      );
      burst.value = 0;
      burst.value = withDelay(
        40,
        withTiming(1, { duration: reducedMotion ? 0 : 520, easing: Easing.out(Easing.quad) }),
      );
      // Linear on purpose: the per-item stagger windows below are carved out of
      // this clock, so it has to advance in real time. The overshoot lives in
      // each target's own worklet.
      progress.value = 0;
      progress.value = withDelay(
        45,
        withTiming(1, { duration: reducedMotion ? 0 : BLOOM_MS, easing: Easing.linear }),
      );
    },
    [
      aimArmed,
      applyMode,
      armAngle,
      burst,
      clearReturnIntent,
      clearRootClosePreview,
      closingMute,
      commit,
      coreExpansion,
      onHoldHintDismiss,
      progress,
      reducedMotion,
      retract,
      subProgress,
      timing,
      trackAngle,
    ],
  );

  /**
   * The opening hold matured.
   *
   * The finger must still be DOWN. Cancelling the fill on release is not enough
   * on its own: a tap opens the status sheet, and mounting that modal can
   * swallow the pan's finalize, leaving the hold to complete into a touch that
   * ended long ago — which is how the orbit kept opening behind the sheet. The
   * orbit is reachable by holding, and by nothing else.
   */
  const openFromHold = useCallback(() => {
    if (!touchActiveRef.current || modeRef.current !== 'idle') return;
    openOrbit('joystick');
  }, [openOrbit]);

  const confirmRoot = useCallback(
    (index: number) => {
      const target = CORE_ROOT_TARGETS[index];
      if (!target) return;
      if (target.id === 'activity') {
        // Never a confirmation of its own — it unfolds Jetzt/Soon and hands the
        // decision on. Releasing here parks the orbit so both options stay
        // tappable without a second hold.
        heldRef.current = false;
        applyMode('persistent');
        enterActivityLevel();
        return;
      }
      // Captured before the closure: the narrowing above lives on `target.id`,
      // and the deferred handover reads it a frame later.
      const id: Exclude<CoreTargetId, 'activity'> = target.id;
      haptics.light();
      closeOrbit();
      handOff(() => onSelectTarget(id));
    },
    [applyMode, closeOrbit, enterActivityLevel, handOff, onSelectTarget],
  );

  const confirmActivity = useCallback(
    (index: number) => {
      const target = CORE_ACTIVITY_TARGETS[index];
      if (!target) return;
      haptics.light();
      closeOrbit();
      handOff(() => onSelectActivityMode(target.id));
    },
    [closeOrbit, handOff, onSelectActivityMode],
  );

  const commitDwell = useCallback(() => {
    if (levelRef.current !== 'root' || armedRef.current !== CORE_PRIMARY_INDEX) return;
    if (!heldRef.current) return;
    enterActivityLevel();
  }, [enterActivityLevel]);

  /** Restarts the dwell clock. Only ever called while the thumb is settled. */
  const armDwell = useCallback(() => {
    resetActivityDwell();
    if (levelRef.current !== 'root' || armedRef.current !== CORE_PRIMARY_INDEX) return;
    activityDwellProgress.value = 0;
    // Same contract as the return fill: the ring is the timer, and the level
    // opens from its completion callback rather than from a second clock.
    activityDwellProgress.value = withTiming(
      1,
      { duration: DWELL_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(commitDwell)();
      },
    );
  }, [activityDwellProgress, commitDwell, resetActivityDwell]);

  const applyArmed = useCallback(
    (next: number | null) => {
      if (next === armedRef.current) return;
      armedRef.current = next;
      setArmed(next);
      aimArmed(next);
      if (next != null) {
        haptics.selection();
        selectionPulse.value = withSequence(
          withTiming(1, { duration: reducedMotion ? 0 : 55, easing: EASE_OUT }),
          withTiming(0, { duration: reducedMotion ? 0 : 170, easing: EASE_OUT }),
        );
      }
      armDwell();
    },
    [aimArmed, armDwell, reducedMotion, selectionPulse],
  );

  const handleBegin = useCallback(
    (touchX: number, touchY: number) => {
      // Where in the Core the finger landed, measured from its centre. The touch
      // coordinates are relative to whatever size the Core currently has, which is
      // the resting one while it is closed and the full pad once the orbit is out.
      const coreSize =
        modeRef.current === 'idle'
          ? status === 'idle'
            ? IDLE_CORE_SIZE
            : OPEN_CORE_SIZE
          : HOLD_CORE_SIZE;
      touchOriginRef.current = { x: touchX - coreSize / 2, y: touchY - coreSize / 2 };
      clearTimers();
      clearReturnIntent();
      clearRootClosePreview();
      flushHandoff();
      movedRef.current = false;
      finalizedTouchRef.current = false;
      touchActiveRef.current = true;
      // A touch that LANDS in the lower zone has not chosen it. Grabbing the Core
      // low used to mean the orbit opened already inside the return zone, where
      // nothing could arm — not even a sideways scrub, because the zone is
      // absolute while selection is relative — and letting go closed it again.
      lowerZoneEligibleRef.current = false;
      lastSampleRef.current = { x: 0, y: 0 };
      currentPointRef.current = { x: 0, y: 0 };
      resetGesturePath();
      joystickX.value = 0;
      joystickY.value = 0;
      press.value = withTiming(1, { duration: reducedMotion ? 0 : 60, easing: EASE_OUT });
      // Touching the core at all retires the introduction. Keeping it until
      // someone actually holds would carry a "hint" across sessions, which is the
      // permanent helper pill this is supposed not to be.
      onHoldHintDismiss?.();
      if (modeRef.current !== 'idle') return;
      openHoldProgress.value = 0;
      openHoldProgress.value = withDelay(
        HOLD_REVEAL_MS,
        withTiming(
          1,
          // Never shortened by reduced motion: this is how long the gesture takes,
          // not how long an animation takes.
          { duration: HOLD_MS - HOLD_REVEAL_MS, easing: Easing.linear },
          (finished) => {
            if (finished) runOnJS(openFromHold)();
          },
        ),
      );
    },
    [
      clearReturnIntent,
      clearRootClosePreview,
      clearTimers,
      flushHandoff,
      joystickX,
      joystickY,
      onHoldHintDismiss,
      openFromHold,
      openHoldProgress,
      press,
      reducedMotion,
      resetGesturePath,
      status,
    ],
  );

  const handleMove = useCallback(
    (dx: number, dy: number) => {
      if (Math.hypot(dx, dy) > TAP_SLOP) movedRef.current = true;
      currentPointRef.current = { x: dx, y: dy };

      // Sampled BEFORE the held check, so the dwell measures stillness from
      // where the thumb actually is. The travel made during the 280 ms the hold
      // takes to mature is real travel; leaving the reference at the origin
      // meant the first sample after the orbit opened almost always read as
      // fresh movement and restarted a clock that should have been running.
      const moved = Math.hypot(dx - lastSampleRef.current.x, dy - lastSampleRef.current.y);
      const travelling = moved > STILL_SLOP;
      if (travelling) lastSampleRef.current = { x: dx, y: dy };

      // A touch that has wandered this far is on its way somewhere else. It used
      // to keep its opening hold alive, so parking a finger 100 px down the map
      // opened the orbit and the return lane closed it again in the same breath.
      if (modeRef.current === 'idle' && Math.hypot(dx, dy) > HOLD_CANCEL_SLOP) cancelOpenHold();

      if (heldRef.current) {
        const joystickRadius = Math.max(1, HOLD_CORE_SIZE / 2);
        joystickX.value = Math.max(-1, Math.min(1, dx / joystickRadius));
        joystickY.value = Math.max(-1, Math.min(1, dy / joystickRadius));
      }

      // The return area is fixed inside the Core, so it is tested against the
      // Core's centre — relative gesture travel would make it drift with where
      // the finger first landed. Selection below stays relative on purpose.
      const laneX = touchOriginRef.current.x + dx;
      const laneY = touchOriginRef.current.y + dy;

      const inReturnZone = isCoreReturnLane(laneX, laneY);
      const inCloseZone = isCoreCloseLane(laneX, laneY);
      if (modeRef.current !== 'idle' && !inReturnZone && !inCloseZone) {
        lowerZoneEligibleRef.current = true;
      }
      const lowerActive = modeRef.current !== 'idle' && lowerZoneEligibleRef.current;

      // At the root there is no level to go back to, so the WHOLE lower area
      // means close — and says so from the first pixel. It used to stay silent
      // for the first 29 px while a release there already closed everything.
      if (lowerActive && (inCloseZone || (inReturnZone && levelRef.current === 'root'))) {
        // An exclusive action zone, not merely a visual hint. Clear the old
        // target so a release here can never confirm a previous selection.
        applyArmed(null);
        clearReturnIntent();
        beginRootClosePreview();
        return;
      }

      if (lowerActive && inReturnZone) {
        applyArmed(null);
        clearRootClosePreview();
        beginReturn();
        return;
      }

      clearRootClosePreview();
      clearReturnIntent();

      if (!heldRef.current) return;

      // A moving thumb is a thumb that has not chosen yet. Restarting the dwell
      // on real movement is what stops a sweep across the middle target from
      // unfolding Jetzt/Soon on the way past.
      if (travelling) armDwell();

      const activityLevel = levelRef.current === 'activity';
      const angles = activityLevel ? CORE_ACTIVITY_ANGLES : CORE_ROOT_ANGLES;
      const weights = activityLevel ? CORE_ACTIVITY_WEIGHTS : CORE_ROOT_WEIGHTS;
      const selection = resolveGestureTrackArmedIndex({
        dx,
        dy,
        angles,
        weights,
        horizontalReach: activityLevel ? activityRailReach : rootRailReach,
        previous: armedRef.current,
        path: pathRef.current,
      });
      pathRef.current = selection.path;
      applyArmed(selection.index);
      // The indicator keeps following even where the selector reports nothing:
      // inside the dead zone, and while a level change holds arming back. Both
      // are exactly the moments the user is asking "where am I?".
      followTrack(trackAngleFor(selection.position, angles) ?? previewTrackAngle(dx, dy, angles));
      commit.value = withTiming(
        armedRef.current != null && !selection.latched ? 1 : selection.reArmProgress,
        { duration: reducedMotion ? 0 : 90, easing: EASE_OUT },
      );
    },
    [
      activityRailReach,
      applyArmed,
      armDwell,
      beginReturn,
      beginRootClosePreview,
      cancelOpenHold,
      clearReturnIntent,
      clearRootClosePreview,
      commit,
      followTrack,
      joystickX,
      joystickY,
      reducedMotion,
      rootRailReach,
      resetGesturePath,
      setReturnVisual,
      trackAngleFor,
    ],
  );

  /**
   * What a plain press on the core means, depending on where we are.
   *
   * Two callers can answer the same touch: the pan gesture (real fingers) and
   * the Pressable (screen-reader activation). The pan owns every touch it has
   * begun, so the Pressable is turned away for as long as one is live; the
   * timestamp then catches the mirror case, a synthetic press arriving right
   * after the gesture already acted.
   */
  const activateCore = useCallback(
    (fromGesture = false) => {
      // A finger that is still down belongs to the pan gesture, which will answer
      // it in `handleFinalize` — including the tap case, where it calls this. The
      // Pressable firing first is not harmless: it rewrote mode and level (closing
      // the orbit, or stepping back a level) under the release that was about to
      // be confirmed, so an armed target silently did nothing. This is the guard
      // the timestamp below was only ever approximating.
      if (!fromGesture && touchActiveRef.current) return;
      const stamp = Date.now();
      if (!fromGesture && stamp - lastGestureActionRef.current < SYNTHETIC_PRESS_GUARD_MS) return;
      lastGestureActionRef.current = stamp;
      // Whichever path got here, the touch is over: disarm the hold before doing
      // anything that can change the view tree.
      touchActiveRef.current = false;
      clearTimers();
      if (modeRef.current === 'idle') onTap();
      // One level up, never a dead tap. The Core used to do literally nothing here
      // while reading "Wählen", so the only ways out of Jetzt/Soon were a drag
      // gesture and the backdrop — and for a screen reader, only the backdrop,
      // which closes everything instead of stepping back.
      else if (levelRef.current === 'activity') leaveActivityLevel();
      else closeOrbit();
    },
    [clearTimers, closeOrbit, leaveActivityLevel, onTap],
  );

  const handleFinalize = useCallback(
    (success: boolean) => {
      if (finalizedTouchRef.current) return;
      finalizedTouchRef.current = true;
      clearTimers();
      touchActiveRef.current = false;
      press.value = withTiming(0, { duration: reducedMotion ? 0 : 90, easing: EASE_OUT });
      joystickX.value = withTiming(0, timing(130));
      joystickY.value = withTiming(0, timing(130));

      // Interruptions (for example a system gesture) are never a confirmation.
      // If the orbit had opened, retract it; the current thumb intent is discarded.
      if (!success) {
        // A cancelled/dragged core touch is never a tap. Native Pressable can
        // still deliver its release callback after this branch, so consume it.
        lastGestureActionRef.current = Date.now();
        clearReturnIntent();
        if (modeRef.current !== 'idle') closeOrbit();
        return;
      }

      // Same gate as the live handling: a thumb that never left the lower zone
      // never entered it, so its position at release carries no intent.
      const lowerActive = modeRef.current !== 'idle' && lowerZoneEligibleRef.current;
      const releasedInLowerLane = lowerActive && isCurrentThumbInReturnLane();
      const releasedInCloseLane = lowerActive && isCurrentThumbInCloseLane();

      // Root close never waits for a timer. Its retraction may still be in
      // flight, but lifting the finger always closes the whole Core immediately.
      if (
        rootClosePreviewRef.current ||
        releasedInCloseLane ||
        (levelRef.current === 'root' && releasedInLowerLane)
      ) {
        lastGestureActionRef.current = Date.now();
        heldRef.current = false;
        if (modeRef.current !== 'idle') closeOrbit(true);
        return;
      }

      // The return ring was still filling. That is an abort, and an abort has to
      // leave things as they were — so a PARKED orbit stays open and stays on
      // its level. A hold is different: it is one continuous gesture, and one
      // that ends without a chosen target always retracts the Core.
      if (
        returnPhaseRef.current === 'pending' ||
        (levelRef.current === 'activity' && releasedInLowerLane)
      ) {
        lastGestureActionRef.current = Date.now();
        clearReturnIntent();
        // Cleared before the branch, so the parked path cannot leave a stale
        // "still holding" behind for the next touch to inherit.
        heldRef.current = false;
        if (modeRef.current === 'persistent') return;
        if (modeRef.current !== 'idle') closeOrbit();
        return;
      }

      if (!heldRef.current) {
        // A hold that never matured. Only a still, short touch counts as a tap —
        // a drag past the slop must never publish an open status.
        if (!movedRef.current) activateCore(true);
        else lastGestureActionRef.current = Date.now();
        return;
      }

      heldRef.current = false;
      lastGestureActionRef.current = Date.now();
      const index = armedRef.current;
      if (index == null) {
        // A release without an armed action always retracts the Core. Holding
        // can never leave an accidental, parked menu behind the user's hand.
        closeOrbit();
        return;
      }
      if (levelRef.current === 'activity') confirmActivity(index);
      else confirmRoot(index);
    },
    [
      activateCore,
      clearReturnIntent,
      clearTimers,
      closeOrbit,
      confirmActivity,
      confirmRoot,
      isCurrentThumbInCloseLane,
      isCurrentThumbInReturnLane,
      joystickX,
      joystickY,
      press,
      reducedMotion,
      timing,
    ],
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .maxPointers(1)
        .minDistance(0)
        .shouldCancelWhenOutside(false)
        .onBegin((event) => handleBegin(event.x, event.y))
        .onUpdate((event) => handleMove(event.translationX, event.translationY))
        // Pan finalization is normally sufficient. These two raw touch endings
        // are its bounded safety net for a native interruption during a Core
        // size/level transition; the ref above makes the normal double signal
        // harmless.
        .onTouchesUp(() => handleFinalize(true))
        .onTouchesCancelled(() => handleFinalize(false))
        .onFinalize((_event, success) => handleFinalize(success)),
    [handleBegin, handleFinalize, handleMove],
  );

  // Whenever the lower zone is speaking — going back OR closing — the rim stops
  // speaking. Otherwise the readout says "Schließen" in red while the rim still
  // glows at whatever direction the thumb last pointed.
  const lowerZoneIntent = useDerivedValue(() =>
    Math.max(returnActivation.value, closeActivation.value, closingMute.value),
  );

  const orbitOpen = mode !== 'idle';
  const interactive = mode === 'persistent';
  /**
   * Highlighted means ARMED, and nothing else.
   *
   * Opening begins without a selection. Once the thumb arms one, its highlight
   * survives a pass through the centre; the lower return lane is the only path
   * that intentionally suspends that indicator.
   */
  const activeRoot = !returning && !rootClosing && level === 'root' ? armed : null;
  const activeActivity = !returning && level === 'activity' ? armed : null;

  const activeTarget = level === 'activity' ? null : CORE_ROOT_TARGETS[activeRoot ?? -1];
  const activeMode = level === 'activity' ? CORE_ACTIVITY_TARGETS[activeActivity ?? -1] : null;
  const selectionAccent =
    activeMode?.accent ??
    (activeTarget
      ? (rootTargetAccent(activeTarget.id) ?? CORE_NEUTRAL_ACCENT)
      : CORE_NEUTRAL_ACCENT);
  const readoutAccent = returning || rootClosing ? CORE_RETURN_ACCENT : selectionAccent;

  const openRemaining =
    status === 'open' && expiresAt && openedAt && expiresAt > openedAt
      ? Math.max(0, Math.min(1, (expiresAt - now) / (expiresAt - openedAt)))
      : null;
  const activityStart = activity?.startsAt ? Date.parse(activity.startsAt) : NaN;
  const activityEnd = activity?.endsAt ? Date.parse(activity.endsAt) : NaN;
  const activityRemaining =
    status === 'now' && Number.isFinite(activityEnd) && activityEnd > now
      ? Number.isFinite(activityStart) && activityEnd > activityStart
        ? Math.max(0, Math.min(1, (activityEnd - now) / (activityEnd - activityStart)))
        : 1
      : null;
  /**
   * The title's second line only exists while the system font is near default.
   *
   * The text block sits inside a ROUND mask (`coreSurface` clips), so its
   * height decides how much width the outermost rows still have. At the default
   * scale a two-line title leaves the label 61 px of chord for its 58 px; at
   * 1.15 that chord is down to 50 px and at 1.3 to 32, and the label gets cut
   * off mid-word. One line holds less text but stays whole, and a clipped line
   * is worse than a short one.
   */
  const titleLines = PixelRatio.getFontScale() > 1.12 ? 1 : 2;

  const journeyMeta = journey
    ? journey.status === 'armed'
      ? 'Vorbereitet'
      : journey.status === 'arrived'
        ? 'Angekommen'
        : 'Du teilst'
    : null;
  const statusAccent = journey
    ? SEMANTIC_COLOR.journey
    : status === 'now'
      ? CORE_ACCENT.now
      : status === 'soon'
        ? CORE_ACCENT.soon
        : CORE_ACCENT.open;
  /**
   * `soon` gets NO ring at all. There is no window to count down — nothing has
   * started — so any arc would be a shape standing in for time that does not
   * exist yet; the previous fixed 0.16 beacon only looked plausible because a
   * grey track framed it. The ring appears when the plan actually starts:
   * `ownCoreActivity` runs through `resolveActivityMode`, so the status flips
   * to `now` on its own and `activityRemaining` then counts the real window.
   */
  const ringProgress = journey
    ? // An Anreise has no window to deplete, and the underlying activity's or
      // open status's countdown would be a ring measuring something the Core is
      // no longer showing — mislabelled time, which is the thing this ring must
      // never be.
      null
    : (openRemaining ?? activityRemaining ?? (status === 'now' ? 1 : null));
  const activityTime = activity
    ? status === 'now'
      ? formatIsoClock(activity.endsAt)
      : formatIsoClock(activity.startsAt)
    : null;
  const activityMeta = activity
    ? `${activity.participantCount} dabei${
        activityTime ? ` · ${status === 'now' ? 'bis' : 'um'} ${activityTime}` : ''
      }`
    : null;

  const restingCoreSize = status === 'idle' ? IDLE_CORE_SIZE : OPEN_CORE_SIZE;
  const renderedCoreSize = orbitOpen ? HOLD_CORE_SIZE : restingCoreSize;

  const coreStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale:
          // No selection term on purpose: the core is the thing the thumb rests
          // on, and re-scaling it at every snap made a sweep across the arc read
          // as the control shuddering. The snap is carried by the rim pointer,
          // the target's own fill and the haptic.
          (orbitOpen
            ? restingCoreSize / HOLD_CORE_SIZE +
              (1 - restingCoreSize / HOLD_CORE_SIZE) * coreExpansion.value
            : 1) *
          (1 + activityExpansion.value * 0.08) *
          (1 + statePulse.value * 0.025) *
          (1 - press.value * 0.045),
      },
      { translateX: joystickX.value * (orbitOpen ? 3 : 0) },
      { translateY: joystickY.value * (orbitOpen ? 3 : 0) },
    ],
  }));
  const lensStyle = useAnimatedStyle(() => ({
    // The pool grows INTO place rather than fading in on top of the map: the
    // scale is what makes it read as the core opening up a space around itself.
    //
    // It answers to the OPEN/CLOSE clock and to nothing else. It used to brighten
    // and swell on every armed-target change and to drift with the joystick, so
    // sweeping the thumb across the arc restarted the backdrop five times in a
    // second. A backdrop that keeps moving is not a backdrop.
    opacity: Math.min(1, progress.value * 1.5),
    transform: [{ scale: 0.62 + 0.38 * progress.value }],
  }));
  const burstStyle = useAnimatedStyle(() => ({
    opacity: (1 - burst.value) * 0.5 * (burst.value > 0 ? 1 : 0),
    transform: [{ scale: 0.3 + burst.value * 1.25 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.05 + coreExpansion.value * 0.14,
    transform: [{ scale: 1.02 + activityExpansion.value * 0.06 }],
  }));
  const readoutStyle = useAnimatedStyle(() => ({
    // The ONLY thing that still reacts to a selection change, because it is the
    // only thing whose content actually swaps: without a beat under it the label
    // would teleport from one word to the next. Kept small — everything around
    // it holds still.
    transform: [{ scale: 1 - selectionPulse.value * 0.06 }],
    opacity: 1 - selectionPulse.value * 0.22,
  }));
  const stateBloomStyle = useAnimatedStyle(() => ({
    opacity: statePulse.value * 0.3,
    transform: [{ scale: 0.62 + statePulse.value * 0.38 }],
  }));
  const coreLabel = useMemo(() => {
    if (orbitOpen) {
      if (returning) return level === 'root' ? 'Schließen' : 'Zurück';
      if (rootClosing) return 'Schließen';
      // No armed target, so no name to show. "Wählen" is what the control is
      // waiting for; naming a target here is what made a neutral hold look like
      // a chosen one.
      return (level === 'activity' ? activeMode?.label : activeTarget?.label) ?? 'Wählen';
    }
    if (status === 'open') return expiresAt ? formatClock(expiresAt) : 'Offen';
    return null;
  }, [activeMode, activeTarget, expiresAt, level, orbitOpen, returning, rootClosing, status]);

  const readoutIcon: ComponentProps<typeof Ionicons>['name'] =
    returning || rootClosing
      ? level === 'root'
        ? 'close-outline'
        : 'arrow-undo-outline'
      : ((level === 'activity' ? activeMode?.icon : activeTarget?.icon) ?? 'ellipse-outline');

  const coreAccessibilityLabel = orbitOpen
    ? rootClosing
      ? 'Menü wird geschlossen'
      : returning
        ? level === 'root'
          ? 'Menü wird geschlossen'
          : 'Zurück wird ausgeführt'
        : level === 'activity'
          ? 'Aktivität auswählen. Nach unten ziehen für die Menü-Übersicht'
          : 'Menü schließen'
    : status === 'now' && activity
      ? `Aktivität läuft: ${activity.title}. Öffnen`
      : status === 'soon' && activity
        ? `Nächste Aktivität: ${activity.title}${activityTime ? ` um ${activityTime}` : ''}. Öffnen`
        : status === 'open'
          ? expiresAt
            ? `Du bist offen bis ${formatClock(expiresAt)}. Status bearbeiten`
            : 'Du bist offen. Status bearbeiten'
          : 'Offen stellen';

  return (
    <View pointerEvents="box-none" style={{ width: box.width, height: box.height }}>
      {orbitMounted ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.lensLayer,
            {
              height: box.lensRadius * 2,
              left: box.cx - box.lensRadius,
              top: box.cy - box.lensRadius,
              width: box.lensRadius * 2,
            },
            lensStyle,
          ]}
        >
          {/* Tinted by the core's OWN state, never by the armed target: the pool
              is the space the menu opened, so it must not react to the thumb
              crossing from one target to the next. */}
          <CoreLens box={box} accent={statusAccent} />
        </Animated.View>
      ) : null}

      {orbitMounted ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.burst,
            {
              borderColor: selectionAccent,
              borderRadius: box.lensRadius,
              height: box.lensRadius * 2,
              left: box.cx - box.lensRadius,
              top: box.cy - box.lensRadius,
              width: box.lensRadius * 2,
            },
            burstStyle,
          ]}
        />
      ) : null}

      {orbitMounted ? (
        <>
          <ActivityChoiceGuide box={box} offsets={activityOffsets} progress={subProgress} />
          {CORE_ROOT_TARGETS.map((target, index) => (
            <OrbitItem
              key={target.id}
              icon={target.icon}
              accessibilityLabel={target.accessibilityLabel}
              offset={rootOffsets[index]}
              box={box}
              progress={progress}
              retract={retract}
              // Blooms from the centre outwards. Launching every target on one beat
              // makes the ring simply appear; a beat between the rings is what
              // makes the eye follow it out of the core.
              stagger={Math.abs(index - CORE_PRIMARY_INDEX) * BLOOM_STAGGER}
              joystickX={joystickX}
              joystickY={joystickY}
              active={activeRoot === index}
              accent={activeRoot === index ? rootTargetAccent(target.id) : null}
              dwellProgress={target.id === 'activity' ? activityDwellProgress : undefined}
              badge={target.id === 'postfach' ? postfachBadgeCount : 0}
              interactive={interactive && level === 'root' && !rootClosing}
              onPress={() => confirmRoot(index)}
            />
          ))}
          {CORE_ACTIVITY_TARGETS.map((target, index) => (
            <ActivityCard
              key={target.id}
              label={target.label}
              icon={target.icon}
              accessibilityLabel={target.accessibilityLabel}
              accent={target.accent}
              active={activeActivity === index}
              offset={activityOffsets[index]}
              box={box}
              progress={subProgress}
              // Jetzt leads by a beat, establishing a stable left/right order
              // without ever preselecting either activity mode.
              stagger={index * 0.09}
              joystickX={joystickX}
              joystickY={joystickY}
              interactive={interactive && level === 'activity' && !rootClosing}
              onPress={() => confirmActivity(index)}
            />
          ))}
        </>
      ) : null}

      <Animated.View
        style={[
          styles.core,
          {
            height: renderedCoreSize,
            left: box.cx - renderedCoreSize / 2,
            top: box.cy - renderedCoreSize / 2,
            width: renderedCoreSize,
          },
          coreStyle,
        ]}
      >
        {orbitOpen ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.coreHalo,
              {
                borderColor: selectionAccent,
                borderRadius: renderedCoreSize / 2,
                height: renderedCoreSize,
                width: renderedCoreSize,
              },
              haloStyle,
            ]}
          />
        ) : null}
        <GestureDetector gesture={gesture}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={coreAccessibilityLabel}
            accessibilityHint={
              orbitOpen
                ? level === 'root'
                  ? 'Zum Schließen im unteren Bereich loslassen.'
                  : 'Für Zurück im unteren Bereich halten, bis der Ring voll ist.'
                : 'Gedrückt halten öffnet das Menü mit allen Bereichen.'
            }
            accessibilityActions={
              orbitOpen
                ? level === 'activity'
                  ? [{ name: 'back', label: 'Zurück zur Übersicht' }]
                  : [{ name: 'close', label: 'Menü schließen' }]
                : [{ name: 'menu', label: 'Menü öffnen' }]
            }
            onAccessibilityAction={(event) => {
              const action = event.nativeEvent.actionName;
              if (action === 'menu') openOrbit('persistent');
              else if (action === 'back') leaveActivityLevel();
              else if (action === 'close') closeOrbit();
            }}
            onPress={() => activateCore()}
            style={[
              styles.coreSurface,
              {
                borderRadius: renderedCoreSize / 2,
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                height: renderedCoreSize,
                width: renderedCoreSize,
              },
            ]}
          >
            <CoreSurfaceOptics
              size={renderedCoreSize}
              accent={orbitOpen ? readoutAccent : statusAccent}
              orbitOpen={orbitOpen}
            />
            {orbitOpen ? (
              <View pointerEvents="none" style={styles.returnAffordance}>
                <Ionicons
                  name={rootClosing || level === 'root' ? 'close-outline' : 'arrow-undo-outline'}
                  size={18}
                  color={returning || rootClosing ? CORE_RETURN_ACCENT : 'rgba(242,239,233,0.66)'}
                />
                <Text
                  {...TEXT_CAPPED}
                  style={[
                    styles.returnAffordanceLabel,
                    {
                      color:
                        returning || rootClosing ? CORE_RETURN_ACCENT : 'rgba(242,239,233,0.66)',
                    },
                  ]}
                >
                  {rootClosing || level === 'root' ? 'Schließen' : 'Zurück'}
                </Text>
              </View>
            ) : null}
            {!orbitOpen ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.coreStateBloom,
                  {
                    backgroundColor: statusAccent,
                    borderRadius: renderedCoreSize / 2,
                    height: renderedCoreSize,
                    width: renderedCoreSize,
                  },
                  stateBloomStyle,
                ]}
              />
            ) : null}
            {orbitOpen ? (
              <Animated.View pointerEvents="none" style={[styles.readout, readoutStyle]}>
                <Ionicons name={readoutIcon} size={24} color={readoutAccent} />
                {coreLabel ? (
                  <Text
                    {...TEXT_CAPPED}
                    numberOfLines={1}
                    style={[
                      styles.coreLabel,
                      { color: returning || rootClosing ? readoutAccent : colors.icon },
                    ]}
                  >
                    {coreLabel}
                  </Text>
                ) : null}
              </Animated.View>
            ) : journey ? (
              <View pointerEvents="none" style={styles.coreStatusContent}>
                <CoreStateLabel icon="navigate" label="ANREISE" accent={SEMANTIC_COLOR.journey} />
                {/* Two lines, and the ellipsis decides where they end — NOT a
                    character cap. "IIIIIIIIIIIIIIIIIIIIIIIII" and
                    "mmmmmmmmmmmmmmmmmmmmmmmmm" are both 25 characters and
                    differ by roughly threefold in width, so a count either
                    overflows or wastes the line depending on the name. */}
                <Text {...TEXT_CAPPED} numberOfLines={titleLines} style={styles.coreHero}>
                  {journey.title}
                </Text>
                {journeyMeta ? (
                  <Text {...TEXT_CAPPED} numberOfLines={1} style={styles.coreSupport}>
                    {journeyMeta}
                  </Text>
                ) : null}
              </View>
            ) : status === 'open' ? (
              <View pointerEvents="none" style={styles.coreStatusContent}>
                <CoreStateLabel icon="ellipse" label="OFFEN" accent={statusAccent} />
                {/* The clock time is the hero and the ring outside shows what is
                    LEFT of it — two different statements about one window. They
                    used to say the same thing twice, and the text said it in the
                    smallest type on the button. */}
                {coreLabel ? (
                  <Text {...TEXT_CAPPED} numberOfLines={1} style={styles.coreHero}>
                    bis {coreLabel}
                  </Text>
                ) : null}
                <Text {...TEXT_CAPPED} numberOfLines={1} style={styles.coreSupport}>
                  {openVibeLabel ?? 'Egal'}
                </Text>
                {locationShared ? (
                  <View pointerEvents="none" style={styles.locationIndicator}>
                    {/* `locate` is what `OpenStatusCard` shows for the same
                        toggle; the Core used `navigate` for it, so the surface
                        that sets the state and the one that reports it drew two
                        different glyphs for one fact. */}
                    <Ionicons name="locate" size={11} color={statusAccent} />
                  </View>
                ) : null}
              </View>
            ) : status === 'now' || status === 'soon' ? (
              <View pointerEvents="none" style={styles.coreStatusContent}>
                <CoreStateLabel
                  icon={status === 'now' ? 'flash' : 'calendar-clear'}
                  label={status === 'now' ? 'JETZT' : 'SOON'}
                  accent={statusAccent}
                />
                {/* Two lines, and the ellipsis decides where they end — NOT a
                    character cap. "IIIIIIIIIIIIIIIIIIIIIIIII" and
                    "mmmmmmmmmmmmmmmmmmmmmmmmm" are both 25 characters and
                    differ by roughly threefold in width, so a count either
                    overflows or wastes the line depending on the name. */}
                <Text {...TEXT_CAPPED} numberOfLines={titleLines} style={styles.coreHero}>
                  {activity?.title ?? 'Aktivität'}
                </Text>
                {activityMeta ? (
                  <Text {...TEXT_CAPPED} numberOfLines={1} style={styles.coreSupport}>
                    {activityMeta}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View pointerEvents="none">
                {/* The Mica figure is portrait (0.82:1) where the old mark was
                    landscape (1.79:1), so the same number would read a third
                    smaller in the rest state. Sized by optical weight, not by
                    keeping the old constant. */}
                <TogetherMark
                  animated={false}
                  idle
                  accessibilityLabel=""
                  color="#F2EFE9"
                  size={34}
                />
              </View>
            )}
          </Pressable>
        </GestureDetector>

        {/* Mounted unconditionally. The profile is ~100 static strokes, so it is
            built once and then only ever rotated and faded — remounting it on
            every open would put that cost in the one frame that must not drop
            any. Visibility is `reveal` (0 while closed) times `suppress`, which
            takes it out of the way while a return is filling: the readout, the
            lower affordance and the return ring all speak at once there. */}
        <CoreMeniscus
          coreSize={renderedCoreSize}
          trackAngle={trackAngle}
          commit={commit}
          reveal={progress}
          suppress={lowerZoneIntent}
        />

        {orbitOpen ? (
          <CoreReturnLane
            coreSize={renderedCoreSize}
            activation={returnActivation}
            progress={returnProgress}
          />
        ) : null}

      </Animated.View>

      {/* Both rings sit OUTSIDE the core's Animated.View on purpose. As children
          they inherited `coreStyle`'s scale — which holds 1.08 for as long as
          the activity cards are open and dips 4.5% under the press — so a ring
          whose whole job is to have ONE constant radius quietly breathed, and
          resampled its stroke, through exactly the hold you are watching.
          Identical absolute box, so they land where they always did.
          `pointerEvents="none"` is load-bearing: this wrapper now covers the
          core, and without it the rings would swallow every tap on it. */}
      <View
        pointerEvents="none"
        style={{
          height: renderedCoreSize,
          left: box.cx - renderedCoreSize / 2,
          position: 'absolute',
          top: box.cy - renderedCoreSize / 2,
          width: renderedCoreSize,
        }}
      >
        {ringProgress != null && !orbitOpen ? (
          <CoreStatusRing progress={ringProgress} size={renderedCoreSize} accent={statusAccent} />
        ) : null}

        {/* Only the level-two return is a held confirmation. Root close is
            immediate on release and must never pretend to need a timer. */}
        {/* The opening hold has NO ring. It was only ever visible for the last
            130 ms of a 280 ms gesture (`HOLD_MS` minus `HOLD_REVEAL_MS`), which
            is too short to tell anyone to keep holding — by the time you notice
            it the orbit is already opening. It therefore read as a loading bar
            flashing over the status, not as progress. `openHoldProgress` itself
            stays: it is the gesture's CLOCK, and its completion callback is what
            opens the orbit. Deleting it as unused would remove the hold. */}
        {orbitOpen && level === 'activity' ? (
          <HoldProgressRing
            size={renderedCoreSize}
            progress={returnProgress}
            accent={CORE_RETURN_ACCENT}
          />
        ) : null}
      </View>

      {holdHintVisible && !orbitOpen ? (
        <View
          pointerEvents="none"
          style={[styles.hint, { top: box.cy - renderedCoreSize / 2 - 36 }]}
        >
          <View style={styles.hintBubble}>
            <Text {...TEXT_CAPPED} style={styles.hintText}>
              Gedrückt halten für mehr
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * One container for every status, and three text roles inside it. There used
   * to be two containers and six text styles carrying three different
   * clearances (16 / 18 / 22) and two sizes that were nearly the same, which is
   * how the flatness got in without anyone choosing it.
   */
  coreStatusContent: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: OPEN_CORE_SIZE - CORE_RING_TEXT_CLEARANCE,
  },
  coreStateLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    maxWidth: OPEN_CORE_SIZE - CORE_RING_TEXT_CLEARANCE,
  },
  coreStateLabelText: {
    fontFamily: FONT.bold,
    fontSize: CORE_SUPPORT_SIZE,
    // Lower than the old 0.9: the glyph now takes width the letters used to
    // have, and "ANREISE" is the longest label the row has to hold.
    letterSpacing: 0.6,
    lineHeight: CORE_SUPPORT_LINE,
  },
  /** Wider than the rows around it — it sits at the circle's equator. */
  coreHero: {
    color: CORE_INK,
    fontFamily: FONT.bold,
    fontSize: CORE_HERO_SIZE,
    lineHeight: CORE_HERO_LINE,
    marginTop: 2,
    maxWidth: OPEN_CORE_SIZE - CORE_TITLE_CLEARANCE,
    textAlign: 'center',
  },
  coreSupport: {
    color: CORE_INK_SUPPORT,
    fontFamily: FONT.semibold,
    fontSize: CORE_SUPPORT_SIZE,
    lineHeight: CORE_SUPPORT_LINE,
    marginTop: 1,
    maxWidth: OPEN_CORE_SIZE - CORE_RING_TEXT_CLEARANCE,
    textAlign: 'center',
  },
  activityCard: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6,
    height: CORE_ACTIVITY_CARD_HEIGHT,
    justifyContent: 'center',
    width: CORE_ACTIVITY_CARD_WIDTH,
  },
  activityCardLabel: {
    fontFamily: FONT.bold,
    fontSize: TYPE.label.fontSize,
    lineHeight: TYPE.label.lineHeight,
  },
  activityCardSlot: {
    height: CORE_ACTIVITY_CARD_HEIGHT,
    position: 'absolute',
    width: CORE_ACTIVITY_CARD_WIDTH,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: CORE_ACCENT.open,
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -2,
    top: -2,
  },
  badgeText: {
    color: '#fff',
    fontFamily: FONT.bold,
    fontSize: 10,
    lineHeight: 13,
  },
  burst: {
    borderWidth: 2,
    position: 'absolute',
  },
  core: {
    position: 'absolute',
  },
  coreHalo: {
    borderWidth: 1.5,
    position: 'absolute',
  },
  coreLabel: {
    fontFamily: FONT.semibold,
    fontSize: TYPE.micro.fontSize,
    lineHeight: TYPE.micro.lineHeight,
    maxWidth: HOLD_CORE_SIZE - 20,
    textAlign: 'center',
  },
  coreSurface: {
    alignItems: 'center',
    borderWidth: 0,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coreStateBloom: {
    position: 'absolute',
  },
  meniscus: {
    position: 'absolute',
  },
  holdRing: {
    position: 'absolute',
  },
  hint: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  lensLayer: {
    overflow: 'visible',
    position: 'absolute',
  },
  hintBubble: {
    backgroundColor: 'rgba(10,16,14,0.82)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hintText: {
    color: '#F2EFE9',
    fontFamily: FONT.semibold,
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
  },
  locationIndicator: {
    alignItems: 'center',
    bottom: 12,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: 11,
    width: 16,
  },
  orbitSlot: {
    height: ITEM_SIZE,
    position: 'absolute',
    width: ITEM_SIZE,
  },
  orbitSurface: {
    alignItems: 'center',
    borderRadius: ITEM_SIZE / 2,
    borderWidth: 1,
    height: ITEM_SIZE,
    justifyContent: 'center',
    width: ITEM_SIZE,
  },
  readout: {
    alignItems: 'center',
    gap: 3,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 27,
  },
  returnAffordance: {
    alignItems: 'center',
    bottom: 27,
    gap: 1,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  returnAffordanceLabel: {
    fontFamily: FONT.semibold,
    fontSize: TYPE.micro.fontSize,
    lineHeight: TYPE.micro.lineHeight,
  },
  returnRail: {
    position: 'absolute',
  },
  targetIntentHalo: {
    backgroundColor: 'rgba(169, 205, 255, 0.12)',
    borderColor: 'rgba(184, 218, 255, 0.96)',
    borderWidth: 1.5,
    position: 'absolute',
  },
});
