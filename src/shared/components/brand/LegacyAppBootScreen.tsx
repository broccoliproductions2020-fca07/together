import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AnimatedLogo } from './AnimatedLogo';

const INK = '#0E1116';
const PAPER = '#F4F5F7';

/** Barely-there depth: two soft brand washes on the ink stage — no shapes,
 * no chrome, nothing competing with the wordmark. */
function InkStage() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <RadialGradient id="bootWashBlue" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#6E8BF7" stopOpacity={0.1} />
          <Stop offset="1" stopColor="#6E8BF7" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="bootWashGreen" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#41C08D" stopOpacity={0.09} />
          <Stop offset="1" stopColor="#41C08D" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={INK} />
      <Circle cx="8%" cy="10%" r="52%" fill="url(#bootWashBlue)" />
      <Circle cx="96%" cy="94%" r="48%" fill="url(#bootWashGreen)" />
    </Svg>
  );
}

/**
 * Branded app-restoration state between native splash and first route.
 *
 * One actor, no chrome: the wordmark assembles (two dots meet → ring → word →
 * period drops in), then the mark itself carries the loading signal — the
 * ring's highlight slowly orbits and the period breathes (`idlePulse`).
 * There is deliberately NO separate spinner or progress element.
 */
export function LegacyAppBootScreen() {
  const reducedMotion = useReducedMotion();

  return (
    <View accessibilityLabel="Together wird geladen" style={styles.root}>
      <InkStage />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <AnimatedLogo idlePulse width={288} wordColor={PAPER} />
        </View>
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.delay(2200).duration(600)}
          style={styles.footer}
        >
          <Text style={styles.footerText}>Privat · Nur Freunde · Kein Feed</Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  footerText: {
    color: 'rgba(244,245,247,0.34)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  root: {
    backgroundColor: INK,
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
  },
});
