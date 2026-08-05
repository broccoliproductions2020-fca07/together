import { firebaseChatService } from './firebaseChatService';
import type { ChatService } from './chatService.types';

/**
 * The single chat integration point (service-seam pattern, see AGENTS.md).
 * There is one backend: Firebase. Dev talks to the local Emulator Suite,
 * production to the cloud project — same code, different endpoint.
 */
export const chatService: ChatService = firebaseChatService;
