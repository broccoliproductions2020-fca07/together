import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

/**
 * The chat colour model (AGENTS.md → "Ein Farbmodell für Chats").
 *
 * A room's colour says what KIND of room it is, and it must be identical
 * wherever that room appears — the Postfach row, the inline sheet chat and the
 * full-screen Modal. Chat components therefore take `accent` as a required
 * prop and never fall back to a literal: a hard-coded default is exactly how
 * one room ended up blue full-screen and green inline.
 */

/** Planning rounds are not activities. Violet, never the Open blue. */
export const GROUP_CHAT_ACCENT = SEMANTIC_COLOR.action;

/**
 * An activity chat inherits its activity's mode colour. Kept as a lookup on
 * the literals rather than importing the map's marker table, so the chat
 * feature does not depend on the map feature.
 */
const ACTIVITY_MODE_ACCENT = {
  open: 'rgb(110,139,247)',
  soon: 'rgb(224,162,62)',
  now: 'rgb(65,192,141)',
} as const;

export type ActivityChatMode = keyof typeof ACTIVITY_MODE_ACCENT;

export function activityChatAccent(mode: ActivityChatMode): string {
  return ACTIVITY_MODE_ACCENT[mode];
}
