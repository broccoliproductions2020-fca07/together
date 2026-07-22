import { BACKEND } from '@/shared/services/firebase';

import { firebasePlaceService } from './firebasePlaceService';
import { mockPlaceService } from './mockPlaceService';

export const placeService = BACKEND === 'firebase' ? firebasePlaceService : mockPlaceService;
