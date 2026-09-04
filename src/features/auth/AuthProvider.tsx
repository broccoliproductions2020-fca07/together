import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { stopJourneyBeforeAccountExit } from '@/features/journey/journeyBackground';

import { authService } from './services/authService';
import type {
  AuthProviderValue,
  AuthSession,
  AuthStatus,
  SignInWithEmailInput,
  UpdateProfileInput,
} from './types';

export const AuthContext = createContext<AuthProviderValue | null>(null);

// iOS intentionally preserves the native Firebase session in Keychain after an
// app is deleted. AsyncStorage is removed with the app, so this marker lets a
// genuinely fresh staging install begin at the login screen instead of inheriting
// a stale test account from a previous installation.
const INSTALL_MARKER_KEY = 'together.auth.installed.v1';

function toMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Etwas ist schiefgelaufen. Bitte erneut versuchen.';
}

/**
 * Owns the auth state (session / status / error) and exposes the auth actions.
 * No UI lives here. It restores any existing session on mount via the
 * `authService` contract.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let settled = false;

    const finishRestore = (restored: AuthSession | null) => {
      if (!active || settled) return;
      settled = true;
      setSession(restored);
      setStatus(restored ? 'authenticated' : 'unauthenticated');
    };

    // Native Auth can occasionally wait indefinitely during an emulator
    // reconnect. The login screen must remain reachable even then; a manual
    // sign-in still establishes the authoritative session afterwards.
    const restoreTimeout = setTimeout(() => finishRestore(null), 6_000);

    void (async () => {
      try {
        const [installedBefore, restored] = await Promise.all([
          AsyncStorage.getItem(INSTALL_MARKER_KEY),
          authService.getCurrentSession(),
        ]);
        if (!active) return;

        if (!installedBefore) {
          if (restored) await authService.signOut();
          await AsyncStorage.setItem(INSTALL_MARKER_KEY, '1').catch(() => {});
          finishRestore(null);
          return;
        }

        finishRestore(restored);
      } catch {
        finishRestore(null);
      }
    })();
    return () => {
      active = false;
      clearTimeout(restoreTimeout);
    };
  }, []);

  const runSignIn = useCallback(async (action: () => Promise<AuthSession | null>) => {
    setError(null);
    try {
      const next = await action();
      if (!next) return;
      setSession(next);
      setStatus('authenticated');
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  }, []);

  const signInDemo = useCallback(() => runSignIn(() => authService.signInDemo()), [runSignIn]);

  const signInWithEmail = useCallback(
    (input: SignInWithEmailInput) => runSignIn(() => authService.signInWithEmail(input)),
    [runSignIn],
  );

  const signInWithGoogle = useCallback(
    () => runSignIn(() => authService.signInWithGoogle()),
    [runSignIn],
  );

  const signInWithApple = useCallback(
    () => runSignIn(() => authService.signInWithApple()),
    [runSignIn],
  );

  const resetPassword = useCallback((email: string) => authService.resetPassword(email), []);

  const updateProfile = useCallback(async (input: UpdateProfileInput) => {
    setError(null);
    try {
      const next = await authService.updateProfile(input);
      setSession(next);
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  }, []);

  const sendEmailVerification = useCallback(() => authService.sendEmailVerification(), []);

  /** Used by the verification gate: reloads the account and reports whether the
   * address is confirmed now. Keeps the session (and its fresh token) in sync. */
  const refreshSession = useCallback(async () => {
    const refreshed = await authService.refreshSession();
    if (refreshed) setSession(refreshed);
    return refreshed?.user.emailVerified === true;
  }, []);

  const deleteAccount = useCallback(async () => {
    setError(null);
    await stopJourneyBeforeAccountExit();
    await authService.deleteAccount();
    setSession(null);
    setStatus('unauthenticated');
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await stopJourneyBeforeAccountExit();
      await authService.signOut();
      setSession(null);
      setStatus('unauthenticated');
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthProviderValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      error,
      signInDemo,
      signInWithEmail,
      signInWithGoogle,
      signInWithApple,
      resetPassword,
      updateProfile,
      sendEmailVerification,
      refreshSession,
      deleteAccount,
      signOut,
      clearError,
    }),
    [
      status,
      session,
      error,
      signInDemo,
      signInWithEmail,
      signInWithGoogle,
      signInWithApple,
      resetPassword,
      updateProfile,
      sendEmailVerification,
      refreshSession,
      deleteAccount,
      signOut,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
