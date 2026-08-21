import type { MatchingHighlight } from './matchingSummary';
import { clockLabel } from './matchingSummary';

/**
 * The one line the compact row carries, and the only place its wording lives.
 *
 * It answers a different question than the timeline below it. Here "3 von 5"
 * counts PEOPLE — how much of the round has answered — while the `x/y` inside
 * the matching card counts availability WITHIN those who already did. Mixing
 * the two would make a round look answered because the few who replied happen
 * to agree, so the two numbers are deliberately derived from different things
 * and never share a formatter.
 *
 * Nothing is computed here that is not already computed elsewhere: the
 * progress is `memberUids` against `audienceUids` (joining IS answering, so a
 * member IS an answer), and the favourite is whatever `bestAcrossWindows`
 * already picked for the card.
 */

export interface PlanSummaryInput {
  /** People who have answered — i.e. members, since there is no member
   * without a response. */
  respondedCount: number;
  /** Everyone the round was addressed to. */
  expectedCount: number;
  /** The winning slots the matching card is already showing. Empty means no
   * stretch works for anybody yet. */
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
 * state in which a bare time could be mistaken for the appointment.
 */
export function describePlanStatus({
  respondedCount,
  expectedCount,
  highlights,
  canSeeFavourite = true,
}: PlanSummaryInput): string {
  const progress = `${respondedCount} von ${Math.max(respondedCount, expectedCount)} Antworten`;
  if (respondedCount === 0) return 'Noch keine Antworten';

  const favourite = canSeeFavourite ? favouriteLabel(highlights) : null;
  if (canSeeFavourite && !favourite) return `${progress} · Noch kein gemeinsamer Zeitraum`;
  if (!favourite) return progress;

  const prefix = favourite === 'Mehrere Favoriten' ? '' : 'Favorit: ';
  // "Aktueller Favorit" only while answers are still outstanding — once
  // everyone has replied the qualifier would suggest it can still move on its
  // own, and it cannot; only the host locking it changes anything now.
  if (respondedCount >= expectedCount) return `Alle Antworten da · ${prefix}${favourite}`;
  const openPrefix = favourite === 'Mehrere Favoriten' ? '' : 'Aktueller Favorit: ';
  return `${progress} · ${openPrefix}${favourite}`;
}

/** Only a running round shows the row. Locked means the activity itself now
 * carries the time, and cancelled means there is nothing to open. */
export function planRoundIsOpen(status: 'collecting' | 'locked' | 'cancelled'): boolean {
  return status === 'collecting';
}
