import { addMinutes, parseISO, toISO } from '../utils/datetime';
import type { ActivityFieldsProps } from './activityFieldsProps';
import { ScheduleFields } from './ScheduleFields';

export function NowFields({ draft, onChange }: ActivityFieldsProps) {
  const startsAt = draft.startsAt ?? toISO(new Date());
  const endsAt = draft.endsAt ?? toISO(addMinutes(parseISO(startsAt), 60));
  return (
    <ScheduleFields
      mode={draft.mode}
      title="Bis wann?"
      startsAt={startsAt}
      endsAt={endsAt}
      startEditable={false}
      onChange={({ startsAt: nextStart, endsAt: nextEnd, durationMinutes: mins }) =>
        onChange({
          ...draft,
          startsAt: nextStart,
          endsAt: nextEnd,
          plannedDurationMinutes: mins,
          expiresInMinutes: mins,
        })
      }
    />
  );
}
