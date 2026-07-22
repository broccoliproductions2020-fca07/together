import { BACKEND } from '@/shared/services/firebase';

import { firebaseChatService } from './firebaseChatService';
import { mockChatService } from './mockChatService';
import type { ChatService } from './chatService.types';

/**
 * The single chat integration point (service-seam pattern, see AGENTS.md).
 * Selection via EXPO_PUBLIC_BACKEND: mock (offline default) | firebase.
 */
export const chatService: ChatService =
  BACKEND === 'firebase' ? firebaseChatService : mockChatService;
