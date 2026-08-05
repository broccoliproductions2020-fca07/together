import { firebaseNotificationService } from './firebaseNotificationService';
import type { NotificationService } from './notificationService.types';

export const notificationService: NotificationService = firebaseNotificationService;
