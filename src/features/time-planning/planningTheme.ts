import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

/**
 * Three colours, one job each. Mixing them is what makes a planning screen
 * read as arbitrary, so every surface in this feature takes them from here.
 *
 * - PLANNING is identity: this is a round, not an Activity. Same violet the app
 *   already uses for planning chat rooms (`GROUP_CHAT_ACCENT`).
 * - FRAME is the host's offer — the container, never availability.
 * - AVAILABLE is availability, everywhere: your own bar, the aggregate band and
 *   the individual rows. One meaning, so a green block always says "can".
 *
 * AVAILABLE is deliberately the same green as the `now` activity mode. On a map
 * that green means "running", but no mode colour appears on a planning surface,
 * so the two never sit side by side — and against a violet identity and an
 * amber frame, green is the one that separates cleanly. Two near-identical
 * greens would be the worse problem.
 */
export const PLANNING_COLOR = SEMANTIC_COLOR.action;
export const FRAME_COLOR = '#E0A23E';
export const AVAILABLE_COLOR = '#41C08D';

/** Someone who answered "not this day". Muted, never alarming: not being free
 * is not a failure, and a red row would read as one. */
export const UNAVAILABLE_COLOR = 'rgba(244,245,247,0.30)';

/** Availability ramp, hard steps. Index by `availabilityLevel() - 1`. */
export const AVAILABILITY_RAMP = [
  'rgba(65,192,141,0.18)',
  'rgba(65,192,141,0.34)',
  'rgba(65,192,141,0.52)',
  'rgba(65,192,141,0.72)',
  'rgba(65,192,141,0.96)',
] as const;

export function availabilityColor(level: number): string {
  if (level <= 0) return 'transparent';
  return AVAILABILITY_RAMP[Math.min(level, AVAILABILITY_RAMP.length) - 1];
}
