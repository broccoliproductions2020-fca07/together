import { Text, View } from 'react-native';

import { markerModeStyles } from '@/features/map/utils/markerStyles';

import type { ActivityDraft } from '../types';
import {
  durationMinutes,
  formatDateTimeLabel,
  formatDurationLabel,
  parseISO,
} from '../utils/datetime';

function activityTitle(draft: ActivityDraft) {
  return draft.title?.trim() || 'Activity bereit';
}

function timeLabel(draft: ActivityDraft) {
  if (draft.mode === 'now') {
    const minutes = draft.expiresInMinutes ?? durationMinutes(draft.startsAt, draft.endsAt);
    return `${formatDurationLabel(minutes)} sichtbar`;
  }
  if (!draft.startsAt || !draft.endsAt) return 'Zeit offen';
  return `${formatDateTimeLabel(parseISO(draft.startsAt))} · ${formatDurationLabel(
    durationMinutes(draft.startsAt, draft.endsAt),
  )}`;
}

function visibilityLabel(draft: ActivityDraft) {
  if (draft.visibility.kind === 'all_friends') return 'Alle Freunde';
  if (draft.visibility.kind === 'close_friends') return 'Enge Freunde';
  return 'Private Gruppe';
}

export function ActivityPreviewCard({ draft }: { draft: ActivityDraft }) {
  const modeLabel = draft.mode === 'now' ? 'Jetzt' : markerModeStyles[draft.mode].label;
  const placeLabel =
    draft.place?.name ??
    (draft.locationChoice === 'open'
      ? draft.mode === 'open'
        ? 'grobe Nähe'
        : 'Ort noch offen'
      : 'Aktueller Standort');

  return (
    <View
      className="rounded-3xl border border-white/10 px-4 py-4 shadow-sm"
      style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
    >
      <Text className="text-xs font-bold uppercase text-white/55">Bestätigung</Text>
      <Text className="mt-2 text-lg font-bold text-white">{activityTitle(draft)}</Text>
      {draft.description?.trim() ? (
        <Text className="mt-1 text-sm leading-5 text-white/70">{draft.description.trim()}</Text>
      ) : null}
      <Text className="mt-2 text-sm leading-5 text-white/60">
        {modeLabel} - {timeLabel(draft)} - {placeLabel} - {visibilityLabel(draft)}
        {draft.maxPeople ? ` - max. ${draft.maxPeople} Pers.` : ''}
      </Text>
    </View>
  );
}
