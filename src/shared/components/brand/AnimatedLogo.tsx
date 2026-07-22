import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  type SharedValue,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const NOW = '#41C08D';
const SOON = '#E0A23E';
const PAPER = '#F4F5F7';

const BRAND_FONT = 'SchibstedGrotesk_600SemiBold';

// Master timeline is LINEAR — every curve lives in the keyframes below, so
// each phase keeps its intended tempo instead of being warped by one global
// ease (a decelerating master ease would turn the period-drop bounce to mush).
const ASSEMBLE_MS = 2600;
const IDLE_MS = 3600;

const REFERENCE_WORDMARK_WIDTH = 340;
const REFERENCE_FONT_SIZE = 58;
// Deliberately bigger than the font's x-height (and even its cap-height) —
// the mark replacing the "o" is the brand's memorable device, so it should
// slightly break the type grid and dominate rather than sit flush with the
// lowercase letters, the way distinctive logo devices commonly do.
const REFERENCE_SLOT_SIZE = 70;

const RING_R = 34;
const RING_STROKE = 18;
// Sheen arc geometry: dash pattern circumference of the r=34 ring.
const SHEEN_DASH: [number, number] = [52, 149];
const SHEEN_PERIMETER = SHEEN_DASH[0] + SHEEN_DASH[1];

/**
 * The circular "o" mark: two presence dots (now/green + soon/amber) travel in
 * along gently curved paths — like two people crossing a night map — meet at
 * the center and, at the union moment, materialize into one genuinely hollow
 * ring (a real "o" counter, never a filled disc). The ring overshoots slightly
 * before settling; a glass highlight arc + specular hotspot give it depth and
 * an ambient glow spreads outward only once the ring has formed. With
 * `idle` running, the highlight arc slowly orbits the settled ring.
 */
function CoalesceOrb({
  progress,
  idle,
  size,
}: {
  progress: SharedValue<number>;
  idle: SharedValue<number>;
  size: number;
}) {
  // --- Approach phase: two dots on curved, decelerating paths ---
  const dotNowProps = useAnimatedProps(() => ({
    cx: interpolate(
      progress.value,
      [0.06, 0.2, 0.34, 0.46],
      [16, 30, 42, 50],
      Extrapolation.CLAMP,
    ),
    cy: interpolate(
      progress.value,
      [0.06, 0.2, 0.34, 0.46],
      [74, 72, 63, 50],
      Extrapolation.CLAMP,
    ),
    opacity: interpolate(
      progress.value,
      [0, 0.05, 0.42, 0.475],
      [0, 1, 1, 0],
      Extrapolation.CLAMP,
    ),
    r: interpolate(
      progress.value,
      [0, 0.06, 0.4, 0.475],
      [9 * 0.4, 9 * 0.9, 9 * 1.05, 9 * 0.5],
      Extrapolation.CLAMP,
    ),
  }));
  const dotSoonProps = useAnimatedProps(() => ({
    cx: interpolate(
      progress.value,
      [0.06, 0.2, 0.34, 0.46],
      [84, 70, 58, 50],
      Extrapolation.CLAMP,
    ),
    cy: interpolate(
      progress.value,
      [0.06, 0.2, 0.34, 0.46],
      [26, 28, 37, 50],
      Extrapolation.CLAMP,
    ),
    opacity: interpolate(
      progress.value,
      [0, 0.05, 0.42, 0.475],
      [0, 1, 1, 0],
      Extrapolation.CLAMP,
    ),
    r: interpolate(
      progress.value,
      [0, 0.06, 0.4, 0.475],
      [9 * 0.4, 9 * 0.9, 9 * 1.05, 9 * 0.5],
      Extrapolation.CLAMP,
    ),
  }));

  // Soft glow travelling with each dot so the approach reads on dark ink.
  const glowNowProps = useAnimatedProps(() => ({
    cx: interpolate(
      progress.value,
      [0.06, 0.2, 0.34, 0.46],
      [16, 30, 42, 50],
      Extrapolation.CLAMP,
    ),
    cy: interpolate(
      progress.value,
      [0.06, 0.2, 0.34, 0.46],
      [74, 72, 63, 50],
      Extrapolation.CLAMP,
    ),
    opacity: interpolate(
      progress.value,
      [0.05, 0.12, 0.4, 0.46],
      [0, 0.55, 0.55, 0],
      Extrapolation.CLAMP,
    ),
  }));
  const glowSoonProps = useAnimatedProps(() => ({
    cx: interpolate(
      progress.value,
      [0.06, 0.2, 0.34, 0.46],
      [84, 70, 58, 50],
      Extrapolation.CLAMP,
    ),
    cy: interpolate(
      progress.value,
      [0.06, 0.2, 0.34, 0.46],
      [26, 28, 37, 50],
      Extrapolation.CLAMP,
    ),
    opacity: interpolate(
      progress.value,
      [0.05, 0.12, 0.4, 0.46],
      [0, 0.55, 0.55, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // --- Union moment: flash, then the ring grows out of the meeting point ---
  const flashProps = useAnimatedProps(() => ({
    opacity: interpolate(
      progress.value,
      [0.45, 0.5, 0.62],
      [0, 0.85, 0],
      Extrapolation.CLAMP,
    ),
    r: interpolate(progress.value, [0.45, 0.62], [26, 50], Extrapolation.CLAMP),
  }));

  // The ring materializes where the two dots meet — radius grows in from a
  // point with a slight overshoot, never passing through a filled-disc state.
  const ringProps = useAnimatedProps(() => ({
    r: interpolate(
      progress.value,
      [0.48, 0.56, 0.62, 0.7],
      [3, 30, RING_R + 2.5, RING_R],
      Extrapolation.CLAMP,
    ),
    opacity: interpolate(progress.value, [0.48, 0.54], [0, 1], Extrapolation.CLAMP),
  }));

  // Ambient glow: only builds once the ring has essentially formed, and
  // spreads outward rather than fading in place.
  const ambientProps = useAnimatedProps(() => ({
    opacity: interpolate(
      progress.value,
      [0.56, 0.64, 0.85],
      [0, 0.55, 1],
      Extrapolation.CLAMP,
    ),
    r: interpolate(progress.value, [0.56, 0.85], [4, 38], Extrapolation.CLAMP),
  }));

  // Glass highlight arc — after settling it slowly orbits the ring (idle).
  const sheenProps = useAnimatedProps(() => {
    const settled = progress.value >= 1 ? 1 : 0;
    return {
      opacity: interpolate(progress.value, [0.58, 0.72], [0, 0.7], Extrapolation.CLAMP),
      strokeDashoffset: -18 - settled * idle.value * SHEEN_PERIMETER,
    };
  });
  const specularProps = useAnimatedProps(() => ({
    opacity: interpolate(progress.value, [0.62, 0.76], [0, 0.95], Extrapolation.CLAMP),
  }));

  return (
    <View style={{ alignItems: 'center', height: size, justifyContent: 'center', width: size }}>
      <Svg
        height={size * 1.7}
        style={{ position: 'absolute' }}
        viewBox="0 0 100 100"
        width={size * 1.7}
      >
        <Defs>
          <RadialGradient id="ambientNow" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={NOW} stopOpacity={0.4} />
            <Stop offset="1" stopColor={NOW} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="ambientSoon" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={SOON} stopOpacity={0.4} />
            <Stop offset="1" stopColor={SOON} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <AnimatedCircle animatedProps={ambientProps} cx={32} cy={62} fill="url(#ambientNow)" />
        <AnimatedCircle animatedProps={ambientProps} cx={68} cy={38} fill="url(#ambientSoon)" />
      </Svg>

      <Svg height={size} style={{ position: 'absolute' }} viewBox="0 0 100 100" width={size}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={NOW} />
            <Stop offset="1" stopColor={SOON} />
          </LinearGradient>
          <RadialGradient id="flashGlow" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={PAPER} stopOpacity={0.9} />
            <Stop offset="1" stopColor={PAPER} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="dotGlowNow" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={NOW} stopOpacity={0.7} />
            <Stop offset="1" stopColor={NOW} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="dotGlowSoon" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={SOON} stopOpacity={0.7} />
            <Stop offset="1" stopColor={SOON} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Union flash */}
        <AnimatedCircle animatedProps={flashProps} cx={50} cy={50} fill="url(#flashGlow)" />

        {/* Travelling glows + the two approaching dots */}
        <AnimatedCircle animatedProps={glowNowProps} fill="url(#dotGlowNow)" r={17} />
        <AnimatedCircle animatedProps={glowSoonProps} fill="url(#dotGlowSoon)" r={17} />
        <AnimatedCircle animatedProps={dotNowProps} fill={NOW} />
        <AnimatedCircle animatedProps={dotSoonProps} fill={SOON} />

        {/* The settled ring — hollow "o", never a filled disc */}
        <AnimatedCircle
          animatedProps={ringProps}
          cx={50}
          cy={50}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={RING_STROKE}
        />

        {/* Glossy highlight arc — orbits slowly once settled (idle sweep) */}
        <AnimatedCircle
          animatedProps={sheenProps}
          cx={50}
          cy={50}
          fill="none"
          r={RING_R}
          stroke={PAPER}
          strokeDasharray={SHEEN_DASH}
          strokeLinecap="round"
          strokeWidth={6}
        />
        {/* Tiny specular hotspot — the extra "polished metal" glint */}
        <AnimatedCircle animatedProps={specularProps} cx={35} cy={20} fill={PAPER} r={3.2} />
      </Svg>
    </View>
  );
}

type AnimatedLogoProps = {
  width?: number;
  wordColor?: string;
  /**
   * Keep the settled mark subtly alive after assembly: the highlight arc
   * orbits the ring and the period breathes. This is the brand's loading
   * signal on the boot screen — the wordmark IS the loader, there is no
   * separate spinner element.
   */
  idlePulse?: boolean;
  onDone?: () => void;
};

/**
 * Together's animated brand mark: "t" + a real circular "o" (two presence
 * dots meeting and coalescing into a hollow, glossy ring) + "gether." —
 * the letters emerge outward from the union moment, then the period drops
 * in from above with a small bounce, landing the statement: "together."
 */
export function AnimatedLogo({
  width = 340,
  wordColor = PAPER,
  idlePulse = false,
  onDone,
}: AnimatedLogoProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const idle = useSharedValue(0);

  const fontSize = width * (REFERENCE_FONT_SIZE / REFERENCE_WORDMARK_WIDTH);
  const slotSize = fontSize * (REFERENCE_SLOT_SIZE / REFERENCE_FONT_SIZE);
  // The "t" glyph carries more built-in whitespace on its right side than
  // "g" does on its left, so the gap to the ring needs an asymmetric pull —
  // tighter on the "t" side — to read as evenly spaced as the other letters.
  const slotMarginLeft = fontSize * (-1.6 / REFERENCE_FONT_SIZE);
  const height = fontSize * 1.55;
  const wordStyle = {
    color: wordColor,
    fontFamily: BRAND_FONT,
    fontSize,
    letterSpacing: fontSize * -0.03,
    lineHeight: fontSize * 1.05,
  };

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      onDone?.();
      return;
    }
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: ASSEMBLE_MS, easing: Easing.linear },
      (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      },
    );
  }, [onDone, progress, reducedMotion]);

  useEffect(() => {
    if (!idlePulse || reducedMotion) return;
    idle.value = 0;
    idle.value = withRepeat(withTiming(1, { duration: IDLE_MS, easing: Easing.linear }), -1, false);
    return () => {
      idle.value = 0;
    };
  }, [idle, idlePulse, reducedMotion]);

  // Letters emerge outward from behind the ring once it has settled.
  const leftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0.55, 0.68, 0.78],
      [0, 0.8, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0.55, 0.66, 0.74, 0.78],
          [16, 6, 1.5, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const rightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0.55, 0.68, 0.78],
      [0, 0.8, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0.55, 0.66, 0.74, 0.78],
          [-16, -6, -1.5, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // The period drops in from above with a little rotation, bounces once and
  // rests — the "full stop" landing after the word finishes assembling.
  // While idle-pulsing (boot screen) it keeps breathing as the load signal.
  const dotStyle = useAnimatedStyle(() => {
    const breathe =
      idlePulse && progress.value >= 1
        ? interpolate(idle.value, [0, 0.5, 1], [1, 0.55, 1])
        : 1;
    return {
      opacity:
        interpolate(progress.value, [0.78, 0.82], [0, 1], Extrapolation.CLAMP) * breathe,
      transform: [
        {
          translateY: interpolate(
            progress.value,
            [0.78, 0.84, 0.885, 0.925, 1],
            [-fontSize * 0.66, fontSize * 0.11, -fontSize * 0.05, 0, 0],
            Extrapolation.CLAMP,
          ),
        },
        {
          rotate: `${interpolate(
            progress.value,
            [0.78, 0.84, 0.885, 0.925, 1],
            [-28, 8, -3, 0, 0],
            Extrapolation.CLAMP,
          )}deg`,
        },
        {
          scale: interpolate(
            progress.value,
            [0.78, 0.84, 0.885, 0.925, 1],
            [0.5, 1.12, 0.96, 1, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <View
      accessibilityLabel="Together"
      accessibilityRole="image"
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        height,
        justifyContent: 'center',
        width,
      }}
    >
      <Animated.Text style={[wordStyle, leftStyle]}>t</Animated.Text>
      <View
        style={{
          alignItems: 'center',
          height: slotSize,
          justifyContent: 'center',
          marginLeft: slotMarginLeft,
          width: slotSize,
        }}
      >
        <CoalesceOrb idle={idle} progress={progress} size={slotSize * 0.94} />
      </View>
      <Animated.Text style={[wordStyle, rightStyle]}>gether</Animated.Text>
      <Animated.Text style={[wordStyle, dotStyle]}>.</Animated.Text>
    </View>
  );
}
