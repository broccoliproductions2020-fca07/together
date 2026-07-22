import { mockCurrentPlace } from '@/data/mock';

import type { ActivityDraft, ActivityMode, SelectedPlace } from '../types';
import { addMinutes, durationMinutes, roundUpToStep, toISO } from './datetime';

export function createDefaultVisibility() {
  // The normal case is a passive publication to direct friends. Sensitive
  // plans use one saved private group instead of a manual recipient list.
  return { kind: 'all_friends' as const };
}

export function createInitialActivityDraft(
  mode: ActivityMode,
  place?: SelectedPlace,
  title?: string,
): ActivityDraft {
  const defaultPlace = place ?? mockCurrentPlace;
  return applyModeDefaults(
    {
      mode,
      title,
      visibility: createDefaultVisibility(),
      place: defaultPlace,
      locationChoice: place ? 'map' : 'current',
      locationPrecision: 'exact',
    },
    mode,
  );
}

export function applyModeDefaults(draft: ActivityDraft, mode: ActivityMode): ActivityDraft {
  const nextDraft: ActivityDraft = { ...draft, mode };

  if (mode === 'soon') {
    if (!nextDraft.startsAt) {
      const start = roundUpToStep(new Date(), 15);
      nextDraft.startsAt = toISO(start);
      nextDraft.endsAt = toISO(addMinutes(start, 120));
    } else if (!nextDraft.endsAt) {
      nextDraft.endsAt = toISO(addMinutes(new Date(nextDraft.startsAt), 120));
    }
    nextDraft.plannedDurationMinutes = durationMinutes(nextDraft.startsAt, nextDraft.endsAt);
    nextDraft.expiresInMinutes = undefined;
  }

  if (mode === 'now') {
    const start = new Date();
    nextDraft.startsAt = toISO(start);
    if (!nextDraft.endsAt || new Date(nextDraft.endsAt).getTime() <= start.getTime()) {
      nextDraft.endsAt = toISO(addMinutes(start, 60));
    }
    nextDraft.plannedDurationMinutes = durationMinutes(nextDraft.startsAt, nextDraft.endsAt);
    nextDraft.expiresInMinutes = nextDraft.plannedDurationMinutes;
  }

  if (mode === 'open') {
    if (!nextDraft.startsAt) {
      const start = roundUpToStep(new Date(), 15);
      nextDraft.startsAt = toISO(start);
      nextDraft.endsAt = toISO(addMinutes(start, 180));
    } else if (!nextDraft.endsAt) {
      nextDraft.endsAt = toISO(addMinutes(new Date(nextDraft.startsAt), 180));
    }
    nextDraft.plannedDurationMinutes = durationMinutes(nextDraft.startsAt, nextDraft.endsAt);
    nextDraft.expiresInMinutes = undefined;
  }

  return nextDraft;
}
