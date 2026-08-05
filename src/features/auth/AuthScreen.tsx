import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  BackHandler,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandBackdrop, TogetherFinalWordmark } from '@/shared/components';
import { PressableScale } from '@/shared/components/PressableScale';
import { TOGETHER_BRAND } from '@/shared/components/brand/brandTokens';
import { FONT, TYPE } from '@/shared/theme';
import { haptics } from '@/shared/utils/haptics';

import { AppleSignInButton } from './components/AppleSignInButton';
import { EmailAuthForm, type AuthFormMode } from './components/EmailAuthForm';
import { useAuth } from './hooks/useAuth';
import type { SignInWithEmailInput } from './types';

const REVEAL_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const GOOGLE_BLUE = '#4285F4';
// Failures read as failures. The brand aqua that used to tint this chip looked
// like an informational note, which is the wrong signal for a rejected sign-in.
const DANGER = '#FCA5A5';

/** Authentication surface. */
export function AuthScreen() {
  const { signInWithApple, signInWithEmail, signInWithGoogle, resetPassword, error, clearError } =
    useAuth();
  const { height, width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<AuthFormMode>('login');
  const [emailOpen, setEmailOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [socialProvider, setSocialProvider] = useState<'apple' | 'google' | null>(null);

  const heroIn = useSharedValue(reducedMotion ? 1 : 0);
  const row0 = useSharedValue(reducedMotion ? 1 : 0);
  const row1 = useSharedValue(reducedMotion ? 1 : 0);
  const row2 = useSharedValue(reducedMotion ? 1 : 0);
  const footIn = useSharedValue(reducedMotion ? 1 : 0);
  const chevron = useSharedValue(0);
  const compact = height < 730;
  const lockupWidth = Math.min(width - 52, compact ? 224 : 268);
  const showApple =
    Platform.OS === 'ios' && process.env.EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED === 'true';
  const showGoogle =
    process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED === 'true' &&
    Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim());
  const hasSocialProviders = showApple || showGoogle;
  // Fixed anchor: the wordmark keeps this vertical offset whether the slogan is
  // shown or the form is open — it never moves during the transition.
  const heroTop = Math.round(Math.max(28, height * (compact ? 0.11 : 0.19)));

  useEffect(() => {
    if (reducedMotion) return;
    heroIn.value = withDelay(520, withTiming(1, { duration: 620, easing: REVEAL_EASE }));
    row0.value = withDelay(860, withTiming(1, { duration: 500, easing: REVEAL_EASE }));
    row1.value = withDelay(960, withTiming(1, { duration: 500, easing: REVEAL_EASE }));
    row2.value = withDelay(1060, withTiming(1, { duration: 500, easing: REVEAL_EASE }));
    footIn.value = withDelay(1200, withTiming(1, { duration: 500, easing: REVEAL_EASE }));
  }, [footIn, heroIn, reducedMotion, row0, row1, row2]);

  useEffect(() => {
    chevron.value = reducedMotion
      ? emailOpen
        ? 1
        : 0
      : withTiming(emailOpen ? 1 : 0, { duration: 220 });
  }, [chevron, emailOpen, reducedMotion]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (emailOpen && !submitting) {
        clearError();
        setEmailOpen(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [clearError, emailOpen, submitting]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroIn.value,
    transform: [{ translateY: (1 - heroIn.value) * 16 }],
  }));
  const row0Style = useAnimatedStyle(() => ({
    opacity: row0.value,
    transform: [{ translateY: (1 - row0.value) * 18 }],
  }));
  const row1Style = useAnimatedStyle(() => ({
    opacity: row1.value,
    transform: [{ translateY: (1 - row1.value) * 18 }],
  }));
  const row2Style = useAnimatedStyle(() => ({
    opacity: row2.value,
    transform: [{ translateY: (1 - row2.value) * 18 }],
  }));
  const dividerStyle = useAnimatedStyle(() => ({
    opacity: showApple && showGoogle ? row1.value : row0.value,
  }));
  const footStyle = useAnimatedStyle(() => ({ opacity: footIn.value }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.value * 180}deg` }],
  }));

  const selectMode = (next: AuthFormMode) => {
    clearError();
    setMode(next);
  };

  const handleEmail = async (input: SignInWithEmailInput) => {
    setSubmitting(true);
    try {
      await signInWithEmail(input);
      // Fired here, not in the form: only the provider knows the round-trip
      // actually succeeded, and this is the last frame before the app takes over.
      haptics.success();
    } catch {
      // AuthProvider exposes the user-facing message through `error`.
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEmail = () => {
    clearError();
    setEmailOpen((open) => !open);
  };

  const handleSocialSignIn = async (provider: 'apple' | 'google') => {
    if (socialProvider || submitting) return;
    setSocialProvider(provider);
    try {
      if (provider === 'apple') {
        await signInWithApple();
      } else {
        await signInWithGoogle();
      }
    } catch {
      // AuthProvider exposes a localized error through `error`.
    } finally {
      setSocialProvider(null);
    }
  };

  const appleRow = showApple ? (
    <Animated.View style={row0Style}>
      <AppleSignInButton
        disabled={socialProvider !== null || submitting}
        onPress={() => void handleSocialSignIn('apple')}
      />
    </Animated.View>
  ) : null;

  const googleRow = showGoogle ? (
    <Animated.View style={showApple ? row1Style : row0Style}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Mit Google anmelden"
        disabled={socialProvider !== null || submitting}
        style={styles.providerBtn}
        onPress={() => void handleSocialSignIn('google')}
      >
        <Ionicons name="logo-google" size={19} color={GOOGLE_BLUE} />
        <Text style={styles.providerLabel}>
          {socialProvider === 'google' ? 'Google wird geöffnet …' : 'Mit Google anmelden'}
        </Text>
      </PressableScale>
    </Animated.View>
  ) : null;

  return (
    <View style={styles.root}>
      <StatusBar style="light" backgroundColor={TOGETHER_BRAND.ink} />
      <BrandBackdrop />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior="padding" style={styles.safeArea}>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingTop: heroTop }]}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <Animated.View style={styles.stage} layout={reducedMotion ? undefined : LinearTransition}>
            {/* Wordmark — the fixed anchor, always present, never moves. */}
            <View style={styles.wordmarkWrap}>
              <TogetherFinalWordmark width={lockupWidth} />
            </View>

            {/* Slogan — fades out slowly when the form opens; the wordmark
                  above it stays put and the content below reflows smoothly. */}
            {!emailOpen ? (
              <Animated.View
                entering={reducedMotion ? undefined : FadeIn.duration(300)}
                exiting={reducedMotion ? undefined : FadeOut.duration(440)}
                style={[styles.heroCopy, heroStyle]}
              >
                <Text style={[styles.title, compact ? styles.titleCompact : null]}>
                  Freie Zeit wird{`\n`}gemeinsame Zeit.
                </Text>
              </Animated.View>
            ) : null}

            {/* Flexible gap: pushes the sign-in block toward the lower part of
                  the screen while collapsed; shrinks so the form fills upward on
                  open. The wordmark above stays anchored either way. */}
            <View style={styles.spacer} />

            <View style={styles.actions}>
              {appleRow}
              {googleRow}

              {hasSocialProviders ? (
                <Animated.View style={[styles.dividerRow, dividerStyle]}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>oder</Text>
                  <View style={styles.dividerLine} />
                </Animated.View>
              ) : null}

              <Animated.View style={row2Style}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={
                    emailOpen ? 'E-Mail-Anmeldung schließen' : 'Mit E-Mail fortfahren'
                  }
                  accessibilityState={{ expanded: emailOpen }}
                  disabled={socialProvider !== null}
                  style={styles.emailBtn}
                  onPress={toggleEmail}
                >
                  <Ionicons name="mail-outline" size={18} color={TOGETHER_BRAND.paper} />
                  <Text style={styles.emailLabel}>
                    {emailOpen ? 'Mit E-Mail' : 'Mit E-Mail fortfahren'}
                  </Text>
                  <Animated.View style={chevronStyle}>
                    <Ionicons name="chevron-down" size={18} color={TOGETHER_BRAND.muted} />
                  </Animated.View>
                </PressableScale>
              </Animated.View>

              {emailOpen ? (
                <Animated.View
                  entering={
                    reducedMotion ? undefined : FadeInDown.duration(320).springify().damping(18)
                  }
                  exiting={reducedMotion ? undefined : FadeOut.duration(160)}
                  style={styles.inlineForm}
                >
                  {/* The segmented switch lives inside the form because the
                        choice is no longer cosmetic: it decides whether the
                        submit signs in or creates an account. */}
                  <EmailAuthForm
                    accent={TOGETHER_BRAND.indigo}
                    autoFocusEmail
                    error={error}
                    mode={mode}
                    onModeChange={selectMode}
                    onResetPassword={resetPassword}
                    onSubmit={handleEmail}
                    submitting={submitting}
                  />
                </Animated.View>
              ) : null}

              {error && !emailOpen ? (
                <Animated.View
                  entering={reducedMotion ? undefined : FadeInDown.duration(200)}
                  style={styles.authError}
                >
                  <Ionicons name="alert-circle-outline" size={15} color={DANGER} />
                  <Text
                    accessibilityLiveRegion="assertive"
                    accessibilityRole="alert"
                    style={styles.authErrorText}
                  >
                    {error}
                  </Text>
                </Animated.View>
              ) : null}

              <Animated.View style={[styles.footer, footStyle]}>
                <View style={styles.privacyLine}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={14}
                    color={TOGETHER_BRAND.quiet}
                  />
                  <Text style={styles.privacyText}>
                    Privat mit deinen Freunden · Kein öffentlicher Feed
                  </Text>
                </View>
                <Text style={styles.legalText}>
                  Mit dem Fortfahren stimmst du unseren{' '}
                  <Text
                    accessibilityRole="link"
                    style={styles.legalLink}
                    suppressHighlighting
                    onPress={() => router.push('/nutzungsbedingungen')}
                  >
                    Nutzungsbedingungen
                  </Text>{' '}
                  und der{' '}
                  <Text
                    accessibilityRole="link"
                    style={styles.legalLink}
                    suppressHighlighting
                    onPress={() => router.push('/datenschutz')}
                  >
                    Datenschutzerklärung
                  </Text>{' '}
                  zu.
                </Text>
              </Animated.View>
            </View>
          </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    paddingBottom: 4,
  },
  authError: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(252,165,165,0.1)',
    borderColor: 'rgba(252,165,165,0.26)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  authErrorText: {
    color: DANGER,
    flex: 1,
    fontFamily: FONT.medium,
    ...TYPE.caption,
  },
  dividerLine: {
    backgroundColor: TOGETHER_BRAND.line,
    flex: 1,
    height: 1,
  },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 2,
  },
  dividerText: {
    color: TOGETHER_BRAND.quiet,
    fontFamily: FONT.medium,
    ...TYPE.caption,
  },
  emailBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(247,248,252,0.06)',
    borderColor: TOGETHER_BRAND.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
  },
  emailLabel: {
    color: TOGETHER_BRAND.paper,
    fontFamily: FONT.semibold,
    ...TYPE.body,
  },
  footer: {
    gap: 8,
    paddingTop: 8,
  },
  heroCopy: {
    alignItems: 'center',
    marginTop: 20,
  },
  inlineForm: {
    gap: 12,
    paddingTop: 4,
  },
  legalLink: {
    color: TOGETHER_BRAND.muted,
    fontFamily: FONT.medium,
    ...TYPE.micro,
    textDecorationLine: 'underline',
  },
  legalText: {
    color: TOGETHER_BRAND.quiet,
    fontFamily: FONT.medium,
    ...TYPE.micro,
    textAlign: 'center',
  },
  privacyLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 22,
  },
  privacyText: {
    color: TOGETHER_BRAND.quiet,
    fontFamily: FONT.medium,
    ...TYPE.micro,
  },
  providerBtn: {
    alignItems: 'center',
    backgroundColor: TOGETHER_BRAND.paper,
    borderRadius: 16,
    elevation: 5,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  providerLabel: {
    color: TOGETHER_BRAND.ink,
    fontFamily: FONT.bold,
    ...TYPE.body,
  },
  root: {
    backgroundColor: TOGETHER_BRAND.ink,
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  spacer: {
    flexGrow: 1,
    minHeight: 24,
  },
  stage: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  title: {
    color: TOGETHER_BRAND.paper,
    fontFamily: FONT.bold,
    ...TYPE.display,
    textAlign: 'center',
  },
  titleCompact: {
    ...TYPE.displayCompact,
  },
  wordmarkWrap: {
    alignItems: 'center',
  },
});
