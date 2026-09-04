import { FONT } from '../../theme';
import { withAlpha } from '@/shared/utils/colorAlpha';

/**
 * Every visual value the picker owns, and nothing the interaction depends on.
 *
 * The engines in `core/` never see this file. That is the whole contract: a
 * consumer can rebuild the look — heights, colours, radii, even the handle
 * elements themselves — without the gesture maths noticing, because the maths
 * only ever reads `safeInsetPx`, `edgeZonePx` and the hit widths, which live in
 * `interaction` precisely because they are geometry rather than decoration.
 *
 * React Native has no CSS custom properties, so this object IS the variable
 * layer: one deep-partial `theme` prop merged over the defaults, plus a
 * `density` preset for the common case of "just make it shorter".
 *
 * Note what is deliberately absent: there is no `fontWeight`. The app ships
 * STATIC font files, and a weight next to a family makes Android synthesize a
 * second, fake bold on top of the real one — so weight is chosen by picking a
 * different `fontFamily`.
 */

export type TimeRangePickerDensity = 'comfortable' | 'default' | 'compact';

export interface HandleTheme {
  /** What is drawn. */
  width: number;
  /** What is touched. Always the larger of the two — never let a slim handle
   * dictate a slim target. Defaults to 44, the platform floor the app's design
   * system sets (`TOUCH.min`); the visible handle stays 6. */
  hitWidth: number;
  /** `'fill'` stretches the handle over the full track height. */
  height: number | 'fill';
  color: string;
  borderColor: string;
  borderWidth: number;
  radius: number;
}

export interface TimeRangePickerTheme {
  container: {
    height: number;
    radius: number;
    background: string;
    borderColor: string;
    borderWidth: number;
    borderStyle: 'solid' | 'dotted' | 'dashed';
    paddingHorizontal: number;
    paddingVertical: number;
  };
  past: { color: string; opacity: number };
  range: {
    color: string;
    fillOpacity: number;
    borderColor: string;
    borderOpacity: number;
    borderWidth: number;
    radius: number;
    height: number;
  };
  startHandle: HandleTheme;
  endHandle: HandleTheme;
  /**
   * An optional band of read-only blocks ABOVE the bar, on the picker's own
   * axis. It exists because the axis is private: a caller drawing its own strip
   * beside the picker would need a second time-to-pixel calculation, and the
   * two would drift apart the moment an edge expand changes the scale — i.e.
   * exactly while someone is dragging. The caller supplies WHAT, the picker
   * decides WHERE.
   *
   * `colors` is a ramp indexed by a layer's `level` (1 = colors[0]). Level 0 is
   * not drawn at all, so an empty stretch stays genuinely empty rather than the
   * faintest shade of occupied.
   */
  layers: { colors: readonly string[]; height: number; gap: number; radius: number };
  ticks: { color: string; width: number; height: number; bottom: number };
  labels: { color: string; fontFamily: string; fontSize: number; bottom: number };
  rangeLabel: { color: string; fontFamily: string; fontSize: number };
  interaction: {
    /** Both handles stay this far inside the picker. A hard invariant. */
    safeInsetPx: number;
    /** Pointer travel past the safe edge that reaches full edge speed. */
    edgeZonePx: number;
  };
}

export type PartialTimeRangePickerTheme = {
  [K in keyof TimeRangePickerTheme]?: Partial<TimeRangePickerTheme[K]>;
};

/** Row height per preset. Everything else is derived from it, so a custom
 * height stays coherent instead of needing a matching set of overrides. */
const DENSITY_HEIGHT: Record<TimeRangePickerDensity, number> = {
  comfortable: 56,
  default: 46,
  compact: 36,
};

export function defaultTimeRangePickerTheme(
  density: TimeRangePickerDensity,
  accent: string,
): TimeRangePickerTheme {
  const height = DENSITY_HEIGHT[density];
  const labelZone = density === 'compact' ? 14 : 15;
  const barHeight = Math.max(12, Math.round((height - labelZone) * 0.62));
  return {
    container: {
      height,
      radius: 14,
      background: 'rgba(255,255,255,0.04)',
      borderColor: 'transparent',
      borderWidth: 0,
      borderStyle: 'solid',
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    past: { color: '#000000', opacity: 0.28 },
    /**
     * Translucent fill with a distinctly stronger edge, inherited from the band
     * this replaces. A solid block hides the hour marks it sits on; at a quarter
     * opacity the bar reads as a SPAN over the axis rather than as an object
     * covering it, and the 0.66 border is what still gives it a definite edge.
     */
    range: {
      color: accent,
      fillOpacity: 0.24,
      borderColor: accent,
      borderOpacity: 0.66,
      borderWidth: 1,
      radius: Math.round(barHeight / 2),
      height: barHeight,
    },
    startHandle: {
      width: 6,
      hitWidth: 44,
      height: 'fill',
      color: '#FFFFFF',
      borderColor: 'transparent',
      borderWidth: 0,
      radius: 3,
    },
    endHandle: {
      width: 6,
      hitWidth: 44,
      height: 'fill',
      color: '#FFFFFF',
      borderColor: 'transparent',
      borderWidth: 0,
      radius: 3,
    },
    layers: {
      // Deliberately hard steps, not a gradient: the number of people available
      // jumps at a boundary, so a smooth ramp would assert a continuity the
      // data does not have.
      colors: [
        withAlpha(accent, 0.16),
        withAlpha(accent, 0.32),
        withAlpha(accent, 0.5),
        withAlpha(accent, 0.7),
        withAlpha(accent, 0.95),
      ],
      height: Math.max(5, Math.round(height * 0.15)),
      gap: 3,
      radius: 2,
    },
    ticks: { color: 'rgba(255,255,255,0.18)', width: 1, height: 5, bottom: labelZone },
    labels: {
      color: 'rgba(255,255,255,0.5)',
      fontFamily: FONT.medium,
      fontSize: density === 'compact' ? 9 : 9.5,
      bottom: 1,
    },
    rangeLabel: {
      color: '#F4F5F7',
      fontFamily: FONT.semibold,
      fontSize: density === 'compact' ? 9.5 : 11,
    },
    interaction: { safeInsetPx: 12, edgeZonePx: 52 },
  };
}

/** One level of nesting is all the theme has, so the merge stays this small —
 * and stays predictable, which a recursive merge over unknown shapes does not. */
export function resolveTimeRangePickerTheme(
  density: TimeRangePickerDensity,
  accent: string,
  overrides?: PartialTimeRangePickerTheme,
): TimeRangePickerTheme {
  const base = defaultTimeRangePickerTheme(density, accent);
  if (!overrides) return base;
  const merged = { ...base } as TimeRangePickerTheme;
  (Object.keys(overrides) as (keyof TimeRangePickerTheme)[]).forEach((key) => {
    const section = overrides[key];
    if (section) Object.assign(merged[key], section);
  });
  return merged;
}

export function handleHeightPx(handle: HandleTheme, trackHeight: number): number {
  return handle.height === 'fill' ? trackHeight : handle.height;
}

// One implementation for the whole app — see the util for why an
// `#RRGGBBAA` suffix is not a safe substitute.
export { withAlpha };
