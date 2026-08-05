import type { AuthService } from '../types';
import { firebaseAuthService } from './firebaseAuthService';

/**
 * The single Auth integration point for the whole app. Everything else imports
 * `authService` (never a concrete implementation), so the backend is swapped in
 * one place.
 *
 * There is one backend: Firebase. The dev build talks to the local Emulator
 * Suite, production to the cloud project — same code, different endpoint
 * (see docs/backend-plan.md).
 */
export const authService: AuthService = firebaseAuthService;
