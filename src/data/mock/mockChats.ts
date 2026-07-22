import type { ChatMessage } from '@/features/chat/types';

/**
 * Seed messages per activity room, keyed by the activity/selection id
 * (`MapMarker.id` for avatars, `MarkerCluster.id` for clusters).
 *
 * Mock only — no backend. Sending a message appends to in-memory state in the
 * ChatProvider; these seeds give each room some life on first open.
 */
const HOUR = 60 * 60 * 1000;
const now = Date.now();

export const mockActivityChats: Record<string, ChatMessage[]> = {
  'marker-max-nearby': [
    {
      id: 'm-max-1',
      activityId: 'marker-max-nearby',
      authorId: 'u_max',
      authorName: 'Max',
      initials: 'M',
      text: 'Bin ab 18 Uhr am Biergarten 🍻',
      createdAt: now - 2 * HOUR,
      isMe: false,
    },
    {
      id: 'm-max-2',
      activityId: 'marker-max-nearby',
      authorId: 'u_lina',
      authorName: 'Lina',
      initials: 'L',
      text: 'Perfekt, ich komme dazu!',
      createdAt: now - 1.5 * HOUR,
      isMe: false,
    },
  ],
  'marker-lisa-nearby': [
    {
      id: 'm-lisa-1',
      activityId: 'marker-lisa-nearby',
      authorId: 'u_lisa_bock',
      authorName: 'Lisa Bock',
      initials: 'LB',
      text: 'Hat jemand Lust auf was zu essen vorher?',
      createdAt: now - 40 * 60 * 1000,
      isMe: false,
    },
  ],
};

/** Rooms that have no seed yet start empty — the chat still works. */
export function getMockChatMessages(activityId: string): ChatMessage[] {
  return mockActivityChats[activityId] ?? [];
}
