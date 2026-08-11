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
import { useEffect, useState, type ReactNode } from 'react';
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

function BootScreen() {
  return (
    <>
      <AppBootScreen />
      <StatusBar style="light" backgroundColor="#070910" />
    </>
  );
}

/** Keeps the prepared app mounted behind the opaque boot curtain. */
function AuthenticatedBootGate({
  children,
  bootAnimationDone,
  resolvedScheme,
}: {
  children: ReactNode;
  bootAnimationDone: boolean;
  resolvedScheme: 'light' | 'dark';
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
      <AuthenticatedBootContent resolvedScheme={resolvedScheme}>
        {children}
      </AuthenticatedBootContent>
    </MapBootProvider>
  );
}

function AuthenticatedBootContent({
  children,
  resolvedScheme,
}: {
  children: ReactNode;
  resolvedScheme: 'light' | 'dark';
}) {
  const {
    prewarming,
    requestLocationPermission,
    showLocationPermissionIntro,
    skipLocationPermission,
  } = useMapBoot();

  return (
    <>
      <DeferredAuthenticatedProviders>{children}</DeferredAuthenticatedProviders>
      {prewarming ? (
        <AppBootScreen
          locationPermissionIntro={showLocationPermissionIntro}
          onRequestLocationPermission={requestLocationPermission}
          onSkipLocationPermission={skipLocationPermission}
        />
      ) : null}
      <StatusBar
        backgroundColor={prewarming ? '#070910' : undefined}
        style={prewarming || resolvedScheme === 'dark' ? 'light' : 'dark'}
      />
    </>
  );
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

  if (status === 'loading' || !themeReady) return <BootScreen />;

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

  // Hard verification gate: an account with an unconfirmed address never
  // reaches the app. The backend already refuses its writes, so letting it in
  // only produced unexplained failures — and this is where the address we
  // mailed is visible, which is what makes a typo fixable. Rendered INSTEAD of
  // the authenticated stack, so no provider mounts and no listener attaches
  // for an account that cannot use them. One-time per account.
  if (status === 'authenticated' && user && user.emailVerified === false) {
    if (!bootAnimationDone) return <BootScreen />;
    return (
      <>
        <EmailVerificationGate />
        <StatusBar style="light" />
      </>
    );
  }

  if (status !== 'authenticated') {
    if (!bootAnimationDone) return <BootScreen />;

    return (
      <>
        {stack}
        <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      </>
    );
  }

  return (
    <>
      <MapBootProviders>
        <AuthenticatedBootGate
          bootAnimationDone={bootAnimationDone}
          resolvedScheme={resolvedScheme}
        >
          {stack}
        </AuthenticatedBootGate>
      </MapBootProviders>
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
            Como konnte diese Ansicht gerade nicht laden. Deine Daten bleiben sicher.
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
