import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { TogetherLoader } from '@/shared/components';
import { FONT, TYPE } from '@/shared/theme';
import { haptics } from '@/shared/utils/haptics';

import type { SignInWithEmailInput } from '../types';
import { suggestEmailCorrection } from '../utils/emailTypo';
import { evaluatePassword, PASSWORD_MIN_LENGTH } from '../utils/passwordStrength';
import { AuthModeSwitch } from './AuthModeSwitch';
import { FloatingLabelField } from './FloatingLabelField';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const COLORS = {
  paper: '#F4F5F7',
  muted: 'rgba(244,245,247,0.55)',
  soft: 'rgba(244,245,247,0.78)',
  fieldBorder: 'rgba(244,245,247,0.12)',
  panel: 'rgba(20,25,33,0.6)',
  action: '#8991FF',
  now: '#41C08D',
  ink: '#0E1116',
  error: '#FCA5A5',
};

export type AuthFormMode = 'login' | 'signup';

type FieldName = 'email' | 'username' | 'password';
type FieldErrors = Partial<Record<FieldName, string>>;

interface EmailAuthFormProps {
  mode: AuthFormMode;
  onSubmit: (input: SignInWithEmailInput) => Promise<void> | void;
  onResetPassword: (email: string) => Promise<void>;
  /** When provided, the form owns the Einloggen/Registrieren switch. */
  onModeChange?: (mode: AuthFormMode) => void;
  submitting?: boolean;
  error?: string | null;
  autoFocusEmail?: boolean;
  accent?: string;
}

export function EmailAuthForm({
  mode,
  onSubmit,
  onResetPassword,
  onModeChange,
  submitting = false,
  error,
  autoFocusEmail = false,
  accent = COLORS.action,
}: EmailAuthFormProps) {
  const reducedMotion = useReducedMotion();
  const shake = useSharedValue(0);

  const usernameRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [resetOpen, setResetOpen] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const resetInFlightRef = useRef(false);

  const isSignup = mode === 'signup';

  const runShake = useCallback(() => {
    if (reducedMotion) return;
    shake.value = withSequence(
      withTiming(-8, { duration: 58 }),
      withTiming(8, { duration: 58 }),
      withTiming(-5, { duration: 52 }),
      withTiming(0, { duration: 52 }),
    );
  }, [reducedMotion, shake]);

  useEffect(() => {
    setFieldErrors({});
    setTouched({});
    setResetError(null);
    setResetSent(false);
    if (isSignup) setResetOpen(false);
  }, [isSignup]);

  // A rejection from the backend deserves the same physical "no" as a local one.
  useEffect(() => {
    if (!error) return;
    runShake();
    haptics.warning();
  }, [error, runShake]);

  const validate = useCallback(
    (field: FieldName, values: { email: string; username: string; password: string }) => {
      if (field === 'email') {
        if (!values.email.trim()) return 'Bitte gib deine E-Mail-Adresse ein.';
        if (!EMAIL_RE.test(values.email.trim()))
          return 'Diese E-Mail-Adresse sieht nicht gültig aus.';
        return undefined;
      }
      if (field === 'username') {
        if (!isSignup) return undefined;
        const trimmed = values.username.trim();
        if (trimmed.length < 2) return 'Bitte einen Namen mit mindestens 2 Zeichen.';
        if (trimmed.length > 50) return 'Der Name darf höchstens 50 Zeichen haben.';
        return undefined;
      }
      if (!values.password) return 'Bitte gib dein Passwort ein.';
      // Login never re-judges an existing password — an old 6-character one is
      // still valid; only new passwords have to meet the current rule.
      if (isSignup && !evaluatePassword(values.password).acceptable) {
        return `Bitte mindestens ${PASSWORD_MIN_LENGTH} Zeichen, nicht zu leicht zu erraten.`;
      }
      return undefined;
    },
    [isSignup],
  );

  const values = { email, username, password };

  const markTouched = (field: FieldName) => {
    setTouched((current) => ({ ...current, [field]: true }));
    setFieldErrors((current) => ({ ...current, [field]: validate(field, values) }));
  };

  /** Typing clears the complaint immediately — errors are never sticky. */
  const changeField = (field: FieldName, next: string) => {
    if (field === 'email') setEmail(next);
    if (field === 'username') setUsername(next);
    if (field === 'password') setPassword(next);
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const handleSubmit = () => {
    if (submitting) return;
    const next: FieldErrors = {
      email: validate('email', values),
      username: validate('username', values),
      password: validate('password', values),
    };
    setFieldErrors(next);
    setTouched({ email: true, username: isSignup, password: true });

    const firstBroken = (['email', 'username', 'password'] as const).find((field) => next[field]);
    if (firstBroken) {
      runShake();
      haptics.warning();
      if (firstBroken === 'username') usernameRef.current?.focus();
      if (firstBroken === 'password') passwordRef.current?.focus();
      return;
    }

    void onSubmit({
      mode,
      email: email.trim(),
      username: username.trim(),
      password,
    });
  };

  const handleResetPassword = async () => {
    if (resetInFlightRef.current) return;
    const normalizedEmail = email.trim();
    if (!EMAIL_RE.test(normalizedEmail)) {
      setResetSent(false);
      setResetError('Bitte gib oben deine E-Mail ein.');
      return;
    }
    resetInFlightRef.current = true;
    setResetError(null);
    setResetBusy(true);
    try {
      await onResetPassword(normalizedEmail);
      setResetSent(true);
      haptics.success();
    } catch (err) {
      setResetError(
        err instanceof Error
          ? err.message
          : 'Der Link konnte gerade nicht gesendet werden. Bitte versuche es erneut.',
      );
    } finally {
      resetInFlightRef.current = false;
      setResetBusy(false);
    }
  };

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const buttonLabel = isSignup ? 'Account erstellen' : 'Einloggen';
  const resetMessage = resetError
    ? resetError
    : resetSent
      ? 'Wenn ein Konto existiert, erhältst du einen Link zum Zurücksetzen.'
      : 'Gib oben deine E-Mail ein. Wir senden dir einen sicheren Link.';

  const emailValid = touched.email && !fieldErrors.email && email.trim().length > 0;
  // Only offered once the address is otherwise plausible, so it never fires
  // mid-typing while the domain is still incomplete.
  const emailSuggestion =
    EMAIL_RE.test(email.trim()) && !fieldErrors.email ? suggestEmailCorrection(email) : null;

  return (
    <Animated.View
      layout={reducedMotion ? undefined : LinearTransition.duration(220)}
      style={[styles.container, shakeStyle]}
    >
      {onModeChange ? (
        <AuthModeSwitch mode={mode} disabled={submitting} onChange={onModeChange} />
      ) : null}

      <FloatingLabelField
        label="E-Mail-Adresse"
        icon="mail-outline"
        accent={accent}
        value={email}
        onChangeText={(next) => changeField('email', next)}
        onBlur={() => markTouched('email')}
        error={touched.email ? fieldErrors.email : undefined}
        valid={Boolean(emailValid)}
        autoFocus={autoFocusEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        importantForAutofill="yes"
        inputMode="email"
        keyboardType="email-address"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => (isSignup ? usernameRef : passwordRef).current?.focus()}
        editable={!submitting}
        accessibilityLabel="E-Mail-Adresse"
      />

      {/* A mistyped domain is silently fatal: the account is created, the
          verification link goes nowhere, and nothing explains why. One tap
          fixes it — a suggestion, never a restriction. */}
      {emailSuggestion ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`E-Mail-Adresse zu ${emailSuggestion} korrigieren`}
          className="-mt-1 flex-row items-center gap-2 px-1 py-1.5 active:opacity-70"
          onPress={() => {
            changeField('email', emailSuggestion);
            haptics.selection();
          }}
        >
          <Ionicons name="bulb-outline" size={14} color="#E0A23E" />
          <Text style={styles.suggestionText}>
            Meintest du <Text style={styles.suggestionStrong}>{emailSuggestion}</Text>?
          </Text>
        </Pressable>
      ) : null}

      {isSignup ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeInDown.duration(220)}
          exiting={reducedMotion ? undefined : FadeOut.duration(120)}
        >
          <FloatingLabelField
            label="Dein Name"
            icon="person-outline"
            accent={accent}
            inputRef={usernameRef}
            value={username}
            onChangeText={(next) => changeField('username', next)}
            onBlur={() => markTouched('username')}
            error={touched.username ? fieldErrors.username : undefined}
            hint="So sehen dich deine Freunde."
            autoCapitalize="words"
            // Autocorrect off (the email field already does this): with it on,
            // iOS shows the QuickType bar and repopulates it on every
            // keystroke, which jitters the whole keyboard. Names are exactly
            // the content autocorrect should never touch. `textContentType`
            // stays so autofill still offers the user's own name — autofill
            // and autocorrect are independent.
            autoCorrect={false}
            spellCheck={false}
            autoComplete="name"
            textContentType="name"
            importantForAutofill="yes"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!submitting}
            accessibilityLabel="Name"
          />
        </Animated.View>
      ) : null}

      <View>
        <FloatingLabelField
          label="Passwort"
          icon="lock-closed-outline"
          accent={accent}
          inputRef={passwordRef}
          value={password}
          onChangeText={(next) => changeField('password', next)}
          onBlur={() => markTouched('password')}
          error={touched.password ? fieldErrors.password : undefined}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          textContentType={isSignup ? 'newPassword' : 'password'}
          passwordRules={
            isSignup ? `minlength: ${PASSWORD_MIN_LENGTH}; allowed: unicode;` : undefined
          }
          importantForAutofill="yes"
          secureTextEntry={!passwordVisible}
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          editable={!submitting}
          accessibilityLabel="Passwort"
          rightSlot={
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
          }
        />
        {isSignup ? <PasswordStrengthMeter password={password} /> : null}
      </View>

      {!isSignup ? (
        <Pressable
          accessibilityLabel="Passwort zurücksetzen"
          accessibilityRole="button"
          accessibilityState={{ expanded: resetOpen }}
          disabled={submitting}
          hitSlop={8}
          onPress={() => {
            setResetOpen((current) => !current);
            setResetError(null);
            setResetSent(false);
          }}
          style={({ pressed }) => [styles.forgotButton, pressed ? styles.pressedSoft : null]}
        >
          <Text style={styles.forgotLabel}>Passwort vergessen?</Text>
        </Pressable>
      ) : null}

      {resetOpen && !isSignup ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeInDown.duration(220)}
          exiting={reducedMotion ? undefined : FadeOut.duration(130)}
          style={styles.resetPanel}
        >
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
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.resetText, resetError ? styles.resetErrorText : null]}
              >
                {resetMessage}
              </Text>
            </View>
          </View>

          <View style={styles.resetActions}>
            <Pressable
              accessibilityLabel="Zurücksetzen schließen"
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => setResetOpen(false)}
              style={({ pressed }) => [styles.resetSecondary, pressed ? styles.pressedSoft : null]}
            >
              <Text style={styles.resetSecondaryLabel}>
                {resetSent ? 'Schließen' : 'Abbrechen'}
              </Text>
            </Pressable>

            {!resetSent ? (
              <Pressable
                accessibilityLabel="Link zum Zurücksetzen senden"
                accessibilityRole="button"
                accessibilityState={{ busy: resetBusy }}
                disabled={submitting || resetBusy}
                onPress={handleResetPassword}
                style={({ pressed }) => [styles.resetPrimary, pressed ? styles.pressed : null]}
              >
                <Text style={styles.resetPrimaryLabel}>
                  {resetBusy ? 'Sende …' : 'Link senden'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}

      {error ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(180)}
          exiting={reducedMotion ? undefined : FadeOut.duration(120)}
          style={styles.errorChip}
        >
          <Ionicons name="alert-circle" size={15} color={COLORS.error} />
          <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        </Animated.View>
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
        {/* Fine top light edge — the premium cue. */}
        <View pointerEvents="none" style={styles.submitSheen} />
        {submitting ? <TogetherLoader size={24} /> : null}
        <Text style={styles.submitLabel}>{buttonLabel}</Text>
        {!submitting ? <Ionicons name="arrow-forward" size={18} color={COLORS.ink} /> : null}
      </Pressable>

      {isSignup ? (
        <Text style={styles.verifyHint}>
          Wir schicken dir eine kurze Bestätigungs-Mail an diese Adresse.
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  disabled: {
    opacity: 0.72,
  },
  suggestionStrong: {
    color: '#E0A23E',
    fontFamily: FONT.bold,
  },
  suggestionText: {
    color: 'rgba(244,245,247,0.6)',
    flex: 1,
    fontFamily: FONT.medium,
    ...TYPE.caption,
  },
  error: {
    color: COLORS.error,
    flex: 1,
    fontFamily: FONT.medium,
    ...TYPE.caption,
  },
  errorChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(252,165,165,0.1)',
    borderColor: 'rgba(252,165,165,0.26)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    justifyContent: 'center',
    marginTop: -6,
    minHeight: 30,
    paddingHorizontal: 4,
  },
  forgotLabel: {
    color: COLORS.soft,
    fontFamily: FONT.semibold,
    ...TYPE.label,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  pressedSoft: {
    opacity: 0.7,
  },
  resetActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  resetCopy: {
    flex: 1,
    gap: 4,
  },
  resetErrorText: {
    color: COLORS.error,
  },
  resetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  resetIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(244,245,247,0.12)',
    borderColor: COLORS.fieldBorder,
    borderRadius: 12,
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
    gap: 16,
    padding: 16,
  },
  resetPrimary: {
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 16,
  },
  resetPrimaryLabel: {
    color: COLORS.ink,
    fontFamily: FONT.bold,
    ...TYPE.label,
  },
  resetSecondary: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  resetSecondaryLabel: {
    color: COLORS.soft,
    fontFamily: FONT.semibold,
    ...TYPE.label,
  },
  resetText: {
    color: COLORS.muted,
    fontFamily: FONT.medium,
    ...TYPE.caption,
  },
  resetTitle: {
    color: COLORS.paper,
    fontFamily: FONT.bold,
    ...TYPE.label,
  },
  submit: {
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    borderRadius: 20,
    elevation: 6,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 56,
    overflow: 'hidden',
    paddingHorizontal: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  submitLabel: {
    color: COLORS.ink,
    fontFamily: FONT.bold,
    ...TYPE.body,
  },
  submitSheen: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 1,
    height: 1.5,
    left: 18,
    position: 'absolute',
    right: 18,
    top: 1,
  },
  verifyHint: {
    color: 'rgba(244,245,247,0.42)',
    fontFamily: FONT.medium,
    ...TYPE.micro,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
});
