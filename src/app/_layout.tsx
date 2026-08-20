import '@/global.css';
// Defines the TaskManager handlers before React mounts. Android can therefore
// process the explicit Anreise action without opening an Activity screen.
import '@/features/journey/journeyBackground';
// Defines the Heimweg location task at module scope so it also works while
// React is paused and the device is locked.
import '@/features/safety/safetyBackground';

import {
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_600SemiBold,
  SchibstedGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/schibsted-grotesk';
import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useReducedMotion } from 'react-native-reanimated';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, EmailVerificationGate, useAuth } from '@/features/auth';
import { useActivityEntities } from '@/features/activities';
import { useCircles } from '@/features/circles';
import { useFriends } from '@/features/friends';
import { MapBootProvider, MapStyleProvider, useMapBoot } from '@/features/map';
import { NearbyRadiusProvider } from '@/features/settings';
import { useSyncOutbox } from '@/features/sync';
import { AppBootScreen, AppButton, ColorSchemeRoot, TogetherLockup } from '@/shared/components';
import { ThemePreferenceProvider, useThemePreference } from '@/features/theme';
import { configureCrashReporting, reportAppError } from '@/shared/services/crashReporting';
import { DIAGNOSTICS_VISIBLE } from '@/shared/utils/buildInfo';
import { prepareNativeFirebase } from '@/shared/services/firebase';
import {
  DeferredAuthenticatedProviders,
  MapBootProviders,
} from '@/providers/AuthenticatedProviders';

// Keep the native splash up until the brand font is ready — the boot screen's
// wordmark must never flash in a system-font fallback.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Shortest time the boot screen stays up once it has appeared.
 *
 * `AppBootScreen` plays a sequence: the lockup animates, then the loading copy
 * fades in at 1050 ms over 520 ms. When auth and theme resolve faster than that
 * — the normal case on a warm start — the screen used to be torn away
 * mid-animation, which reads as a glitch rather than as speed. This holds it to
 * the end of its own sequence and no longer.
 *
 * It is a FLOOR, never a delay on top: if preparation takes longer, the screen
 * stays until preparation is done, and this timer has long since elapsed.
 */
const BOOT_ANIMATION_MS = 1600;

// Local caches and the first bounded feed snapshot normally settle within a
// few frames. This ceiling only keeps a cold/offline boot usable; the existing
// listeners continue to reconcile after the curtain has lifted.
const BOOT_DATA_WAIT_MAX_MS = 4_000;

/** Runs once per app start. `enabled === false` (reduced motion) resolves
 * immediately — there is no animation to let finish. */
function useBootAnimationFloor(enabled: boolean) {
  const [elapsed, setElapsed] = useState(!enabled);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setElapsed(true), BOOT_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [enabled]);

  return elapsed;
}

function useBootDataTimeout() {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), BOOT_DATA_WAIT_MAX_MS);
    return () => clearTimeout(timer);
  }, []);

  return elapsed;
}

/**
 * What the boot curtain needs to know, pushed UP from the map-boot phase.
 *
 * `prewarming` is computed deep inside `MapBootProvider`, but the curtain is
 * rendered at the top of `RootNavigator` — see the comment there for why it has
 * to be one instance. Lifting the state is what lets that single instance
 * survive the whole boot instead of being torn down and rebuilt when the
 * authenticated providers mount.
 */
interface BootCurtainState {
  busy: boolean;
  locationPermissionIntro: boolean;
  onRequestLocationPermission?: () => void;
  onSkipLocationPermission?: () => void;
}

/** Held by default: the map phase must never be assumed finished before it has
 * reported once, or the curtain would lift for a frame between the two. */
const CURTAIN_HELD: BootCurtainState = { busy: true, locationPermissionIntro: false };

/** Keeps the prepared app mounted behind the opaque boot curtain. */
function AuthenticatedBootGate({
  children,
  bootAnimationDone,
  onBootStateChange,
}: {
  children: ReactNode;
  bootAnimationDone: boolean;
  onBootStateChange: (state: BootCurtainState) => void;
}) {
  const { initialFeedReady } = useActivityEntities();
  const { hydrated: syncHydrated } = useSyncOutbox();
  const { hydrated: friendsHydrated } = useFriends();
  const { hydrated: circlesHydrated } = useCircles();
  const dataWaitTimedOut = useBootDataTimeout();
  const initialDataReady = initialFeedReady && syncHydrated && friendsHydrated && circlesHydrated;
  const baseReady = bootAnimationDone && (initialDataReady || dataWaitTimedOut);

  return (
    <MapBootProvider baseReady={baseReady}>
      <AuthenticatedBootContent onBootStateChange={onBootStateChange}>
        {children}
      </AuthenticatedBootContent>
    </MapBootProvider>
  );
}

/**
 * Reports the map-boot phase upward instead of drawing its own curtain.
 *
 * It used to render a second `AppBootScreen` here. That is one screen too many:
 * the first one lives in `RootNavigator` and is unmounted the moment the
 * authenticated providers take over, so the app showed the mark, dropped it for
 * the frames these providers needed to mount, and showed it again.
 */
function AuthenticatedBootContent({
  children,
  onBootStateChange,
}: {
  children: ReactNode;
  onBootStateChange: (state: BootCurtainState) => void;
}) {
  const {
    prewarming,
    requestLocationPermission,
    showLocationPermissionIntro,
    skipLocationPermission,
  } = useMapBoot();

  useEffect(() => {
    onBootStateChange({
      busy: prewarming,
      locationPermissionIntro: showLocationPermissionIntro,
      onRequestLocationPermission: requestLocationPermission,
      onSkipLocationPermission: skipLocationPermission,
    });
  }, [
    onBootStateChange,
    prewarming,
    requestLocationPermission,
    showLocationPermissionIntro,
    skipLocationPermission,
  ]);

  // Back to held on unmount, so signing out and back in starts behind the
  // curtain again rather than showing a cold map for a frame.
  useEffect(() => () => onBootStateChange(CURTAIN_HELD), [onBootStateChange]);

  return <DeferredAuthenticatedProviders>{children}</DeferredAuthenticatedProviders>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
  });
  const fontsReady = fontsLoaded || fontError != null;
  const [nativeFirebaseReady, setNativeFirebaseReady] = useState(false);
  const [nativeFirebaseError, setNativeFirebaseError] = useState<Error | null>(null);

  useEffect(() => {
    // Keep the native mark up until the React boot curtain is mountable. Hiding
    // it when only fonts are ready leaves a blank frame if Firebase is slower.
    if (fontsReady && nativeFirebaseReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady, nativeFirebaseReady]);

  useEffect(() => {
    void prepareNativeFirebase()
      .then(async () => {
        await configureCrashReporting(process.env.EXPO_PUBLIC_CRASH_REPORTING_ENABLED === 'true');
        setNativeFirebaseReady(true);
      })
      .catch((error: unknown) => {
        setNativeFirebaseError(
          error instanceof Error
            ? error
            : new Error('Native Firebase konnte nicht vorbereitet werden.'),
        );
      });
  }, []);

  // Bundled assets resolve in a few frames; if they ever fail we continue
  // with the system fallback rather than blocking the app.
  if (nativeFirebaseError) throw nativeFirebaseError;
  if (!fontsReady || !nativeFirebaseReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Drives every keyboard-aware surface. `statusBarTranslucent` +
          `navigationBarTranslucent` make Android report the real keyboard
          frame under edge-to-edge, which is what lets forms follow the
          keyboard instead of jumping to a settled position. */}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <ThemePreferenceProvider>
          <MapStyleProvider>
            <NearbyRadiusProvider>
              <ThemedApp />
            </NearbyRadiusProvider>
          </MapStyleProvider>
        </ThemePreferenceProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/** Applies the persisted color-scheme preference to the app root + navigation. */
function ThemedApp() {
  const { preference, resolvedScheme } = useThemePreference();
  const isDark = resolvedScheme === 'dark';

  return (
    <ColorSchemeRoot mode={preference}>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </ColorSchemeRoot>
  );
}

/**
 * Auth gate: while the session restores we show a dezent loading state; then we
 * expose either the authenticated app stack or the auth screen (unauthenticated).
 * `Stack.Protected` redirects automatically when `guard` flips.
 */
function RootNavigator() {
  const { status, user } = useAuth();
  const { ready: themeReady, resolvedScheme } = useThemePreference();
  const reducedMotion = useReducedMotion();
  const bootAnimationDone = useBootAnimationFloor(!reducedMotion);
  const [mapBoot, setMapBoot] = useState<BootCurtainState>(CURTAIN_HELD);
  const reportMapBoot = useCallback((state: BootCurtainState) => setMapBoot(state), []);

  const sessionResolving = status === 'loading' || !themeReady;
  const unverified = status === 'authenticated' && user != null && user.emailVerified === false;
  const authenticated = status === 'authenticated' && !unverified;

  // Stack.Protected switches routes in the same render pass as the guard flip.
  // This prevents a signed-out route from rendering after its providers unmount.
  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'authenticated'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={status !== 'authenticated'}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
      {/* Legal pages stay outside both guards: they must be readable BEFORE
          creating an account (auth screen links here) and after. */}
      <Stack.Screen name="datenschutz" />
      <Stack.Screen name="nutzungsbedingungen" />
      <Stack.Screen name="impressum" />
    </Stack>
  );

  /**
   * Everything behind the curtain. It is allowed to mount as early as the
   * session allows — the animation floor holds the CURTAIN, never the work
   * behind it, so listeners and caches keep warming up while it is still shown.
   *
   * Hard verification gate: an account with an unconfirmed address never
   * reaches the app. The backend already refuses its writes, so letting it in
   * only produced unexplained failures — and this is where the address we
   * mailed is visible, which is what makes a typo fixable. Rendered INSTEAD of
   * the authenticated stack, so no provider mounts and no listener attaches
   * for an account that cannot use them. One-time per account.
   */
  let body: ReactNode = null;
  if (!sessionResolving) {
    if (unverified) {
      body = <EmailVerificationGate />;
    } else if (authenticated) {
      body = (
        <MapBootProviders>
          <AuthenticatedBootGate
            bootAnimationDone={bootAnimationDone}
            onBootStateChange={reportMapBoot}
          >
            {stack}
          </AuthenticatedBootGate>
        </MapBootProviders>
      );
    } else {
      body = stack;
    }
  }

  /**
   * ONE curtain, from the first frame to the last — this is the whole point.
   *
   * There used to be two `AppBootScreen`s: one here for the session phase and a
   * second one deeper in, for the map phase. They are different positions in
   * the tree, so React tore the first down and built the second, and the mark
   * visibly vanished and came back in between. Rendered at a FIXED position in
   * this fragment it is the same instance throughout, no matter how `body`
   * changes underneath it, and it lifts exactly once.
   */
  const curtainBusy =
    sessionResolving || !bootAnimationDone || (authenticated && mapBoot.busy);
  // The verification gate is a dark surface of its own, so light chrome
  // outlives the curtain there — it used to hard-code `style="light"`.
  const darkChrome = curtainBusy || unverified || resolvedScheme === 'dark';

  return (
    <>
      {body}
      {curtainBusy ? (
        <AppBootScreen
          locationPermissionIntro={authenticated && mapBoot.locationPermissionIntro}
          onRequestLocationPermission={mapBoot.onRequestLocationPermission}
          onSkipLocationPermission={mapBoot.onSkipLocationPermission}
        />
      ) : null}
      <StatusBar
        backgroundColor={curtainBusy ? '#070910' : undefined}
        style={darkChrome ? 'light' : 'dark'}
      />
    </>
  );
}

/** Last-resort route boundary: recoverable and branded instead of a red/blank screen. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportAppError(error, 'router_error_boundary');
  }, [error]);

  return (
    <View className="flex-1 bg-[#090D12]">
      <StatusBar style="light" backgroundColor="#090D12" />
      <SafeAreaView className="flex-1 px-6">
        <View className="flex-1 items-center justify-center">
          <TogetherLockup animated={false} width={228} />
          <View className="mt-10 h-16 w-16 items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.06]">
            <Ionicons name="sparkles-outline" size={26} color="#E0A23E" />
          </View>
          <Text className="mt-6 text-center text-2xl font-extrabold tracking-[-0.5px] text-white">
            Kurz aus dem Takt
          </Text>
          <Text className="mt-2 max-w-[310px] text-center text-sm leading-5 text-white/50">
            Mica konnte diese Ansicht gerade nicht laden. Deine Daten bleiben sicher.
          </Text>
          {DIAGNOSTICS_VISIBLE ? (
            <Text
              className="mt-4 max-w-[330px] text-center text-xs text-white/30"
              numberOfLines={3}
            >
              {error.message}
            </Text>
          ) : null}
          <View className="mt-8 w-full max-w-[260px]">
            <AppButton label="Noch einmal versuchen" onPress={() => void retry()} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
