import { firebaseFriendService } from './firebaseFriendService';
import type { FriendService } from './friendService.types';

/** Single switch point for the friendship domain. */
export const friendService: FriendService = firebaseFriendService;
