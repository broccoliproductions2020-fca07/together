import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

/**
 * Exercises when activity pins merge into a stack and when they come apart.
 *
 * This is pure geometry and every number below is derived from the real marker
 * layout, never typed in — the point of the test is that grouping asks what a
 * marker ACTUALLY covers. It used to floor every candidate at the width of a
 * fully-labelled stack pin, so two pins stayed merged well past the zoom at
 * which they already fit side by side.
 *
 * Run: `node scripts/test-marker-collision.mjs`
 */

function load(path) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  });
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('exports', 'module', 'require', compiled.outputText)(
    module.exports,
    module,
    () => ({}),
  );
  return module.exports;
}

const layout = load('src/features/map/components/activityMarkerLayout.ts');
const { groupMarkersByProjectedCollision } = load('src/features/map/utils/markerCollision.ts');

const {
  activityMarkerCardWidth,
  ACTIVITY_MARKER_GROUND_Y,
  ACTIVITY_MARKER_GROUND_HEIGHT,
  ACTIVITY_MARKER_SHELL_TOP,
} = layout;

const HEIGHT = ACTIVITY_MARKER_GROUND_Y + ACTIVITY_MARKER_GROUND_HEIGHT - ACTIVITY_MARKER_SHELL_TOP;
const ANCHOR = { x: 0.5, y: (ACTIVITY_MARKER_GROUND_Y - ACTIVITY_MARKER_SHELL_TOP) / HEIGHT };
/** Mirrors `COLLISION_GAP` in markerCollision.ts. */
const GAP = 2;
/** Street zoom — where the complaint lives and where the widths differ most. */
const STAGE = 1;

/** A plain, not-joined single pin: one face, no revealed title. */
const SINGLE_WIDTH = activityMarkerCardWidth(1, true, STAGE, false, 'Bier');
const stackWidth = (count) => activityMarkerCardWidth(1, true, STAGE, false, `${count} Activities`);
/** What the OLD code forced every candidate to be. */
const OLD_FLOOR_WIDTH = activityMarkerCardWidth(1, true, STAGE, false, '99 Activities');

function candidate(id, width = SINGLE_WIDTH) {
  return {
    marker: { id, coordinate: { latitude: 52 + Number(id.slice(1)) / 1000, longitude: 13 } },
    width,
    height: HEIGHT,
    anchor: ANCHOR,
  };
}

/** Groups markers laid out on one horizontal line at the given x positions. */
function groupAtX(positions, options = {}) {
  const candidates = positions.map((_, index) => candidate(`m${index}`, options.width));
  const points = Object.fromEntries(positions.map((x, index) => [`m${index}`, { x, y: 200 }]));
  // `in`, not `??`: a case deliberately passing no resolver must reach the
  // function as `undefined` rather than falling back to the default.
  const resolver = 'resolveMergedBox' in options ? options.resolveMergedBox : stackBox;
  const groups = groupMarkersByProjectedCollision(
    candidates,
    points,
    options.independent ?? new Set(),
    resolver,
  );
  return groups
    .map((group) => group.map(({ marker }) => marker.id).sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
}

const stackBox = (members) => ({
  width: stackWidth(members.length),
  height: HEIGHT,
  anchor: ANCHOR,
});

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}

console.log('marker collision');
console.log(
  `      single ${SINGLE_WIDTH}px · stack(2) ${stackWidth(2)}px · old floor ${OLD_FLOOR_WIDTH}px · gap ${GAP}px\n`,
);

// Two singles touch while their centres are closer than this.
const SINGLE_SPLIT_AT = SINGLE_WIDTH + GAP;
// What the old floor demanded before it would let go.
const OLD_SPLIT_AT = OLD_FLOOR_WIDTH + GAP;

check('two pins split as soon as their own boards clear', () => {
  assert.deepEqual(groupAtX([0, SINGLE_SPLIT_AT + 1]), [['m0'], ['m1']]);
});

check('two pins still merge while their own boards overlap', () => {
  assert.deepEqual(groupAtX([0, SINGLE_SPLIT_AT - 1]), [['m0', 'm1']]);
});

check('a visible three-pixel gap no longer merges separate pins', () => {
  assert.deepEqual(groupAtX([0, SINGLE_WIDTH + 3]), [['m0'], ['m1']]);
});

check('the old floor kept them merged far longer — that gap is now recovered', () => {
  assert.ok(
    OLD_SPLIT_AT - SINGLE_SPLIT_AT > 25,
    `expected a meaningful recovery, got ${OLD_SPLIT_AT - SINGLE_SPLIT_AT}px`,
  );
  // Exactly the band that used to stay clustered and now comes apart.
  const midway = Math.round((SINGLE_SPLIT_AT + OLD_SPLIT_AT) / 2);
  assert.deepEqual(groupAtX([0, midway]), [['m0'], ['m1']]);
  // …and the old rule really would have merged it, same inputs, floored width.
  assert.deepEqual(groupAtX([0, midway], { width: OLD_FLOOR_WIDTH }), [['m0', 'm1']]);
});

check('a stack that grows over a neighbour still swallows it', () => {
  // Two pins on the same spot merge; the stack is wider than either of them,
  // so it reaches a third pin that neither member touched on its own.
  const reach = (stackWidth(2) + SINGLE_WIDTH) / 2 + GAP;
  const third = Math.round((SINGLE_SPLIT_AT + reach) / 2);
  assert.ok(third > SINGLE_SPLIT_AT, 'the third pin must clear both members individually');
  assert.deepEqual(groupAtX([0, 0, third]), [['m0', 'm1', 'm2']]);
});

check('…but only while it really reaches — otherwise the third stays out', () => {
  const reach = (stackWidth(2) + SINGLE_WIDTH) / 2 + GAP;
  assert.deepEqual(groupAtX([0, 0, Math.ceil(reach) + 2]), [['m0', 'm1'], ['m2']]);
});

check('without a merged-box resolver nothing beyond pass one happens', () => {
  const reach = (stackWidth(2) + SINGLE_WIDTH) / 2 + GAP;
  const third = Math.round((SINGLE_SPLIT_AT + reach) / 2);
  assert.deepEqual(groupAtX([0, 0, third], { resolveMergedBox: undefined }), [
    ['m0', 'm1'],
    ['m2'],
  ]);
});

check('a selected marker never joins a stack', () => {
  assert.deepEqual(groupAtX([0, 0], { independent: new Set(['m1']) }), [['m0'], ['m1']]);
});

check('a dense line settles instead of looping', () => {
  const positions = Array.from({ length: 40 }, (_, index) => index * 3);
  const started = Date.now();
  const groups = groupAtX(positions);
  assert.ok(Date.now() - started < 2000, 'grouping must not spin');
  assert.equal(groups.length, 1, 'a tightly packed line collapses into one stack');
});

check('far-apart pins are never grouped', () => {
  const positions = [0, 400, 800];
  assert.deepEqual(groupAtX(positions), [['m0'], ['m1'], ['m2']]);
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
