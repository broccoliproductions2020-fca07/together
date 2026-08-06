import * as SunCalc from 'suncalc';

/**
 * Time-of-day phases for the map palette, derived from the real sun position
 * at the user's coordinates.
 *
 * Entirely local: SunCalc is pure astronomy math (no dependencies, no network
 * call, ever). Nothing about the user's position or daily rhythm leaves the
 * device, so this needs no consent, no processor entry in the
 * Datenschutzerklärung, and costs nothing to run.
 *
 * Deliberately driven by `getTimes()` (which returns Date objects) rather than
 * `getPosition().altitude`: measured against suncalc@2.0.1, `altitude` comes
 * back in DEGREES (54.65 at Berlin solar noon in August), while the library is
 * widely documented as returning radians. Dates carry no unit ambiguity, so
 * this stays correct even if a future release "fixes" that discrepancy.
 */
export type SunPhase = 'day' | 'golden' | 'dusk' | 'night';

export interface SunPhaseState {
  phase: SunPhase;
  /** The palette at the next solar boundary, used to blend without a jump. */
  nextPhase: SunPhase;
  /** 0→1 progress through the current phase, for continuous lighting. */
  progress: number;
  /** Epoch ms at which the phase changes — used to schedule the next update. */
  endsAt: number;
}

/**
 * One solar day, in order. The arc is symmetric around noon:
 * night → dusk (dawn) → golden → day → golden → dusk → night.
 */
const TRANSITIONS: { key: keyof ReturnType<typeof SunCalc.getTimes>; phase: SunPhase }[] = [
  { key: 'dawn', phase: 'dusk' }, // civil dawn: blue hour begins
  { key: 'sunrise', phase: 'golden' },
  { key: 'goldenHourEnd', phase: 'day' },
  { key: 'goldenHour', phase: 'golden' },
  { key: 'sunset', phase: 'dusk' },
  { key: 'dusk', phase: 'night' }, // civil dusk: night begins
];

const DAY_MS = 24 * 60 * 60 * 1000;

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * Resolves the phase for `at`. Returns a safe fallback rather than throwing on
 * polar day/night (where SunCalc yields Invalid Date for sunrise/sunset) or on
 * a missing//invalid position — a map style must never be able to crash the map.
 */
export function resolveSunPhase(at: Date, latitude: number, longitude: number): SunPhaseState {
  const now = at.getTime();
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return { phase: 'day', nextPhase: 'day', progress: 0, endsAt: now + DAY_MS };
  }

  // Yesterday/today/tomorrow so the lookup works across midnight and so the
  // *next* boundary is always present, whatever the current time.
  const boundaries: { at: number; phase: SunPhase }[] = [];
  for (const offset of [-1, 0, 1]) {
    const times = SunCalc.getTimes(new Date(now + offset * DAY_MS), latitude, longitude);
    for (const { key, phase } of TRANSITIONS) {
      const value = times[key];
      if (isValidDate(value)) boundaries.push({ at: value.getTime(), phase });
    }
  }
  boundaries.sort((a, b) => a.at - b.at);

  // Polar day/night: too few usable events to describe an arc. Fall back to a
  // stable choice and re-check in an hour rather than flickering.
  if (boundaries.length < 2) {
    return { phase: 'day', nextPhase: 'day', progress: 0, endsAt: now + 60 * 60 * 1000 };
  }

  let index = -1;
  for (let i = 0; i < boundaries.length; i += 1) {
    if (boundaries[i].at <= now) index = i;
    else break;
  }

  // Before the first known boundary → we are in the trailing phase of the
  // previous cycle, which is always night.
  if (index < 0) {
    return { phase: 'night', nextPhase: 'dusk', progress: 0, endsAt: boundaries[0].at };
  }
  const current = boundaries[index];
  const next = boundaries[index + 1];
  if (!next) {
    return {
      phase: current.phase,
      nextPhase: current.phase,
      progress: 0,
      endsAt: now + 60 * 60 * 1000,
    };
  }

  const span = next.at - current.at;
  const progress = span > 0 ? Math.min(1, Math.max(0, (now - current.at) / span)) : 0;
  return { phase: current.phase, nextPhase: next.phase, progress, endsAt: next.at };
}
