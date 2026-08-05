import { firebaseJourneyService } from './firebaseJourneyService';
import type { JourneyService } from './journeyService.types';

export const journeyService: JourneyService = firebaseJourneyService;
