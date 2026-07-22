import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { TogetherLoader } from '@/shared/components';

import type { SignInWithEmailInput } from '../types';
import { GlassField } from './GlassField';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const COLORS = {
  paper: '#F4F5F7',
  muted: 'rgba(244,245,247,0.6)',
  soft: 'rgba(244,245,247,0.78)',
  field: 'rgba(23,28,35,0.72)',
  fieldBorder: 'rgba(244,245,247,0.13)',
  panel: 'rgba(23,28,35,0.58)',
  action: '#6E8BF7',
  now: '#41C08D',
  ink: '#0E1116',
  error: '#FCA5A5',
};

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export type AuthFormMode = 'login' | 'signup';

interface EmailAuthFormProps {
  mode: AuthFormMode;
  onSubmit: (input: SignInWithEmailInput) => Promise<void> | void;
  onResetPassword: (email: string) => Promise<void>;
  submitting?: boolean;
  error?: string | null;
  /** Focus the e-mail field on mount (sheet opens → keyboard comes right up). */
  autoFocusEmail?: boolean;
  /** Optional brand accent. Legacy auth keeps the original blue by default. */
  accent?: string;
}

export function EmailAuthForm({
  mode,
  onSubmit,
  onResetPassword,
  submitting = false,
  error,
  autoFocusEmail = false,
  accent = COLORS.action,
}: EmailAuthFormProps) {
  const reducedMotion = useReducedMotion();
  const nameProgress = useSharedValue(mode === 'signup' ? 1 : 0);
  const resetProgress = useSharedValue(0);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'name' | 'password' | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    setFieldError(null);
    setResetError(null);
    setResetSent(false);
    if (mode === 'signup') {
      setResetOpen(false);
    }
    nameProgress.value = reducedMotion
      ? mode === 'signup'
        ? 1
        : 0
      : withTiming(mode === 'signup' ? 1 : 0, { duration: 240, easing: EASE });
  }, [mode, nameProgress, reducedMotion]);

  useEffect(() => {
    const open = resetOpen && mode === 'login';
    resetProgress.value = reducedMotion
      ? open
        ? 1
        : 0
      : withTiming(open ? 1 : 0, { duration: 220, easing: EASE });
  }, [mode, reducedMotion, resetOpen, resetProgress]);

  const nameStyle = useAnimatedStyle(() => ({
    height: interpolate(nameProgress.value, [0, 1], [0, 58]),
    marginBottom: interpolate(nameProgress.value, [0, 1], [0, 14]),
    opacity: nameProgress.value,
    transform: [
      { translateY: interpolate(nameProgress.value, [0, 1], [-8, 0]) },
      { scale: interpolate(nameProgress.value, [0, 1], [0.985, 1]) },
    ],
  }));

  const resetStyle = useAnimatedStyle(() => ({
    height: interpolate(resetProgress.value, [0, 1], [0, 132]),
    marginTop: interpolate(resetProgress.value, [0, 1], [0, 2]),
    opacity: resetProgress.value,
    transform: [
      { translateY: interpolate(resetProgress.value, [0, 1], [-8, 0]) },
      { scale: interpolate(resetProgress.value, [0, 1], [0.985, 1]) },
    ],
  }));

  const handleSubmit = () => {
    const normalizedEmail = email.trim();
    const normalizedUsername = username.trim();

    if (mode === 'login') {
      const fallbackEmail = normalizedEmail || 'demo@together.app';
      setFieldError(null);
      void onSubmit({
        email: fallbackEmail,
        username: fallbackEmail.split('@')[0] || 'demo',
        password: password || 'password',
      });
      return;
    }

    if (!EMAIL_RE.test(normalizedEmail)) {
      setFieldError('Bitte eine gültige E-Mail eingeben.');
      return;
    }

    if (mode === 'signup' && normalizedUsername.length < 2) {
      setFieldError('Bitte einen Namen mit mindestens 2 Zeichen wählen.');
      return;
    }

    if (password.length < 6) {
      setFieldError('Das Passwort braucht mindestens 6 Zeichen.');
      return;
    }

    const fallbackUsername = normalizedEmail.split('@')[0] || 'friend';

    setFieldError(null);
    void onSubmit({
      email: normalizedEmail,
      username: mode === 'signup' ? normalizedUsername : fallbackUsername,
      password,
    });
  };

  const handleResetPassword = async () => {
    const normalizedEmail = email.trim();

    if (!EMAIL_RE.test(normalizedEmail)) {
      setResetSent(false);
      setResetError('Bitte gib oben deine E-Mail ein.');
      return;
    }

    setResetError(null);
    setResetBusy(true);
    try {
      await onResetPassword(normalizedEmail);
      setResetSent(true);
    } catch (error) {
      setResetError(
        error instanceof Error
          ? error.message
          : 'Der Link konnte gerade nicht gesendet werden. Bitte versuche es erneut.',
      );
    } finally {
      setResetBusy(false);
    }
  };

  const handleToggleReset = () => {
    setResetOpen((current) => !current);
    setResetError(null);
    setResetSent(false);
  };

  const shownError = fieldError ?? error ?? null;
  const buttonLabel = mode === 'signup' ? 'Account erstellen' : 'Einloggen';
  const resetMessage = resetError
    ? resetError
    : resetSent
      ? 'Wenn ein Konto existiert, erhältst du einen Link zum Zurücksetzen.'
      : 'Gib oben deine E-Mail ein. Wir senden dir einen sicheren Link.';

  return (
    <View style={styles.container}>
      <GlassField accent={accent} focused={focusedField === 'email'}>
        <Ionicons
          name="mail-outline"
          size={20}
          color={focusedField === 'email' ? accent : COLORS.muted}
        />
        <TextInput
          accessibilityLabel="E-Mail"
          style={styles.input}
          placeholder="du@example.com"
          placeholderTextColor={COLORS.muted}
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocusedField('email')}
          onBlur={() => setFocusedField((f) => (f === 'email' ? null : f))}
          autoFocus={autoFocusEmail}
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          keyboardType="email-address"
          returnKeyType="next"
          editable={!submitting}
        />
      </GlassField>

      <Animated.View style={[styles.animatedFieldSlot, nameStyle]}>
        <GlassField accent={accent} focused={focusedField === 'name'}>
          <Ionicons
            name="person-outline"
            size={20}
            color={focusedField === 'name' ? accent : COLORS.muted}
          />
          <TextInput
            accessibilityLabel="Name"
            style={styles.input}
            placeholder="Dein Name"
            placeholderTextColor={COLORS.muted}
            value={username}
            onChangeText={setUsername}
            onFocus={() => setFocusedField('name')}
            onBlur={() => setFocusedField((f) => (f === 'name' ? null : f))}
            autoCapitalize="words"
            autoComplete="username"
            returnKeyType="next"
            editable={!submitting && mode === 'signup'}
          />
        </GlassField>
      </Animated.View>

      <GlassField accent={accent} focused={focusedField === 'password'}>
        <Ionicons
          name="lock-closed-outline"
          size={20}
          color={focusedField === 'password' ? accent : COLORS.muted}
        />
        <TextInput
          accessibilityLabel="Passwort"
          style={styles.input}
          placeholder="Passwort"
          placeholderTextColor={COLORS.muted}
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField((f) => (f === 'password' ? null : f))}
          autoCapitalize="none"
          autoComplete={mode === 'signup' ? 'new-password' : 'password'}
          secureTextEntry={!passwordVisible}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          editable={!submitting}
        />
        <Pressable
          accessibilityLabel={passwordVisible ? 'Passwort verbergen' : 'Passwort anzeigen'}
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => setPasswordVisible((current) => !current)}
          disabled={submitting}
        >
          <Ionicons
            name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
            size={21}
            color={COLORS.muted}
          />
        </Pressable>
      </GlassField>

      {mode === 'login' ? (
        <Pressable
          accessibilityLabel="Passwort zurücksetzen"
          accessibilityRole="button"
          disabled={submitting}
          hitSlop={8}
          onPress={handleToggleReset}
          style={({ pressed }) => [styles.forgotButton, pressed ? styles.forgotPressed : null]}
        >
          <Text style={styles.forgotLabel}>Passwort vergessen?</Text>
        </Pressable>
      ) : null}

      <Animated.View
        pointerEvents={resetOpen && mode === 'login' ? 'auto' : 'none'}
        style={[styles.resetSlot, resetStyle]}
      >
        <View style={styles.resetPanel}>
          <View style={styles.resetHeader}>
            <View style={[styles.resetIcon, resetSent ? styles.resetIconSuccess : null]}>
              <Ionicons
                name={resetSent ? 'checkmark-outline' : 'mail-unread-outline'}
                size={18}
                color={resetSent ? COLORS.ink : COLORS.paper}
              />
            </View>
            <View style={styles.resetCopy}>
              <Text style={styles.resetTitle}>
                {resetSent ? 'Link vorbereitet' : 'Passwort zurücksetzen'}
              </Text>
              <Text style={[styles.resetText, resetError ? styles.resetError : null]}>
                {resetMessage}
              </Text>
            </View>
          </View>

          <View style={styles.resetActions}>
            <Pressable
              accessibilityLabel="Passwort zurücksetzen schließen"
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => setResetOpen(false)}
              style={({ pressed }) => [
                styles.resetSecondary,
                pressed ? styles.forgotPressed : null,
              ]}
            >
              <Text style={styles.resetSecondaryLabel}>
                {resetSent ? 'Schließen' : 'Abbrechen'}
              </Text>
            </Pressable>

            {!resetSent ? (
              <Pressable
                accessibilityLabel="Link zum Zurücksetzen senden"
                accessibilityRole="button"
                disabled={submitting}
                onPress={handleResetPassword}
                style={({ pressed }) => [styles.resetPrimary, pressed ? styles.pressed : null]}
              >
                <Text style={styles.resetPrimaryLabel}>
                  {resetBusy ? 'Sende …' : 'Link senden'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Animated.View>

      {shownError ? (
        <View style={styles.errorChip}>
          <Ionicons name="alert-circle" size={15} color={COLORS.error} />
          <Text style={styles.error}>{shownError}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityLabel={buttonLabel}
        accessibilityRole="button"
        accessibilityState={{ busy: submitting, disabled: submitting }}
        disabled={submitting}
        onPress={handleSubmit}
        style={({ pressed }) => [
          styles.submit,
          submitting ? styles.disabled : null,
          pressed && !submitting ? styles.pressed : null,
        ]}
      >
        {submitting ? <TogetherLoader size={24} /> : null}
        <Text style={styles.submitLabel}>{buttonLabel}</Text>
        {!submitting ? <Ionicons name="arrow-forward" size={17} color={COLORS.ink} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  animatedFieldSlot: {
    overflow: 'hidden',
  },
  container: {
    gap: 14,
  },
  disabled: {
    opacity: 0.72,
  },
  error: {
    color: COLORS.error,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  errorChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(252,165,165,0.1)',
    borderColor: 'rgba(252,165,165,0.26)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    minHeight: 32,
    justifyContent: 'center',
    marginTop: -6,
    paddingHorizontal: 4,
  },
  forgotLabel: {
    color: COLORS.soft,
    fontSize: 14,
    fontWeight: '600',
  },
  forgotPressed: {
    opacity: 0.72,
  },
  input: {
    color: COLORS.paper,
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  resetActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  resetCopy: {
    flex: 1,
    gap: 3,
  },
  resetError: {
    color: COLORS.error,
  },
  resetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 11,
  },
  resetIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(244,245,247,0.12)',
    borderColor: COLORS.fieldBorder,
    borderRadius: 14,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  resetIconSuccess: {
    backgroundColor: COLORS.now,
    borderColor: 'rgba(65,192,141,0.34)',
  },
  resetPanel: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.fieldBorder,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  resetPrimary: {
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 15,
  },
  resetPrimaryLabel: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  resetSecondary: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  resetSecondaryLabel: {
    color: COLORS.soft,
    fontSize: 14,
    fontWeight: '600',
  },
  resetSlot: {
    overflow: 'hidden',
  },
  resetText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  resetTitle: {
    color: COLORS.paper,
    fontSize: 14,
    fontWeight: '700',
  },
  submit: {
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    borderRadius: 22,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 20,
  },
  submitLabel: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '700',
  },
});
