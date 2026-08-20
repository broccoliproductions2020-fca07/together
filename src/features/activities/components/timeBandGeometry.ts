/**
 * The shared scale of the time band — ONE source for both variants.
 *
 * There are two band implementations because they behave differently under a
 * finger: `TimeBand` travels its rail when you push against an edge, while
 * `PlanningTimeBand` keeps the whole span in view and re-fits instead. That
 * split is real and stays. Their GEOMETRY had no business being split with it —
 * it lived twice, in two constant blocks, and had already drifted (the planner
 * grew a third size and a centred bar that the standard band never got).
 *
 * `bar` is CENTRED in the space above the hour labels rather than hung from the
 * top edge: the labels own a fixed strip at the bottom (`labelZone`), so equal
 * gaps above and below the span are what stop a row reading as top-heavy.
 *
 * `labelZone` is a floor, not a preference — the hour labels are drawn inside
 * it, so a smaller strip lets the span cover the very hours it is read against.
 */
export type TimeBandDensity = 'regular' | 'snug' | 'compact';

const DENSITY: Record<
  TimeBandDensity,
  { band: number; bar: number; labelZone: number; labelFont: number; spanFont: number }
> = {
  regular: { band: 56, bar: 28, labelZone: 15, labelFont: 9.5, spanFont: 11 },
  snug: { band: 46, bar: 20, labelZone: 14, labelFont: 9.5, spanFont: 10.5 },
  compact: { band: 36, bar: 14, labelZone: 14, labelFont: 9, spanFont: 9.5 },
};

export interface TimeBandMetrics {
  /** Total row height. */
  bandHeight: number;
  /** Span inset from the top / from the bottom. Derived, never typed in. */
  trackTop: number;
  trackBottom: number;
  /** Height of the grip inside the span — inset, so it can never out-grow it. */
  gripHeight: number;
  /** Bottom strip reserved for the hour labels. */
  labelZone: number;
  labelFont: number;
  spanFont: number;
  /**
   * How wide the span must be before it can carry its own times.
   *
   * Below this "18:00–21:00" would be clipped, and a truncated time is worse
   * than none — the summary line still states it. Scaled with the font so the
   * threshold means the same thing at every density.
   */
  spanLabelMinWidth: number;
}

export function timeBandMetrics(density: TimeBandDensity): TimeBandMetrics {
  const step = DENSITY[density];
  const trackTop = Math.round((step.band - step.labelZone - step.bar) / 2);
  return {
    bandHeight: step.band,
    trackTop,
    trackBottom: step.band - trackTop - step.bar,
    gripHeight: Math.max(10, step.bar - 8),
    labelZone: step.labelZone,
    labelFont: step.labelFont,
    spanFont: step.spanFont,
    spanLabelMinWidth: Math.round(step.spanFont * 8.2),
  };
}

/** Hard-cut at the label threshold would pop on every drag frame near it, so
 * the label fades across the last few pixels of room instead. */
export const TIME_BAND_SPAN_LABEL_FADE = 18;

/** 5, not 15: quarter-hour steps make "kurz nach halb" impossible to express,
 * and a drag has plenty of resolution to spare. */
export const TIME_BAND_SNAP_MINUTES = 5;
/** Mirrors DurationPicker, so an activity's length means the same in both. */
export const TIME_BAND_MIN_DURATION_MINUTES = 15;
export const TIME_BAND_MAX_DURATION_MINUTES = 12 * 60;
/** Response room before either grip reaches the viewport edge. */
export const TIME_BAND_FIT_INSET_PX = 18;
export const TIME_BAND_FIT_TARGET_FILL = 0.9;

/** The comfortable working scale — one hour is 80 dp wide. */
export const TIME_BAND_DEFAULT_PX_PER_HOUR = 80;
/**
 * How far the band may zoom out to show a whole span.
 *
 * A floor for LEGIBILITY, not for precision: editing always happens at the
 * default scale (the band zooms back in when a grip is touched), so the 5-minute
 * grid never has to be hit at this size. 16 dp/h puts a full twelve-hour span in
 * 192 dp, which fits the narrowest phone we target, and the hour labels thin out
 * on their own (`timeBandLabelInterval`) long before they could collide.
 */
export const TIME_BAND_MIN_PX_PER_HOUR = 16;

/**
 * The scale at which a span of this length fits the given width.
 *
 * Pure on purpose: the single band applies it to its own span, while the
 * planner applies it ONCE to the longest span in its stack and hands the result
 * to every row — that is what keeps a four-hour window visibly longer than a
 * two-hour one. Same arithmetic in both, so the two can never drift; the
 * decision of WHICH span to fit belongs to the caller, not here.
 */
export function fitPixelsPerHour(durationMinutes: number, viewportWidth: number): number {
  if (viewportWidth <= 0) return TIME_BAND_DEFAULT_PX_PER_HOUR;
  const available = Math.max(
    1,
    (viewportWidth - TIME_BAND_FIT_INSET_PX * 2) * TIME_BAND_FIT_TARGET_FILL,
  );
  const target = (available / Math.max(1, durationMinutes)) * 60;
  return Math.min(TIME_BAND_DEFAULT_PX_PER_HOUR, Math.max(TIME_BAND_MIN_PX_PER_HOUR, target));
}

/**
 * Which hours still get a label, with hysteresis.
 *
 * The thresholds deliberately overlap (a 1→2 switch at 36 dp/h, 2→1 only above
 * 48) so a scale drifting across a boundary cannot flicker the labels on and
 * off. Labels are 34 dp wide ("23:00"), so below ~40 dp/h every hour no longer fits.
 */
export function timeBandLabelInterval(currentInterval: number, pixelsPerHour: number): number {
  'worklet';
  if (currentInterval === 1) return pixelsPerHour < 40 ? 2 : 1;
  if (currentInterval === 2) {
    if (pixelsPerHour > 52) return 1;
    return pixelsPerHour < 19 ? 3 : 2;
  }
  if (currentInterval === 3) {
    if (pixelsPerHour > 27) return 2;
    return pixelsPerHour < 13 ? 4 : 3;
  }
  return pixelsPerHour > 18 ? 3 : 4;
}
