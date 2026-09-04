import { useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { TimeRangePicker } from '@/shared/components/time-range-picker';
import type { TimeRangePickerDensity } from '@/shared/components/time-range-picker';

import type { TimeBandDensity } from './timeBandGeometry';

/**
 * The composer's single time band: `TimeRangePicker` wearing the props the
 * scheduler already speaks.
 *
 * The adapter is the whole integration — `ScheduleBench` decides the times, this
 * decides nothing. It kept the old band's prop shape when both were rendered
 * side by side behind a staging chip; the chip is gone and the picker is now the
 * only single band, but the shape stays because the multi-window planner still
 * speaks it (`PlanningOfferFields` renders `TimeBand keepSpanVisible`).
 *
 * Several of the old props have no counterpart, and their absence is the point
 * rather than a gap to fill in later:
 *
 * - `originMs` / `railMinutes` — the new viewport is described by the time at
 *   screen x = 0 and a scale, so there is no rail to size, no offset to clamp
 *   and no maximum scroll position to run out of.
 * - `pixelsPerHour` / `onPixelsPerHourChange` — a controlled scale exists to
 *   keep a STACK of bands comparable. The single scheduler band has no siblings.
 * - `linkedSync`, `keepSpanVisible`, `railOffset`, the preview callbacks — all
 *   of them serve the planner, which keeps using `PlanningTimeBand`.
 * - `startFixed` — the composer already passes `false`; the start handle is
 *   what turns a Jetzt into a plan and back, so fixing it would remove that
 *   gesture entirely.
 */

const DENSITY: Record<TimeBandDensity, TimeRangePickerDensity> = {
  regular: 'comfortable',
  snug: 'default',
  compact: 'compact',
};

interface ActivityTimeBandProps {
  startMs: number;
  endMs: number;
  accent: string;
  accentSequence?: readonly [string, string];
  accentProgress?: SharedValue<number>;
  nowMs: number;
  minDurationMinutes?: number;
  density?: TimeBandDensity;
  onChange: (span: { startMs: number; endMs: number }) => void;
}

export function ActivityTimeBand({
  startMs,
  endMs,
  accent,
  accentSequence,
  accentProgress,
  nowMs,
  minDurationMinutes,
  density = 'regular',
  onChange,
}: ActivityTimeBandProps) {
  // Rebuilt every render, which is safe on purpose: the picker keys its work on
  // the millisecond values, never on Date identity.
  const value = useMemo(
    () => ({ start: new Date(startMs), end: new Date(endMs) }),
    [startMs, endMs],
  );
  const min = useMemo(() => new Date(nowMs), [nowMs]);

  return (
    <TimeRangePicker
      value={value}
      min={min}
      minDurationMinutes={minDurationMinutes}
      density={DENSITY[density]}
      accent={accent}
      accentSequence={accentSequence}
      accentProgress={accentProgress}
      theme={BAND_THEME}
      // The Jetzt/Soon flip is decided in `ScheduleBench.emit` from the span it
      // receives, so it works here with no help from the picker — and must, or
      // the two bands would disagree about what a drag onto the now-wall means.
      onChange={(range) => onChange({ startMs: range.start.getTime(), endMs: range.end.getTime() })}
    />
  );
}

/** Only what the composer's surface needs: no card of its own, since the
 * workbench already provides one. Fill and border come from the picker's
 * defaults. */
const BAND_THEME = {
  container: { background: 'transparent' as const, radius: 0 },
  startHandle: { color: 'rgba(255,255,255,0.92)' },
  endHandle: { color: 'rgba(255,255,255,0.92)' },
};
