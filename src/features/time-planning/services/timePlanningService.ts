import { firebaseTimePlanningService } from './firebaseTimePlanningService';
import type { TimePlanningService } from './timePlanningService.types';

/** One Firebase-backed seam; planning never writes directly from a component. */
export const timePlanningService: TimePlanningService = firebaseTimePlanningService;
