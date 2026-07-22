import { BACKEND } from '@/shared/services/firebase';

import { firebaseFriendService } from './firebaseFriendService';
import { mockFriendService } from './mockFriendService';
import type { FriendService } from './friendService.types';

/** Single switch point for the friendship domain. */
export const friendService: FriendService =
  BACKEND === 'firebase' ? firebaseFriendService : mockFriendService;
