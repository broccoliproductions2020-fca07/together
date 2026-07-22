import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { TOGETHER_BRAND } from './brandTokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Abstract route field used by auth and boot surfaces. It references the map
 * and shared journeys without drawing a literal map or reusing the old dots.
 */
export function BrandBackdrop({ quiet = false }: { quiet?: boolean }) {
  const reducedMotion = useReducedMotion();
  const drift = useSharedValue(0);
  const route = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;

    drift.value = withRepeat(
      withTiming(1, { duration: 9200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    route.value = withRepeat(withTiming(1, { duration: 5600, easing: Easing.linear }), -1, false);

    return () => {
      drift.value = 0;
      route.value = 0;
    };
  }, [drift, reducedMotion, route]);

  const fieldStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1.08 },
      { translateX: (drift.value - 0.5) * 10 },
      { translateY: (0.5 - drift.value) * 14 },
    ],
  }));

  const routeProps = useAnimatedProps(() => ({
    strokeDashoffset: -route.value * 220,
  }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fieldStyle]}>
      <Svg height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 390 844" width="100%">
        <Defs>
          <LinearGradient id="brandNight" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={TOGETHER_BRAND.ink} />
            <Stop offset="0.56" stopColor="#0A0D18" />
            <Stop offset="1" stopColor="#12172A" />
          </LinearGradient>
          <LinearGradient id="brandBlueRibbon" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={TOGETHER_BRAND.indigo} stopOpacity="0" />
            <Stop offset="0.45" stopColor={TOGETHER_BRAND.indigo} stopOpacity="0.46" />
            <Stop offset="1" stopColor={TOGETHER_BRAND.violet} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="brandAquaRibbon" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={TOGETHER_BRAND.aqua} stopOpacity="0" />
            <Stop offset="0.5" stopColor={TOGETHER_BRAND.aqua} stopOpacity="0.38" />
            <Stop offset="1" stopColor={TOGETHER_BRAND.indigo} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        <Rect height="844" width="390" fill="url(#brandNight)" />

        <Path
          d="M-130 200 C36 20 178 258 520 34"
          fill="none"
          opacity={quiet ? 0.1 : 0.17}
          stroke="url(#brandBlueRibbon)"
          strokeLinecap="round"
          strokeWidth={74}
        />
        <Path
          d="M-120 704 C68 492 222 818 520 548"
          fill="none"
          opacity={quiet ? 0.08 : 0.15}
          stroke="url(#brandAquaRibbon)"
          strokeLinecap="round"
          strokeWidth={68}
        />

        <Path
          d="M-90 126 C78 54 120 304 454 168"
          fill="none"
          opacity={quiet ? 0.1 : 0.18}
          stroke="rgba(124,131,255,0.38)"
          strokeLinecap="round"
          strokeWidth={1.2}
        />
        <Path
          d="M-70 742 C122 614 250 898 478 650"
          fill="none"
          opacity={quiet ? 0.08 : 0.16}
          stroke="rgba(85,223,194,0.34)"
          strokeLinecap="round"
          strokeWidth={1.2}
        />
        <Path
          d="M-44 420 C82 286 214 520 440 350"
          fill="none"
          opacity={0.08}
          stroke="rgba(247,248,252,0.44)"
          strokeWidth={0.8}
        />

        <AnimatedPath
          animatedProps={routeProps}
          d="M-90 126 C78 54 120 304 454 168"
          fill="none"
          opacity={quiet ? 0.22 : 0.42}
          stroke="rgba(247,248,252,0.76)"
          strokeDasharray="9 211"
          strokeLinecap="round"
          strokeWidth={2.2}
        />

        <Path d="M48 0 L48 844" opacity={0.035} stroke="#FFFFFF" strokeWidth={0.7} />
        <Path d="M195 0 L195 844" opacity={0.035} stroke="#FFFFFF" strokeWidth={0.7} />
        <Path d="M342 0 L342 844" opacity={0.035} stroke="#FFFFFF" strokeWidth={0.7} />
        <Path d="M0 278 L390 278" opacity={0.03} stroke="#FFFFFF" strokeWidth={0.7} />
        <Path d="M0 566 L390 566" opacity={0.03} stroke="#FFFFFF" strokeWidth={0.7} />
      </Svg>
    </Animated.View>
  );
}
