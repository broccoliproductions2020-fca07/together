import { firebasePresenceService } from './firebasePresenceService';
import type { PresenceService } from './presenceService.types';

export const presenceService: PresenceService = firebasePresenceService;
