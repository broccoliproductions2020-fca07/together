import { BACKEND } from '@/shared/services/firebase';

import { firebaseNotificationService } from './firebaseNotificationService';
import { mockNotificationService } from './mockNotificationService';
import type { NotificationService } from './notificationService.types';

export const notificationService: NotificationService =
  BACKEND === 'firebase' ? firebaseNotificationService : mockNotificationService;
