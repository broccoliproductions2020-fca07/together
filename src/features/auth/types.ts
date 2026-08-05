/** Auth domain types shared by the UI and Firebase service. */

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  /** ISO 8601 */
  createdAt: string;
}

export interface AuthSession {
  user: AuthUser;
  /** Firebase ID token for the authenticated user. */
  token: string;
  /** ISO 8601 */
  createdAt: string;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  user: AuthUser | null;
  error: string | null;
}

export interface SignInWithEmailInput {
  /**
   * The user's explicit intent. Login and sign-up are separate operations:
   * a login must NEVER fall through to account creation (a typo in the address
   * would silently produce a second, empty account), and a sign-up must never
   * silently log into someone else's existing one.
   */
  mode: 'login' | 'signup';
  email: string;
  /** Display name — only used when `mode === 'signup'`. */
  username: string;
  password: string;
}

export interface UpdateProfileInput {
  displayName: string;
  /** Local image URI selected on-device; Firebase uploads it to Storage. */
  avatarUri?: string;
}

/**
 * The contract every auth backend must satisfy. This is the single seam that a
 * real provider plugs into — see `services/authService.ts`.
 */
export interface AuthService {
  getCurrentSession(): Promise<AuthSession | null>;
  /** Re-reads the account from the server so a just-clicked verification link
   * becomes visible without signing out. Returns null if nobody is signed in. */
  refreshSession(): Promise<AuthSession | null>;
  signInDemo(): Promise<AuthSession>;
  signInWithEmail(input: SignInWithEmailInput): Promise<AuthSession>;
  /** Resolves null when the person cancels the native provider sheet. */
  signInWithGoogle(): Promise<AuthSession | null>;
  /** Apple is available on supported iOS devices only. */
  signInWithApple(): Promise<AuthSession | null>;
  resetPassword(email: string): Promise<void>;
  updateProfile(input: UpdateProfileInput): Promise<AuthSession>;
  sendEmailVerification(): Promise<void>;
  deleteAccount(): Promise<void>;
  signOut(): Promise<void>;
}

/** What `useAuth()` exposes to the UI. */
export interface AuthProviderValue extends AuthState {
  signInDemo: () => Promise<void>;
  signInWithEmail: (input: SignInWithEmailInput) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  sendEmailVerification: () => Promise<void>;
  /** Reloads the account; resolves true once the e-mail is confirmed. */
  refreshSession: () => Promise<boolean>;
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}
