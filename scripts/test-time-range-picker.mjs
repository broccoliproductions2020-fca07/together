import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * Exercises the TimeRangePicker's core engines without React or React Native.
 *
 * The whole point of keeping `core/` free of imports outside its own folder is
 * that the interaction can be replayed here frame by frame: every invariant the
 * picker promises is a claim about numbers, and a claim about numbers should be
 * checked against numbers rather than against a screenshot.
 *
 * The engines carry `'worklet'` directives so they can also run on Reanimated's
 * UI thread; off that thread the directive is an inert string literal, which is
 * exactly why the same code can be transpiled and run straight into node.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const cache = new Map();

/** Minimal CJS loader: transpiles a TS file and resolves its relative imports
 * recursively, so the modules can be split the way the architecture wants
 * rather than the way a test runner would prefer. */
function loadTs(absPath) {
  const key = absPath.endsWith('.ts') ? absPath : `${absPath}.ts`;
  const cached = cache.get(key);
  if (cached) return cached;

  const compiled = ts.transpileModule(readFileSync(key, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: key,
  });
  const module = { exports: {} };
  cache.set(key, module.exports);
  const requireShim = (specifier) => {
    if (!specifier.startsWith('.')) return {};
    return loadTs(resolvePath(dirname(key), specifier));
  };
  new Function('exports', 'module', 'require', compiled.outputText)(
    module.exports,
    module,
    requireShim,
  );
  cache.set(key, module.exports);
  return module.exports;
}

const core = loadTs(resolvePath(HERE, '../src/shared/components/time-range-picker/core/index.ts'));
const {
  RE_ZOOM_TARGET_FRACTION,
  RE_ZOOM_TRIGGER_FRACTION,
  adoptExternalRange,
  applyPointer,
  beginGesture,
  cancelGesture,
  centreRange,
  createPickerState,
  durationOf,
  edgeStrength,
  edgeTick,
  endGesture,
  ensureRangeVisible,
  fitRange,
  isRangeInSafeBounds,
  pxPerHourFromPxPerMs,
  pxPerMsFromPxPerHour,
  requestDelta,
  resolveRange,
  safeLeft,
  safeRight,
  snapRange,
  snappedRange,
  tickSettle,
  timeToX,
  usableWidth,
  validateScaleConfiguration,
  xToTime,
  zoomAround,
} = core;

const MINUTE = 60_000;
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 7, 19, 8, 0, 0);

let checks = 0;
let failures = 0;
function check(name, fn) {
  checks += 1;
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}

const WIDTH = 320;
const SAFE_INSET = 12;
const EDGE_ZONE = 52;

function geometry(overrides = {}) {
  const bounds = { width: WIDTH, safeInsetPx: SAFE_INSET, ...(overrides.bounds ?? {}) };
  return {
    bounds,
    limits: {
      minTimeMs: T0 - 12 * HOUR,
      maxTimeMs: Number.POSITIVE_INFINITY,
      minDurationMs: 15 * MINUTE,
      maxDurationMs: 12 * HOUR,
      ...(overrides.limits ?? {}),
    },
    scale: {
      minPxPerMs: pxPerMsFromPxPerHour(16),
      maxPxPerMs: pxPerMsFromPxPerHour(80),
      ...(overrides.scale ?? {}),
    },
    edge: {
      travelPx: EDGE_ZONE - SAFE_INSET,
      maxSpeedMsPerSecond: 7 * HOUR,
      minStrength: 0.01,
      ...(overrides.edge ?? {}),
    },
    stepMs: 5 * MINUTE,
    snapOriginMs: T0,
    ...(overrides.root ?? {}),
  };
}

/** A picker showing a two-hour range at the comfortable working scale. */
function scenario(overrides = {}) {
  const geo = geometry(overrides);
  const range = { startMs: T0, endMs: T0 + 2 * HOUR, ...(overrides.range ?? {}) };
  const viewport = fitRange(
    range,
    geo.bounds,
    geo.scale,
    pxPerMsFromPxPerHour(80),
    0.9,
  );
  return { geo, state: createPickerState(range, viewport) };
}

/**
 * How still "still" can be.
 *
 * Not zero, and not because the anchor maths is approximate: epoch
 * milliseconds sit around 1.8e12, so a double carries ~4e-4 ms of slack there,
 * and pushing that back through the scale lands at a few times 1e-9 px. Measured
 * over 200 frames it oscillates around the anchor instead of growing, which is
 * the property that actually matters — a drift would compound and this does not.
 * Still 100,000x tighter than the 0.1 px the contract asks for.
 */
const ANCHOR_TOLERANCE_PX = 1e-6;

const startX = (s) => timeToX(s.viewport, s.range.startMs);
const endX = (s) => timeToX(s.viewport, s.range.endMs);
const pxPerHour = (s) => pxPerHourFromPxPerMs(s.viewport.pxPerMs);

/** Replays a pointer path as discrete samples, the way a real gesture arrives. */
function drag(state, geo, kind, fromX, path) {
  let next = beginGesture(state, kind, fromX, geo);
  for (const x of path) next = applyPointer(next, x, geo);
  return next;
}

/** Runs the edge loop for a number of 16 ms frames. */
function ticks(state, geo, count, dt = 1 / 62.5) {
  let next = state;
  for (let i = 0; i < count; i += 1) next = edgeTick(next, dt, geo);
  return next;
}

console.log('\nWorklet definition order (static)\n');

/**
 * The one class of bug every other test here is blind to.
 *
 * The worklets Babel plugin rewrites a `'worklet'` function declaration into an
 * assignment, so the hoisting a plain declaration would have had is gone, and a
 * caller captures its callee at module-evaluation time. A caller placed above
 * its callee therefore captures `undefined` and the app dies on the UI thread
 * with "X is not a function" on the very first gesture.
 *
 * Node hoists normally, so the behavioural tests below happily pass on an order
 * the device rejects — which is exactly what happened on 19 August 2026. This
 * check reads the source rather than running it.
 */
const CORE_FILES = ['units.ts', 'constraints.ts', 'viewport.ts', 'gesture.ts'];

function definitionOrderProblems(fileName) {
  const source = readFileSync(
    resolvePath(HERE, `../src/shared/components/time-range-picker/core/${fileName}`),
    'utf8',
  );
  const lines = source.split('\n');
  const definedAt = new Map();
  lines.forEach((line, index) => {
    const match = /^(?:export )?function (\w+)/.exec(line);
    if (match) definedAt.set(match[1], index);
  });

  const problems = [];
  let caller = null;
  let callerAt = -1;
  lines.forEach((line, index) => {
    const match = /^(?:export )?function (\w+)/.exec(line);
    if (match) {
      caller = match[1];
      callerAt = index;
      return;
    }
    if (!caller) return;
    for (const [callee, calleeAt] of definedAt) {
      if (callee === caller || calleeAt <= callerAt) continue;
      if (new RegExp(`\\b${callee}\\s*\\(`).test(line)) {
        problems.push(
          `${fileName}: ${caller} (line ${callerAt + 1}) calls ${callee}, defined only on ` +
            `line ${calleeAt + 1}. Move ${callee} above ${caller} — worklets do not hoist.`,
        );
      }
    }
  });
  return problems;
}

check('no core worklet is called before it is defined', () => {
  const problems = CORE_FILES.flatMap(definitionOrderProblems);
  assert.deepEqual(problems, [], `\n      ${problems.join('\n      ')}`);
});

console.log('\nTransformation and safe bounds\n');

check('time and screen convert back into each other', () => {
  const viewport = { startMs: T0, pxPerMs: pxPerMsFromPxPerHour(80) };
  for (const x of [0, 13.5, 160, 319]) {
    assert.ok(Math.abs(xToTime(viewport, timeToX(viewport, xToTime(viewport, x))) - xToTime(viewport, x)) < 1e-6);
  }
  assert.equal(timeToX(viewport, T0), 0);
  assert.equal(timeToX(viewport, T0 + HOUR), 80);
});

check('an initial fit puts both handles inside the safe bounds', () => {
  const { geo, state } = scenario();
  assert.ok(isRangeInSafeBounds(state.viewport, state.range, geo.bounds));
  assert.ok(startX(state) >= safeLeft(geo.bounds) - 1e-9);
  assert.ok(endX(state) <= safeRight(geo.bounds) + 1e-9);
});

check('a viewport that is already valid is left completely alone', () => {
  const { geo, state } = scenario();
  const same = ensureRangeVisible(state.viewport, state.range, geo.bounds, geo.scale);
  assert.equal(same, state.viewport);
});

check('an impossible min-scale configuration is reported, not silently broken', () => {
  const narrow = { width: 180, safeInsetPx: SAFE_INSET };
  const scale = { minPxPerMs: pxPerMsFromPxPerHour(16), maxPxPerMs: pxPerMsFromPxPerHour(80) };
  const verdict = validateScaleConfiguration(narrow, scale, 12 * HOUR);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.requiredWidth > 180);
  assert.ok(verdict.effectiveMinPxPerMs < scale.minPxPerMs);
  // Safe bounds still hold at the lowered floor — that is what it is lowered for.
  const range = { startMs: T0, endMs: T0 + 12 * HOUR };
  const fitted = ensureRangeVisible(
    { startMs: T0, pxPerMs: pxPerMsFromPxPerHour(80) },
    range,
    narrow,
    scale,
  );
  assert.ok(isRangeInSafeBounds(fitted, range, narrow));
});

console.log('\nNormal drag (56, 60)\n');

check('dragging the end handle holds the start handle on its exact pixel', () => {
  const { geo, state } = scenario();
  const before = startX(state);
  const from = endX(state);
  const dragged = drag(state, geo, 'end', from, [from + 10, from + 25, from + 40]);
  assert.equal(dragged.phase, 'endDrag');
  assert.ok(Math.abs(startX(dragged) - before) < 1e-9, `start moved by ${startX(dragged) - before}`);
  assert.ok(dragged.range.endMs > state.range.endMs);
  assert.equal(dragged.range.startMs, state.range.startMs);
});

check('dragging the start handle holds the end handle on its exact pixel', () => {
  const { geo, state } = scenario();
  const before = endX(state);
  const from = startX(state);
  const dragged = drag(state, geo, 'start', from, [from - 10, from - 30]);
  assert.equal(dragged.phase, 'startDrag');
  assert.ok(Math.abs(endX(dragged) - before) < 1e-9);
  assert.ok(dragged.range.startMs < state.range.startMs);
});

check('a normal handle drag never changes the scale', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  const dragged = drag(state, geo, 'end', from, [from + 5, from + 35, from - 20]);
  assert.equal(dragged.viewport.pxPerMs, state.viewport.pxPerMs);
  assert.equal(dragged.viewport.startMs, state.viewport.startMs);
});

check('the handle tracks the finger without a grab offset jump', () => {
  const { geo, state } = scenario();
  // Grabbed 8 px off-centre: the handle must not snap to the finger.
  const grabbed = endX(state) + 8;
  const dragged = drag(state, geo, 'end', grabbed, [grabbed]);
  assert.ok(Math.abs(endX(dragged) - endX(state)) < 1e-9);
});

check('a range drag never changes duration or scale', () => {
  const { geo, state } = scenario();
  const duration = durationOf(state.range);
  const from = startX(state);
  const dragged = drag(state, geo, 'range', from, [from + 12, from + 30, from + 18]);
  assert.equal(dragged.phase, 'rangeDrag');
  assert.equal(durationOf(dragged.range), duration);
  assert.equal(dragged.viewport.pxPerMs, state.viewport.pxPerMs);
  assert.ok(dragged.range.startMs > state.range.startMs);
});

console.log('\nEdge expand (57, 58, 59)\n');

check('end handle at the right edge: both handles hold still, duration grows, scale falls', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  const pushed = drag(state, geo, 'end', from, [safeRight(geo.bounds) + 40]);
  assert.equal(pushed.phase, 'endEdgeExpand');

  const anchorBefore = startX(pushed);
  const draggedBefore = endX(pushed);
  const scaleBefore = pushed.viewport.pxPerMs;
  const durationBefore = durationOf(pushed.range);

  const after = ticks(pushed, geo, 30);

  assert.ok(Math.abs(startX(after) - anchorBefore) < ANCHOR_TOLERANCE_PX, 'anchor drifted');
  assert.ok(Math.abs(endX(after) - draggedBefore) < ANCHOR_TOLERANCE_PX, 'dragged handle left the edge');
  assert.ok(after.range.endMs > pushed.range.endMs, 'end time did not advance');
  assert.ok(durationOf(after.range) > durationBefore, 'duration did not grow');
  assert.ok(after.viewport.pxPerMs < scaleBefore, 'scale did not compress');
  assert.ok(pxPerHour(after) < pxPerHour(pushed), 'dp per hour did not fall');
  assert.ok(isRangeInSafeBounds(after.viewport, after.range, geo.bounds));
});

check('start handle at the left edge: mirrored, with the end handle as anchor', () => {
  const { geo, state } = scenario();
  const from = startX(state);
  const pushed = drag(state, geo, 'start', from, [safeLeft(geo.bounds) - 40]);
  assert.equal(pushed.phase, 'startEdgeExpand');

  const anchorBefore = endX(pushed);
  const draggedBefore = startX(pushed);
  const after = ticks(pushed, geo, 30);

  assert.ok(Math.abs(endX(after) - anchorBefore) < ANCHOR_TOLERANCE_PX, 'anchor drifted');
  assert.ok(Math.abs(startX(after) - draggedBefore) < ANCHOR_TOLERANCE_PX, 'dragged handle left the edge');
  assert.ok(after.range.startMs < pushed.range.startMs);
  assert.ok(after.viewport.pxPerMs < pushed.viewport.pxPerMs);
});

check('anchor error oscillates around zero instead of accumulating', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  let s = drag(state, geo, 'end', from, [safeRight(geo.bounds) + 40]);
  const anchor = startX(s);
  let worst = 0;
  for (let i = 0; i < 200; i += 1) {
    s = edgeTick(s, 1 / 62.5, geo);
    worst = Math.max(worst, Math.abs(startX(s) - anchor));
  }
  assert.ok(worst < ANCHOR_TOLERANCE_PX, `anchor drifted by ${worst}px`);
});

check('the pinned handle sits exactly on the safe edge, frame after frame', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  let s = drag(state, geo, 'end', from, [safeRight(geo.bounds) + 40]);
  for (let i = 0; i < 60; i += 1) {
    s = edgeTick(s, 1 / 62.5, geo);
    s = applyPointer(s, safeRight(geo.bounds) + 40, geo);
    assert.ok(Math.abs(endX(s) - safeRight(geo.bounds)) < ANCHOR_TOLERANCE_PX);
  }
});

check('scale explains the geometry: handle distance divided by duration', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  let s = drag(state, geo, 'end', from, [safeRight(geo.bounds) + 40]);
  s = ticks(s, geo, 40);
  const distance = endX(s) - startX(s);
  assert.ok(Math.abs(distance / durationOf(s.range) - s.viewport.pxPerMs) < 1e-12);
});

console.log('\nEdge pan (61)\n');

check('range at the right edge pans the camera and never the scale', () => {
  const { geo, state } = scenario();
  const from = startX(state);
  const pushed = drag(state, geo, 'range', from, [safeRight(geo.bounds) + 40]);
  assert.equal(pushed.phase, 'rangeEdgePan');

  const sx = startX(pushed);
  const ex = endX(pushed);
  const duration = durationOf(pushed.range);
  const scale = pushed.viewport.pxPerMs;

  const after = ticks(pushed, geo, 30);

  assert.ok(Math.abs(startX(after) - sx) < 1e-9, 'start handle moved on screen');
  assert.ok(Math.abs(endX(after) - ex) < 1e-9, 'end handle moved on screen');
  assert.equal(after.viewport.pxPerMs, scale);
  assert.equal(durationOf(after.range), duration);
  assert.ok(after.range.startMs > pushed.range.startMs);
  assert.equal(
    after.range.endMs - pushed.range.endMs,
    after.range.startMs - pushed.range.startMs,
  );
});

check('range at the left edge pans the other way, still without a scale change', () => {
  const { geo, state } = scenario();
  const from = startX(state);
  const pushed = drag(state, geo, 'range', from, [safeLeft(geo.bounds) - 40]);
  const scale = pushed.viewport.pxPerMs;
  const after = ticks(pushed, geo, 20);
  assert.equal(after.viewport.pxPerMs, scale);
  assert.ok(after.range.startMs < pushed.range.startMs);
  assert.equal(durationOf(after.range), durationOf(pushed.range));
});

console.log('\nAccepted delta and constraints (62)\n');

check('a request the limits refuse buys nothing and moves nothing', () => {
  const { geo, state } = scenario();
  const atMax = {
    ...state,
    range: { startMs: T0, endMs: T0 + 12 * HOUR },
  };
  const fitted = {
    ...atMax,
    viewport: ensureRangeVisible(atMax.viewport, atMax.range, geo.bounds, geo.scale),
  };
  const from = timeToX(fitted.viewport, fitted.range.endMs);
  const pushed = drag(fitted, geo, 'end', from, [safeRight(geo.bounds) + 40]);

  const { acceptedMs } = requestDelta(pushed.range, 'end', 20 * MINUTE, geo.limits);
  assert.equal(acceptedMs, 0);

  const after = ticks(pushed, geo, 20);
  assert.equal(after.range.endMs, pushed.range.endMs);
  assert.equal(after.viewport.startMs, pushed.viewport.startMs);
  assert.equal(after.viewport.pxPerMs, pushed.viewport.pxPerMs);
  // The loop is still armed: only leaving the zone or lifting ends it.
  assert.equal(after.phase, 'endEdgeExpand');
  assert.notEqual(after.overshootPx, 0);
});

check('a partially allowed request moves by the accepted amount, not the asked one', () => {
  const limits = {
    minTimeMs: T0 - HOUR,
    maxTimeMs: Number.POSITIVE_INFINITY,
    minDurationMs: 15 * MINUTE,
    maxDurationMs: 2 * HOUR + 5 * MINUTE,
  };
  const base = { startMs: T0, endMs: T0 + 2 * HOUR };
  const { range, acceptedMs } = requestDelta(base, 'end', 20 * MINUTE, limits);
  assert.equal(acceptedMs, 5 * MINUTE);
  assert.equal(range.endMs, T0 + 2 * HOUR + 5 * MINUTE);
});

check('minTime blocks the past without letting the duration collapse', () => {
  const { geo, state } = scenario({ limits: { minTimeMs: T0 } });
  const from = startX(state);
  const dragged = drag(state, geo, 'start', from, [from - 200]);
  assert.equal(dragged.range.startMs, T0);
  assert.equal(dragged.range.endMs, state.range.endMs);
});

check('the edge pedal is a squared ramp with a creeping floor', () => {
  const edge = geometry().edge;
  const entrance = edgeStrength(0.5, edge);
  const half = edgeStrength(edge.travelPx / 2, edge);
  const full = edgeStrength(edge.travelPx * 2, edge);
  assert.equal(full, 1);
  assert.ok(Math.abs(half - 0.25) < 1e-9);
  assert.equal(entrance, edge.minStrength);
  // The three calibration points, read back as time per second.
  assert.ok(Math.abs(entrance * edge.maxSpeedMsPerSecond - 4 * MINUTE) < 30_000);
  assert.ok(Math.abs(half * edge.maxSpeedMsPerSecond - 1.75 * HOUR) < MINUTE);
  assert.ok(Math.abs(full * edge.maxSpeedMsPerSecond - 7 * HOUR) < MINUTE);
});

console.log('\nTransitions (63, 69)\n');

check('leaving the edge zone resumes a normal drag without a jump', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  const outside = safeRight(geo.bounds) + 40;
  let s = drag(state, geo, 'end', from, [outside]);
  s = ticks(s, geo, 25);

  const scaleAtExit = s.viewport.pxPerMs;
  const endAtExit = s.range.endMs;
  const handleAtExit = endX(s);

  // One pixel back inside: the handle must move by about one pixel, not jump.
  const back = applyPointer(s, safeRight(geo.bounds) - 1, geo);
  assert.equal(back.phase, 'endDrag');
  assert.equal(back.viewport.pxPerMs, scaleAtExit, 'scale jumped on the way back');
  assert.equal(back.viewport.startMs, s.viewport.startMs);
  assert.ok(Math.abs(endX(back) - handleAtExit) <= 1 + 1e-9, 'handle jumped');
  assert.ok(Math.abs(back.range.endMs - endAtExit) < 2 / scaleAtExit + 1);
});

check('the scale the edge left behind is kept — no zoom rubber band', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  let s = drag(state, geo, 'end', from, [safeRight(geo.bounds) + 40]);
  s = ticks(s, geo, 40);
  const compressed = s.viewport.pxPerMs;
  assert.ok(compressed < state.viewport.pxPerMs);

  s = applyPointer(s, safeRight(geo.bounds) - 30, geo);
  s = endGesture(s, geo);
  assert.equal(s.viewport.pxPerMs, compressed, 'the picker zoomed back in by itself');
});

check('crossing in and out repeatedly does not accumulate drift', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  let s = beginGesture(state, 'end', from, geo);
  const inside = safeRight(geo.bounds) - 20;
  for (let i = 0; i < 40; i += 1) {
    s = applyPointer(s, safeRight(geo.bounds) + 30, geo);
    s = applyPointer(s, inside, geo);
  }
  const settled = s;
  // The pointer ends where it started each round, so the value must too:
  // an absolute mapping cannot drift, an accumulating one would.
  s = applyPointer(s, inside, geo);
  assert.equal(s.range.endMs, settled.range.endMs);
  assert.ok(Math.abs(endX(s) - inside) < 1e-9);
});

check('a flick straight into the edge zone still lands the handle on the edge', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  // One sample, far outside: the handle must follow to the safe edge at once.
  const flicked = drag(state, geo, 'end', from, [safeRight(geo.bounds) + 120]);
  assert.ok(Math.abs(endX(flicked) - safeRight(geo.bounds)) < 1e-9);
  const anchor = startX(flicked);
  const after = ticks(flicked, geo, 5);
  assert.ok(Math.abs(startX(after) - anchor) < ANCHOR_TOLERANCE_PX);
});

console.log('\nSnapping and reporting (64)\n');

check('raw motion is continuous while the reported value stays on the grid', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  let s = beginGesture(state, 'end', from, geo);
  const reported = [];
  let last = snappedRange(s, geo);
  for (let px = 1; px <= 40; px += 1) {
    s = applyPointer(s, from + px, geo);
    const snapped = snappedRange(s, geo);
    if (snapped.endMs !== last.endMs) {
      reported.push(snapped.endMs);
      last = snapped;
    }
  }
  assert.ok(reported.length > 0);
  for (const ms of reported) assert.equal((ms - T0) % (5 * MINUTE), 0);
  // 40 px at 80 dp/h is 30 minutes, so six steps — never forty callbacks.
  assert.ok(reported.length <= 8, `reported ${reported.length} times`);
});

check('pointer-up lands on the grid and keeps both handles visible', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  const dragged = drag(state, geo, 'end', from, [from + 37]);
  const done = endGesture(dragged, geo);
  assert.equal(done.phase, 'idle');
  assert.equal(done.snapshot, null);
  assert.equal((done.range.endMs - T0) % (5 * MINUTE), 0);
  assert.ok(isRangeInSafeBounds(done.viewport, done.range, geo.bounds));
  // At most half a step of visible correction.
  assert.ok(Math.abs(done.range.endMs - dragged.range.endMs) <= 2.5 * MINUTE + 1);
});

check('snapping the moving edge can never break the duration limits', () => {
  const limits = geometry().limits;
  const tight = { startMs: T0, endMs: T0 + 16 * MINUTE };
  const snapped = snapRange(tight, 'end', 5 * MINUTE, T0, limits);
  assert.ok(durationOf(snapped) >= limits.minDurationMs);
});

console.log('\nRe-zoom after a handle release (65/85)\n');

/** Runs a settle to completion the way the frame loop would. */
function runSettle(state) {
  let s = state;
  for (let i = 0; i < 200 && s.settle; i += 1) s = tickSettle(s, 16);
  return s;
}

const ratioOf = (s, geo) =>
  (durationOf(s.range) * s.viewport.pxPerMs) / usableWidth(geo.bounds);

/** A range at a chosen share of the usable width, with one handle grabbed. */
function grabbedAtRatio(ratio, durationHours, kind) {
  const geo = geometry();
  const duration = durationHours * HOUR;
  const range = { startMs: T0, endMs: T0 + duration };
  const pxPerMs = (usableWidth(geo.bounds) * ratio) / duration;
  const idle = createPickerState(range, centreRange(range, pxPerMs, geo.bounds));
  const handleX = kind === 'end' ? endX(idle) : startX(idle);
  return { geo, state: beginGesture(idle, kind, handleX, geo) };
}

check('1: the scale never rises while a handle is held', () => {
  const { geo, state } = grabbedAtRatio(0.9, 8, 'end');
  let s = state;
  let highest = s.viewport.pxPerMs;
  const wanted = s.range.startMs + 30 * MINUTE;
  for (let i = 0; i < 200; i += 1) {
    s = applyPointer(s, timeToX(s.viewport, wanted), geo);
    assert.ok(
      s.viewport.pxPerMs <= highest + 1e-12,
      `scale rose during the drag: ${pxPerHour(s)}dp/h`,
    );
    highest = Math.max(highest, s.viewport.pxPerMs);
  }
  assert.ok(durationOf(s.range) < HOUR, 'the range did not actually shrink');
});

check('2: under 65% on release zooms to about 85%, times untouched', () => {
  // Four hours, so 85% is reachable before the scale ceiling.
  const { geo, state } = grabbedAtRatio(0.4, 4, 'end');
  assert.ok(ratioOf(state, geo) < RE_ZOOM_TRIGGER_FRACTION);

  const released = endGesture(state, geo);
  assert.notEqual(released.settle, null, 'no settle was scheduled');

  const done = runSettle(released);
  assert.equal(done.settle, null);
  assert.ok(
    Math.abs(ratioOf(done, geo) - RE_ZOOM_TARGET_FRACTION) < 0.01,
    `ended at ${(ratioOf(done, geo) * 100).toFixed(1)}%`,
  );
  assert.equal(done.range.startMs, released.range.startMs);
  assert.equal(done.range.endMs, released.range.endMs);
  assert.ok(isRangeInSafeBounds(done.viewport, done.range, geo.bounds));
});

check('3: at or above 65% the camera is not touched at all', () => {
  const { geo, state } = grabbedAtRatio(0.7, 4, 'end');
  const released = endGesture(state, geo);
  assert.equal(released.settle, null);
  assert.equal(released.viewport.pxPerMs, state.viewport.pxPerMs);
  assert.equal(released.viewport.startMs, state.viewport.startMs);
});

check('4: moving the whole range never triggers the rule', () => {
  const geo = geometry();
  const duration = 4 * HOUR;
  const range = { startMs: T0, endMs: T0 + duration };
  const pxPerMs = (usableWidth(geo.bounds) * 0.4) / duration;
  const idle = createPickerState(range, centreRange(range, pxPerMs, geo.bounds));
  const dragged = drag(idle, geo, 'range', startX(idle), [startX(idle) + 20]);
  assert.ok(ratioOf(dragged, geo) < RE_ZOOM_TRIGGER_FRACTION);

  const released = endGesture(dragged, geo);
  assert.equal(released.settle, null, 'a range drag scheduled a re-zoom');
  assert.equal(released.viewport.pxPerMs, dragged.viewport.pxPerMs);
  assert.equal(released.viewport.startMs, dragged.viewport.startMs);
});

check('5: a new pointer abandons the settle where it stands, with no jump', () => {
  const { geo, state } = grabbedAtRatio(0.4, 4, 'end');
  let s = endGesture(state, geo);
  for (let i = 0; i < 3; i += 1) s = tickSettle(s, 16);
  assert.notEqual(s.settle, null, 'settle finished too early for this test');

  const midScale = s.viewport.pxPerMs;
  const midStart = s.viewport.startMs;
  const grabbed = beginGesture(s, 'end', endX(s), geo);

  assert.equal(grabbed.settle, null, 'the settle survived a new pointer-down');
  assert.equal(grabbed.viewport.pxPerMs, midScale, 'the camera jumped on grab');
  assert.equal(grabbed.viewport.startMs, midStart);
});

check('6: the re-zoom moves no time, on any frame of it', () => {
  const { geo, state } = grabbedAtRatio(0.4, 4, 'end');
  const released = endGesture(state, geo);
  let s = released;
  for (let i = 0; i < 200 && s.settle; i += 1) {
    s = tickSettle(s, 16);
    assert.equal(s.range.startMs, released.range.startMs);
    assert.equal(s.range.endMs, released.range.endMs);
  }
  assert.equal(s.range.startMs, released.range.startMs);
  assert.equal(s.range.endMs, released.range.endMs);
});

check('adopting an external value during the settle discards it — so a host must not', () => {
  const { geo, state } = grabbedAtRatio(0.4, 4, 'end');
  const released = endGesture(state, geo);
  assert.notEqual(released.settle, null);

  // What a lagging controlled parent does: echo a value from mid-drag right
  // after pointer-up. Measured on device: 50 minutes out, corrected 200 ms
  // later — and it wiped the re-zoom before its first frame. The renderer
  // therefore ignores external values while a settle is running.
  const adopted = adoptExternalRange(released, released.range, geo);
  assert.equal(adopted.settle, null);
  assert.equal(adopted.viewport.pxPerMs, released.viewport.pxPerMs, 'the zoom never happened');
});

/** Mirrors `DEFAULT_MAX_PX_PER_HOUR` in the renderer. Keep the two in step —
 * this is the number the shipped picker actually uses. */
const SHIPPED_MAX_PX_PER_HOUR = 160;

check('a raised ceiling keeps repeated shrinking workable', () => {
  // The measured failure at a 80 dp/h ceiling: 85%, 82%, then 41%, 21%, 11%, 7%
  // with no zoom at all after the second halving, because the target was
  // unreachable below three hours. A raised ceiling moves that boundary down.
  const geo = geometry({ scale: { maxPxPerMs: pxPerMsFromPxPerHour(SHIPPED_MAX_PX_PER_HOUR) } });
  const usable = usableWidth(geo.bounds);
  const range = { startMs: T0, endMs: T0 + 12 * HOUR };
  let s = createPickerState(range, centreRange(range, usable / (12 * HOUR), geo.bounds));

  const ratios = [];
  for (let step = 0; step < 5; step += 1) {
    const halved = durationOf(s.range) / 2;
    s = beginGesture(s, 'end', endX(s), geo);
    const wanted = s.range.startMs + halved;
    for (let i = 0; i < 300; i += 1) s = applyPointer(s, timeToX(s.viewport, wanted), geo);
    s = endGesture(s, geo);
    for (let i = 0; i < 200 && s.settle; i += 1) s = tickSettle(s, 16);
    ratios.push((durationOf(s.range) * s.viewport.pxPerMs) / usable);
  }

  // The first halvings still reach the target; the later ones sit at the ceiling
  // and simply get shorter. What must not happen is the collapse to single
  // digits that the 80 dp/h ceiling produced.
  ratios.forEach((r, i) => {
    assert.ok(r > 0.15, `after ${i + 1} halvings the bar was only ${(r * 100).toFixed(0)}%`);
  });
  assert.ok(pxPerHour(s) <= SHIPPED_MAX_PX_PER_HOUR + 1e-9, 'the ceiling was exceeded');
  console.log(`        (Balken nach jedem Halbieren: ${ratios.map((r) => `${(r * 100).toFixed(0)}%`).join(' ')})`);
});

check('adopting a longer range lowers the scale and nothing restores it', () => {
  // Why the renderer filters echoes of its own superseded values: this is what a
  // late one costs. `ensureRangeVisible` may only ever lower the scale, so the
  // correcting echo that follows restores the range but not the zoom, and the
  // re-zoom cannot help because it runs on release only.
  const geo = geometry({ scale: { maxPxPerMs: pxPerMsFromPxPerHour(SHIPPED_MAX_PX_PER_HOUR) } });
  const short = { startMs: T0, endMs: T0 + HOUR };
  const tight = createPickerState(
    short,
    centreRange(short, pxPerMsFromPxPerHour(SHIPPED_MAX_PX_PER_HOUR), geo.bounds),
  );

  const stale = adoptExternalRange(tight, { startMs: T0, endMs: T0 + 5 * HOUR }, geo);
  assert.ok(stale.viewport.pxPerMs < tight.viewport.pxPerMs, 'expected the scale to drop');

  const corrected = adoptExternalRange(stale, short, geo);
  assert.equal(corrected.viewport.pxPerMs, stale.viewport.pxPerMs, 'the scale came back on its own');
  assert.ok(corrected.viewport.pxPerMs < tight.viewport.pxPerMs);
});


check('the scale ceiling wins over the target width, without a special case', () => {
  // Thirty minutes cannot reach 85% at any allowed scale, so the widest
  // reachable view is used and nothing else happens.
  const { geo, state } = grabbedAtRatio(0.1, 0.5, 'end');
  const done = runSettle(endGesture(state, geo));
  assert.ok(done.viewport.pxPerMs <= geo.scale.maxPxPerMs + 1e-12);
  assert.ok(ratioOf(done, geo) < RE_ZOOM_TARGET_FRACTION);
});


console.log('\nLifecycle (66, 67, 68)\n');

check('adopting an external range mid-gesture kills the gesture — so a host must not', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  const dragging = drag(state, geo, 'end', from, [from + 20]);
  assert.equal(dragging.phase, 'endDrag');

  // What a careless controlled host does: feed its own echo back mid-drag.
  const adopted = adoptExternalRange(dragging, dragging.range, geo);
  assert.equal(adopted.snapshot, null);

  // From here the finger is ignored entirely — the handle sits still while the
  // user keeps moving. Measured on device before the fix: the value followed for
  // six minutes, the parent's echo landed 323 ms in, and nothing moved after.
  // The renderer therefore ignores external values while a gesture is active.
  const after = applyPointer(adopted, from + 200, geo);
  assert.equal(after.range.endMs, adopted.range.endMs);
  assert.equal(after, adopted);
});

check('cancelling stops everything and returns to idle', () => {
  const { geo, state } = scenario();
  const from = endX(state);
  const pushed = drag(state, geo, 'end', from, [safeRight(geo.bounds) + 40]);
  const cancelled = cancelGesture(pushed, geo);
  assert.equal(cancelled.phase, 'idle');
  assert.equal(cancelled.snapshot, null);
  assert.equal(cancelled.overshootPx, 0);
  // A tick after cancellation is inert.
  assert.equal(edgeTick(cancelled, 1 / 62.5, geo), cancelled);
});

check('a narrower picker keeps both handles visible by giving up scale', () => {
  const { geo, state } = scenario();
  const narrow = { width: 140, safeInsetPx: SAFE_INSET };
  const resized = ensureRangeVisible(state.viewport, state.range, narrow, geo.scale);
  assert.ok(isRangeInSafeBounds(resized, state.range, narrow));
  assert.ok(resized.pxPerMs < state.viewport.pxPerMs);
});

check('a wider picker keeps its scale and simply shows more context', () => {
  const { geo, state } = scenario();
  const wide = { width: 640, safeInsetPx: SAFE_INSET };
  const resized = ensureRangeVisible(state.viewport, state.range, wide, geo.scale);
  assert.equal(resized.pxPerMs, state.viewport.pxPerMs);
  assert.equal(resized.startMs, state.viewport.startMs);
  assert.ok(isRangeInSafeBounds(resized, state.range, wide));
});

check('an external value that is already visible does not move the camera', () => {
  const { geo, state } = scenario();
  const nudged = { startMs: state.range.startMs + 5 * MINUTE, endMs: state.range.endMs };
  const after = ensureRangeVisible(state.viewport, nudged, geo.bounds, geo.scale);
  assert.equal(after, state.viewport);
});

check('an external value outside the viewport is brought back into it', () => {
  const { geo, state } = scenario();
  const elsewhere = { startMs: T0 + 40 * HOUR, endMs: T0 + 42 * HOUR };
  const after = ensureRangeVisible(state.viewport, elsewhere, geo.bounds, geo.scale);
  assert.ok(isRangeInSafeBounds(after, elsewhere, geo.bounds));
});

console.log('\nAnchored zoom (11)\n');

check('zoomAround holds its anchor at any scale', () => {
  for (const pxPerHour of [80, 41.3, 16, 7.5]) {
    const zoomed = zoomAround(T0 + 3 * HOUR, 137.5, pxPerMsFromPxPerHour(pxPerHour));
    assert.ok(Math.abs(timeToX(zoomed, T0 + 3 * HOUR) - 137.5) < 1e-9);
  }
});

check('resolveRange is the only clamp anyone needs', () => {
  const limits = geometry().limits;
  const base = { startMs: T0, endMs: T0 + 2 * HOUR };
  assert.equal(resolveRange(base, 'end', T0, limits).endMs, T0 + 15 * MINUTE);
  assert.equal(resolveRange(base, 'end', T0 + 99 * HOUR, limits).endMs, T0 + 12 * HOUR);
  assert.equal(resolveRange(base, 'start', T0 + 99 * HOUR, limits).startMs, T0 + 105 * MINUTE);
  assert.equal(
    resolveRange(base, 'range', limits.minTimeMs - HOUR, limits).startMs,
    limits.minTimeMs,
  );
  assert.equal(durationOf(resolveRange(base, 'range', T0 + 5 * HOUR, limits)), 2 * HOUR);
});

console.log(
  failures === 0
    ? `\n${checks} checks passed\n`
    : `\n${checks - failures}/${checks} passed, ${failures} FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
