import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

/**
 * Exercises the Terminfindung's pure maths: turning per-person intervals into
 * one density, picking the window a card names, and the shared time-of-day
 * axis a stack of days is drawn on.
 *
 * These are the parts that fail SILENTLY. A wrong count renders as a slightly
 * different shade, a wrong axis as rows that look comparable and are not —
 * neither throws, and neither is visible without measuring it.
 */

const loaded = new Map();

function load(relativePath) {
  if (loaded.has(relativePath)) return loaded.get(relativePath);
  const url = new URL(`../src/features/time-planning/utils/${relativePath}.ts`, import.meta.url);
  const source = readFileSync(url, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: url.pathname,
  });
  const module = { exports: {} };
  loaded.set(relativePath, module.exports);
  // Evaluated in THIS realm on purpose: the modules return plain object
  // literals, and a separate realm gives those a different Object.prototype,
  // which makes assert's deep-strict comparison fail on identical values.
  // eslint-disable-next-line no-new-func
  new Function('exports', 'module', 'require', compiled.outputText)(
    module.exports,
    module,
    (request) => (request.startsWith('./') ? load(request.slice(2)) : {}),
  );
  loaded.set(relativePath, module.exports);
  return module.exports;
}

const {
  aggregateWindow,
  availabilityLevel,
  bestSlot,
  bestSlots,
  memberIntervals,
  rankWindows,
  AVAILABILITY_LEVELS,
  MIN_SLOT_MINUTES,
} = load('availability');
const { sharedDayAxis, axisFraction, axisHourMarks, dayStartMs, formatAxisMinutes } =
  load('dayAxis');
const { staircaseRuns, staircasePoints, roundedPolygonPath, staircasePaths } = load('staircase');
const { groupAnswers, ANSWER_LIST_LIMIT } = load('answerGroups');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`  ok  ${name}`);
}

/** 2026-08-21 is a Friday; the exact date only has to be stable. */
function at(day, hour, minute = 0) {
  return new Date(2026, 7, day, hour, minute).toISOString();
}

function windowAt(id, day, fromHour, toHour) {
  return { id, groupId: 'g1', startsAt: at(day, fromHour), endsAt: at(day, toHour) };
}

function member(uid, role, responsesByWindow, responseStatus = 'responded') {
  return {
    uid,
    displayName: uid,
    initials: uid.slice(0, 2).toUpperCase(),
    role,
    responseStatus,
    responsesByWindow,
    updatedAt: 0,
  };
}

function minutes(ms) {
  return Math.round(ms / 60_000);
}

console.log('\naggregateWindow');

check('a full-cover window is one segment, not many', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
  ]);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].count, 2);
  assert.equal(result.totalCount, 2);
  assert.equal(result.peakCount, 2);
});

check('boundaries are exact and edges are hard', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', { w1: [{ startsAt: at(21, 20), endsAt: at(21, 23) }] }),
  ]);
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0].count, 1);
  assert.equal(result.segments[1].count, 2);
  // The step sits exactly at 20:00 — no ramp, no rounding.
  assert.equal(result.segments[0].endMs, Date.parse(at(21, 20)));
  assert.equal(result.segments[1].startMs, Date.parse(at(21, 20)));
});

check('a gap in the middle splits into three segments', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', {
      w1: [
        { startsAt: at(21, 18), endsAt: at(21, 19) },
        { startsAt: at(21, 21), endsAt: at(21, 23) },
      ],
    }),
  ]);
  assert.deepEqual(
    result.segments.map((segment) => segment.count),
    [2, 1, 2],
  );
});

check('an empty answer counts as answered but covers nothing', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', { w1: [] }),
  ]);
  assert.equal(result.totalCount, 2, 'an explicit "no" is an answer');
  assert.equal(result.peakCount, 1);
  assert.deepEqual(result.unavailableUids, ['b']);
});

check('an unanswered member is not counted at all', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', {}, 'pending'),
  ]);
  assert.equal(result.totalCount, 1, 'pending must not dilute the count');
  assert.equal(result.best.everyone, true, 'everyone = everyone who answered');
  assert.deepEqual(result.unavailableUids, []);
});

check('segments tile the window exactly, with no gap and no overlap', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', { w1: [{ startsAt: at(21, 19), endsAt: at(21, 21) }] }),
    member('c', 'member', { w1: [{ startsAt: at(21, 20), endsAt: at(21, 22, 30) }] }),
  ]);
  assert.equal(result.segments[0].startMs, result.startMs);
  assert.equal(result.segments[result.segments.length - 1].endMs, result.endMs);
  result.segments.forEach((segment, index) => {
    if (index === 0) return;
    assert.equal(segment.startMs, result.segments[index - 1].endMs);
  });
});

check('a member answering outside the window is clipped, not trusted', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'member', { w1: [{ startsAt: at(21, 6), endsAt: at(22, 4) }] }),
  ]);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].startMs, result.startMs);
  assert.equal(result.segments[0].endMs, result.endMs);
});

check('an unusable window yields null rather than a broken shape', () => {
  assert.equal(aggregateWindow({ id: 'x', groupId: 'g', startsAt: 'nope', endsAt: 'nope' }, []), null);
  assert.equal(aggregateWindow(windowAt('w1', 21, 20, 20), []), null);
});

console.log('\nmemberIntervals');

check('a pending member is null, an empty answer is an empty list', () => {
  const w = windowAt('w1', 21, 18, 23);
  assert.equal(memberIntervals(member('a', 'member', {}, 'pending'), w), null);
  assert.deepEqual(memberIntervals(member('a', 'member', { w1: [] }), w), []);
});

console.log('\nbestSlot');

check('picks the highest count', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', { w1: [{ startsAt: at(21, 19), endsAt: at(21, 23) }] }),
    member('c', 'member', { w1: [{ startsAt: at(21, 20), endsAt: at(21, 23) }] }),
  ]);
  assert.equal(result.best.count, 3);
  assert.equal(result.best.startMs, Date.parse(at(21, 20)));
  assert.equal(result.best.endMs, Date.parse(at(21, 23)));
  assert.equal(result.best.everyone, true);
});

check('a tie on count goes to the longer slot', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', {
      w1: [
        { startsAt: at(21, 18), endsAt: at(21, 19) },
        { startsAt: at(21, 20), endsAt: at(21, 23) },
      ],
    }),
  ]);
  assert.equal(result.best.count, 2);
  assert.equal(minutes(result.best.endMs - result.best.startMs), 180);
});

check('a tie on count and length goes to the earlier slot', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', {
      w1: [
        { startsAt: at(21, 18), endsAt: at(21, 19) },
        { startsAt: at(21, 22), endsAt: at(21, 23) },
      ],
    }),
  ]);
  assert.equal(result.best.startMs, Date.parse(at(21, 18)));
});

check('a change in who can splits a lockable candidate', () => {
  const w = windowAt('w1', 21, 18, 23);
  // b and c together cover 18–23 at count 2 the whole way, but the switch
  // participant set changes, so they are two distinct lockable candidates.
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 21) }] }),
    member('c', 'member', { w1: [{ startsAt: at(21, 21), endsAt: at(21, 23) }] }),
  ]);
  assert.equal(result.best.count, 2);
  assert.equal(minutes(result.best.endMs - result.best.startMs), 180);
  assert.deepEqual(result.best.uids, ['a', 'b']);
});

check('returns every exact tie for the overview summary', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', {
      w1: [
        { startsAt: at(21, 18), endsAt: at(21, 19) },
        { startsAt: at(21, 22), endsAt: at(21, 23) },
      ],
    }),
  ]);
  const candidates = bestSlots(result.segments, result.totalCount);
  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => [candidate.startMs, candidate.endMs]),
    [
      [Date.parse(at(21, 18)), Date.parse(at(21, 19))],
      [Date.parse(at(21, 22)), Date.parse(at(21, 23))],
    ],
  );
});

check(`a peak under ${MIN_SLOT_MINUTES} min loses to a longer, lower run`, () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 22) }] }),
    member('c', 'member', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 18, 10) }] }),
  ]);
  assert.equal(result.peakCount, 3, 'the spike is still in the data');
  assert.equal(result.best.count, 2, 'but it is not the answer');
  assert.equal(minutes(result.best.endMs - result.best.startMs), 230);
});

check('a short peak still wins when nothing longer exists', () => {
  const w = { id: 'w1', groupId: 'g1', startsAt: at(21, 18), endsAt: at(21, 18, 10) };
  const result = aggregateWindow(w, [member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 18, 10) }] })]);
  assert.equal(result.best.count, 1);
});

check('nobody available yields no slot rather than a zero-count one', () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [member('a', 'member', { w1: [] })]);
  assert.equal(result.best, null);
  assert.equal(bestSlot([], 0), null);
});

console.log('\navailabilityLevel');

check('zero stays zero and full reaches the top step', () => {
  assert.equal(availabilityLevel(0, 5), 0);
  assert.equal(availabilityLevel(5, 5), AVAILABILITY_LEVELS);
  assert.equal(availabilityLevel(0, 0), 0);
});

check('a partial count never reaches the top step', () => {
  for (let total = 1; total <= 50; total += 1) {
    for (let count = 1; count < total; count += 1) {
      const level = availabilityLevel(count, total);
      assert.ok(level >= 1, `count ${count}/${total} must be visible`);
      assert.ok(
        level <= AVAILABILITY_LEVELS - 1,
        `count ${count}/${total} must not look like everyone`,
      );
    }
  }
});

check('levels stay monotonic as the count grows', () => {
  for (const total of [3, 7, 12, 50]) {
    let previous = 0;
    for (let count = 0; count <= total; count += 1) {
      const level = availabilityLevel(count, total);
      assert.ok(level >= previous, `level fell at ${count}/${total}`);
      previous = level;
    }
  }
});

console.log('\nrankWindows');

check('most people first, then longer, then earlier', () => {
  const build = (id, day, from, to, others) =>
    aggregateWindow(windowAt(id, day, from, to), [
      member('a', 'host', { [id]: [{ startsAt: at(day, from), endsAt: at(day, to) }] }),
      ...others.map((uid, index) =>
        member(uid, 'member', { [id]: [{ startsAt: at(day, from), endsAt: at(day, to) }] }, 'responded'),
      ),
    ]);
  const thin = build('w1', 21, 18, 23, []);
  const full = build('w2', 22, 14, 20, ['b', 'c']);
  const ranked = rankWindows([thin, full]);
  assert.equal(ranked[0].windowId, 'w2');
});

console.log('\nsharedDayAxis');

check('spans every window and rounds out to whole hours', () => {
  const axis = sharedDayAxis([windowAt('w1', 21, 18, 23), windowAt('w2', 22, 14, 20)]);
  assert.equal(axis.startMinutes, 14 * 60);
  assert.equal(axis.endMinutes, 23 * 60);
  assert.equal(axis.spanMinutes, 9 * 60);
});

check('a half-hour start is rounded out, never in', () => {
  const axis = sharedDayAxis([
    { id: 'w1', groupId: 'g', startsAt: at(21, 18, 30), endsAt: at(21, 22, 15) },
  ]);
  assert.equal(axis.startMinutes, 18 * 60);
  assert.equal(axis.endMinutes, 23 * 60);
});

check('days are compared by clock, not by calendar distance', () => {
  // Same hours a week apart must produce the same narrow axis, not a 7-day one.
  const axis = sharedDayAxis([windowAt('w1', 21, 19, 22), windowAt('w2', 28, 19, 22)]);
  assert.equal(axis.spanMinutes, 3 * 60);
});

check('a window past midnight extends the axis beyond 24 h', () => {
  const axis = sharedDayAxis([
    { id: 'w1', groupId: 'g', startsAt: at(21, 21), endsAt: at(22, 2) },
  ]);
  assert.equal(axis.startMinutes, 21 * 60);
  assert.equal(axis.endMinutes, 26 * 60);
  assert.equal(formatAxisMinutes(25 * 60), '01:00');
});

check('an empty or unusable set falls back to a whole day', () => {
  assert.equal(sharedDayAxis([]).spanMinutes, 24 * 60);
  assert.equal(
    sharedDayAxis([{ id: 'w', groupId: 'g', startsAt: 'nope', endsAt: 'nope' }]).spanMinutes,
    24 * 60,
  );
});

console.log('\naxisFraction');

check('the same clock time lands at the same fraction on every day', () => {
  const first = windowAt('w1', 21, 18, 23);
  const second = windowAt('w2', 22, 18, 23);
  const axis = sharedDayAxis([first, second]);
  const left = axisFraction(Date.parse(at(21, 20)), dayStartMs(first), axis);
  const right = axisFraction(Date.parse(at(22, 20)), dayStartMs(second), axis);
  assert.ok(Math.abs(left - right) < 1e-9, 'rows would not line up');
});

check('window bounds map to 0 and 1 when the axis is tight around them', () => {
  const w = windowAt('w1', 21, 18, 23);
  const axis = sharedDayAxis([w]);
  assert.equal(axisFraction(Date.parse(at(21, 18)), dayStartMs(w), axis), 0);
  assert.equal(axisFraction(Date.parse(at(21, 23)), dayStartMs(w), axis), 1);
});

check('an hour is the same width in every row', () => {
  const evening = windowAt('w1', 21, 18, 23);
  const afternoon = windowAt('w2', 22, 14, 20);
  const axis = sharedDayAxis([evening, afternoon]);
  const eveningHour =
    axisFraction(Date.parse(at(21, 19)), dayStartMs(evening), axis) -
    axisFraction(Date.parse(at(21, 18)), dayStartMs(evening), axis);
  const afternoonHour =
    axisFraction(Date.parse(at(22, 15)), dayStartMs(afternoon), axis) -
    axisFraction(Date.parse(at(22, 14)), dayStartMs(afternoon), axis);
  assert.ok(Math.abs(eveningHour - afternoonHour) < 1e-9, 'this is the whole point of the axis');
});

console.log('\naxisHourMarks');

check('thins out instead of colliding, and never returns nothing', () => {
  const axis = sharedDayAxis([windowAt('w1', 21, 8, 23)]);
  const wide = axisHourMarks(axis, 900);
  const narrow = axisHourMarks(axis, 200);
  assert.ok(wide.length > narrow.length, 'a narrow row must show fewer marks');
  assert.ok(narrow.length >= 2, 'an axis with no marks cannot be read at all');
  wide.forEach((mark) => assert.equal(mark % 60, 0, 'marks sit on whole hours'));
});

check('marks stay inside the axis', () => {
  const axis = sharedDayAxis([windowAt('w1', 21, 18, 23)]);
  axisHourMarks(axis, 320).forEach((mark) => {
    assert.ok(mark >= axis.startMinutes && mark <= axis.endMinutes);
  });
});

check('a zero-width row asks for no marks', () => {
  assert.deepEqual(axisHourMarks(sharedDayAxis([windowAt('w1', 21, 18, 23)]), 0), []);
});

console.log('\nstaircase');

const step = (startPx, endPx, height) => ({ startPx, endPx, height });

check('touching stretches stay ONE run — that is what closes the gaps', () => {
  const runs = staircaseRuns([step(0, 40, 10), step(40, 90, 20), step(90, 120, 5)]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].length, 3);
});

check('a stretch nobody can make breaks the run', () => {
  const runs = staircaseRuns([step(0, 40, 10), step(40, 60, 0), step(60, 90, 15)]);
  assert.equal(runs.length, 2);
  assert.equal(runs[0][0].endPx, 40);
  assert.equal(runs[1][0].startPx, 60);
});

check('a real hole in the x-range breaks the run too', () => {
  assert.equal(staircaseRuns([step(0, 40, 10), step(55, 90, 10)]).length, 2);
});

check('the outline walks base, treads and risers in order', () => {
  const points = staircasePoints([step(0, 40, 10), step(40, 90, 20)], 30);
  assert.deepEqual(points, [
    { x: 0, y: 30 },
    { x: 0, y: 20 },
    { x: 40, y: 20 },
    { x: 40, y: 20 },
    { x: 40, y: 10 },
    { x: 90, y: 10 },
    { x: 90, y: 30 },
  ]);
});

check('the outline is closed and starts and ends on the baseline', () => {
  const points = staircasePoints([step(10, 50, 8)], 24);
  assert.equal(points[0].y, 24);
  assert.equal(points[points.length - 1].y, 24);
  assert.equal(points[0].x, 10);
  assert.equal(points[points.length - 1].x, 50);
});

check('rounding never eats a short tread or a low step', () => {
  const path = roundedPolygonPath(staircasePoints([step(0, 3, 4)], 20), 3);
  const ys = [...path.matchAll(/-?\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...ys) >= 16, 'the top edge must survive');
  assert.ok(Math.max(...ys) <= 20, 'nothing may drop below the baseline');
});

check('a path is emitted per run, and each one closes', () => {
  const paths = staircasePaths([step(0, 40, 10), step(40, 60, 0), step(60, 90, 15)], 30, 3);
  assert.equal(paths.length, 2);
  paths.forEach((path) => {
    assert.ok(path.startsWith('M'));
    assert.ok(path.endsWith('Z'));
  });
});

check('nothing is emitted for an empty or fully uncovered window', () => {
  assert.deepEqual(staircasePaths([], 30, 3), []);
  assert.deepEqual(staircasePaths([step(0, 40, 0)], 30, 3), []);
});

console.log('\ngroupAnswers');

function answered(uid, spans) {
  return member(uid, 'member', { w1: spans });
}

check('identical answers collapse into one line', () => {
  const w = windowAt('w1', 21, 18, 23);
  const whole = [{ startsAt: at(21, 18), endsAt: at(21, 23) }];
  const groups = groupAnswers(w, [
    answered('a', whole),
    answered('b', whole),
    answered('c', whole),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'whole');
  assert.equal(groups[0].count, 3);
});

check('a late start becomes "erst ab", an early end "nur bis"', () => {
  const w = windowAt('w1', 21, 18, 23);
  const groups = groupAnswers(w, [
    answered('a', [{ startsAt: at(21, 20), endsAt: at(21, 23) }]),
    answered('b', [{ startsAt: at(21, 18), endsAt: at(21, 20) }]),
  ]);
  const from = groups.find((group) => group.kind === 'from');
  const until = groups.find((group) => group.kind === 'until');
  assert.equal(from.startMs, Date.parse(at(21, 20)));
  assert.equal(until.endMs, Date.parse(at(21, 20)));
});

check('a slice inside the window keeps both ends', () => {
  const w = windowAt('w1', 21, 18, 23);
  const [group] = groupAnswers(w, [answered('a', [{ startsAt: at(21, 19), endsAt: at(21, 21) }])]);
  assert.equal(group.kind, 'range');
  assert.equal(group.startMs, Date.parse(at(21, 19)));
  assert.equal(group.endMs, Date.parse(at(21, 21)));
});

check('a split answer is not a pattern, it is "other"', () => {
  const w = windowAt('w1', 21, 18, 23);
  const [group] = groupAnswers(w, [
    answered('a', [
      { startsAt: at(21, 18), endsAt: at(21, 19) },
      { startsAt: at(21, 21), endsAt: at(21, 23) },
    ]),
  ]);
  assert.equal(group.kind, 'other');
});

check('largest group first', () => {
  const w = windowAt('w1', 21, 18, 23);
  const whole = [{ startsAt: at(21, 18), endsAt: at(21, 23) }];
  const late = [{ startsAt: at(21, 20), endsAt: at(21, 23) }];
  const groups = groupAnswers(w, [
    answered('a', late),
    answered('b', whole),
    answered('c', whole),
    answered('d', whole),
  ]);
  assert.equal(groups[0].kind, 'whole');
  assert.equal(groups[0].count, 3);
  assert.equal(groups[1].count, 1);
});

check('"nobody can" is never merged away and stays last', () => {
  const w = windowAt('w1', 21, 18, 23);
  const spread = [19, 20, 21, 22].map((hour, index) =>
    answered(`p${index}`, [{ startsAt: at(21, hour), endsAt: at(21, 23) }]),
  );
  const groups = groupAnswers(w, [...spread, answered('x', []), answered('y', [])], 3);
  const none = groups[groups.length - 1];
  assert.equal(none.kind, 'none');
  assert.equal(none.count, 2);
});

check('everything past the limit collapses into one rest line', () => {
  const w = windowAt('w1', 21, 18, 23);
  const spread = [19, 20, 21, 22].map((hour, index) =>
    answered(`p${index}`, [{ startsAt: at(21, hour), endsAt: at(21, 23) }]),
  );
  const groups = groupAnswers(w, spread, 3);
  assert.equal(groups.length, 3);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  assert.equal(total, 4, 'nobody may be lost in the merge');
});

check('an unanswered member is not grouped at all', () => {
  const w = windowAt('w1', 21, 18, 23);
  const groups = groupAnswers(w, [member('a', 'member', {}, 'pending')]);
  assert.deepEqual(groups, []);
});

check('the listing threshold is a dozen', () => {
  assert.equal(ANSWER_LIST_LIMIT, 12);
});

console.log(`\n${checks} checks passed.\n`);
