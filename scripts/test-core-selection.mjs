import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import ts from 'typescript';

const sourcePath = new URL('../src/features/overlay/core/coreSelection.ts', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath.pathname,
});
const module = { exports: {} };
vm.runInNewContext(compiled.outputText, { Math, Number, exports: module.exports, module }, { filename: sourcePath.pathname });

const {
  arcAngles,
  createCoreGesturePathState,
  isCoreCloseLane,
  isCoreReturnGesture,
  isCoreReturnLane,
  obliqueSectorWeights,
  previewTrackAngle,
  resolveGestureTrackArmedIndex,
  sectorBoundaries,
} = module.exports;

const rootAngles = arcAngles(4, (132 * Math.PI) / 180);
const rootWeights = obliqueSectorWeights(rootAngles, 0.3);
const activityAngles = arcAngles(2, (52 * Math.PI) / 180);
const rootRailReach = 60;
assert.equal(rootAngles.length, 4, 'the root orbit contains the four requested actions');
// These coordinates are measured from the CORE CENTRE, not from the touch.
// The home-bar-like arc is only a visual hint: the lower third of the circular
// thumb pad is the target, so no one has to hit the drawn marker precisely.
assert.equal(isCoreReturnLane(0, 28), false, 'the upper two thirds remain for actions');
assert.equal(isCoreReturnLane(0, 29), true, 'the lower Core third enters the lower action zone');
assert.equal(isCoreReturnGesture(0, 29), true, 'the lower action zone starts level-two return');
assert.equal(isCoreReturnLane(0, 57), true, 'the upper part of the lower third is return');
assert.equal(isCoreReturnLane(0, 58), false, 'the home-bar depth is not also return');
assert.equal(isCoreCloseLane(0, 57), false, 'close starts below the return band');
assert.equal(isCoreCloseLane(0, 58), true, 'the deepest lower zone is immediate close');
assert.equal(isCoreReturnGesture(58, 35), true, 'the whole lower area, not only its centre, is reserved');
assert.equal(isCoreReturnGesture(80, 35), false, 'the return area never escapes the circular Core');
assert.equal(isCoreCloseLane(80, 64), false, 'close never escapes the circular Core');

function trace(points, { angles, weights, horizontalReach, latch = null, previous = null }) {
  let path = createCoreGesturePathState(latch);
  let index = previous;
  let result = null;
  const indices = [];
  for (const [dx, dy] of points) {
    result = resolveGestureTrackArmedIndex({
      dx,
      dy,
      angles,
      weights,
      horizontalReach,
      previous: index,
      path,
    });
    index = result.index;
    path = result.path;
    indices.push(index);
  }
  return { ...result, indices };
}

const directAngle = rootAngles[2];
const direct = trace([[Math.sin(directAngle) * 110, -Math.cos(directAngle) * 110]], {
  angles: rootAngles,
  weights: rootWeights,
  horizontalReach: rootRailReach,
});
assert.equal(direct.index, 2, 'a direct radial mark selects its visible target');
assert.equal(direct.path.track, 'adaptive', 'a diagonal mark uses the adaptive coordinate');

const outerRadial = trace(
  [[Math.sin(rootAngles[3]) * 110, -Math.cos(rootAngles[3]) * 110]],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.equal(outerRadial.index, 3, 'the outer root action remains reachable by a radial mark');
assert.equal(outerRadial.path.track, 'adaptive', 'an outer radial mark stays continuously reachable');

const mixedCurve = trace(
  [
    [0, -46],
    [14, -66],
    [28, -78],
    [42, -76],
  ],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.equal(mixedCurve.index, 2, 'a loose, mixed curve selects the same target as a clean mark');
assert.equal(mixedCurve.path.track, 'adaptive', 'a loose curve stays continuously interpretable');

const sidewaysRail = trace(
  [
    [0, 0],
    [24, 0],
    [48, 0],
  ],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.equal(sidewaysRail.index, 3, 'a side scrub from the core reaches the rightmost root target');
assert.equal(sidewaysRail.path.track, 'adaptive', 'a side scrub uses the adaptive coordinate');

const leftRail = trace([[-48, 0]], {
  angles: rootAngles,
  weights: rootWeights,
  horizontalReach: rootRailReach,
});
assert.equal(leftRail.index, 0, 'the leftmost root target is reachable within 48 px of travel');

const railReturnedHome = trace(
  [
    [32, 0],
    [0, 0],
  ],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.equal(railReturnedHome.index, 2, 'returning through the centre preserves the armed scrub target');
assert.equal(railReturnedHome.path.track, 'adaptive', 'returning home keeps the adaptive coordinate');

const throughCentreRail = trace(
  [
    [-60, 0],
    [-18, 0],
    [0, 0],
    [18, 0],
    [60, 0],
  ],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.deepEqual(
  throughCentreRail.indices,
  [0, 1, 1, 2, 3],
  'a horizontal pass crosses both central root targets instead of jumping over them',
);

const railMixed = trace(
  [
    [32, -4],
    [58, -40],
  ],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.equal(railMixed.index, 3, 'a line that later curves keeps its initial scrub meaning');
assert.equal(railMixed.path.track, 'adaptive', 'a scrub can smoothly become a curve mid-gesture');

const activityLine = trace(
  [
    [0, 0],
    [50, 0],
  ],
  { angles: activityAngles, horizontalReach: 66 },
);
assert.equal(activityLine.index, 1, 'a horizontal thumb line selects Soon without tracing the arc');
assert.equal(activityLine.path.track, 'adaptive', 'Jetzt/Soon uses the same adaptive coordinate');

const returnedHome = trace(
  [
    [0, -56],
    [46, -56],
    [0, 0],
  ],
  { angles: activityAngles, horizontalReach: 66 },
);
assert.equal(returnedHome.index, 1, 'returning through the core preserves the pending activity selection');

const downDrag = trace([[0, 72]], {
  angles: rootAngles,
  weights: rootWeights,
  horizontalReach: rootRailReach,
});
assert.equal(downDrag.index, null, 'a drag down the map remains a cancel, never a command');
assert.equal(downDrag.path.track, 'cancelled', 'a downward start stays a cancellation');

const armedThenDown = trace(
  [
    [48, 0],
    [0, 72],
  ],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.equal(armedThenDown.index, 3, 'only the dedicated return lane can clear an armed action');

const cancelledThenSideways = trace(
  [
    [0, 72],
    [40, 40],
    [96, 6],
  ],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.equal(cancelledThenSideways.index, null, 'a cancelled stroke cannot arm by curving away');
assert.equal(
  cancelledThenSideways.path.track,
  'cancelled',
  'leaving the cancel only counts through the core, never around it',
);

const cancelledThenHome = trace(
  [
    [0, 72],
    [0, 4],
    [-14, -62],
    [-46, -84],
  ],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.equal(cancelledThenHome.path.track, 'adaptive', 'moving up clears a cancelled track');
assert.equal(cancelledThenHome.index, 1, 'the same hold can still choose after a cancelled dip');

// The level-change latch. "Aktivität" sits at -22 deg and "Jetzt" at -26 deg, so
// a thumb that dwelled on the former lands squarely on the latter the moment the
// sub-level opens under it. Holding to SEE the two options must never create one.
const dwellPoint = {
  x: Math.sin(rootAngles[1]) * 80,
  y: -Math.cos(rootAngles[1]) * 80,
};
const unlatched = trace([[dwellPoint.x, dwellPoint.y]], {
  angles: activityAngles,
  horizontalReach: 66,
});
assert.equal(unlatched.index, 0, 'without a latch the unchanged thumb position arms Jetzt');

const latched = trace([[dwellPoint.x, dwellPoint.y]], {
  angles: activityAngles,
  horizontalReach: 66,
  latch: dwellPoint,
});
assert.equal(latched.index, null, 'a level change arms nothing until the thumb moves');
assert.equal(latched.latched, true, 'the latch reports itself so the indicator can show it');
assert.equal(latched.path.track, 'adaptive', 'a latched path never commits a movement mode on jitter');

const latchJitter = trace(
  [
    [dwellPoint.x, dwellPoint.y],
    [dwellPoint.x + 9, dwellPoint.y - 6],
    [dwellPoint.x - 4, dwellPoint.y + 11],
  ],
  { angles: activityAngles, horizontalReach: 66, latch: dwellPoint },
);
assert.deepEqual(
  latchJitter.indices,
  [null, null, null],
  'resting-hand jitter never clears the latch',
);

const latchReleased = trace(
  [
    [dwellPoint.x, dwellPoint.y],
    [dwellPoint.x + 40, dwellPoint.y],
  ],
  { angles: activityAngles, horizontalReach: 66, latch: dwellPoint },
);
assert.equal(latchReleased.index, 1, 'a deliberate move past the latch chooses again');
assert.equal(latchReleased.latched, false, 'the latch clears once, and stays cleared');

// The weighted radial bounds remain ordered inside the adaptive coordinate;
// blending must never make a rightward sweep reverse or skip an action.
const adaptiveBounds = sectorBoundaries(rootAngles, rootWeights).map((angle) =>
  trace([[Math.sin(angle) * 80, -Math.cos(angle) * 80]], {
    angles: rootAngles,
    weights: rootWeights,
    horizontalReach: rootRailReach,
  }).position,
);
adaptiveBounds.slice(1).forEach((position, index) => {
  assert.ok(position > (adaptiveBounds[index] ?? -Infinity), 'adaptive boundaries stay in visual order');
});

const lineIntoCurve = trace(
  [
    [0, 0],
    [28, 0],
    [42, -10],
    [52, -32],
    [54, -58],
  ],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.equal(lineIntoCurve.indices.at(-1), 3, 'a line can become a curve without losing the intended outer action');
lineIntoCurve.indices.filter((index) => index != null).slice(1).forEach((index, step, armed) => {
  assert.ok(Math.abs(index - armed[step]) <= 1, 'line-to-curve never skips an armed target');
});

const curveIntoLine = trace(
  [
    [-48, -58],
    [-38, -32],
    [-24, -8],
    [4, 0],
    [28, 0],
    [52, 0],
  ],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.equal(curveIntoLine.indices.at(-1), 3, 'a curve can become a line and still reach its final action');
curveIntoLine.indices.filter((index) => index != null).slice(1).forEach((index, step, armed) => {
  assert.ok(Math.abs(index - armed[step]) <= 1, 'curve-to-line never skips an armed target');
});

const repeatedHybrid = trace(
  [
    [0, 0],
    [24, 0],
    [24, -22],
    [32, 0],
    [32, -34],
    [42, 0],
    [42, -42],
  ],
  { angles: rootAngles, weights: rootWeights, horizontalReach: rootRailReach },
);
assert.deepEqual(
  repeatedHybrid.indices,
  [null, 2, 2, 2, 2, 2, 2],
  'alternating between a line and a curve keeps the same visible target stable',
);

// The indicator has to keep following the thumb where the selector reports no
// position at all — inside the dead zone — or it parks at the apex and then
// teleports to the first target that arms.
assert.equal(previewTrackAngle(0, -3, rootAngles), null, 'pure jitter points nowhere');
assert.ok(
  Math.abs(previewTrackAngle(0, -20, rootAngles)) < 1e-9,
  'straight up inside the dead zone points straight up',
);
assert.equal(
  previewTrackAngle(200, 0, rootAngles),
  rootAngles[3],
  'a direction past the fan clamps to its end instead of promising more',
);
assert.equal(
  previewTrackAngle(-200, 0, rootAngles),
  rootAngles[0],
  'the same on the other end',
);

console.log('OK adaptive Core gesture selection');
