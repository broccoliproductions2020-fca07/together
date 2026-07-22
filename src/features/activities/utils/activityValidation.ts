import type { ActivityDraft } from '../types';

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

  if (draft.maxPeople != null && (draft.maxPeople < 2 || draft.maxPeople > 50)) {
    return 'Das Teilnehmerlimit muss zwischen 2 und 50 liegen.';
  }

  if (draft.mode === 'now' && !draft.place && draft.locationChoice !== 'current') {
    return 'Jetzt braucht einen Ort oder den aktuellen Standort.';
  }

  if (draft.mode === 'soon') {
    if (!draft.startsAt || !draft.endsAt) return 'Soon braucht Start und Ende.';
    if (!endsAfterStart(draft)) return 'Das Ende muss nach dem Start liegen.';
  }

  if (draft.mode === 'now') {
    if (!draft.endsAt) return 'Jetzt braucht ein Ende.';
    if (!endsAfterStart(draft)) return 'Das Ende muss nach dem Start liegen.';
  }

  if (draft.mode === 'open') {
    if (!draft.startsAt || !draft.endsAt) return 'Open braucht ein Zeitfenster.';
    if (!endsAfterStart(draft)) return 'Das Ende muss nach dem Start liegen.';
  }

  return null;
}
