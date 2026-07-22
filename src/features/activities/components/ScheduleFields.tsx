import { Text, View } from 'react-native';

import type { ActivityMode } from '../types';
import { addMinutes, durationMinutes, parseISO, toISO } from '../utils/datetime';
import { DateTimeField } from './DateTimeField';
import { DurationPicker } from './DurationPicker';

export interface ScheduleChange {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
}

export interface ScheduleFieldsProps {
  title: string;
  startsAt: string;
  endsAt: string;
  mode: ActivityMode;
  /** When false (Now-mode), the Start row is a fixed "Jetzt" display — not a picker. */
  startEditable?: boolean;
  onChange: (next: ScheduleChange) => void;
}

/**
 * Shared scheduler: Soon shows Start/Ende pickers with the DurationPicker as a
 * shortcut below; Now (`startEditable={false}`) pins the Start row to "Jetzt" —
 * end time and duration stay editable.
 */
export function ScheduleFields({
  title,
  startsAt,
  endsAt,
  mode,
  startEditable = true,
  onChange,
}: ScheduleFieldsProps) {
  const start = parseISO(startsAt);
  const end = parseISO(endsAt);

  function emit(nextStart: Date, nextEnd: Date) {
    const safeEnd = nextEnd.getTime() > nextStart.getTime() ? nextEnd : addMinutes(nextStart, 30);
    onChange({
      startsAt: toISO(nextStart),
      endsAt: toISO(safeEnd),
      durationMinutes: durationMinutes(toISO(nextStart), toISO(safeEnd)),
    });
  }

  return (
    <View className="gap-3">
      <Text className="text-sm font-bold text-white">{title}</Text>

      <View className="gap-2">
        {startEditable ? (
          <DateTimeField label="Start" value={start} onChange={(date) => emit(date, end)} />
        ) : (
          <View
            className="min-h-14 flex-row items-center justify-between rounded-2xl border border-white/10 px-4"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          >
            <Text className="text-base font-bold text-white">Start</Text>
            <Text className="text-base font-semibold text-white/60">Jetzt</Text>
          </View>
        )}
        <DateTimeField
          label="Ende"
          value={end}
          minimumDate={start}
          onChange={(date) => emit(start, date)}
        />
      </View>

      <DurationPicker
        minutes={durationMinutes(startsAt, endsAt)}
        accent={mode === 'now' ? '#41C08D' : '#E0A23E'}
        onChange={(nextDuration) => emit(start, addMinutes(start, nextDuration))}
      />
    </View>
  );
}
