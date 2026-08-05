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
import Constants from 'expo-constants';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, EmailVerificationGate, useAuth } from '@/features/auth';
import { MapStyleProvider } from '@/features/map';
import { NearbyRadiusProvider } from '@/features/settings';
import { AppBootScreen, AppButton, ColorSchemeRoot, TogetherLockup } from '@/shared/components';
import { ThemePreferenceProvider, useThemePreference } from '@/features/theme';
import { configureCrashReporting, reportAppError } from '@/shared/services/crashReporting';
import { prepareNativeFirebase } from '@/shared/services/firebase';
import { AuthenticatedProviders } from '@/providers/AuthenticatedProviders';

// Keep the native splash up until the brand font is ready — the boot screen's
// wordmark must never flash in a system-font fallback.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Staging is our controlled test environment. Showing the thrown message there
// makes a device-only regression diagnosable without exposing it to consumers.
const SHOW_STAGING_DIAGNOSTICS =
  process.env.EXPO_PUBLIC_STAGING_DIAGNOSTICS === 'true' ||
  Constants.expoConfig?.ios?.bundleIdentifier === 'com.broccolistudio.together.staging' ||
  Constants.expoConfig?.android?.package === 'com.broccolistudio.together.staging' ||
  Constants.expoConfig?.name === 'Together Staging';

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
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

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

  if (status === 'loading' || !themeReady) {
    return (
      <>
        <AppBootScreen />
        <StatusBar style="light" backgroundColor="#070910" />
      </>
    );
  }

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
    return (
      <>
        <EmailVerificationGate />
        <StatusBar style="light" />
      </>
    );
  }

  const content =
    status === 'authenticated' ? <AuthenticatedProviders>{stack}</AuthenticatedProviders> : stack;

  return (
    <>
      {content}
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
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
            Together konnte diese Ansicht gerade nicht laden. Deine Daten bleiben sicher.
          </Text>
          {__DEV__ || SHOW_STAGING_DIAGNOSTICS ? (
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
