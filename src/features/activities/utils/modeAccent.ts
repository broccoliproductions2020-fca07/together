import type { ActivityMode } from '../types';

/** The mode colours from AGENTS.md → Activity Modes. */
export const MODE_ACCENTS: Record<ActivityMode, string> = {
  open: '#3B82F6',
  soon: '#E0A23E',
  now: '#41C08D',
};

/**
 * The now→soon axis, as one ordered pair.
 *
 * Several surfaces cross-fade between the two modes (the composer's wash and
 * header, the time band's span and handles) and every one of them has to
 * interpolate over the SAME sequence in the same direction, or a mode flip
 * would fade one part of the sheet green-to-amber while another goes the other
 * way. `MODE_ACCENT_INDEX` is that direction.
 */
export const MODE_ACCENT_SEQUENCE: readonly [string, string] = [
  MODE_ACCENTS.now,
  MODE_ACCENTS.soon,
];

/** `open` shares soon's slot: it is never composable, so it only has to land
 * somewhere defined rather than on its own colour. */
export const MODE_ACCENT_INDEX: Record<ActivityMode, number> = { now: 0, soon: 1, open: 1 };
