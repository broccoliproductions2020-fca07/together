import type { MapCoordinate, MapMarker } from '../types/map.types';

export interface ProjectedMarkerPoint {
  x: number;
  y: number;
}

export interface MarkerCollisionBox {
  width: number;
  height: number;
  /** Normalized location of the geographic coordinate inside the visible
   * collision bounds. Activity boards sit almost entirely above that point. */
  anchor?: ProjectedMarkerPoint;
}

export interface MarkerCollisionCandidate extends MarkerCollisionBox {
  marker: MapMarker;
}

/**
 * The box a GROUP occupies once it has been replaced by a single stack pin.
 *
 * A merged stack is wider than any of the markers it swallowed, so grouping
 * cannot stop at "do the individuals overlap?" — the stack that replaces them
 * could still cover a neighbour that none of them touched. The caller supplies
 * this because marker geometry belongs to the map, not here.
 */
export type MergedBoxResolver = (members: MarkerCollisionCandidate[]) => MarkerCollisionBox;

const EXACT_COORDINATE_EPSILON = 0.0000001;
// Covers antialiasing at the board edge without merging visibly separate pins.
const COLLISION_GAP = 2;

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function sameCoordinate(left: MapCoordinate, right: MapCoordinate) {
  return (
    Math.abs(left.latitude - right.latitude) <= EXACT_COORDINATE_EPSILON &&
    Math.abs(left.longitude - right.longitude) <= EXACT_COORDINATE_EPSILON
  );
}

function boundsFor(point: ProjectedMarkerPoint, box: MarkerCollisionBox): Bounds {
  const anchor = box.anchor ?? { x: 0.5, y: 0.5 };
  return {
    left: point.x - box.width * anchor.x,
    right: point.x + box.width * (1 - anchor.x),
    top: point.y - box.height * anchor.y,
    bottom: point.y + box.height * (1 - anchor.y),
  };
}

function boundsOverlap(left: Bounds, right: Bounds) {
  return !(
    left.right + COLLISION_GAP < right.left ||
    right.right + COLLISION_GAP < left.left ||
    left.bottom + COLLISION_GAP < right.top ||
    right.bottom + COLLISION_GAP < left.top
  );
}

function projectedCollision(
  left: MarkerCollisionCandidate,
  right: MarkerCollisionCandidate,
  points: Readonly<Record<string, ProjectedMarkerPoint>>,
) {
  const a = points[left.marker.id];
  const b = points[right.marker.id];
  if (!a || !b) return sameCoordinate(left.marker.coordinate, right.marker.coordinate);
  return boundsOverlap(boundsFor(a, left), boundsFor(b, right));
}

/**
 * The point a stack pin is drawn at: the mean of its members' screen points.
 *
 * The pin itself is placed at the mean COORDINATE (`activityStackCoordinate`).
 * Averaging the projected points instead is the same thing to well under a
 * pixel at the distances a stack spans — Mercator is only nonlinear over
 * degrees, and a stack is at most ~100 px wide.
 */
function groupPoint(
  members: MarkerCollisionCandidate[],
  points: Readonly<Record<string, ProjectedMarkerPoint>>,
): ProjectedMarkerPoint | null {
  let x = 0;
  let y = 0;
  let seen = 0;
  for (const member of members) {
    const point = points[member.marker.id];
    if (!point) continue;
    x += point.x;
    y += point.y;
    seen += 1;
  }
  return seen === 0 ? null : { x: x / seen, y: y / seen };
}

/**
 * Connected collision groups at the current native map projection.
 *
 * Runs to a fixed point rather than in a single pass. The first pass asks only
 * what the markers themselves cover, so two pins come apart the moment their
 * own boards clear each other — this used to be answered with a worst-case box
 * as wide as a fully-labelled stack pin, which kept singles merged about 31 px
 * of zoom longer than they needed to be. Later passes then re-test the STACKS
 * that resulted, because a stack is wider than its members and may cover a
 * neighbour none of them touched. Merging is monotone, so the loop settles.
 *
 * Selected markers stay independent, so choosing one from a stack can lift the
 * real marker above the remaining stack instead of immediately swallowing it
 * again.
 */
export function groupMarkersByProjectedCollision(
  candidates: MarkerCollisionCandidate[],
  points: Readonly<Record<string, ProjectedMarkerPoint>>,
  independentIds: ReadonlySet<string> = new Set(),
  resolveMergedBox?: MergedBoxResolver,
): MarkerCollisionCandidate[][] {
  const parents = candidates.map((_, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parents[current] !== current) current = parents[current];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = current;
      index = next;
    }
    return current;
  };
  const unite = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return false;
    parents[rightRoot] = leftRoot;
    return true;
  };

  const joinable = candidates.map((candidate) => !independentIds.has(candidate.marker.id));

  for (let left = 0; left < candidates.length; left += 1) {
    if (!joinable[left]) continue;
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (!joinable[right]) continue;
      if (projectedCollision(candidates[left], candidates[right], points)) unite(left, right);
    }
  }

  const collectGroups = () => {
    const groups = new Map<number, number[]>();
    candidates.forEach((_, index) => {
      const root = find(index);
      const group = groups.get(root);
      if (group) group.push(index);
      else groups.set(root, [index]);
    });
    return [...groups.values()];
  };

  if (resolveMergedBox) {
    // Bounded by the number of candidates: every pass that changes anything
    // removes at least one group, and a pass that changes nothing ends it.
    for (let pass = 0; pass < candidates.length; pass += 1) {
      const groups = collectGroups().filter((group) => group.every((index) => joinable[index]));
      const resolved = groups.flatMap((group) => {
        const members = group.map((index) => candidates[index]);
        const point = groupPoint(members, points);
        if (!point) return [];
        const box = members.length > 1 ? resolveMergedBox(members) : members[0];
        return [{ group, bounds: boundsFor(point, box) }];
      });

      let merged = false;
      for (let left = 0; left < resolved.length; left += 1) {
        for (let right = left + 1; right < resolved.length; right += 1) {
          if (!boundsOverlap(resolved[left].bounds, resolved[right].bounds)) continue;
          if (unite(resolved[left].group[0], resolved[right].group[0])) merged = true;
        }
      }
      if (!merged) break;
    }
  }

  return collectGroups().map((group) => group.map((index) => candidates[index]));
}

export function activityStackId(markers: MapMarker[]) {
  const firstId = markers.map((marker) => marker.id).sort()[0] ?? 'empty';
  return `activity-stack:${firstId}`;
}

export function activityStackCoordinate(markers: MapMarker[]): MapCoordinate {
  const count = Math.max(markers.length, 1);
  return {
    latitude: markers.reduce((sum, marker) => sum + marker.coordinate.latitude, 0) / count,
    longitude: markers.reduce((sum, marker) => sum + marker.coordinate.longitude, 0) / count,
  };
}
