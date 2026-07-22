import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { authService } from './services/authService';
import type {
  AuthProviderValue,
  AuthSession,
  AuthStatus,
  SignInWithEmailInput,
  UpdateProfileInput,
} from './types';

export const AuthContext = createContext<AuthProviderValue | null>(null);

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

    authService
      .getCurrentSession()
      .then((restored) => {
        finishRestore(restored);
      })
      .catch(() => {
        finishRestore(null);
      });
    return () => {
      active = false;
      clearTimeout(restoreTimeout);
    };
  }, []);

  const runSignIn = useCallback(async (action: () => Promise<AuthSession>) => {
    setError(null);
    try {
      const next = await action();
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

  const deleteAccount = useCallback(async () => {
    setError(null);
    await authService.deleteAccount();
    setSession(null);
    setStatus('unauthenticated');
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await authService.signOut();
    } finally {
      setSession(null);
      setStatus('unauthenticated');
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
      resetPassword,
      updateProfile,
      sendEmailVerification,
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
      resetPassword,
      updateProfile,
      sendEmailVerification,
      deleteAccount,
      signOut,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
