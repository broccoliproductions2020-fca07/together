import { BACKEND } from '@/shared/services/firebase';

import { firebasePresenceService } from './firebasePresenceService';
import { mockPresenceService } from './mockPresenceService';
import type { PresenceService } from './presenceService.types';

export const presenceService: PresenceService =
  BACKEND === 'firebase' ? firebasePresenceService : mockPresenceService;
