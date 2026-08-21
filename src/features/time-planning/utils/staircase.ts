/**
 * The availability staircase as ONE outline.
 *
 * Drawing each stretch as its own rectangle looked right and was not: a
 * percentage width is rounded to physical pixels per element, so neighbouring
 * blocks land a fraction apart and the staircase tears open at every change of
 * cover. And a corner radius on separate blocks makes it worse — each one
 * rounds away from its neighbour, so the run reads as loose tiles.
 *
 * One path fixes both. The treads join because they are the same shape, and the
 * corners can be softened without opening a gap. The per-stretch opacity is
 * still possible: the caller clips its rectangles to this outline.
 */

export interface StaircaseStep {
  startPx: number;
  endPx: number;
  /** Height above the baseline, in the same pixel space. */
  height: number;
}

interface Point {
  x: number;
  y: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Contiguous runs of covered time. A stretch nobody can make genuinely breaks
 * the shape, and joining across it would draw a floor that is not there.
 */
export function staircaseRuns(steps: StaircaseStep[]): StaircaseStep[][] {
  const runs: StaircaseStep[][] = [];
  let current: StaircaseStep[] = [];
  steps.forEach((step) => {
    if (step.height <= 0 || step.endPx <= step.startPx) {
      if (current.length) runs.push(current);
      current = [];
      return;
    }
    const previous = current[current.length - 1];
    if (previous && Math.abs(previous.endPx - step.startPx) > 0.51) {
      runs.push(current);
      current = [];
    }
    current.push(step);
  });
  if (current.length) runs.push(current);
  return runs;
}

/** The closed outline of one contiguous run, walked as a rectilinear polygon:
 * up the left edge, along each tread, down the right edge, back along the base. */
export function staircasePoints(run: StaircaseStep[], baseY: number): Point[] {
  if (run.length === 0) return [];
  const points: Point[] = [{ x: run[0].startPx, y: baseY }];
  run.forEach((step, index) => {
    const top = baseY - step.height;
    if (index === 0) {
      points.push({ x: step.startPx, y: top });
    } else {
      // The riser between two treads: across at the old height, then up or down.
      points.push({ x: step.startPx, y: baseY - run[index - 1].height });
      points.push({ x: step.startPx, y: top });
    }
    points.push({ x: step.endPx, y: top });
  });
  points.push({ x: run[run.length - 1].endPx, y: baseY });
  return points;
}

/**
 * A closed path through `points` with every corner cut by `radius`.
 *
 * The radius is clamped per corner to half the shorter of its two edges, so a
 * five-minute tread never rounds itself out of existence and a one-person
 * sliver keeps its height.
 */
export function roundedPolygonPath(points: Point[], radius: number): string {
  const count = points.length;
  if (count < 3) return '';

  const parts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const previous = points[(index - 1 + count) % count];
    const current = points[index];
    const next = points[(index + 1) % count];

    const inLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outLength = Math.hypot(next.x - current.x, next.y - current.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);

    if (r <= 0.01 || inLength === 0 || outLength === 0) {
      parts.push(`${index === 0 ? 'M' : 'L'}${round2(current.x)},${round2(current.y)}`);
      continue;
    }

    const from = {
      x: current.x + ((previous.x - current.x) / inLength) * r,
      y: current.y + ((previous.y - current.y) / inLength) * r,
    };
    const to = {
      x: current.x + ((next.x - current.x) / outLength) * r,
      y: current.y + ((next.y - current.y) / outLength) * r,
    };
    parts.push(`${index === 0 ? 'M' : 'L'}${round2(from.x)},${round2(from.y)}`);
    parts.push(`Q${round2(current.x)},${round2(current.y)} ${round2(to.x)},${round2(to.y)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Every contiguous run of `steps`, as rounded closed paths. */
export function staircasePaths(
  steps: StaircaseStep[],
  baseY: number,
  radius: number,
): string[] {
  return staircaseRuns(steps)
    .map((run) => roundedPolygonPath(staircasePoints(run, baseY), radius))
    .filter((path) => path.length > 0);
}
