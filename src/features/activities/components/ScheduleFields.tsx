import { Text, View } from 'react-native';

import type { ActivityMode } from '../types';
import { durationMinutes, formatDurationLabel, parseISO, toISO } from '../utils/datetime';
import { DayStrip } from './DayStrip';
import { TimeBand } from './TimeBand';

/** Rail length per mode. Now starts at the current hour and only ever runs
 * forward, so 14 h covers the 12 h maximum with an hour of lead-in. Soon owns a
 * whole calendar day plus the small hours of the next one, because an evening
 * activity is allowed to cross midnight. */
const NOW_RAIL_MINUTES = 14 * 60;
/** 36 h, not 24: a 23:45 start plus the 12 h maximum lands at 11:45 the next
 * day. A shorter rail would silently cap late-evening activities. */
const SOON_RAIL_MINUTES = 36 * 60;

/** Same ternary the DurationPicker call site used. `ActivityMode` still carries
 * `open`, but the composer never creates one (open = presence, not event), so it
 * deliberately gets no colour of its own here. */
const modeAccent = (mode: ActivityMode) => (mode === 'now' ? '#41C08D' : '#E0A23E');

export interface ScheduleChange {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
}

export interface ScheduleFieldsProps {
  startsAt: string;
  endsAt: string;
  mode: ActivityMode;
  /** When false (Now-mode), the activity begins the moment it is created and
   * the rail's left edge is not draggable. */
  startEditable?: boolean;
  onChange: (next: ScheduleChange) => void;
}

function floorToHour(date: Date): Date {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  return next;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatClock(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Start, end and duration in one row.
 *
 * This replaced two full datetime fields plus a duration slider — three controls
 * and roughly 180 px for what is really a single decision: which slice of the
 * evening is this. Dragging the span answers all three at once, and the rail
 * shows what separate fields never could: how much of the day is still free
 * around it.
 *
 * Soon additionally gets a day strip, because the band owns hours, not dates.
 * Now does not — it starts now, so there is no day to choose.
 */
export function ScheduleFields({
  startsAt,
  endsAt,
  mode,
  startEditable = true,
  onChange,
}: ScheduleFieldsProps) {
  const start = parseISO(startsAt);
  const end = parseISO(endsAt);
  const accent = modeAccent(mode);
  const minutes = durationMinutes(startsAt, endsAt);

  // Now pins the rail to the current hour; Soon shows the chosen day from
  // midnight, so the strip and the band always agree on which day is on screen.
  const originMs = startEditable ? startOfDay(start).getTime() : floorToHour(start).getTime();
  const railMinutes = startEditable ? SOON_RAIL_MINUTES : NOW_RAIL_MINUTES;

  function emit(nextStart: Date, nextEnd: Date) {
    onChange({
      startsAt: toISO(nextStart),
      endsAt: toISO(nextEnd),
      durationMinutes: durationMinutes(toISO(nextStart), toISO(nextEnd)),
    });
  }

  return (
    <View className="gap-2.5">
      {/* The time IS the headline — set large and in the mode colour, so a Jetzt
          activity reads green and a Soon one amber at a glance. No "Bis wann?"
          caption above it: the band underneath is obviously a time control, and
          a heading that restates its own control is noise. */}
      <View className="flex-row items-baseline gap-2.5">
        <Text
          className="text-2xl font-extrabold tracking-[-0.5px]"
          style={{ color: accent }}
          numberOfLines={1}
        >
          {startEditable ? formatClock(start) : 'Jetzt'} – {formatClock(end)}
        </Text>
        <Text className="text-xs font-semibold uppercase tracking-wide text-white/40">
          {formatDurationLabel(minutes)}
        </Text>
      </View>

      {startEditable ? (
        <DayStrip
          value={start}
          accent={accent}
          onChange={(nextDay) => {
            // Carry the whole span to the new day rather than only its start —
            // moving an activity to Saturday must not silently shorten it.
            const shift = nextDay.getTime() - start.getTime();
            emit(nextDay, new Date(end.getTime() + shift));
          }}
        />
      ) : null}

      <TimeBand
        startMs={start.getTime()}
        endMs={end.getTime()}
        originMs={originMs}
        railMinutes={railMinutes}
        accent={accent}
        startFixed={!startEditable}
        nowMs={Date.now()}
        onChange={(span) => emit(new Date(span.startMs), new Date(span.endMs))}
      />
    </View>
  );
}
