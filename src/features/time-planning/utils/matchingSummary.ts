import type { TimePlanWindow } from '../types';
import { bestSlots, type BestSlot, type WindowAvailability } from './availability';

/**
 * The one line the card leads with: when the group actually overlaps best.
 *
 * A tie is not resolved away. Two evenings that are equally good are two real
 * answers, and silently naming one of them would hide a choice the host is
 * entitled to make — so every window that ties on head count AND length is
 * listed.
 */
export interface MatchingHighlight {
  windowId: string;
  slot: BestSlot;
  /** The day the slot falls on, for the summary line. */
  dayLabel: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Heute" / "Morgen" where that is true, otherwise a short, unambiguous date.
 * A weekday alone stops being unambiguous past a week, and a plan may run out
 * six months. */
export function dayLabelFor(ms: number, now = Date.now()): string {
  const days = Math.round((startOfDay(ms) - startOfDay(now)) / DAY_MS);
  if (days === 0) return 'Heute';
  if (days === 1) return 'Morgen';
  const date = new Date(ms);
  const weekday = date.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  return `${weekday} ${date.getDate()}.${date.getMonth() + 1}.`;
}

export function clockLabel(ms: number): string {
  const date = new Date(ms);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * The strongest slots across ALL proposed days.
 *
 * Ranking is head count first, then length — the same order the per-window
 * choice uses, so the card and a later lock cannot disagree about what "best"
 * means. Chronological within a tie.
 */
export function bestAcrossWindows(
  windows: TimePlanWindow[],
  availabilityByWindow: Map<string, WindowAvailability>,
  now = Date.now(),
): MatchingHighlight[] {
  const candidates: MatchingHighlight[] = [];
  windows.forEach((window) => {
    const availability = availabilityByWindow.get(window.id);
    if (!availability) return;
    bestSlots(availability.segments, availability.totalCount).forEach((slot) => {
      candidates.push({ windowId: window.id, slot, dayLabel: dayLabelFor(slot.startMs, now) });
    });
  });
  if (candidates.length === 0) return [];

  const topCount = Math.max(...candidates.map((entry) => entry.slot.count));
  const byCount = candidates.filter((entry) => entry.slot.count === topCount);
  const topLength = Math.max(...byCount.map((entry) => entry.slot.endMs - entry.slot.startMs));
  return byCount
    .filter((entry) => entry.slot.endMs - entry.slot.startMs === topLength)
    .sort((left, right) => left.slot.startMs - right.slot.startMs);
}

/** "Heute, 20:00–21:30" — and every tied window when there is more than one. */
export function summariseHighlights(highlights: MatchingHighlight[]): string[] {
  return highlights.map(
    (entry) =>
      `${entry.dayLabel}, ${clockLabel(entry.slot.startMs)}–${clockLabel(entry.slot.endMs)}`,
  );
}

/**
 * How tall a collapsed day row is, so a long list of proposals still fits
 * without the card turning into a scroll of its own. It stops shrinking at 32:
 * below that the steps can no longer show a difference in height, which is
 * half of how the amount is encoded.
 */
export function dayRowHeight(dayCount: number): number {
  if (dayCount <= 3) return 48;
  if (dayCount === 4) return 44;
  if (dayCount === 5) return 40;
  if (dayCount === 6) return 36;
  return 32;
}
