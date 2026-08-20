import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

/**
 * The marker ring is a clock, and the rule "no time, no ring" only holds if the
 * maths says so. These are the cases that fail silently on a device: a ring
 * that is subtly proportional where it should be absolute looks fine and lies.
 */
const url = new URL('../src/features/map/utils/countdown.ts', import.meta.url);
const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: url.pathname,
});
const module = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('exports', 'module', 'require', compiled.outputText)(module.exports, module, () => ({}));
const { countdownBucket, leadFraction, remainingFraction, quantizeFraction, SOON_RING_SCALE_MS } =
  module.exports;

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`  ok  ${name}`);
}

const MINUTE = 60_000;
const now = Date.UTC(2026, 7, 20, 12, 0, 0);
const iso = (offsetMinutes) => new Date(now + offsetMinutes * MINUTE).toISOString();

console.log('\nno time, no ring');

check('an activity without times has no ring', () => {
  assert.equal(countdownBucket('soon', undefined, undefined, now), undefined);
  assert.equal(countdownBucket('now', undefined, undefined, now), undefined);
});

check('an unparseable time has no ring rather than a wrong one', () => {
  assert.equal(countdownBucket('soon', 'nonsense', undefined, now), undefined);
  assert.equal(countdownBucket('now', 'nonsense', 'nonsense', now), undefined);
});

check('a mode that is not now or soon has no ring', () => {
  assert.equal(countdownBucket('open', iso(30), iso(120), now), undefined);
});

console.log('\ngreen: proportional, unchanged');

check('half over is half a ring, at any length', () => {
  const short = remainingFraction(iso(-30), iso(30), now);
  const long = remainingFraction(iso(-180), iso(180), now);
  assert.equal(short, 0.5);
  assert.equal(long, 0.5);
});

check('a just-started activity shows a full ring', () => {
  assert.equal(countdownBucket('now', iso(0), iso(120), now), 1);
});

check('a finished activity is empty, never negative', () => {
  assert.equal(remainingFraction(iso(-180), iso(-60), now), 0);
});

console.log('\namber: absolute, comparable across markers');

check('the same wait is the same ring on every marker', () => {
  // Two plans 30 minutes out but of very different lengths must look alike.
  const first = countdownBucket('soon', iso(30), iso(90), now);
  const second = countdownBucket('soon', iso(30), iso(600), now);
  assert.equal(first, second);
});

check('half the scale is half a ring', () => {
  assert.equal(leadFraction(iso(30), now), 0.5);
  assert.equal(leadFraction(iso(15), now), 0.25);
});

check('anything past the scale is simply full', () => {
  assert.equal(leadFraction(iso(60), now), 1);
  assert.equal(leadFraction(iso(60 * 48), now), 1);
  assert.equal(countdownBucket('soon', iso(60 * 48), iso(60 * 50), now), 1);
});

check('a plan far out never re-captures, because its bucket never moves', () => {
  const far = iso(60 * 24);
  const first = countdownBucket('soon', far, undefined, now);
  const later = countdownBucket('soon', far, undefined, now + 90 * MINUTE);
  assert.equal(first, 1);
  assert.equal(later, 1);
});

check('a due plan is empty, and never negative once late', () => {
  assert.equal(leadFraction(iso(0), now), 0);
  assert.equal(leadFraction(iso(-45), now), 0);
});

check('the ring only ever drains as time passes', () => {
  let previous = Number.POSITIVE_INFINITY;
  for (let minutes = 60; minutes >= 0; minutes -= 1) {
    const value = leadFraction(iso(minutes), now);
    assert.ok(value <= previous, `rose at ${minutes} min`);
    previous = value;
  }
});

check('the scale matches the composer default lead time', () => {
  assert.equal(SOON_RING_SCALE_MS, 60 * MINUTE);
});

console.log('\nquantisation');

check('a sliver stays visible instead of rounding to nothing', () => {
  assert.ok(quantizeFraction(0.001) > 0);
  assert.equal(quantizeFraction(0), 0);
});

check('exactly eight distinct steps, and never above 1', () => {
  const seen = new Set();
  for (let index = 0; index <= 1000; index += 1) {
    const value = quantizeFraction(index / 1000);
    assert.ok(value <= 1);
    seen.add(value);
  }
  assert.equal(seen.size, 9, 'eight steps plus a true zero');
});

check('the ring steps down only once a whole step is used up', () => {
  // Quantisation ceils, so the ring stays FULL until more than one step
  // (7.5 min of the 60-min scale) has actually gone by. That is deliberate:
  // a marker must not look already-drained the second it is created.
  assert.equal(countdownBucket('soon', iso(60), undefined, now), 1);
  assert.equal(countdownBucket('soon', iso(53), undefined, now), 1);
  assert.equal(countdownBucket('soon', iso(50), undefined, now), 0.875);
});

console.log(`\n${checks} checks passed.\n`);
