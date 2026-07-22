import { useContext } from 'react';

import { ChatContext } from './ChatProvider';

export function useActivityChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useActivityChat must be used within ChatProvider');
  return ctx;
}
