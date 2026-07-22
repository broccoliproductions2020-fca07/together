import { useContext } from 'react';

import { ThemePreferenceContext } from './ThemePreferenceProvider';
import type { ThemePreferenceValue } from './types';

export function useThemePreference(): ThemePreferenceValue {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    throw new Error('useThemePreference() must be used within a <ThemePreferenceProvider>.');
  }
  return context;
}
