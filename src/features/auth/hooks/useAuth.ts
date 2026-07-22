import { useContext } from 'react';

import { AuthContext } from '../AuthProvider';
import type { AuthProviderValue } from '../types';

/**
 * Access the auth context. Throws a clear error if used outside `<AuthProvider>`.
 */
export function useAuth(): AuthProviderValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth() must be used within an <AuthProvider>.');
  }
  return context;
}
