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
import { type ReactNode, useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { ActivityEntityProvider } from '@/features/activities';
import { AuthProvider, useAuth } from '@/features/auth';
import { ChatProvider } from '@/features/chat';
import { CirclesProvider } from '@/features/circles';
import { FriendsProvider } from '@/features/friends';
import { JourneyProvider } from '@/features/journey';
import { MapStyleProvider } from '@/features/map';
import { ModerationProvider } from '@/features/moderation';
import { SafetyProvider } from '@/features/safety';
import { OpenStatusProvider } from '@/features/presence';
import { NotificationsProvider } from '@/features/notifications';
import { NearbyRadiusProvider } from '@/features/settings';
import { AppBootScreen, AppButton, TogetherLockup } from '@/shared/components';
import { ThemePreferenceProvider, useThemePreference } from '@/features/theme';
import { BACKEND, prepareNativeFirebase } from '@/shared/services/firebase';

// Keep the native splash up until the brand font is ready — the boot screen's
// wordmark must never flash in a system-font fallback.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
  });
  const fontsReady = fontsLoaded || fontError != null;
  const [nativeFirebaseReady, setNativeFirebaseReady] = useState(BACKEND !== 'firebase');
  const [nativeFirebaseError, setNativeFirebaseError] = useState<Error | null>(null);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  useEffect(() => {
    if (BACKEND !== 'firebase') return;
    void prepareNativeFirebase()
      .then(() => setNativeFirebaseReady(true))
      .catch((error: unknown) => {
        setNativeFirebaseError(
          error instanceof Error ? error : new Error('Native Firebase konnte nicht vorbereitet werden.'),
        );
      });
  }, []);

  // Bundled assets resolve in a few frames; if they ever fail we continue
  // with the system fallback rather than blocking the app.
  if (nativeFirebaseError) throw nativeFirebaseError;
  if (!fontsReady || !nativeFirebaseReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemePreferenceProvider>
        <MapStyleProvider>
          <NearbyRadiusProvider>
            <ThemedApp />
          </NearbyRadiusProvider>
        </MapStyleProvider>
      </ThemePreferenceProvider>
    </GestureHandlerRootView>
  );
}

/** Applies the persisted color-scheme preference to gluestack + navigation. */
function ThemedApp() {
  const { preference, resolvedScheme } = useThemePreference();
  const isDark = resolvedScheme === 'dark';

  return (
    <GluestackUIProvider mode={preference}>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </GluestackUIProvider>
  );
}

/**
 * Auth gate: while the session restores we show a dezent loading state; then we
 * expose either the tabs (authenticated) or the auth screen (unauthenticated).
 * `Stack.Protected` redirects automatically when `guard` flips.
 */
function RootNavigator() {
  const { status } = useAuth();
  const { ready: themeReady, resolvedScheme } = useThemePreference();

  if (status === 'loading' || !themeReady) {
    return (
      <>
        <AppBootScreen />
        <StatusBar style="light" backgroundColor="#070910" />
      </>
    );
  }

  // Stack.Protected switches the route in the SAME render pass as the guard
  // flip. Without it, signing out unmounts the providers while the router
  // still shows "(tabs)" for one frame → "useX must be used within XProvider"
  // render crash. Never swap back to two separate <Stack> returns.
  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'authenticated'}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={status !== 'authenticated'}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
    </Stack>
  );

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
          {__DEV__ ? (
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

function AuthenticatedProviders({ children }: { children: ReactNode }) {
  return (
    <FriendsProvider>
      <CirclesProvider>
        <ChatProvider>
          <ActivityEntityProvider>
            <JourneyProvider>
              <SafetyProvider>
                <OpenStatusProvider>
                  <NotificationsProvider>
                    <ModerationProvider>{children}</ModerationProvider>
                  </NotificationsProvider>
                </OpenStatusProvider>
              </SafetyProvider>
            </JourneyProvider>
          </ActivityEntityProvider>
        </ChatProvider>
      </CirclesProvider>
    </FriendsProvider>
  );
}
