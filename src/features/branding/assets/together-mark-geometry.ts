import type { MorphPoint } from '../types/branding.types';

type Vector = Readonly<{
  x: number;
  y: number;
}>;

export type CubicSegment = Readonly<{
  start: MorphPoint;
  control1: MorphPoint;
  control2: MorphPoint;
  end: MorphPoint;
}>;

export const TOGETHER_MARK_VIEW_BOX = {
  x: 190,
  y: 40,
  width: 276,
  height: 177,
} as const;

const LEFT_CENTER_X = 256.5;
const RIGHT_CENTER_X = 402.5;
const MID_CENTER_X = (LEFT_CENTER_X + RIGHT_CENTER_X) / 2;
const CENTER_Y = 106.5;
const OUTER_RADIUS = 52.5;
const INNER_RADIUS = 36.5;
const BAND_RADIUS = (OUTER_RADIUS + INNER_RADIUS) / 2;
const HALF_BAND_WIDTH = (OUTER_RADIUS - INNER_RADIUS) / 2;
const FINAL_ATTACH_ANGLE = 0.72;
const HALF_SEPARATION = (RIGHT_CENTER_X - LEFT_CENTER_X) / 2;

/**
 * Progress windows (all in the shared 0..1 timeline driven by useTogetherLogoAnimation).
 * Bands are a pure function of `sep` until SEPARATION_END -- fully formed, frozen, and
 * untouched by the letter morph up to that point, per spec. Ring-arc anchors are allowed
 * to start blending toward the letterform a bit earlier (LETTER_START) so the hand-off
 * from separation into the morph reads as one continuous gesture. Band anchors only start
 * their own (later) blend once separation is complete -- a pure constant-width offset band
 * cannot reproduce the hand-authored letterform's junction fillets pixel-for-pixel, so a
 * late, gentle settle is required for the resting frame to exactly match the final artwork.
 */
const SEPARATION_END = 0.62;
const LETTER_START = 0.46;
const LETTER_END = 0.92;

/** Exact connected g-e subpath from the final wordmark SVG (176-point single loop). */
const FINAL_CONNECTED_GE_PATH =
  'M 204.00 104.00 L 204.00 109.00 L 205.00 118.00 L 208.00 128.00 L 211.00 134.00 L 215.00 140.00 L 224.00 149.00 L 230.00 153.00 L 239.00 157.00 L 247.00 159.00 L 267.00 159.00 L 272.00 158.00 L 278.00 156.00 L 286.00 151.00 L 288.00 153.00 L 288.00 164.00 L 287.00 170.00 L 284.00 177.00 L 276.00 185.00 L 269.00 188.00 L 265.00 189.00 L 247.00 189.00 L 240.00 187.00 L 236.00 185.00 L 228.00 177.00 L 211.00 178.00 L 213.00 183.00 L 218.00 190.00 L 224.00 195.00 L 229.00 198.00 L 240.00 202.00 L 246.00 203.00 L 267.00 203.00 L 276.00 201.00 L 281.00 199.00 L 288.00 195.00 L 296.00 187.00 L 300.00 180.00 L 302.00 174.00 L 303.00 168.00 L 303.00 137.00 L 306.00 134.00 L 306.00 133.00 L 308.00 131.00 L 309.00 131.00 L 312.00 128.00 L 315.00 126.00 L 320.00 124.00 L 340.00 124.00 L 346.00 126.00 L 352.00 130.00 L 357.00 135.00 L 357.00 136.00 L 363.00 143.00 L 367.00 147.00 L 374.00 152.00 L 382.00 156.00 L 388.00 158.00 L 393.00 159.00 L 413.00 159.00 L 418.00 158.00 L 427.00 155.00 L 431.00 153.00 L 437.00 149.00 L 444.00 142.00 L 446.00 139.00 L 451.00 128.00 L 433.00 129.00 L 430.00 134.00 L 427.00 137.00 L 423.00 140.00 L 414.00 144.00 L 408.00 145.00 L 398.00 145.00 L 390.00 143.00 L 385.00 141.00 L 379.00 137.00 L 363.00 120.00 L 358.00 116.00 L 350.00 112.00 L 344.00 110.00 L 337.00 109.00 L 323.00 109.00 L 314.00 111.00 L 311.00 112.00 L 305.00 115.00 L 302.00 117.00 L 283.00 136.00 L 279.00 139.00 L 273.00 142.00 L 267.00 144.00 L 262.00 145.00 L 254.00 145.00 L 245.00 143.00 L 236.00 138.00 L 227.00 129.00 L 223.00 122.00 L 221.00 115.00 L 221.00 99.00 L 223.00 92.00 L 226.00 86.00 L 229.00 82.00 L 234.00 77.00 L 238.00 74.00 L 247.00 70.00 L 252.00 69.00 L 263.00 69.00 L 268.00 70.00 L 274.00 72.00 L 281.00 76.00 L 285.00 79.00 L 297.00 92.00 L 302.00 96.00 L 310.00 100.00 L 320.00 103.00 L 341.00 103.00 L 349.00 101.00 L 354.00 99.00 L 359.00 96.00 L 363.00 93.00 L 371.00 84.00 L 375.00 80.00 L 376.00 80.00 L 381.00 75.00 L 387.00 72.00 L 397.00 69.00 L 409.00 69.00 L 414.00 70.00 L 421.00 73.00 L 424.00 75.00 L 429.00 80.00 L 433.00 86.00 L 435.00 92.00 L 436.00 97.00 L 393.00 98.00 L 389.00 100.00 L 386.00 103.00 L 386.00 112.00 L 453.00 112.00 L 453.00 99.00 L 452.00 93.00 L 449.00 83.00 L 445.00 75.00 L 442.00 71.00 L 435.00 64.00 L 429.00 60.00 L 425.00 58.00 L 416.00 55.00 L 410.00 54.00 L 396.00 54.00 L 390.00 55.00 L 383.00 57.00 L 373.00 62.00 L 369.00 65.00 L 360.00 75.00 L 352.00 83.00 L 345.00 87.00 L 338.00 89.00 L 323.00 89.00 L 316.00 87.00 L 312.00 85.00 L 309.00 83.00 L 292.00 65.00 L 286.00 61.00 L 280.00 58.00 L 274.00 56.00 L 265.00 54.00 L 250.00 54.00 L 245.00 55.00 L 238.00 57.00 L 228.00 62.00 L 225.00 64.00 L 215.00 74.00 L 211.00 80.00 L 208.00 86.00 L 205.00 96.00 Z';

function parseFinalPoints(): MorphPoint[] {
  const values = [...FINAL_CONNECTED_GE_PATH.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  return Array.from({ length: values.length / 2 }, (_, index) => ({
    x: values[index * 2],
    y: values[index * 2 + 1],
  }));
}

/** All 176 real anchor points from the final artwork -- used as-is, never hand-approximated. */
const FINAL_POINTS = parseFinalPoints();
const ANCHOR_COUNT = FINAL_POINTS.length;

/** Ring-only "band-role" source-index ranges: [start, end, side, offsetSign, reversed]. */
const BAND_SOURCE_RANGES: readonly (readonly [number, number, 'lower' | 'upper', 1 | -1, boolean])[] = [
  [40, 53, 'lower', 1, false],
  [77, 87, 'lower', -1, true],
  [111, 120, 'upper', 1, false],
  [154, 162, 'upper', -1, true],
];

const PULL_SEAM_SOURCE_INDICES = new Set<number>([66, 67, 133, 139]);
const FINAL_SHARP_SOURCE_INDICES = new Set<number>([13, 14, 25, 40, 66, 67, 133, 134, 136, 137, 138, 139]);

function isInRange(index: number, start: number, end: number) {
  'worklet';
  return index >= start && index <= end;
}

function mix(from: number, to: number, amount: number) {
  'worklet';
  return from + (to - from) * amount;
}

function clamp01(value: number) {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t: number) {
  'worklet';
  const p = clamp01(t);
  return 1 - Math.pow(1 - p, 3);
}

function easeInOutCubic(t: number) {
  'worklet';
  const p = clamp01(t);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function rangeProgress(value: number, start: number, end: number) {
  'worklet';
  return clamp01((value - start) / (end - start));
}

function pointOnCircle(centerX: number, centerY: number, radius: number, angle: number): MorphPoint {
  'worklet';
  return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
}

function normalize(vector: Vector): Vector {
  'worklet';
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function add(point: MorphPoint, vector: Vector, amount = 1): MorphPoint {
  'worklet';
  return { x: point.x + vector.x * amount, y: point.y + vector.y * amount };
}

function lerpPoint(from: MorphPoint, to: MorphPoint, amount: number): MorphPoint {
  'worklet';
  return { x: mix(from.x, to.x, amount), y: mix(from.y, to.y, amount) };
}

function distance(a: MorphPoint, b: MorphPoint) {
  'worklet';
  return Math.hypot(b.x - a.x, b.y - a.y);
}

type SeparationState = Readonly<{
  sep: number;
  leftCenter: number;
  rightCenter: number;
}>;

/** Both circle centers and the connector bands are driven by this single value. */
function separationState(progress: number): SeparationState {
  'worklet';
  const sep = easeOutCubic(rangeProgress(progress, 0, SEPARATION_END));
  return {
    sep,
    leftCenter: MID_CENTER_X - HALF_SEPARATION * sep,
    rightCenter: MID_CENTER_X + HALF_SEPARATION * sep,
  };
}

/**
 * Live Bezier centerline for a connector band. Attach angle grows from a shared 0
 * baseline (both circles coincide, band is degenerate/invisible) to FINAL_ATTACH_ANGLE
 * as `sep` grows to 1 -- guaranteeing the two rings read as one seamless ring at
 * progress 0 and land exactly on the authored band geometry once fully separated.
 */
function bandCenterline(side: 'upper' | 'lower', state: SeparationState): CubicSegment {
  'worklet';
  const { sep, leftCenter, rightCenter } = state;
  const isLower = side === 'lower';
  const leftAngle = mix(0, isLower ? FINAL_ATTACH_ANGLE : -FINAL_ATTACH_ANGLE, sep);
  const rightAngle = mix(0, isLower ? Math.PI - FINAL_ATTACH_ANGLE : -(Math.PI - FINAL_ATTACH_ANGLE), sep);
  const start = pointOnCircle(leftCenter, CENTER_Y, BAND_RADIUS, leftAngle);
  const end = pointOnCircle(rightCenter, CENTER_Y, BAND_RADIUS, rightAngle);
  const startTangent = normalize(
    isLower ? { x: Math.sin(leftAngle), y: -Math.cos(leftAngle) } : { x: -Math.sin(leftAngle), y: Math.cos(leftAngle) },
  );
  const endTangent = normalize(
    isLower ? { x: Math.sin(rightAngle), y: -Math.cos(rightAngle) } : { x: -Math.sin(rightAngle), y: Math.cos(rightAngle) },
  );
  const gap = Math.max(0, end.x - start.x);
  const controlLength = Math.max(0.001, gap * 0.34);
  return {
    start,
    control1: add(start, startTangent, controlLength),
    control2: add(end, endTangent, -controlLength),
    end,
  };
}

function cubicPoint(segment: CubicSegment, t: number): MorphPoint {
  'worklet';
  const inv = 1 - t;
  return {
    x: inv ** 3 * segment.start.x + 3 * inv ** 2 * t * segment.control1.x + 3 * inv * t ** 2 * segment.control2.x + t ** 3 * segment.end.x,
    y: inv ** 3 * segment.start.y + 3 * inv ** 2 * t * segment.control1.y + 3 * inv * t ** 2 * segment.control2.y + t ** 3 * segment.end.y,
  };
}

function cubicTangent(segment: CubicSegment, t: number): Vector {
  'worklet';
  const inv = 1 - t;
  return {
    x:
      3 * inv ** 2 * (segment.control1.x - segment.start.x) +
      6 * inv * t * (segment.control2.x - segment.control1.x) +
      3 * t ** 2 * (segment.end.x - segment.control2.x),
    y:
      3 * inv ** 2 * (segment.control1.y - segment.start.y) +
      6 * inv * t * (segment.control2.y - segment.control1.y) +
      3 * t ** 2 * (segment.end.y - segment.control2.y),
  };
}

function offsetPoint(point: MorphPoint, tangent: Vector, offset: number): MorphPoint {
  'worklet';
  const direction = normalize(tangent);
  const normal = { x: -direction.y, y: direction.x };
  return add(point, normal, offset);
}

function bandEdgePoint(centerline: CubicSegment, t: number, offset: number): MorphPoint {
  'worklet';
  return offsetPoint(cubicPoint(centerline, t), cubicTangent(centerline, t), offset);
}

/**
 * Live ring-arc position for a non-band source index. Every bound is written as
 * mix(baseline, finalAngle, sep) where baseline is chosen so that the left and right
 * pieces of a given boundary always land on the exact same point when sep=0 -- that is
 * what makes progress=0 read as a single unified ring instead of two overlapping outlines
 * with a visible seam.
 */
function ringArcPoint(sourceIndex: number, state: SeparationState): MorphPoint {
  'worklet';
  const { sep, leftCenter, rightCenter } = state;
  const attach = (finalAngle: number) => mix(0, finalAngle, sep);

  if (isInRange(sourceIndex, 0, 40)) {
    const angle = mix(Math.PI, attach(FINAL_ATTACH_ANGLE), rangeProgress(sourceIndex, 0, 40));
    return pointOnCircle(leftCenter, CENTER_Y, OUTER_RADIUS, angle);
  }
  if (isInRange(sourceIndex, 53, 66)) {
    const angle = mix(attach(Math.PI - FINAL_ATTACH_ANGLE), 0, rangeProgress(sourceIndex, 53, 66));
    return pointOnCircle(rightCenter, CENTER_Y, OUTER_RADIUS, angle);
  }
  if (isInRange(sourceIndex, 67, 77)) {
    const angle = mix(0, attach(Math.PI - FINAL_ATTACH_ANGLE), rangeProgress(sourceIndex, 67, 77));
    return pointOnCircle(rightCenter, CENTER_Y, INNER_RADIUS, angle);
  }
  if (isInRange(sourceIndex, 87, 111)) {
    const angle = mix(
      attach(FINAL_ATTACH_ANGLE),
      mix(2 * Math.PI, 2 * Math.PI - FINAL_ATTACH_ANGLE, sep),
      rangeProgress(sourceIndex, 87, 111),
    );
    return pointOnCircle(leftCenter, CENTER_Y, INNER_RADIUS, angle);
  }
  if (isInRange(sourceIndex, 120, 133)) {
    const angle = mix(
      mix(2 * Math.PI, Math.PI + FINAL_ATTACH_ANGLE, sep),
      2 * Math.PI,
      rangeProgress(sourceIndex, 120, 133),
    );
    return pointOnCircle(rightCenter, CENTER_Y, INNER_RADIUS, angle);
  }
  if (isInRange(sourceIndex, 133, 139)) {
    return {
      x: rightCenter + mix(INNER_RADIUS, OUTER_RADIUS, rangeProgress(sourceIndex, 133, 139)),
      y: CENTER_Y,
    };
  }
  if (isInRange(sourceIndex, 139, 154)) {
    const angle = mix(0, attach(-(Math.PI - FINAL_ATTACH_ANGLE)), rangeProgress(sourceIndex, 139, 154));
    return pointOnCircle(rightCenter, CENTER_Y, OUTER_RADIUS, angle);
  }
  // 162..175
  const angle = mix(attach(-FINAL_ATTACH_ANGLE), -Math.PI, rangeProgress(sourceIndex, 162, 175));
  return pointOnCircle(leftCenter, CENTER_Y, OUTER_RADIUS, angle);
}

function isBandSourceIndex(sourceIndex: number) {
  'worklet';
  return BAND_SOURCE_RANGES.some(([start, end]) => isInRange(sourceIndex, start, end));
}

function bandAnchorPoint(sourceIndex: number, state: SeparationState): MorphPoint {
  'worklet';
  for (const [start, end, side, sign, reversed] of BAND_SOURCE_RANGES) {
    if (!isInRange(sourceIndex, start, end)) continue;
    const centerline = bandCenterline(side, state);
    const localT = rangeProgress(sourceIndex, start, end);
    const t = reversed ? 1 - localT : localT;
    return bandEdgePoint(centerline, t, sign * HALF_BAND_WIDTH);
  }
  // Unreachable: callers always guard with isBandSourceIndex first.
  return { x: 0, y: 0 };
}

function anchorPoint(sourceIndex: number, progress: number): MorphPoint {
  'worklet';
  const state = separationState(progress);
  const finalPos = FINAL_POINTS[sourceIndex];
  if (isBandSourceIndex(sourceIndex)) {
    const ringPos = bandAnchorPoint(sourceIndex, state);
    const letterT = easeInOutCubic(rangeProgress(progress, SEPARATION_END, LETTER_END));
    return letterT <= 0 ? ringPos : lerpPoint(ringPos, finalPos, letterT);
  }
  const ringPos = ringArcPoint(sourceIndex, state);
  const letterT = easeInOutCubic(rangeProgress(progress, LETTER_START, LETTER_END));
  return letterT <= 0 ? ringPos : lerpPoint(ringPos, finalPos, letterT);
}

function sharpAmount(sourceIndex: number, progress: number) {
  'worklet';
  if (PULL_SEAM_SOURCE_INDICES.has(sourceIndex)) return 1;
  if (FINAL_SHARP_SOURCE_INDICES.has(sourceIndex)) {
    return easeInOutCubic(rangeProgress(progress, LETTER_START, LETTER_END));
  }
  return 0;
}

const CR_ALPHA = 0.5;
const CR_EPS = 1e-3;

function crParam(a: MorphPoint, b: MorphPoint) {
  'worklet';
  return Math.max(distance(a, b), CR_EPS) ** CR_ALPHA;
}

/**
 * Centripetal Catmull-Rom -> cubic Bezier conversion for one segment (4 consecutive
 * anchors). The curated point list is extremely unevenly spaced (dense near letterform
 * corners, sparse on straight runs); a naive "normalize direction * heuristic length"
 * tangent estimate under-rounds the sparse stretches and reads as faceted. Centripetal
 * parametrization is the standard, tuning-free fix.
 */
function centripetalControls(p0: MorphPoint, p1: MorphPoint, p2: MorphPoint, p3: MorphPoint) {
  'worklet';
  const t0 = 0;
  const t1 = t0 + crParam(p0, p1);
  const t2 = t1 + crParam(p1, p2);
  const t3 = t2 + crParam(p2, p3);

  const m1 = {
    x: (t2 - t1) * ((p1.x - p0.x) / (t1 - t0) - (p2.x - p0.x) / (t2 - t0) + (p2.x - p1.x) / (t2 - t1)),
    y: (t2 - t1) * ((p1.y - p0.y) / (t1 - t0) - (p2.y - p0.y) / (t2 - t0) + (p2.y - p1.y) / (t2 - t1)),
  };
  const m2 = {
    x: (t2 - t1) * ((p2.x - p1.x) / (t2 - t1) - (p3.x - p1.x) / (t3 - t1) + (p3.x - p2.x) / (t3 - t2)),
    y: (t2 - t1) * ((p2.y - p1.y) / (t2 - t1) - (p3.y - p1.y) / (t3 - t1) + (p3.y - p2.y) / (t3 - t2)),
  };

  return {
    control1: { x: p1.x + m1.x / 3, y: p1.y + m1.y / 3 },
    control2: { x: p2.x - m2.x / 3, y: p2.y - m2.y / 3 },
  };
}

/**
 * Builds the whole mark -- ring, connector bands and letterform -- as a single closed,
 * evenodd cubic-Bezier loop for any progress in [0, 1]. Every one of the 176 real anchor
 * points from the final artwork is used directly (never hand-approximated), so progress=1
 * always lands pixel-exact on the provided logo.
 */
export function buildTogetherMarkSegments(progress: number): CubicSegment[] {
  'worklet';
  const anchors: MorphPoint[] = [];
  const sharp: number[] = [];
  for (let index = 0; index < ANCHOR_COUNT; index += 1) {
    anchors.push(anchorPoint(index, progress));
    sharp.push(sharpAmount(index, progress));
  }

  const segments: CubicSegment[] = [];
  for (let index = 0; index < ANCHOR_COUNT; index += 1) {
    const nextIndex = (index + 1) % ANCHOR_COUNT;
    const start = anchors[index];
    const end = anchors[nextIndex];
    const p0 = anchors[(index - 1 + ANCHOR_COUNT) % ANCHOR_COUNT];
    const p3 = anchors[(nextIndex + 1) % ANCHOR_COUNT];
    const { control1, control2 } = centripetalControls(p0, start, end, p3);
    segments.push({
      start,
      control1: lerpPoint(control1, start, sharp[index]),
      control2: lerpPoint(control2, end, sharp[nextIndex]),
      end,
    });
  }
  return segments;
}

function formatNumber(value: number) {
  'worklet';
  return Math.round(value * 100) / 100;
}

export function segmentsToSvgPath(segments: readonly CubicSegment[]) {
  'worklet';
  const first = segments[0];
  let path = `M ${formatNumber(first.start.x)} ${formatNumber(first.start.y)}`;
  for (const segment of segments) {
    path += ` C ${formatNumber(segment.control1.x)} ${formatNumber(segment.control1.y)} ${formatNumber(segment.control2.x)} ${formatNumber(segment.control2.y)} ${formatNumber(segment.end.x)} ${formatNumber(segment.end.y)}`;
  }
  return `${path} Z`;
}
