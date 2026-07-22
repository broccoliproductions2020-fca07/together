import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandBackdrop } from './BrandBackdrop';
import { TOGETHER_BRAND } from './brandTokens';
import { TogetherLockup } from './TogetherMark';

/** Branded restoration state between native splash and the first route. */
export function AppBootScreen() {
  const reducedMotion = useReducedMotion();

  return (
    <View accessibilityLabel="Together wird geladen" style={styles.root}>
      <BrandBackdrop quiet />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <TogetherLockup animated idle layout="stacked" width={258} />
          <Animated.View
            entering={reducedMotion ? undefined : FadeInDown.delay(1050).duration(520)}
            style={styles.loadingCopy}
          >
            <View style={styles.loadingRail}>
              <View style={styles.loadingRailAccent} />
            </View>
            <Text style={styles.loadingText}>MOMENTE VERBINDEN</Text>
          </Animated.View>
        </View>

        <Animated.Text
          entering={reducedMotion ? undefined : FadeIn.delay(1450).duration(500)}
          style={styles.footer}
        >
          Privat mit deinen Freunden
        </Animated.Text>
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
    color: TOGETHER_BRAND.quiet,
    fontFamily: 'SchibstedGrotesk_500Medium',
    fontSize: 11.5,
    letterSpacing: 0.25,
    paddingBottom: 24,
    textAlign: 'center',
  },
  loadingCopy: {
    alignItems: 'center',
    gap: 13,
    marginTop: 28,
  },
  loadingRail: {
    backgroundColor: 'rgba(247,248,252,0.1)',
    height: 1,
    overflow: 'hidden',
    width: 82,
  },
  loadingRailAccent: {
    alignSelf: 'center',
    backgroundColor: TOGETHER_BRAND.aqua,
    height: 1,
    opacity: 0.9,
    width: 28,
  },
  loadingText: {
    color: 'rgba(247,248,252,0.42)',
    fontFamily: 'SchibstedGrotesk_600SemiBold',
    fontSize: 9.5,
    letterSpacing: 2.1,
  },
  root: {
    backgroundColor: TOGETHER_BRAND.ink,
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
  },
});
