import { rtdbSafetyService } from './rtdbSafetyService';
import type { SafetyService } from './safetyService.types';

/**
 * The single safety integration point (service-seam pattern, see AGENTS.md).
 * There is one backend: Firebase. Dev talks to the local Emulator Suite,
 * production to the cloud project — same code, different endpoint.
 */
export const safetyService: SafetyService = rtdbSafetyService;
