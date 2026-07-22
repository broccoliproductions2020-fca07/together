import { BACKEND } from '@/shared/services/firebase';

import { firebaseActivityService } from './firebaseActivityService';
import { mockActivityService } from './mockActivityService';
import type { ActivityService } from './activityService.types';

/**
 * The single activity integration point (service-seam pattern, see AGENTS.md).
 * Selection via EXPO_PUBLIC_BACKEND: mock (offline default) | firebase.
 */
export const activityService: ActivityService =
  BACKEND === 'firebase' ? firebaseActivityService : mockActivityService;
