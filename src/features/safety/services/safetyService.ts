import { BACKEND } from '@/shared/services/firebase';

import { mockSafetyService } from './mockSafetyService';
import { rtdbSafetyService } from './rtdbSafetyService';
import type { SafetyService } from './safetyService.types';

/**
 * The single safety integration point (service-seam pattern, see AGENTS.md).
 * Selection via EXPO_PUBLIC_BACKEND: mock (offline default) | firebase (RTDB).
 */
export const safetyService: SafetyService =
  BACKEND === 'firebase' ? rtdbSafetyService : mockSafetyService;
