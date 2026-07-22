import { useContext } from 'react';

import { ChatActivityContext } from './ChatProvider';

/** Activity/map chat state without the active message-stream subscription. */
export function useActivityChatActivity() {
  const ctx = useContext(ChatActivityContext);
  if (!ctx) throw new Error('useActivityChatActivity must be used within ChatProvider');
  return ctx;
}
