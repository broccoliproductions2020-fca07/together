import { BACKEND } from '@/shared/services/firebase';

import { firebaseJourneyService } from './firebaseJourneyService';
import { mockJourneyService } from './mockJourneyService';
import type { JourneyService } from './journeyService.types';

export const journeyService: JourneyService =
  BACKEND === 'firebase' ? firebaseJourneyService : mockJourneyService;
