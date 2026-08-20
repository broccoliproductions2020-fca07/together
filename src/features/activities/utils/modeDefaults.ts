import { CURRENT_LOCATION_PLACE } from './currentPlace';

import type { ActivityDraft, ActivityMode, SelectedPlace } from '../types';
import { addMinutes, durationMinutes, parseISO, roundUpToStep, toISO } from './datetime';

/** Mirrors the TimeBand's own bounds so a mode switch can never produce a span
 * the control is unable to draw. */
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 12 * 60;
export const NOW_DEFAULT_DURATION_MINUTES = 60;
export const SOON_DEFAULT_DURATION_MINUTES = 120;
/**
 * How far ahead a fresh plan starts.
 *
 * The next quarter hour was the old default and sat uncomfortably close to now:
 * a plan is something people need time to see and react to, and a start eight
 * minutes out is a Jetzt with extra steps. An hour is the lead time a proposal
 * needs to be answerable at all.
 *
 * A DEFAULT, never a floor: a start the person placed themselves is kept, and
 * dragging the band closer than this stays their decision (the band clamps at
 * the current moment, nothing else).
 */
export const SOON_LEAD_MINUTES = 60;

function clampDuration(minutes: number | undefined, fallback: number): number {
  if (!Number.isFinite(minutes ?? NaN)) return fallback;
  return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.round(minutes!)));
}

export function createDefaultVisibility() {
  // The normal case is a passive publication to every direct friend. Narrowing
  // happens by deselecting people, never by having to select them first.
  return { kind: 'all_friends' as const };
}

export function createInitialActivityDraft(
  mode: ActivityMode,
  place?: SelectedPlace,
  title?: string,
): ActivityDraft {
  const defaultPlace = place ?? CURRENT_LOCATION_PLACE;
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

/**
 * How long the activity runs, regardless of mode.
 *
 * For `now` this is the authoritative value — the start does not exist yet (see
 * resolveDraftForPublish), so a duration is the only thing that can be edited.
 * For `soon` it is derived from the chosen span.
 */
export function draftDurationMinutes(draft: ActivityDraft): number {
  if (draft.startsAt && draft.endsAt) {
    return clampDuration(
      durationMinutes(draft.startsAt, draft.endsAt),
      draft.mode === 'now' ? NOW_DEFAULT_DURATION_MINUTES : SOON_DEFAULT_DURATION_MINUTES,
    );
  }
  return clampDuration(
    draft.plannedDurationMinutes,
    draft.mode === 'now' ? NOW_DEFAULT_DURATION_MINUTES : SOON_DEFAULT_DURATION_MINUTES,
  );
}

/**
 * The publish-time resolution of "Jetzt".
 *
 * While the composer is open a `now` draft carries a PROVISIONAL start, frozen
 * at the moment the sheet opened, purely so the time control has something to
 * draw. It is never what gets written: "Jetzt" means the instant the person
 * tapped publish, so the start is stamped here and the end follows from the
 * chosen duration. Without this, a two-minute composing session would publish
 * an activity that already started two minutes ago — and every label the user
 * read while filling the form would have been quietly wrong.
 *
 * Editing is exempt: an existing activity's start is a fact, not an intention.
 */
export function resolveDraftForPublish(draft: ActivityDraft, at: Date = new Date()): ActivityDraft {
  if (draft.mode !== 'now') return draft;
  const minutes = draftDurationMinutes(draft);
  const start = toISO(at);
  const end = toISO(addMinutes(at, minutes));
  return {
    ...draft,
    startsAt: start,
    endsAt: end,
    plannedDurationMinutes: minutes,
    expiresInMinutes: minutes,
  };
}

export function applyModeDefaults(draft: ActivityDraft, mode: ActivityMode): ActivityDraft {
  const nextDraft: ActivityDraft = { ...draft, mode };
  // Carried across a mode switch as a DURATION, never as an end time: keeping
  // "ends tomorrow 22:00" while switching to Jetzt produced a 20-hour activity
  // that the rail could not even draw.
  const carriedDuration = clampDuration(
    draft.startsAt && draft.endsAt
      ? durationMinutes(draft.startsAt, draft.endsAt)
      : draft.plannedDurationMinutes,
    mode === 'now' ? NOW_DEFAULT_DURATION_MINUTES : SOON_DEFAULT_DURATION_MINUTES,
  );

  if (mode === 'now') {
    const start = new Date();
    nextDraft.startsAt = toISO(start);
    nextDraft.endsAt = toISO(addMinutes(start, carriedDuration));
    nextDraft.plannedDurationMinutes = carriedDuration;
    nextDraft.expiresInMinutes = carriedDuration;
    return nextDraft;
  }

  // A start in the past is either a fresh draft or the provisional stamp a Jetzt
  // draft carried; neither is something a planned activity should inherit.
  const existingStart = nextDraft.startsAt ? parseISO(nextDraft.startsAt) : null;
  const start =
    existingStart && existingStart.getTime() > Date.now()
      ? existingStart
      : roundUpToStep(addMinutes(new Date(), SOON_LEAD_MINUTES), 15);
  nextDraft.startsAt = toISO(start);
  nextDraft.endsAt = toISO(addMinutes(start, carriedDuration));
  nextDraft.plannedDurationMinutes = carriedDuration;
  nextDraft.expiresInMinutes = undefined;
  return nextDraft;
}
