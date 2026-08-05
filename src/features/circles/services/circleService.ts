import { firebaseCircleService } from './firebaseCircleService';
import type { CircleService } from './circleService.types';

/**
 * The single circle integration point (service-seam pattern, see AGENTS.md).
 * There is one backend: Firebase. Dev talks to the local Emulator Suite,
 * production to the cloud project — same code, different endpoint.
 */
export const circleService: CircleService = firebaseCircleService;
