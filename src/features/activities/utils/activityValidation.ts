import type { ActivityDraft } from '../types';
import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES, draftDurationMinutes } from './modeDefaults';

function endsAfterStart(draft: ActivityDraft) {
  if (!draft.startsAt || !draft.endsAt) return false;
  return new Date(draft.endsAt).getTime() > new Date(draft.startsAt).getTime();
}

export function validateActivityDraft(draft: ActivityDraft) {
  if (!draft.title || draft.title.trim().length === 0) {
    return 'Gib deiner Activity einen Namen.';
  }

  if (draft.visibility.kind === 'group' && !draft.visibility.groupId) {
    return 'Wähle eine Gruppe aus.';
  }

  // An activity nobody may see is always a mistake, never an intention — and it
  // would publish silently, with no error and no audience to notice.
  if (draft.visibility.kind === 'selection' && draft.visibility.uids.length === 0) {
    return 'Wähle mindestens eine Person aus, die die Activity sehen kann.';
  }

  if (draft.maxPeople != null && (draft.maxPeople < 2 || draft.maxPeople > 50)) {
    return 'Das Teilnehmerlimit muss zwischen 2 und 50 liegen.';
  }

  /**
   * A place is required in BOTH modes, and the test is the COORDINATE.
   *
   * Checking only that a place object exists let the composer's default
   * (`CURRENT_LOCATION_PLACE` — a label carrying no position until the map hands
   * one over) through. An activity published in that state gets
   * `visibility: 'none'`: no pin, no distance, invisible on the map. It looked
   * created and reached nobody, which is the worst possible failure for this
   * app. `locationChoice: 'open'` is the one legitimate no-place answer and is
   * no longer offered anywhere in the UI.
   */
  if (draft.locationChoice !== 'open') {
    const hasCoordinate = draft.place?.latitude != null && draft.place?.longitude != null;
    if (!hasCoordinate) {
      return 'Der Ort steht noch nicht fest — wähle einen Ort oder deinen aktuellen Standort.';
    }
  }

  // Jetzt is deliberately NOT checked against startsAt/endsAt: its start is
  // stamped at publish time (resolveDraftForPublish), so the draft's span is
  // provisional. The duration is the only thing there is to validate.
  if (draft.mode === 'now') {
    const minutes = draftDurationMinutes(draft);
    if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
      return 'Die Dauer muss zwischen 15 Minuten und 12 Stunden liegen.';
    }
    return null;
  }

  if (!draft.startsAt || !draft.endsAt) return 'Soon braucht Start und Ende.';
  if (!endsAfterStart(draft)) return 'Das Ende muss nach dem Start liegen.';

  return null;
}
