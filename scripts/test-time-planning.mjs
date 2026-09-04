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
const { describePlanStatus, planRoundIsOpen } = load('planSummary');
const {
  canSeedResponseDraft,
  anyNarrowedAnswer,
  coversWholeWindow,
  responseDraftToResponses,
  seedResponseDraft,
  replaceFirstInterval,
} = load('responseDraft');

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

console.log('\nresponse drafts');

check('an existing member waits for their response before seeding the draft', () => {
  assert.equal(
    canSeedResponseDraft({
      planId: 'p1',
      seededPlanId: undefined,
      isMember: true,
      membersLoadedPlanId: null,
    }),
    false,
  );
  assert.equal(
    canSeedResponseDraft({
      planId: 'p1',
      seededPlanId: undefined,
      isMember: true,
      membersLoadedPlanId: 'p1',
    }),
    true,
  );
  assert.equal(
    canSeedResponseDraft({
      planId: 'p1',
      seededPlanId: undefined,
      isMember: false,
      membersLoadedPlanId: null,
    }),
    true,
  );
});

check('legacy split intervals are reduced to one visible availability range', () => {
  const w = windowAt('w1', 21, 18, 23);
  const stored = [
    { startsAt: at(21, 18), endsAt: at(21, 19) },
    { startsAt: at(21, 21), endsAt: at(21, 22) },
  ];
  const draft = seedResponseDraft([w], member('a', 'member', { w1: stored }));
  const edited = replaceFirstInterval(draft.intervals.w1, {
    startsAt: at(21, 18, 30),
    endsAt: at(21, 19, 30),
  });
  const responses = responseDraftToResponses([w], { w1: 'partial' }, { w1: edited });
  assert.deepEqual(responses.w1, [
    { startsAt: at(21, 18, 30), endsAt: at(21, 19, 30) },
  ]);
});

check('a declined row stays empty even when its draft still holds an interval', () => {
  const w = windowAt('w1', 21, 18, 23);
  const responses = responseDraftToResponses(
    [w],
    { w1: 'none' },
    { w1: [{ startsAt: at(21, 18), endsAt: at(21, 20) }] },
  );
  assert.deepEqual(responses.w1, []);
});

check('"Passt" sends the host window, not a leftover narrowed range', () => {
  const w = windowAt('w1', 21, 18, 23);
  const responses = responseDraftToResponses(
    [w],
    { w1: 'full' },
    { w1: [{ startsAt: at(21, 20), endsAt: at(21, 21) }] },
  );
  assert.deepEqual(responses.w1, [{ startsAt: at(21, 18), endsAt: at(21, 23) }]);
});

check('an unanswered row defaults to the whole window', () => {
  const w = windowAt('w1', 21, 18, 23);
  const responses = responseDraftToResponses([w], {}, {});
  assert.deepEqual(responses.w1, [{ startsAt: at(21, 18), endsAt: at(21, 23) }]);
});

check('the three answer states are derived from what was stored', () => {
  const w = windowAt('w1', 21, 18, 23);
  const whole = seedResponseDraft(
    [w],
    member('a', 'member', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
  );
  assert.equal(whole.answers.w1, 'full');

  const narrowed = seedResponseDraft(
    [w],
    member('a', 'member', { w1: [{ startsAt: at(21, 20), endsAt: at(21, 23) }] }),
  );
  assert.equal(narrowed.answers.w1, 'partial');

  const declined = seedResponseDraft([w], member('a', 'member', { w1: [] }));
  assert.equal(declined.answers.w1, 'none');
  // A declined day still keeps a usable range, so switching to "Teilweise"
  // has something to open on.
  assert.deepEqual(declined.intervals.w1, [{ startsAt: at(21, 18), endsAt: at(21, 23) }]);

  const fresh = seedResponseDraft([w], undefined);
  assert.equal(fresh.answers.w1, 'full');
});

check('coversWholeWindow accepts a clamped or over-reaching interval', () => {
  const w = windowAt('w1', 21, 18, 23);
  assert.equal(coversWholeWindow({ startsAt: at(21, 18), endsAt: at(21, 23) }, w), true);
  assert.equal(coversWholeWindow({ startsAt: at(21, 17), endsAt: at(21, 24) }, w), true);
  assert.equal(coversWholeWindow({ startsAt: at(21, 19), endsAt: at(21, 23) }, w), false);
});

console.log('\nanyNarrowedAnswer — which overview a round earns');

check('all-day answers and declines alone never ask for the matrix', () => {
  const w = windowAt('w1', 21, 18, 23);
  const v = windowAt('w2', 22, 18, 23);
  assert.equal(
    anyNarrowedAnswer(
      [w, v],
      [
        member('a', 'host', {
          w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }],
          w2: [{ startsAt: at(22, 18), endsAt: at(22, 23) }],
        }),
        member('b', 'member', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }], w2: [] }),
      ],
    ),
    false,
  );
});

check('one narrowed day anywhere brings the matrix back', () => {
  const w = windowAt('w1', 21, 18, 23);
  const v = windowAt('w2', 22, 18, 23);
  assert.equal(
    anyNarrowedAnswer(
      [w, v],
      [
        member('a', 'host', {
          w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }],
          w2: [{ startsAt: at(22, 18), endsAt: at(22, 23) }],
        }),
        member('b', 'member', {
          w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }],
          w2: [{ startsAt: at(22, 20), endsAt: at(22, 23) }],
        }),
      ],
    ),
    true,
  );
});

check('a legacy split answer counts as narrowed', () => {
  const w = windowAt('w1', 21, 18, 23);
  assert.equal(
    anyNarrowedAnswer(
      [w],
      [
        member('a', 'member', {
          w1: [
            { startsAt: at(21, 18), endsAt: at(21, 19) },
            { startsAt: at(21, 21), endsAt: at(21, 23) },
          ],
        }),
      ],
    ),
    true,
  );
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

check('a lockable candidate may span changing groups using their honest intersection', () => {
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

check(`a peak under ${MIN_SLOT_MINUTES} min loses to a valid longer candidate`, () => {
  const w = windowAt('w1', 21, 18, 23);
  const result = aggregateWindow(w, [
    member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 23) }] }),
    member('b', 'member', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 22) }] }),
    member('c', 'member', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 18, 10) }] }),
  ]);
  assert.equal(result.peakCount, 3, 'the spike is still in the data');
  assert.equal(result.best.count, 2, 'but it is not the answer');
  assert.equal(minutes(result.best.endMs - result.best.startMs), 240);
});

check('a window shorter than the Activity minimum has no lockable slot', () => {
  const w = { id: 'w1', groupId: 'g1', startsAt: at(21, 18), endsAt: at(21, 18, 10) };
  const result = aggregateWindow(w, [member('a', 'host', { w1: [{ startsAt: at(21, 18), endsAt: at(21, 18, 10) }] })]);
  assert.equal(result.best, null);
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

console.log('\ndescribePlanStatus');

function highlight(day, startHour, endHour) {
  const startMs = new Date(2026, 7, 22, startHour, 0, 0).getTime();
  const endMs = new Date(2026, 7, 22, endHour, 0, 0).getTime();
  return {
    windowId: 'w1',
    dayLabel: day,
    slot: { startMs, endMs, count: 3, uids: [], everyone: false },
  };
}

check('nobody has answered yet', () => {
  assert.equal(describePlanStatus({ respondedCount: 0, highlights: [] }), 'Noch keine Antworten');
});

check('the line leads with the favourite and what it covers', () => {
  assert.equal(
    describePlanStatus({
      respondedCount: 5,
      highlights: [highlight('Morgen', 19, 21)],
    }),
    'Favorit: Morgen, 19:00–21:00 · 3 von 5 können',
  );
});

check('the denominator is the answers, never the audience', () => {
  const line = describePlanStatus({
    respondedCount: 3,
    highlights: [highlight('Morgen', 19, 21)],
  });
  // 3 answers, 3 of them cover the slot. The old form said "3 von 20
  // Antworten" against the host's whole friend list, which read as failure
  // however well the round was going.
  assert.equal(line, 'Favorit: Morgen, 19:00–21:00 · 3 von 3 können');
});

check('no overlap at all is stated, never hidden behind a count', () => {
  assert.equal(
    describePlanStatus({ respondedCount: 3, highlights: [] }),
    '3 Antworten · Noch kein gemeinsamer Zeitraum',
  );
});

check('a tie is never squeezed into the row as two ranges', () => {
  const line = describePlanStatus({
    respondedCount: 4,
    highlights: [highlight('Morgen', 19, 21), highlight('So 23.8.', 19, 21)],
  });
  assert.equal(line, 'Mehrere Favoriten · je 3 von 4 können');
  assert.ok(!line.includes('Favorit:'), 'no dangling label without a time');
});

check('a reader without member access gets no favourite and no aggregate', () => {
  assert.equal(
    describePlanStatus({
      respondedCount: 3,
      highlights: [highlight('Morgen', 19, 21)],
      canSeeFavourite: false,
    }),
    '3 Antworten',
  );
  assert.equal(describePlanStatus({ respondedCount: 1, highlights: [], canSeeFavourite: false }), '1 Antwort');
});

check('the row never states a time as decided', () => {
  [3, 5].forEach((responded) => {
    const line = describePlanStatus({
      respondedCount: responded,
      highlights: [highlight('Morgen', 19, 21)],
    });
    assert.ok(/Favorit/.test(line), line);
  });
});


check('the audience size cannot reach the line at all', () => {
  // Replaces a guard against "6 von 5" — a member count that had outgrown a
  // stale audience snapshot. There is no audience denominator left to disagree
  // with, which is the stronger version of that fix.
  const line = describePlanStatus({ respondedCount: 6, highlights: [] });
  assert.equal(line, '6 Antworten · Noch kein gemeinsamer Zeitraum');
  assert.ok(!/ von /.test(line), line);
});

check('only a collecting round shows the row', () => {
  assert.equal(planRoundIsOpen('collecting'), true);
  assert.equal(planRoundIsOpen('locked'), false);
  assert.equal(planRoundIsOpen('cancelled'), false);
});

console.log(`\n${checks} checks passed.\n`);
