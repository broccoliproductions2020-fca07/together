import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BrandBackdrop,
  TogetherFinalWordmark,
  TogetherLoader,
  TogetherMark,
} from '@/shared/components';
import { TOGETHER_BRAND } from '@/shared/components/brand/brandTokens';

import { authInteractionStyles } from './components/authInteractionStyles';
import { AuthModeSwitch } from './components/AuthModeSwitch';
import { EmailAuthForm, type AuthFormMode } from './components/EmailAuthForm';
import { useAuth } from './hooks/useAuth';
import type { SignInWithEmailInput } from './types';

const REVEAL_EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Brand v2 auth surface. The previous implementation lives in AuthScreenLegacy.tsx. */
export function AuthScreen() {
  const { signInWithEmail, signInDemo, resetPassword, error, clearError } = useAuth();
  const { height, width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<AuthFormMode>('login');
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  const heroIn = useSharedValue(reducedMotion ? 1 : 0);
  const actionsIn = useSharedValue(reducedMotion ? 1 : 0);
  const compact = height < 730;
  const lockupWidth = Math.min(width - 52, compact ? 248 : 292);

  useEffect(() => {
    if (reducedMotion) {
      heroIn.value = 1;
      actionsIn.value = 1;
      return;
    }

    heroIn.value = withDelay(680, withTiming(1, { duration: 620, easing: REVEAL_EASE }));
    actionsIn.value = withDelay(1040, withTiming(1, { duration: 560, easing: REVEAL_EASE }));
  }, [actionsIn, heroIn, reducedMotion]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroIn.value,
    transform: [{ translateY: (1 - heroIn.value) * 16 }],
  }));

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actionsIn.value,
    transform: [{ translateY: (1 - actionsIn.value) * 20 }],
  }));

  const handleModeChange = (nextMode: AuthFormMode) => {
    if (nextMode === mode) return;
    clearError();
    setMode(nextMode);
  };

  const handleEmail = async (input: SignInWithEmailInput) => {
    setSubmitting(true);
    try {
      await signInWithEmail(input);
    } catch {
      // AuthProvider exposes the user-facing message through `error`.
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuest = async () => {
    setGuestLoading(true);
    try {
      await signInDemo();
    } catch (guestError) {
      console.error('[auth] Gast-Login fehlgeschlagen:', guestError);
    } finally {
      setGuestLoading(false);
    }
  };

  const closeForm = () => {
    if (submitting) return;
    clearError();
    setFormOpen(false);
  };

  const busy = submitting || guestLoading;

  return (
    <View style={styles.root}>
      <StatusBar style="light" backgroundColor={TOGETHER_BRAND.ink} />
      <BrandBackdrop />

      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.content, compact ? styles.contentCompact : null]}>
          <View style={styles.heroStage}>
            <TogetherFinalWordmark width={lockupWidth} />

            <Animated.View style={[styles.heroCopy, heroStyle]}>
              <Text style={[styles.title, compact ? styles.titleCompact : null]}>
                Freie Zeit wird{`\n`}gemeinsame Zeit.
              </Text>
              <Text style={styles.subtitle}>
                Sieh, wer offen ist. Teile einen Plan. Kommt spontan zusammen.
              </Text>
            </Animated.View>
          </View>

          <Animated.View style={[styles.actions, actionsStyle]}>
            <Pressable
              accessibilityLabel="Mit E-Mail fortfahren"
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setFormOpen(true)}
              style={({ pressed }) => [
                styles.primaryAction,
                busy ? authInteractionStyles.disabled : null,
                pressed && !busy ? authInteractionStyles.pressed : null,
              ]}
            >
              <View style={styles.primaryLead}>
                <Ionicons name="mail-outline" size={18} color={TOGETHER_BRAND.ink} />
                <Text style={styles.primaryLabel}>Mit E-Mail fortfahren</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={TOGETHER_BRAND.ink} />
            </Pressable>

            <Pressable
              accessibilityLabel="Als Gast ansehen"
              accessibilityRole="button"
              disabled={busy}
              onPress={handleGuest}
              style={({ pressed }) => [
                styles.guestAction,
                busy ? authInteractionStyles.disabled : null,
                pressed && !busy ? authInteractionStyles.pressed : null,
              ]}
            >
              {guestLoading ? (
                <TogetherLoader size={22} />
              ) : (
                <Ionicons name="person-outline" size={19} color={TOGETHER_BRAND.paper} />
              )}
              <Text style={styles.guestLabel}>
                {guestLoading ? 'Gastzugang wird geöffnet …' : 'Als Gast ansehen'}
              </Text>
            </Pressable>

            <View style={styles.privacyLine}>
              <Ionicons name="shield-checkmark-outline" size={14} color={TOGETHER_BRAND.quiet} />
              <Text style={styles.privacyText}>
                Privat mit deinen Freunden · Kein öffentlicher Feed
              </Text>
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>

      <Modal
        animationType="slide"
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        visible={formOpen}
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetRoot}
        >
          <Pressable
            accessibilityLabel="Anmeldung schließen"
            accessibilityRole="button"
            onPress={closeForm}
            style={styles.sheetBackdrop}
          />

          <View style={styles.sheet}>
            <View style={styles.sheetAccent} />
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetIdentity}>
                <TogetherMark animated={false} size={42} />
                <View style={styles.sheetTitleBlock}>
                  <Text style={styles.sheetEyebrow}>TOGETHER</Text>
                  <Text style={styles.sheetTitle}>
                    {mode === 'login' ? 'Willkommen zurück' : 'Account erstellen'}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel="Schließen"
                accessibilityRole="button"
                disabled={submitting}
                onPress={closeForm}
                style={({ pressed }) => [
                  styles.sheetClose,
                  pressed ? authInteractionStyles.pressed : null,
                ]}
              >
                <Ionicons name="close" size={20} color={TOGETHER_BRAND.paper} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <AuthModeSwitch mode={mode} disabled={busy} onChange={handleModeChange} />
              <EmailAuthForm
                accent={TOGETHER_BRAND.indigo}
                autoFocusEmail
                error={error}
                mode={mode}
                onResetPassword={resetPassword}
                onSubmit={handleEmail}
                submitting={submitting}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 11,
    paddingBottom: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 18,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  contentCompact: {
    paddingBottom: 10,
    paddingTop: 8,
  },
  guestAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(247,248,252,0.07)',
    borderColor: 'rgba(247,248,252,0.14)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 18,
  },
  guestLabel: {
    color: TOGETHER_BRAND.paper,
    fontFamily: 'SchibstedGrotesk_600SemiBold',
    fontSize: 15,
  },
  heroCopy: {
    alignItems: 'center',
    gap: 12,
    maxWidth: 350,
  },
  heroStage: {
    alignItems: 'center',
    flex: 1,
    gap: 24,
    justifyContent: 'center',
    paddingTop: 8,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: TOGETHER_BRAND.paper,
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 19,
  },
  primaryLabel: {
    color: TOGETHER_BRAND.ink,
    fontFamily: 'SchibstedGrotesk_700Bold',
    fontSize: 16,
  },
  primaryLead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  privacyLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 24,
  },
  privacyText: {
    color: TOGETHER_BRAND.quiet,
    fontFamily: 'SchibstedGrotesk_500Medium',
    fontSize: 11.5,
  },
  root: {
    backgroundColor: TOGETHER_BRAND.ink,
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#0C0F19',
    borderColor: 'rgba(247,248,252,0.11)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    maxHeight: '92%',
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 24 : 18,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetAccent: {
    alignSelf: 'center',
    backgroundColor: TOGETHER_BRAND.indigo,
    height: 2,
    opacity: 0.78,
    position: 'absolute',
    top: 0,
    width: 116,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,4,8,0.72)',
  },
  sheetClose: {
    alignItems: 'center',
    backgroundColor: 'rgba(247,248,252,0.08)',
    borderColor: 'rgba(247,248,252,0.1)',
    borderRadius: 14,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  sheetEyebrow: {
    color: TOGETHER_BRAND.indigo,
    fontFamily: 'SchibstedGrotesk_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(247,248,252,0.2)',
    borderRadius: 99,
    height: 4,
    marginBottom: 13,
    width: 38,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sheetIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetScrollContent: {
    gap: 16,
    paddingBottom: 4,
  },
  sheetTitle: {
    color: TOGETHER_BRAND.paper,
    fontFamily: 'SchibstedGrotesk_700Bold',
    fontSize: 20,
    letterSpacing: -0.35,
  },
  sheetTitleBlock: {
    gap: 1,
  },
  subtitle: {
    color: TOGETHER_BRAND.muted,
    fontFamily: 'SchibstedGrotesk_500Medium',
    fontSize: 15.5,
    lineHeight: 22,
    maxWidth: 325,
    textAlign: 'center',
  },
  title: {
    color: TOGETHER_BRAND.paper,
    fontFamily: 'SchibstedGrotesk_700Bold',
    fontSize: 38,
    letterSpacing: -1.35,
    lineHeight: 43,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 34,
    lineHeight: 39,
  },
});
