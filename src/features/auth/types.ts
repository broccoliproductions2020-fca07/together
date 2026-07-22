/**
 * Auth domain types. Kept backend-agnostic on purpose: the same shapes work for
 * the local mock fallback and the Firebase production implementation.
 */

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
  /** Opaque access token. A mock string today; a real JWT later. */
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
  email: string;
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
  signInDemo(): Promise<AuthSession>;
  signInWithEmail(input: SignInWithEmailInput): Promise<AuthSession>;
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
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  sendEmailVerification: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}
