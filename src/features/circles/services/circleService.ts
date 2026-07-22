import { BACKEND } from '@/shared/services/firebase';

import { firebaseCircleService } from './firebaseCircleService';
import { mockCircleService } from './mockCircleService';
import type { CircleService } from './circleService.types';

/**
 * The single circle integration point (service-seam pattern, see AGENTS.md).
 * Selection via EXPO_PUBLIC_BACKEND: mock (offline default) | firebase.
 */
export const circleService: CircleService =
  BACKEND === 'firebase' ? firebaseCircleService : mockCircleService;
