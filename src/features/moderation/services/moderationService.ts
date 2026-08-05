import { firebaseModerationService } from './firebaseModerationService';
import type { ModerationService } from './moderationService.types';

export const moderationService: ModerationService = firebaseModerationService;
