import { BACKEND } from '@/shared/services/firebase';

import type { AuthService } from '../types';
import { firebaseAuthService } from './firebaseAuthService';
import { mockAuthService } from './mockAuthService';

/**
 * The single Auth integration point for the whole app. Everything else imports
 * `authService` (never a concrete implementation), so the backend is swapped in
 * one place.
 *
 * Selection happens via `EXPO_PUBLIC_BACKEND` (see docs/backend-plan.md):
 *  - unset / `mock` → local mock, no network (default for development + web)
 *  - `firebase`     → Firebase Auth, in dev against the local Emulator Suite
 */
export const authService: AuthService =
  BACKEND === 'firebase' ? firebaseAuthService : mockAuthService;
