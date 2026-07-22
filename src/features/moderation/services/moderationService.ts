import { BACKEND } from '@/shared/services/firebase';

import { firebaseModerationService } from './firebaseModerationService';
import { mockModerationService } from './mockModerationService';
import type { ModerationService } from './moderationService.types';

export const moderationService: ModerationService =
  BACKEND === 'firebase' ? firebaseModerationService : mockModerationService;
