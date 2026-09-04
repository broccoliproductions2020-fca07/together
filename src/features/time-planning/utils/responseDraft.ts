import type { TimePlanInterval, TimePlanMember, TimePlanWindow } from '../types';

import { normalizeIntervals } from './intervals';

/**
 * A day gets ONE of three answers, and the order is a scale: yes → yes-but → no.
 *
 * `partial` is the whole reason this is not a two-state poll. "Samstag kann ich,
 * aber erst ab 19" is the most common real answer to a proposed day, and a
 * binary control forces that person to vote NO on a day they can actually make
 * — which is worse than no answer, because it pushes the host away from a slot
 * that would have worked. Free intervals stay available; they just stop being
 * the DEFAULT shape of the question.
 */
export type TimePlanAnswer = 'full' | 'partial' | 'none';

export interface TimePlanResponseDraft {
  answers: Record<string, TimePlanAnswer>;
  intervals: Record<string, TimePlanInterval[]>;
}

export function canSeedResponseDraft({
  planId,
  seededPlanId,
  isMember,
  membersLoadedPlanId,
}: {
  planId: string | undefined;
  seededPlanId: string | undefined;
  isMember: boolean;
  membersLoadedPlanId: string | null;
}): boolean {
  return Boolean(
    planId && seededPlanId !== planId && (!isMember || membersLoadedPlanId === planId),
  );
}

export function fullInterval(window: TimePlanWindow): TimePlanInterval {
  return { startsAt: window.startsAt, endsAt: window.endsAt };
}

/**
 * Whether a stored interval still means "the whole day the host offered".
 *
 * Compared with `<=`/`>=` rather than equality: the server normalises answers
 * into the window, so an interval can legitimately arrive clamped to exactly
 * the bounds, and an older client could have stored one reaching past them.
 * Both mean the same thing to the person who answered.
 */
export function coversWholeWindow(
  interval: TimePlanInterval,
  window: TimePlanWindow,
): boolean {
  const start = Date.parse(interval.startsAt);
  const end = Date.parse(interval.endsAt);
  const windowStart = Date.parse(window.startsAt);
  const windowEnd = Date.parse(window.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start <= windowStart && end >= windowEnd;
}

/**
 * Seed the answer rows from what this member already stored.
 *
 * The three states are DERIVED from the stored intervals, never persisted
 * separately: an empty array is `none`, an interval covering the host window is
 * `full`, anything narrower is `partial`. That keeps the wire format unchanged
 * — the server still receives intervals and knows nothing about the control —
 * and it means answers written by the previous two-state UI reopen in the right
 * state without a migration.
 */
export function seedResponseDraft(
  windows: TimePlanWindow[],
  member: TimePlanMember | undefined,
): TimePlanResponseDraft {
  const answers: Record<string, TimePlanAnswer> = {};
  const intervals: Record<string, TimePlanInterval[]> = {};

  windows.forEach((window) => {
    const stored =
      member?.responseStatus === 'responded' ? member.responsesByWindow[window.id] : undefined;
    const whole = fullInterval(window);

    if (stored && stored.length === 0) {
      answers[window.id] = 'none';
      // The picker keeps a usable range behind a declined day, so switching to
      // "Nur teilweise" has something to open on instead of an empty control.
      intervals[window.id] = [whole];
      return;
    }

    const chosen = stored?.length ? stored[0] : whole;
    intervals[window.id] = [chosen];
    answers[window.id] = coversWholeWindow(chosen, window) ? 'full' : 'partial';
  });

  return { answers, intervals };
}

export function replaceFirstInterval(
  _current: TimePlanInterval[] | undefined,
  next: TimePlanInterval,
): TimePlanInterval[] {
  return [next];
}

/**
 * The wire payload. `full` deliberately sends the host's own window rather than
 * whatever the picker last held: the person said "the whole day works", and
 * shipping a stale narrowed range from an earlier `partial` visit would quietly
 * contradict them.
 */
export function responseDraftToResponses(
  windows: TimePlanWindow[],
  answers: Record<string, TimePlanAnswer>,
  intervals: Record<string, TimePlanInterval[]>,
): Record<string, TimePlanInterval[]> {
  return Object.fromEntries(
    windows.map((window) => {
      const answer = answers[window.id] ?? 'full';
      if (answer === 'none') return [window.id, []];
      if (answer === 'full') {
        return [window.id, normalizeIntervals([fullInterval(window)], window)];
      }
      const chosen = intervals[window.id];
      return [
        window.id,
        normalizeIntervals(chosen?.length ? [chosen[0]] : [fullInterval(window)], window),
      ];
    }),
  );
}

/**
 * Did anybody actually narrow a day?
 *
 * This is what decides whether the round needs the availability MATRIX or just
 * a tally. When every answer is a whole window or a decline, the staircase is a
 * flat block per row and carries no information the count does not — it is the
 * chart equivalent of a progress bar stuck at 100 %. Drawing it anyway is what
 * made the overview feel like more than the decision deserved.
 */
export function anyNarrowedAnswer(
  windows: TimePlanWindow[],
  members: TimePlanMember[],
): boolean {
  return members.some((member) =>
    windows.some((window) => {
      const stored = member.responsesByWindow[window.id];
      if (!stored?.length) return false;
      return stored.length > 1 || !coversWholeWindow(stored[0], window);
    }),
  );
}
