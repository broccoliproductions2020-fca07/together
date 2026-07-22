import { addMinutes, parseISO, roundUpToStep, toISO } from '../utils/datetime';
import type { ActivityFieldsProps } from './activityFieldsProps';
import { ScheduleFields } from './ScheduleFields';

export function SoonFields({ draft, onChange }: ActivityFieldsProps) {
  const startsAt = draft.startsAt ?? toISO(roundUpToStep(new Date()));
  const endsAt = draft.endsAt ?? toISO(addMinutes(parseISO(startsAt), 120));
  return (
    <ScheduleFields
      mode={draft.mode}
      title="Wann?"
      startsAt={startsAt}
      endsAt={endsAt}
      onChange={({ startsAt: nextStart, endsAt: nextEnd, durationMinutes: mins }) =>
        onChange({ ...draft, startsAt: nextStart, endsAt: nextEnd, plannedDurationMinutes: mins })
      }
    />
  );
}
