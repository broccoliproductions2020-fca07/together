import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

/**
 * Exercises the composer's audience selection maths.
 *
 * The incremental group counters are the one piece here with a real chance of
 * drifting silently: a toggle patches only the groups the person belongs to, so
 * a mistake shows up as a group stuck on the wrong tri-state rather than as an
 * error. Every case below compares the incremental result against a full
 * rebuild, which is the only honest check that the shortcut and the ground
 * truth still agree.
 */
const sourcePath = new URL('../src/features/activities/utils/audienceSelection.ts', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath.pathname,
});
// Evaluated in THIS realm rather than a vm context: the module returns plain
// object literals, and a separate realm gives them a different Object.prototype,
// which makes assert's deep-strict comparison fail on values that are identical.
const module = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('exports', 'module', 'require', compiled.outputText)(
  module.exports,
  module,
  () => ({}),
);

const {
  buildAudienceIndex,
  createAudienceState,
  setFriendSelected,
  setGroupSelected,
  groupCheckState,
  nextCheckValue,
  selectionToVisibility,
  visibilityToSelection,
  describeAudience,
  describeExcluded,
  ALL_FRIENDS_GROUP_ID,
  CLOSE_FRIENDS_GROUP_ID,
} = module.exports;

const friend = (uid, displayName) => ({ uid, displayName, initials: displayName.slice(0, 2) });

const FRIENDS = [
  friend('u1', 'Lena Kern'),
  friend('u2', 'Max Thiel'),
  friend('u3', 'Tim Sauer'),
  friend('u4', 'Anna Bauer'),
  friend('u5', 'Sina Nowak'),
  friend('u6', 'Finn Krause'),
];
const CIRCLES = [
  { id: 'c1', name: 'Mädels', friendUids: ['u1', 'u4', 'u5'] },
  { id: 'c2', name: 'Bouldern', friendUids: ['u2', 'u3', 'u5'] },
  // Contains a uid that is no longer a friend — must be intersected away.
  { id: 'c3', name: 'Alt', friendUids: ['u6', 'ghost'] },
  // Nothing selectable at all: dropped entirely.
  { id: 'c4', name: 'Leer', friendUids: ['ghost2'] },
];
const CLOSE = ['u4', 'u6', 'ghost'];

const index = buildAudienceIndex(FRIENDS, CIRCLES, CLOSE);
let checks = 0;
const check = (label, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${label}`);
};

console.log('index');
check('drops CIRCLES with no live members', () => {
  assert.equal(
    index.groups.find((group) => group.id === 'c4'),
    undefined,
  );
});
check('the two standard groups lead the list, in order', () => {
  assert.deepEqual(
    index.groups.slice(0, 2).map((group) => group.id),
    [ALL_FRIENDS_GROUP_ID, CLOSE_FRIENDS_GROUP_ID],
  );
  assert.equal(index.groups[0].standard, true);
  assert.equal(index.groups[1].standard, true);
});
check('standard groups exist even for an account with nothing in them', () => {
  const bare = buildAudienceIndex([], [], []);
  assert.deepEqual(
    bare.groups.map((group) => group.id),
    [ALL_FRIENDS_GROUP_ID, CLOSE_FRIENDS_GROUP_ID],
  );
  assert.deepEqual(bare.groups[0].memberUids, []);
  // A friendless account still keeps "Enge Freunde" as a row, unlike a circle.
  const noClose = buildAudienceIndex(FRIENDS, [], []);
  assert.deepEqual(
    noClose.groups.find((group) => group.id === CLOSE_FRIENDS_GROUP_ID).memberUids,
    [],
  );
});
check('Alle Freunde holds exactly the live friend list', () => {
  assert.deepEqual(
    index.groups.find((group) => group.id === ALL_FRIENDS_GROUP_ID).memberUids,
    index.friendUids,
  );
});
check('intersects group members with the live friend list', () => {
  assert.deepEqual(index.groups.find((group) => group.id === 'c3').memberUids, ['u6']);
});
check('close friends travel as a pseudo-group, also intersected', () => {
  const close = index.groups.find((group) => group.id === CLOSE_FRIENDS_GROUP_ID);
  assert.deepEqual(close.memberUids, ['u4', 'u6']);
});
check('inverse index lists every group a person is in', () => {
  assert.deepEqual([...index.memberOf.get('u5')].sort(), [ALL_FRIENDS_GROUP_ID, 'c1', 'c2']);
  assert.deepEqual(
    [...index.memberOf.get('u4')].sort(),
    [ALL_FRIENDS_GROUP_ID, CLOSE_FRIENDS_GROUP_ID, 'c1'],
  );
});

console.log('counters');
/** The shortcut must always agree with a from-scratch rebuild. */
function assertConsistent(state, label) {
  const rebuilt = createAudienceState(index, state.selected);
  for (const group of index.groups) {
    assert.equal(
      state.groupCounts.get(group.id),
      rebuilt.groupCounts.get(group.id),
      `${label}: counter drift on ${group.id}`,
    );
  }
}

let state = createAudienceState(index, index.friendUids);
check('everything selected reads as on', () => {
  assert.equal(groupCheckState(index, state, ALL_FRIENDS_GROUP_ID), 'on');
  assert.equal(groupCheckState(index, state, 'c1'), 'on');
});

state = setFriendSelected(index, state, 'u5', false);
check('removing a shared member makes BOTH their groups partial', () => {
  assert.equal(groupCheckState(index, state, 'c1'), 'partial');
  assert.equal(groupCheckState(index, state, 'c2'), 'partial');
  assert.equal(groupCheckState(index, state, ALL_FRIENDS_GROUP_ID), 'partial');
  assertConsistent(state, 'after single removal');
});

state = setGroupSelected(index, state, 'c2', false);
check('deselecting a group leaves other groups partial, not off', () => {
  assert.equal(groupCheckState(index, state, 'c2'), 'off');
  assert.equal(groupCheckState(index, state, 'c1'), 'partial');
  assert.equal(state.selected.size, 3);
  assertConsistent(state, 'after group removal');
});

state = setGroupSelected(index, state, 'c2', true);
check('re-selecting a group restores the shared member everywhere', () => {
  assert.equal(groupCheckState(index, state, 'c2'), 'on');
  assert.equal(groupCheckState(index, state, 'c1'), 'on');
  assertConsistent(state, 'after group restore');
});

check('idempotent writes do not double-count', () => {
  let repeated = setGroupSelected(index, state, 'c1', true);
  repeated = setGroupSelected(index, repeated, 'c1', true);
  repeated = setFriendSelected(index, repeated, 'u1', true);
  assertConsistent(repeated, 'after repeated writes');
  assert.equal(repeated.selected.size, state.selected.size);
});

check('a long random walk never drifts', () => {
  let walk = createAudienceState(index, index.friendUids);
  let seed = 7;
  const rand = (max) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % max;
  };
  for (let step = 0; step < 400; step += 1) {
    if (rand(2) === 0) {
      const uid = index.friendUids[rand(index.friendUids.length)];
      walk = setFriendSelected(index, walk, uid, rand(2) === 0);
    } else {
      const group = index.groups[rand(index.groups.length)];
      walk = setGroupSelected(index, walk, group.id, rand(2) === 0);
    }
    assertConsistent(walk, `walk step ${step}`);
  }
});

console.log('tri-state tap direction');
check('partial resolves to on, never to off', () => {
  assert.equal(nextCheckValue('partial'), true);
  assert.equal(nextCheckValue('off'), true);
  assert.equal(nextCheckValue('on'), false);
});

console.log('visibility round trip');
check('everyone selected emits all_friends, not an enumerated list', () => {
  const full = createAudienceState(index, index.friendUids);
  assert.deepEqual(selectionToVisibility(index, full), { kind: 'all_friends' });
});
check('a narrowed set emits an explicit selection', () => {
  const narrowed = setFriendSelected(index, createAudienceState(index, index.friendUids), 'u2', false);
  const visibility = selectionToVisibility(index, narrowed);
  assert.equal(visibility.kind, 'selection');
  assert.equal(visibility.uids.includes('u2'), false);
  assert.equal(visibility.uids.length, 5);
});
check('an account without friends never emits an empty selection', () => {
  const emptyIndex = buildAudienceIndex([], [], []);
  const emptyState = createAudienceState(emptyIndex, []);
  assert.deepEqual(selectionToVisibility(emptyIndex, emptyState), { kind: 'all_friends' });
});
check('stored visibilities resolve back to concrete people', () => {
  assert.deepEqual(visibilityToSelection(index, { kind: 'all_friends' }, CLOSE), index.friendUids);
  assert.deepEqual(visibilityToSelection(index, { kind: 'close_friends' }, CLOSE), ['u4', 'u6']);
  assert.deepEqual(visibilityToSelection(index, { kind: 'group', groupId: 'c1' }, CLOSE), [
    'u1',
    'u4',
    'u5',
  ]);
  // A uid that is no longer a friend must not survive the round trip.
  assert.deepEqual(
    visibilityToSelection(index, { kind: 'selection', uids: ['u1', 'ghost'] }, CLOSE),
    ['u1'],
  );
});
check('clearing via the Alle-Freunde group empties every counter', () => {
  const full = createAudienceState(index, index.friendUids);
  const cleared = setGroupSelected(index, full, ALL_FRIENDS_GROUP_ID, false);
  assert.equal(cleared.selected.size, 0);
  for (const group of index.groups) assert.equal(cleared.groupCounts.get(group.id), 0);
  assert.equal(groupCheckState(index, cleared, ALL_FRIENDS_GROUP_ID), 'off');
  assertConsistent(cleared, 'after clearing via Alle Freunde');
});
check('selecting the Alle-Freunde group restores everyone', () => {
  const restored = setGroupSelected(index, createAudienceState(index, []), ALL_FRIENDS_GROUP_ID, true);
  assert.deepEqual([...restored.selected].sort(), [...index.friendUids].sort());
  assertConsistent(restored, 'after restoring via Alle Freunde');
});

console.log('summary copy');
check('the collapsed row names the audience instead of counting it', () => {
  const full = createAudienceState(index, index.friendUids);
  assert.equal(describeAudience(index, full).label, 'Alle Freunde');
  assert.equal(describeAudience(index, full).detail, '6 Personen');

  // A selection that exactly equals a group is reported under that group's name.
  const close = createAudienceState(index, ['u4', 'u6']);
  assert.equal(describeAudience(index, close).label, 'Enge Freunde');
  const circle = createAudienceState(index, ['u1', 'u4', 'u5']);
  assert.equal(describeAudience(index, circle).label, 'Mädels');

  const one = createAudienceState(index, ['u2']);
  assert.equal(describeAudience(index, one).label, 'Max Thiel');

  // No nameable match left: fall back to the count plus who is missing.
  const odd = createAudienceState(index, ['u1', 'u2']);
  assert.equal(describeAudience(index, odd).label, '2 von 6 Freunden');
  assert.match(describeAudience(index, odd).detail, /sehen sie nicht$/);
});
check('nobody selected is the only warning state', () => {
  const none = createAudienceState(index, []);
  assert.equal(describeAudience(index, none).label, 'Niemand');
  assert.equal(describeAudience(index, none).empty, true);
});
check('an account without friends is not reported as "Niemand"', () => {
  const bare = buildAudienceIndex([], [], []);
  const summary = describeAudience(bare, createAudienceState(bare, []));
  assert.equal(summary.label, 'Alle Freunde');
  assert.equal(summary.empty, false);
});
check('names the excluded and collapses a long tail', () => {
  const full = createAudienceState(index, index.friendUids);
  assert.equal(describeExcluded(index, full), null);
  const one = setFriendSelected(index, full, 'u2', false);
  assert.equal(describeExcluded(index, one), 'Max sieht sie nicht');
  const two = setFriendSelected(index, one, 'u4', false);
  assert.equal(describeExcluded(index, two), 'Max und Anna sehen sie nicht');
  const many = setGroupSelected(index, two, 'c1', false);
  assert.match(describeExcluded(index, many), /und \d+ weitere sehen sie nicht$/);
});

console.log(`\n${checks} checks passed`);
