import { useMemo } from 'react';

import { useThemeColors } from '@/features/theme';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

/**
 * Three colours, one job each. Mixing them is what makes a planning screen
 * read as arbitrary, so every surface in this feature takes them from here.
 *
 * - PLANNING is identity: this is a round, not an Activity. Same violet the app
 *   already uses for planning chat rooms (`GROUP_CHAT_ACCENT`).
 * - FRAME is the host's offer — the container, never availability.
 * - AVAILABLE is a person's own positive answer. It stays green in input
 *   controls, where it answers the local question "can I?".
 * - The shared overview is different: violet expresses the density of a round;
 *   green is reserved for the precise outline of its leading time window.
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
export const MEMBER_AVAILABILITY_COLOR = 'rgba(118,87,168,0.74)';

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

/** Read-only density is a different visual language from an individual's
 * positive answer. It never turns green: green is the outline that locates the
 * best interval without replacing the density information underneath. */
export const OVERVIEW_AVAILABILITY_RAMP = [
  'rgba(118,87,168,0.18)',
  'rgba(118,87,168,0.34)',
  'rgba(118,87,168,0.52)',
  'rgba(118,87,168,0.76)',
  'rgba(118,87,168,0.94)',
] as const;

export function overviewAvailabilityColor(level: number): string {
  if (level <= 0) return 'transparent';
  return OVERVIEW_AVAILABILITY_RAMP[Math.min(level, OVERVIEW_AVAILABILITY_RAMP.length) - 1];
}

/**
 * The surface colours every planning component uses.
 *
 * These screens were first drawn on a dark sheet and hard-coded white, which
 * rendered them invisible the moment they moved into the app's own detail
 * sheet — that sheet follows the theme, and in light mode white text on a white
 * card is simply gone. One mapping, taken from the app tokens, so a planning
 * surface can never drift from the sheet it sits in again.
 */
export interface PlanningSurfaceColors {
  text: string;
  muted: string;
  faint: string;
  card: string;
  cardBorder: string;
  track: string;
  handle: string;
  /** Readable ON the violet CTA. */
  onAccent: string;
}

export function usePlanningColors(): PlanningSurfaceColors {
  const colors = useThemeColors();
  return useMemo(
    () => ({
      text: colors.foreground,
      muted: colors.mutedForeground,
      faint: colors.border,
      card: colors.secondary,
      cardBorder: colors.border,
      track: colors.background,
      handle: colors.foreground,
      onAccent: '#FFFFFF',
    }),
    [colors],
  );
}
