export { AuthProvider } from './AuthProvider';
export { useAuth } from './hooks/useAuth';
export { AuthScreen } from './AuthScreen';
export { EmailVerificationGate } from './EmailVerificationGate';
export { ProfileEditSheet } from './components/ProfileEditSheet';
export { authService } from './services/authService';
export type {
  AuthUser,
  AuthSession,
  AuthStatus,
  AuthState,
  AuthProviderValue,
  SignInWithEmailInput,
  UpdateProfileInput,
  AuthService,
} from './types';
