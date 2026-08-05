import { firebaseActivityService } from './firebaseActivityService';
import type { ActivityService } from './activityService.types';

/**
 * The single activity integration point (service-seam pattern, see AGENTS.md).
 * There is one backend: Firebase. Dev talks to the local Emulator Suite,
 * production to the cloud project — same code, different endpoint.
 */
export const activityService: ActivityService = firebaseActivityService;
