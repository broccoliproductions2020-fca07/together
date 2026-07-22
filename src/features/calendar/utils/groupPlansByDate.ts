import type { AgendaSection, Plan } from '../types/calendar.types';
import { dateKeyFromIso, formatDayLabel } from './formatPlanTime';

/**
 * Sorts plans chronologically and groups them into day sections, each with a
 * human label ("Heute", "Morgen", weekday, …). Insertion order is chronological.
 */
export function groupPlansByDate(plans: Plan[], now: Date = new Date()): AgendaSection[] {
  const sorted = [...plans].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const byDay = new Map<string, Plan[]>();

  for (const plan of sorted) {
    const key = dateKeyFromIso(plan.startsAt);
    const existing = byDay.get(key);
    if (existing) {
      existing.push(plan);
    } else {
      byDay.set(key, [plan]);
    }
  }

  return Array.from(byDay.entries()).map(([key, dayPlans]) => ({
    key,
    label: formatDayLabel(new Date(dayPlans[0].startsAt), now),
    plans: dayPlans,
  }));
}
