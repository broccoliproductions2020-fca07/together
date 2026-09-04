import type { MatchingHighlight } from './matchingSummary';
import { clockLabel } from './matchingSummary';

/**
 * The one line the compact row carries, and the only place its wording lives.
 *
 * It leads with the ANSWER — day, time, and how many of the answers cover it —
 * because that is what someone opens a round to learn. The progress used to
 * come first and the favourite second.
 *
 * There is deliberately no "N von M haben geantwortet" any more (September
 * 2026). M was `audienceCount`: everyone the round was addressed to, i.e. the
 * host's friend list. Set the audience to all friends and the line reads
 * "5 von 40" for ever — not a task list, just the size of a contact list, and
 * it makes every round look like a failure. What the counts below refer to is
 * the number of ANSWERS, which is stated without a denominator.
 *
 * Nothing is computed here that is not already computed elsewhere: the count
 * is the server-written member count (joining IS answering, so a member IS an
 * answer), and the favourite is whatever `bestAcrossWindows` already picked.
 */

export interface PlanSummaryInput {
  /** People who have answered — i.e. members, since there is no member
   * without a response. */
  respondedCount: number;
  /** The winning slots the overview is already showing. Empty means no stretch
   * works for anybody yet. */
  highlights: MatchingHighlight[];
  /** Suppresses the favourite where the reader may not see member data. */
  canSeeFavourite?: boolean;
}

/** "Morgen, 19:00–21:00" — or the honest plural, because two equally good
 * windows do not fit in a quarter of a row and picking one would invent a
 * decision the host has not made. */
function favouriteLabel(highlights: MatchingHighlight[]): string | null {
  if (highlights.length === 0) return null;
  if (highlights.length > 1) return 'Mehrere Favoriten';
  const [entry] = highlights;
  return `${entry.dayLabel}, ${clockLabel(entry.slot.startMs)}–${clockLabel(entry.slot.endMs)}`;
}

/**
 * Never states a time as decided. The word in front of it is always
 * "Favorit" — a locked round does not show this row at all, so the row has no
 * state in which a bare time could be mistaken for the appointment. That word
 * is doing more work now that the time comes first.
 */
export function describePlanStatus({
  respondedCount,
  highlights,
  canSeeFavourite = true,
}: PlanSummaryInput): string {
  if (respondedCount === 0) return 'Noch keine Antworten';
  const answers = respondedCount === 1 ? '1 Antwort' : `${respondedCount} Antworten`;

  const favourite = canSeeFavourite ? favouriteLabel(highlights) : null;
  if (canSeeFavourite && !favourite) return `${answers} · Noch kein gemeinsamer Zeitraum`;
  // An invitee cannot read `timePlanMembers`, so there is no aggregate to
  // report — only that the round is running.
  if (!favourite) return answers;

  const [leading] = highlights;
  const covers = `${leading.slot.count} von ${respondedCount} können`;
  if (favourite === 'Mehrere Favoriten') return `${favourite} · je ${covers}`;
  return `Favorit: ${favourite} · ${covers}`;
}

/** Only a running round shows the row. Locked means the activity itself now
 * carries the time, and cancelled means there is nothing to open. */
export function planRoundIsOpen(status: 'collecting' | 'locked' | 'cancelled'): boolean {
  return status === 'collecting';
}
