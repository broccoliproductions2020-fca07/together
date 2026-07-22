import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  AuthService,
  AuthSession,
  AuthUser,
  SignInWithEmailInput,
  UpdateProfileInput,
} from '../types';

/**
 * Local, in-app mock implementation of {@link AuthService}.
 *
 * - No network, no backend, no real verification.
 * - The session is persisted with AsyncStorage so the user stays "logged in"
 *   across app restarts; if storage is unavailable it degrades gracefully to an
 *   in-memory session for the running app.
 */

const SESSION_STORAGE_KEY = 'together.auth.session.v1';
const MOCK_LATENCY_MS = 450;

/** Fallback session when AsyncStorage is not writable at runtime. */
let inMemorySession: AuthSession | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeSession(user: AuthUser): AuthSession {
  return { user, token: createId('mocktok'), createdAt: new Date().toISOString() };
}

function deriveDisplayName(username: string, email: string): string {
  const base = username.trim() || email.split('@')[0] || 'Friend';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

async function persist(session: AuthSession | null): Promise<void> {
  inMemorySession = session;
  try {
    if (session) {
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Best-effort: keep the in-memory session for this run.
  }
}

const DEMO_USER: AuthUser = {
  id: 'u_demo',
  email: 'demo@together.app',
  username: 'demo',
  displayName: 'Demo',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const mockAuthService: AuthService = {
  async getCurrentSession() {
    try {
      const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as AuthSession;
    } catch {
      // Fall through to the in-memory session.
    }
    return inMemorySession;
  },

  async signInDemo() {
    await delay(MOCK_LATENCY_MS);
    const session = makeSession(DEMO_USER);
    await persist(session);
    return session;
  },

  async signInWithEmail(input: SignInWithEmailInput) {
    await delay(MOCK_LATENCY_MS);
    const user: AuthUser = {
      id: createId('u'),
      email: input.email.trim().toLowerCase(),
      username: input.username.trim(),
      displayName: deriveDisplayName(input.username, input.email),
      createdAt: new Date().toISOString(),
    };
    const session = makeSession(user);
    await persist(session);
    return session;
  },

  async resetPassword(_email) {
    await delay(MOCK_LATENCY_MS);
  },

  async updateProfile(input: UpdateProfileInput) {
    const current = await this.getCurrentSession();
    if (!current) throw new Error('Nicht angemeldet.');
    const user = {
      ...current.user,
      displayName: input.displayName.trim(),
      avatarUrl: input.avatarUri ?? current.user.avatarUrl,
    };
    const session = makeSession(user);
    await persist(session);
    return session;
  },

  async sendEmailVerification() {
    await delay(MOCK_LATENCY_MS);
  },

  async deleteAccount() {
    await persist(null);
  },

  async signOut() {
    await delay(150);
    await persist(null);
  },
};
