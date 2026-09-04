import { useMemo } from 'react';

import { useThemeColors, useThemePreference } from '@/features/theme';

/**
 * Four colours, one job each. Mixing them is what makes a planning screen
 * read as arbitrary, so every surface in this feature takes them from here.
 *
 * - PLANNING and FRAME are amber: a round is a future (`soon`) activity whose
 *   concrete time is still open. It does not create a second activity colour.
 * - AVAILABLE is green and belongs to the DATA: what other people answered,
 *   and the confirmation that a round is settled. It is deliberately NOT worn
 *   by any control — the answer switch used to, which painted the one surface
 *   you operate in the colour reserved for the answers you read.
 * - DECLINED is the single exception to "amber is the control": inside the
 *   answer switch, saying no needs to be distinguishable from saying yes at a
 *   glance. It is scoped to that control and to your OWN answer — somebody
 *   else's unavailability never turns red.
 * - The shared overview is different: amber expresses the density of a round;
 *   green is reserved for the precise outline of its leading time window.
 *
 * AVAILABLE is deliberately the same green as the `now` activity mode. On a map
 * that green means "running", but no mode colour appears on a planning surface,
 * so the two never sit side by side. Two near-identical greens would be the
 * worse problem.
 */
export const FRAME_COLOR = '#E0A23E';
export const PLANNING_COLOR = FRAME_COLOR;
export const AVAILABLE_COLOR = '#41C08D';

/**
 * "Passt nicht", in the switch where you give your OWN answer. The two yes
 * answers wear `FRAME_COLOR` there, like every other control in this feature.
 *
 * Deliberately not the app's destructive red (#C82626 / #FF6467): that one is
 * reserved for irreversible actions — Absagen, Blockieren, Gruppe verlassen —
 * and borrowing it here would say a day you cannot make is a mistake. This is a
 * muted clay: it reads as "no" across the row at a glance, which grey did not,
 * without reading as an alarm. Measured 4.88:1 against the light track and
 * 3.56:1 against the dark one, so the pill is unmistakably filled in both, and
 * white label text clears AA on it at 5.21:1. Against the destructive red it
 * is ΔE00 9.7 (light) and 18.4 (dark) — the map palettes treat ~4 as the point
 * where two colours stop being read as the same one, so nobody mistakes this
 * for the Absagen button.
 *
 * The scope is exactly this control. Somebody ELSE's unavailability stays
 * `UNAVAILABLE_COLOR` in the shared overview — a column of red rows naming who
 * cannot come is a pillory, and this app already refuses that elsewhere.
 */
export const DECLINED_COLOR = '#A85449';
export const MEMBER_AVAILABILITY_COLOR = 'rgba(224,162,62,0.74)';

/** Someone who answered "not this day". Muted, never alarming: not being free
 * is not a failure, and a red row would read as one. */
export const UNAVAILABLE_COLOR = 'rgba(244,245,247,0.30)';

/** Read-only density is a different visual language from an individual's
 * positive answer. It never turns green: green is the outline that locates the
 * best interval without replacing the density information underneath. */
export const OVERVIEW_AVAILABILITY_RAMP = [
  'rgba(224,162,62,0.18)',
  'rgba(224,162,62,0.34)',
  'rgba(224,162,62,0.52)',
  'rgba(224,162,62,0.76)',
  'rgba(224,162,62,0.94)',
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
  /** Zebra band behind a person's row. Deliberately far below the border
   * token: the bars over it are translucent, so a strong band would tint the
   * same availability differently in odd and even rows. At this strength the
   * shift is about two values per channel — felt, not seen. */
  band: string;
  /** Hairline around a row's own strongest stretch. */
  peakOutline: string;
  /** The count drawn INSIDE that stretch, so it is read against the amber
   * fill and not against the card. */
  peakLabel: string;
  /** Readable on the amber CTA. */
  onAccent: string;
}

export function usePlanningColors(): PlanningSurfaceColors {
  const colors = useThemeColors();
  const { resolvedScheme } = useThemePreference();
  const dark = resolvedScheme === 'dark';
  return useMemo(
    () => ({
      text: colors.foreground,
      muted: colors.mutedForeground,
      faint: colors.border,
      /**
       * The matching card's ground must NOT be the app's warm `secondary`
       * (#EFEAE1 in light). That sand is a near neighbour of the amber the
       * chart is drawn in, so the low steps — a single person, two of five —
       * sank into it and the whole block read as tinted. A neutral ground is
       * what lets amber be data. Dark keeps `secondary`, which is a cool
       * green-grey and separates from amber perfectly well.
       */
      card: dark ? colors.secondary : colors.card,
      cardBorder: colors.border,
      track: colors.background,
      handle: colors.foreground,
      band: dark ? 'rgba(255,255,255,0.045)' : 'rgba(20,33,28,0.035)',
      /**
       * The outline around a row's own best stretch. Deliberately NOT amber:
       * amber is the control and the data, so a third amber line would read as
       * more of the same measurement instead of a mark laid on top of it. Ink
       * on light, paper on dark — the one pair that stays neutral against a
       * translucent amber fill in both schemes.
       */
      peakOutline: dark ? 'rgba(255,255,255,0.78)' : 'rgba(16,22,20,0.66)',
      /**
       * Read against the amber FILL, which inverts between the schemes: pale
       * sand in light, dark olive in dark. A single hard-coded ink therefore
       * cannot work — it was '#3A2A10' for both, and in dark that is dark
       * brown on dark olive.
       */
      peakLabel: dark ? '#F2E3C6' : '#3A2A10',
      onAccent: '#FFFFFF',
    }),
    [colors, dark],
  );
}
