import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedLogo, AppScreen } from '@/shared/components';
import { LegacyTogetherLoader } from '@/shared/components/brand/LegacyTogetherLoader';

import { COLORS } from './colors';
import { authInteractionStyles } from './components/authInteractionStyles';
import { AuthModeSwitch } from './components/AuthModeSwitch';
import { AuroraBackdrop } from './components/AuroraBackdrop';
import { EmailAuthForm, type AuthFormMode } from './components/EmailAuthForm';
import { TrustRow } from './components/TrustRow';
import { useAuth } from './hooks/useAuth';
import type { SignInWithEmailInput } from './types';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export function AuthScreenLegacy() {
  const { signInWithEmail, signInDemo, resetPassword, error, clearError } = useAuth();
  const [mode, setMode] = useState<AuthFormMode>('login');
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const reducedMotion = useReducedMotion();

  const copyIn = useSharedValue(reducedMotion ? 1 : 0);
  const footerIn = useSharedValue(reducedMotion ? 1 : 0);
  const modeMotion = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      copyIn.value = 1;
      footerIn.value = 1;
      return;
    }

    // Timed to the logo assembly (~2.6s): the copy rises as the letters
    // settle, the actions follow once the period has landed — the whole
    // screen builds outward from the brand moment instead of appearing at once.
    copyIn.value = withDelay(1450, withTiming(1, { duration: 520, easing: EASE }));
    footerIn.value = withDelay(1950, withTiming(1, { duration: 520, easing: EASE }));
  }, [copyIn, footerIn, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      modeMotion.value = 1;
      return;
    }

    modeMotion.value = 0;
    modeMotion.value = withTiming(1, { duration: 180, easing: Easing.bezier(0.2, 0, 0, 1) });
  }, [mode, modeMotion, reducedMotion]);

  const copyStyle = useAnimatedStyle(() => ({
    opacity: copyIn.value,
    transform: [{ translateY: (1 - copyIn.value) * 14 }],
  }));

  const formStyle = useAnimatedStyle(() => ({
    opacity: modeMotion.value,
    transform: [
      { translateY: interpolate(modeMotion.value, [0, 1], [8, 0]) },
      { scale: interpolate(modeMotion.value, [0, 1], [0.996, 1]) },
    ],
  }));

  const footerStyle = useAnimatedStyle(() => ({
    opacity: footerIn.value,
    transform: [{ translateY: (1 - footerIn.value) * 18 }],
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
      // The auth context exposes the message for the form.
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuest = async () => {
    setGuestLoading(true);
    try {
      await signInDemo();
    } catch (err) {
      // Surface the reason in the dev log — a silently swallowed error here is
      // indistinguishable from a hang and made this very bug hard to diagnose.
      console.error('[auth] Gast-Login fehlgeschlagen:', err);
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <AppScreen className="bg-[#0B0E13]" contentClassName="px-6 py-7">
      <AuroraBackdrop />

      {/* Landing: pure brand stage — NO form fields on the first screen. */}
      <View style={styles.content}>
        <View style={styles.hero}>
          <AnimatedLogo idlePulse width={330} wordColor={COLORS.paper} />
          <Animated.View style={[styles.copy, copyStyle]}>
            <Text style={styles.title}>Deine Zeit,{'\n'}deine Gruppen.</Text>
            <Text style={styles.subtitle}>
              Sieh, welche deiner Freunde gerade oder später offen sind — ganz ohne Feed.
            </Text>
          </Animated.View>
        </View>

        <Animated.View style={[styles.actions, footerStyle]}>
          <Pressable
            accessibilityLabel="Weiter mit E-Mail"
            accessibilityRole="button"
            disabled={submitting || guestLoading}
            onPress={() => setFormOpen(true)}
            style={({ pressed }) => [
              styles.primaryAction,
              submitting || guestLoading ? authInteractionStyles.disabled : null,
              pressed && !(submitting || guestLoading) ? authInteractionStyles.pressed : null,
            ]}
          >
            <Ionicons name="mail-outline" size={19} color={COLORS.ink} />
            <Text style={styles.primaryActionLabel}>Weiter mit E-Mail</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Als Gast ansehen"
            accessibilityRole="button"
            disabled={submitting || guestLoading}
            onPress={handleGuest}
            style={({ pressed }) => [
              styles.guestButton,
              submitting || guestLoading ? authInteractionStyles.disabled : null,
              pressed && !(submitting || guestLoading) ? authInteractionStyles.pressed : null,
            ]}
          >
            {guestLoading ? (
              <LegacyTogetherLoader size={20} />
            ) : (
              <Ionicons name="person-circle-outline" size={19} color="rgba(244,245,247,0.85)" />
            )}
            <Text style={styles.guestLabel}>{guestLoading ? 'Moment …' : 'Als Gast ansehen'}</Text>
          </Pressable>

          <TrustRow />
        </Animated.View>
      </View>

      {/* The e-mail form lives in a bottom sheet, not on the landing screen. */}
      <Modal
        animationType="slide"
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        visible={formOpen}
        onRequestClose={() => setFormOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetRoot}
        >
          <Pressable
            accessibilityLabel="Formular schließen"
            accessibilityRole="button"
            onPress={() => setFormOpen(false)}
            style={styles.sheetBackdrop}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {mode === 'login' ? 'Willkommen zurück' : 'Erstelle deinen Account'}
              </Text>
              <Pressable
                accessibilityLabel="Schließen"
                accessibilityRole="button"
                onPress={() => setFormOpen(false)}
                style={({ pressed }) => [
                  styles.sheetClose,
                  pressed ? authInteractionStyles.pressed : null,
                ]}
              >
                <Ionicons name="close" size={20} color={COLORS.paper} />
              </Pressable>
            </View>

            <AuthModeSwitch
              mode={mode}
              disabled={submitting || guestLoading}
              onChange={handleModeChange}
            />
            <Animated.View style={formStyle}>
              <EmailAuthForm
                mode={mode}
                onSubmit={handleEmail}
                submitting={submitting}
                error={error}
                onResetPassword={resetPassword}
                autoFocusEmail
              />
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    paddingBottom: 6,
  },
  content: {
    flex: 1,
    gap: 28,
    justifyContent: 'flex-end',
  },
  copy: {
    gap: 12,
    maxWidth: 342,
  },
  guestButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(244,245,247,0.07)',
    borderColor: 'rgba(244,245,247,0.12)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 20,
  },
  guestLabel: {
    color: 'rgba(244,245,247,0.85)',
    fontFamily: 'SchibstedGrotesk_600SemiBold',
    fontSize: 16,
  },
  hero: {
    alignItems: 'flex-start',
    flex: 1,
    gap: 26,
    justifyContent: 'center',
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 20,
  },
  primaryActionLabel: {
    color: COLORS.ink,
    fontFamily: 'SchibstedGrotesk_700Bold',
    fontSize: 16,
  },
  sheet: {
    backgroundColor: '#12161C',
    borderColor: 'rgba(244,245,247,0.1)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    gap: 16,
    paddingBottom: 30,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    ...StyleSheet.absoluteFillObject,
  },
  sheetClose: {
    alignItems: 'center',
    backgroundColor: 'rgba(244,245,247,0.1)',
    borderRadius: 999,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(244,245,247,0.2)',
    borderRadius: 999,
    height: 5,
    marginBottom: 6,
    width: 44,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetTitle: {
    color: COLORS.paper,
    fontFamily: 'SchibstedGrotesk_700Bold',
    fontSize: 21,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: COLORS.muted,
    fontFamily: 'SchibstedGrotesk_500Medium',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'left',
  },
  title: {
    color: COLORS.paper,
    fontFamily: 'SchibstedGrotesk_700Bold',
    fontSize: 40,
    letterSpacing: -1.2,
    lineHeight: 46,
    textAlign: 'left',
  },
});
