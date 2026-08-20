import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeOut } from 'react-native-reanimated';

import { TEXT_CAPPED, TEXT_FLEXIBLE } from '@/shared/theme';

import { BrandBackdrop } from './BrandBackdrop';
import { TOGETHER_BRAND } from './brandTokens';
import { TogetherLoader } from './TogetherLoader';

/**
 * Sized to match the figure the NATIVE splash draws, so the hand-over from the
 * OS screen to this one is invisible and the two read as a single screen.
 *
 * `app.json` renders the 1024² splash asset at `imageWidth: 144`, and the
 * figure occupies 738 of those 1024 pixels vertically — 103.8 dp on screen.
 * `TogetherLoader` lays its mark out at 86 % of `size`, so 121 lands on the
 * same height. (Both widths follow from that: the asset's figure and
 * `MICA_FIGURE_ASPECT_RATIO` agree to within 0.2 %.)
 *
 * If either number moves — the plugin's `imageWidth` or the loader's 0.86 —
 * recompute this one, or the mark will visibly jump at the hand-over.
 */
const SPLASH_MATCHED_LOADER_SIZE = Math.round((144 * (738 / 1024)) / 0.86);

/** Branded boot curtain and the contextual first-use location choice. */
export function AppBootScreen({
  locationPermissionIntro = false,
  onRequestLocationPermission,
  onSkipLocationPermission,
}: {
  locationPermissionIntro?: boolean;
  onRequestLocationPermission?: () => void;
  onSkipLocationPermission?: () => void;
}) {
  return (
    <Animated.View
      accessibilityLabel={
        locationPermissionIntro ? 'Standort für Mica einrichten' : 'Mica wird geladen'
      }
      accessibilityViewIsModal
      importantForAccessibility="yes"
      exiting={FadeOut.duration(240)}
      style={styles.root}
    >
      <BrandBackdrop quiet />
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.center, locationPermissionIntro && styles.centerWithPermission]}>
          {/* The SAME loader the submit buttons use — the figure's three parts
              pulsing in sequence. A mark that only breathes reads as a brand
              screen that has stalled; a beat reads as work in progress, and
              reusing the one people already meet when an account is being
              created means the app has one loading state, not two.
              `TogetherLoader` sits still under reduced motion on its own. */}
          {/* Unlabelled on purpose: the curtain itself already announces "Mica
              wird geladen", and a second label would read it twice. */}
          <TogetherLoader size={SPLASH_MATCHED_LOADER_SIZE} accessibilityLabel="" />
          {locationPermissionIntro ? (
            <View style={styles.permissionCard}>
              <Text style={styles.title} {...TEXT_FLEXIBLE}>
                Entdecke, was in deiner Nähe passiert
              </Text>
              <Text style={styles.copy} {...TEXT_FLEXIBLE}>
                Dein Standort richtet die Karte für dich aus. Er wird nicht automatisch mit anderen
                geteilt.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Standort verwenden"
                onPress={onRequestLocationPermission}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonLabel} {...TEXT_CAPPED}>
                  Standort verwenden
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ohne Standort fortfahren"
                onPress={onSkipLocationPermission}
                style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
              >
                <Text style={styles.skipButtonLabel} {...TEXT_CAPPED}>
                  Ohne Standort fortfahren
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  centerWithPermission: {
    justifyContent: 'space-between',
    paddingBottom: 24,
    paddingTop: 52,
  },
  copy: {
    color: TOGETHER_BRAND.muted,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  permissionCard: {
    alignItems: 'stretch',
    gap: 16,
    maxWidth: 380,
    width: '100%',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: TOGETHER_BRAND.paper,
    borderRadius: 20,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 20,
  },
  primaryButtonLabel: {
    color: TOGETHER_BRAND.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.82,
  },
  root: {
    backgroundColor: TOGETHER_BRAND.ink,
    ...StyleSheet.absoluteFillObject,
    elevation: 100,
    zIndex: 100,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 20,
  },
  skipButtonLabel: {
    color: TOGETHER_BRAND.paper,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: TOGETHER_BRAND.paper,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 33,
    textAlign: 'center',
  },
});
