import type { TimePlanMember, TimePlanWindow } from '../types';
import { memberIntervals } from './availability';

/**
 * Answers collapsed into patterns, for a round too big to list.
 *
 * Past a dozen people a row per person is a wall: fifty thin bars scroll past
 * and tell you nothing. What is still worth knowing at that size is the SHAPE
 * of the answers — "28 the whole evening, 9 only from 20:00, 5 not at all" —
 * so the rows give way to the patterns behind them. Below the threshold the
 * individual rows stay, because in a small round WHO can is the actual
 * question.
 */

export type AnswerGroupKind = 'whole' | 'from' | 'until' | 'range' | 'other' | 'none';

export interface AnswerGroup {
  kind: AnswerGroupKind;
  count: number;
  startMs?: number;
  endMs?: number;
}

/** Above this many answers the card groups instead of listing. Twelve rows is
 * about where a stack of bars stops being read and starts being skimmed. */
export const ANSWER_LIST_LIMIT = 12;

function signatureOf(
  intervals: Array<{ startMs: number; endMs: number }>,
  windowStart: number,
  windowEnd: number,
): AnswerGroup {
  if (intervals.length === 0) return { kind: 'none', count: 1 };
  if (intervals.length > 1) return { kind: 'other', count: 1 };
  const [span] = intervals;
  const atStart = span.startMs <= windowStart;
  const atEnd = span.endMs >= windowEnd;
  if (atStart && atEnd) return { kind: 'whole', count: 1 };
  if (atEnd) return { kind: 'from', count: 1, startMs: span.startMs };
  if (atStart) return { kind: 'until', count: 1, endMs: span.endMs };
  return { kind: 'range', count: 1, startMs: span.startMs, endMs: span.endMs };
}

function keyOf(group: AnswerGroup): string {
  return `${group.kind}:${group.startMs ?? ''}:${group.endMs ?? ''}`;
}

/**
 * Groups identical answers, largest first.
 *
 * "Nobody can" is never merged away — it is the one line that changes what the
 * host does next, and folding it into a rest bucket would hide the reason a
 * window is weaker than it looks. Everything past `maxGroups` collapses into a
 * single `other`.
 */
export function groupAnswers(
  window: TimePlanWindow,
  members: TimePlanMember[],
  maxGroups = 4,
): AnswerGroup[] {
  const windowStart = Date.parse(window.startsAt);
  const windowEnd = Date.parse(window.endsAt);
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) return [];

  const buckets = new Map<string, AnswerGroup>();
  members.forEach((member) => {
    const intervals = memberIntervals(member, window);
    if (!intervals) return;
    const parsed = intervals.map((interval) => ({
      startMs: Date.parse(interval.startsAt),
      endMs: Date.parse(interval.endsAt),
    }));
    const signature = signatureOf(parsed, windowStart, windowEnd);
    const key = keyOf(signature);
    const existing = buckets.get(key);
    if (existing) existing.count += 1;
    else buckets.set(key, signature);
  });

  const all = [...buckets.values()];
  const none = all.find((group) => group.kind === 'none');
  const rest = all
    .filter((group) => group.kind !== 'none')
    .sort((left, right) => {
      if (left.count !== right.count) return right.count - left.count;
      return (left.startMs ?? windowStart) - (right.startMs ?? windowStart);
    });

  const roomForRest = Math.max(1, maxGroups - (none ? 1 : 0));
  // The rest line is itself a line. Keeping `roomForRest` groups AND adding it
  // would overshoot the budget by one, so the merge starts one earlier.
  const overflows = rest.length > roomForRest;
  const kept = rest.slice(0, overflows ? roomForRest - 1 : roomForRest);
  const dropped = overflows ? rest.slice(roomForRest - 1) : [];
  if (dropped.length > 0) {
    const merged = dropped.reduce((sum, group) => sum + group.count, 0);
    const last = kept[kept.length - 1];
    if (last && last.kind === 'other') last.count += merged;
    else kept.push({ kind: 'other', count: merged });
  }

  return none ? [...kept, none] : kept;
}
