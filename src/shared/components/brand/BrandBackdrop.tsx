import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { TOGETHER_BRAND } from './brandTokens';
import { MICA_FIGURE_COLORS } from './micaLogo';

/**
 * Brand stage for auth and boot: a deep ink ground with three very slow
 * aurora fields in the icon's own green, amber and blue.
 *
 * Two constraints shaped it. The colour comes from the mark rather than from
 * an invented palette, so the first screen and the home-screen icon read as
 * one thing. And softness is built from radial gradients, never from a blur —
 * `react-native-svg` has no dependable blur, so a field that "looks blurred"
 * has to be drawn that way. Each orb is its own layer whose *View* transform
 * is animated, which keeps the motion off the SVG-prop interop path.
 *
 * Deliberately dark in both colour schemes: this is a brand stage, like the
 * sign-in surfaces of most apps this one is measured against, and every
 * control mounted on top of it (`EmailAuthForm`, the provider buttons) is
 * built as dark glass.
 */

const BASE_TOP = '#080B14';
const BASE_MID = '#0B0F19';
const BASE_BOTTOM = '#05070E';

type OrbProps = {
  id: string;
  color: string;
  peak: number;
  diameter: number;
  left: number;
  top: number;
  progress: SharedValue<number>;
  driftX: number;
  driftY: number;
  driftScale?: number;
  /** Share of the orb's opacity that breathes with `progress`. */
  driftFade?: number;
};

function Orb({
  id,
  color,
  peak,
  diameter,
  left,
  top,
  progress,
  driftX,
  driftY,
  driftScale = 0,
  driftFade = 0,
}: OrbProps) {
  // Built here rather than handed in as a prop: each orb is its own component,
  // so the hook is legal, and the animated style never has to cross a props
  // boundary where its type would widen back to a plain style.
  const style = useAnimatedStyle(() => {
    const centred = progress.value - 0.5;
    return {
      opacity: 1 - driftFade + progress.value * driftFade,
      transform: [
        { translateX: centred * driftX },
        { translateY: centred * driftY },
        { scale: 1 + progress.value * driftScale },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ height: diameter, left, position: 'absolute', top, width: diameter }, style]}
    >
      <Svg height="100%" viewBox="0 0 100 100" width="100%">
        <Defs>
          <RadialGradient cx="50" cy="50" gradientUnits="userSpaceOnUse" id={id} r="50">
            <Stop offset="0" stopColor={color} stopOpacity={peak} />
            <Stop offset="0.42" stopColor={color} stopOpacity={peak * 0.42} />
            <Stop offset="0.72" stopColor={color} stopOpacity={peak * 0.12} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" fill={`url(#${id})`} r="50" />
      </Svg>
    </Animated.View>
  );
}

export function BrandBackdrop({ quiet = false }: { quiet?: boolean }) {
  const reducedMotion = useReducedMotion();
  const { height, width } = useWindowDimensions();
  const damp = quiet ? 0.55 : 1;

  const t0 = useSharedValue(0);
  const t1 = useSharedValue(0);
  const t2 = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    const cycle = (value: typeof t0, duration: number) => {
      value.value = withRepeat(
        withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    };
    // Mutually prime durations: the three fields never return to the same
    // arrangement twice within a session, so the motion cannot read as a loop.
    cycle(t0, 23000);
    cycle(t1, 31000);
    cycle(t2, 19000);
    return () => {
      t0.value = 0;
      t1.value = 0;
      t2.value = 0;
    };
  }, [reducedMotion, t0, t1, t2]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg height="100%" style={StyleSheet.absoluteFill} width="100%">
        <Defs>
          <LinearGradient id="micaGround" x1="0" x2="0.35" y1="0" y2="1">
            <Stop offset="0" stopColor={BASE_TOP} />
            <Stop offset="0.52" stopColor={BASE_MID} />
            <Stop offset="1" stopColor={BASE_BOTTOM} />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#micaGround)" height="100%" width="100%" />
      </Svg>

      {/* Blue carries the brand. Its dense centre is deliberately placed ABOVE
          the wordmark's anchor so the mark lands on the falloff — a white
          wordmark sitting in the brightest part of a blue field loses its
          edge, and moving the light is cheaper than dimming it. */}
      <Orb
        color={MICA_FIGURE_COLORS.body}
        diameter={width * 1.55}
        driftScale={0.12}
        driftX={46}
        driftY={-34}
        id="micaOrbBlue"
        left={-width * 0.42}
        peak={0.5 * damp}
        progress={t0}
        top={-height * 0.26}
      />
      {/* Green answers from the opposite corner so the field has a diagonal. */}
      <Orb
        color={MICA_FIGURE_COLORS.arm}
        diameter={width * 1.3}
        driftScale={-0.1}
        driftX={-38}
        driftY={44}
        id="micaOrbGreen"
        left={width * 0.24}
        peak={0.3 * damp}
        progress={t1}
        top={height * 0.42}
      />
      {/* Amber is the smallest and faintest on purpose: warmth, not a third
          competing mass — it is the accent colour of a single activity state
          and must never look like one here. */}
      <Orb
        color={MICA_FIGURE_COLORS.head}
        diameter={width * 0.86}
        driftFade={0.28}
        driftX={28}
        driftY={22}
        id="micaOrbAmber"
        left={-width * 0.2}
        peak={0.18 * damp}
        progress={t2}
        top={height * 0.2}
      />

      {/* Legibility floor. The action stack and the legal line sit in the lower
          third; without this the aurora would run straight under the white
          buttons and cost them their edge. */}
      <Svg height="100%" style={StyleSheet.absoluteFill} width="100%">
        <Defs>
          <LinearGradient id="micaScrim" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={BASE_TOP} stopOpacity="0.55" />
            <Stop offset="0.22" stopColor={BASE_MID} stopOpacity="0" />
            <Stop offset="0.62" stopColor={BASE_BOTTOM} stopOpacity="0.28" />
            <Stop offset="1" stopColor={BASE_BOTTOM} stopOpacity="0.86" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#micaScrim)" height="100%" width="100%" />
      </Svg>
    </View>
  );
}
