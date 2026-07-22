import type { ChatMessage } from '../types';

/**
 * Threads render from a single row model: day separators plus messages with
 * grouping metadata. A "group" is a run of one author's messages without a
 * larger time gap — the author label shows at the group start, the timestamp
 * and (for others) the avatar at the group end, WhatsApp-style.
 */
export type ChatListRow =
  | { type: 'day'; id: string; label: string }
  | {
      type: 'message';
      id: string;
      message: ChatMessage;
      showAuthor: boolean;
      isGroupEnd: boolean;
    };

const GROUP_GAP_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDayLabel(ms: number, now: number = Date.now()): string {
  const dayDiff = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS);
  if (dayDiff <= 0) return 'Heute';
  if (dayDiff === 1) return 'Gestern';
  const date = new Date(ms);
  if (dayDiff < 7) return date.toLocaleDateString('de-DE', { weekday: 'long' });
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** Messenger-list timestamp: HH:MM today, "Gestern", weekday, then date. */
export function formatListTimestamp(ms: number, now: number = Date.now()): string {
  const dayDiff = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS);
  if (dayDiff <= 0) return formatTime(ms);
  if (dayDiff === 1) return 'Gestern';
  if (dayDiff < 7) return new Date(ms).toLocaleDateString('de-DE', { weekday: 'short' });
  return new Date(ms).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

function breaksGroup(prev: ChatMessage, current: ChatMessage): boolean {
  return (
    prev.authorId !== current.authorId ||
    prev.kind === 'proposal' ||
    current.kind === 'proposal' ||
    current.createdAt - prev.createdAt > GROUP_GAP_MS ||
    !sameDay(prev.createdAt, current.createdAt)
  );
}

export function buildChatRows(messages: ChatMessage[]): ChatListRow[] {
  const rows: ChatListRow[] = [];
  messages.forEach((message, index) => {
    const prev = index > 0 ? messages[index - 1] : undefined;
    const next = index < messages.length - 1 ? messages[index + 1] : undefined;
    if (!prev || !sameDay(prev.createdAt, message.createdAt)) {
      rows.push({
        type: 'day',
        id: `day-${startOfDay(message.createdAt)}`,
        label: formatDayLabel(message.createdAt),
      });
    }
    rows.push({
      type: 'message',
      id: message.id,
      message,
      showAuthor: !prev || breaksGroup(prev, message),
      isGroupEnd: !next || breaksGroup(message, next),
    });
  });
  return rows;
}
