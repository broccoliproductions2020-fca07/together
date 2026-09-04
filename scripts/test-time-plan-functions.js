/* global __dirname */

/**
 * Emulator test for the Terminfindung callables.
 *
 * The two rules this feature stands on are both SERVER rules, so they are
 * tested here rather than asserted in a comment:
 *
 *   1. There is no member without an answer. Joining and answering are one
 *      transaction, and an incomplete answer is refused.
 *   2. A round can END. `lockTimePlan` turns it into a real Activity, carries
 *      over the people who said they can, and cannot be run by anyone else.
 */

const PROJECT_ID = 'demo-together';
const AUTH_PORT = Number(process.env.TEST_AUTH_EMULATOR_PORT ?? 9199);
const FIRESTORE_PORT = Number(process.env.TEST_FIRESTORE_EMULATOR_PORT ?? 8180);
const FUNCTIONS_PORT = Number(process.env.TEST_FUNCTIONS_EMULATOR_PORT ?? 5001);
const DATABASE_PORT = Number(process.env.TEST_DATABASE_EMULATOR_PORT ?? 8281);
const AUTH_BASE = `http://127.0.0.1:${AUTH_PORT}/identitytoolkit.googleapis.com/v1`;
const FUNCTIONS_BASE = `http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT_ID}/europe-west3`;

process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FIRESTORE_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_PORT}`;
process.env.FIREBASE_DATABASE_EMULATOR_HOST = `127.0.0.1:${DATABASE_PORT}`;

const admin = require('./firebase-admin-tools.cjs');
const { buildFriendSearchFields } = require('../functions/friend-search');

let passed = 0;

function initialsOf(name) {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'TU'
  );
}

async function createTestUser() {
  const response = await fetch(`${AUTH_BASE}/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth sign-up failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function callFunction(token, name, data) {
  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { ok: response.ok, status: response.status, body };
}

async function expectOk(label, operation) {
  const result = await operation();
  if (!result.ok) {
    throw new Error(`${label}: expected success, got ${result.status} ${JSON.stringify(result.body)}`);
  }
  passed += 1;
  console.log(`  ok  ${label}`);
  return result.body?.result ?? result.body;
}

async function expectError(label, expectedStatus, operation) {
  const result = await operation();
  if (result.ok) throw new Error(`${label}: expected failure, got success`);
  const status = result.body?.error?.status;
  if (status !== expectedStatus) {
    throw new Error(`${label}: expected ${expectedStatus}, got ${status} ${JSON.stringify(result.body)}`);
  }
  passed += 1;
  console.log(`  ok  ${label}`);
}

function assert(label, condition, detail) {
  if (!condition) throw new Error(`${label}${detail ? ` — ${detail}` : ''}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

function friendshipId(first, second) {
  return [first, second].sort().join('_');
}

function iso(ms) {
  return new Date(ms).toISOString();
}

/** Snaps to a 5-minute grid — the server rejects anything else. */
function slot(base, offsetMinutes) {
  const step = 5 * 60 * 1000;
  return Math.round((base + offsetMinutes * 60 * 1000) / step) * step;
}

async function main() {
  const app = admin.initializeApp(
    { projectId: PROJECT_ID, databaseURL: 'https://demo-together-default-rtdb.firebaseio.com' },
    'time-plan-test',
  );
  const db = app.firestore();
  const timestamp = admin.firestore.Timestamp.now();
  const now = Date.now();

  const [alice, bob, charlie, dave] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const people = [
    { ...alice, name: 'Alice Adams', username: 'tpalice' },
    { ...bob, name: 'Bob Berger', username: 'tpbob' },
    { ...charlie, name: 'Charlie Clark', username: 'tpcharlie' },
    { ...dave, name: 'Dave Dietrich', username: 'tpdave' },
  ];

  const batch = db.batch();
  people.forEach((person) => {
    const initials = initialsOf(person.name);
    batch.set(db.doc(`users/${person.uid}`), {
      displayName: person.name,
      username: person.username,
      initials,
      profileVisibility: 'friends',
      friendRequestPolicy: 'anyone',
      friendshipsVersion: 0,
      createdAt: timestamp,
    });
    batch.set(db.doc(`publicProfiles/${person.uid}`), {
      displayName: person.name,
      username: person.username,
      initials,
      createdAt: timestamp,
    });
    batch.set(db.doc(`usernames/${person.username}`), { uid: person.uid, createdAt: timestamp });
    batch.set(db.doc(`friendSearch/${person.uid}`), {
      ...buildFriendSearchFields(
        { displayName: person.name, username: person.username, initials },
        'anyone',
      ),
      updatedAt: timestamp,
    });
  });
  // Alice is friends with everyone; the others are not friends with each other.
  [bob, charlie, dave].forEach((friend) => {
    const pair = [alice, friend];
    batch.set(db.doc(`friendships/${friendshipId(alice.uid, friend.uid)}`), {
      participantUids: [alice.uid, friend.uid].sort(),
      requesterUid: alice.uid,
      status: 'accepted',
      profiles: pair.map((person) => {
        const entry = people.find((item) => item.uid === person.uid);
        return {
          uid: entry.uid,
          displayName: entry.name,
          username: entry.username,
          initials: initialsOf(entry.name),
        };
      }),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
  await batch.commit();

  // Three evenings, two days apart, all comfortably in the future.
  const dayOne = slot(now + 26 * 60 * 60 * 1000, 0);
  const dayTwo = slot(now + 50 * 60 * 60 * 1000, 0);
  const dayThree = slot(now + 74 * 60 * 60 * 1000, 0);
  const windows = [
    { id: 'w1', groupId: 'g1', startsAt: iso(dayOne), endsAt: iso(slot(dayOne, 300)) },
    { id: 'w2', groupId: 'g1', startsAt: iso(dayTwo), endsAt: iso(slot(dayTwo, 300)) },
    { id: 'w3', groupId: 'g1', startsAt: iso(dayThree), endsAt: iso(slot(dayThree, 300)) },
  ];
  const planId = 'timePlan_test_1';

  console.log('\ncreateTimePlan');
  await expectOk('host creates a round for all friends', () =>
    callFunction(alice.token, 'createTimePlan', {
      planId,
      plan: {
        title: 'Grillen im Park',
        visibility: { kind: 'all_friends' },
        sourceWindows: windows,
      },
    }),
  );

  const planSnapshot = await db.doc(`timePlans/${planId}`).get();
  assert('plan starts in collecting', planSnapshot.data().status === 'collecting');
  const hostMember = await db.doc(`timePlans/${planId}/timePlanMembers/${alice.uid}`).get();
  assert(
    'the host counts as answered from the start',
    hostMember.data().responseStatus === 'responded',
  );
  const invites = await db.collection('timePlanInvites').where('planId', '==', planId).get();
  assert('every friend is invited', invites.size === 3, `got ${invites.size}`);
  assert('the plan stores only the audience count', planSnapshot.data().audienceCount === 4);
  assert('the plan does not expose invitee ids', !('audienceUids' in planSnapshot.data()));
  const audienceProjections = await db
    .collection('timePlanAudience')
    .where('planId', '==', planId)
    .get();
  assert('every audience member gets one private projection', audienceProjections.size === 4);
  assert(
    'audience projections contain no member or audience identity arrays',
    audienceProjections.docs.every(
      (entry) => !('memberUids' in entry.data()) && !('audienceUids' in entry.data()),
    ),
  );

  console.log('\njoinTimePlan — joining IS answering');
  await expectError('joining without an answer is refused', 'INVALID_ARGUMENT', () =>
    callFunction(bob.token, 'joinTimePlan', { planId }),
  );
  await expectError('an answer missing a day is refused', 'FAILED_PRECONDITION', () =>
    callFunction(bob.token, 'joinTimePlan', {
      planId,
      responsesByWindow: { w1: [{ startsAt: windows[0].startsAt, endsAt: windows[0].endsAt }] },
    }),
  );
  assert(
    'a refused join leaves no member behind',
    !(await db.doc(`timePlans/${planId}/timePlanMembers/${bob.uid}`).get()).exists,
  );

  // Bob can do all of day one, only the second half of day two, and not day three.
  const bobResponses = {
    w1: [{ startsAt: windows[0].startsAt, endsAt: windows[0].endsAt }],
    w2: [{ startsAt: iso(slot(dayTwo, 120)), endsAt: iso(slot(dayTwo, 300)) }],
    w3: [],
  };
  await expectOk('joining with a complete answer works', () =>
    callFunction(bob.token, 'joinTimePlan', { planId, responsesByWindow: bobResponses }),
  );
  const bobMember = await db.doc(`timePlans/${planId}/timePlanMembers/${bob.uid}`).get();
  assert('the new member is answered, never pending', bobMember.data().responseStatus === 'responded');
  assert('an explicit "no" is stored as an empty list', bobMember.data().responsesByWindow.w3.length === 0);
  assert(
    'joining activates only the viewer projection',
    (await db.doc(`timePlanAudience/${planId}_${bob.uid}`).get()).data().joined === true,
  );
  await expectError('split availability is refused', 'INVALID_ARGUMENT', () =>
    callFunction(bob.token, 'respondToTimePlan', {
      planId,
      revision: 1,
      responsesByWindow: {
        w1: [
          { startsAt: windows[0].startsAt, endsAt: iso(slot(dayOne, 60)) },
          { startsAt: iso(slot(dayOne, 120)), endsAt: windows[0].endsAt },
        ],
        w2: [],
        w3: [],
      },
    }),
  );

  // Charlie can do day one only from an hour in.
  await expectOk('a second member joins', () =>
    callFunction(charlie.token, 'joinTimePlan', {
      planId,
      responsesByWindow: {
        w1: [{ startsAt: iso(slot(dayOne, 60)), endsAt: windows[0].endsAt }],
        w2: [],
        w3: [],
      },
    }),
  );

  const outsider = await createTestUser();
  await expectError('an outsider cannot join', 'PERMISSION_DENIED', () =>
    callFunction(outsider.token, 'joinTimePlan', {
      planId,
      responsesByWindow: { w1: [], w2: [], w3: [] },
    }),
  );

  console.log('\nlockTimePlan — the round can end');
  const lockStart = iso(slot(dayOne, 60));
  const lockEnd = iso(slot(dayOne, 240));

  await expectError('a member cannot lock', 'PERMISSION_DENIED', () =>
    callFunction(bob.token, 'lockTimePlan', {
      planId,
      windowId: 'w1',
      activityId: 'activity_wrong_actor',
      startsAt: lockStart,
      endsAt: lockEnd,
    }),
  );
  await expectError('a slot outside the offer is refused', 'INVALID_ARGUMENT', () =>
    callFunction(alice.token, 'lockTimePlan', {
      planId,
      windowId: 'w1',
      activityId: 'activity_outside',
      startsAt: iso(slot(dayOne, -60)),
      endsAt: lockEnd,
    }),
  );
  await expectError('an unknown window is refused', 'NOT_FOUND', () =>
    callFunction(alice.token, 'lockTimePlan', {
      planId,
      windowId: 'nope',
      activityId: 'activity_unknown_window',
      startsAt: lockStart,
      endsAt: lockEnd,
    }),
  );
  await expectError('a lock shorter than 15 minutes is refused', 'INVALID_ARGUMENT', () =>
    callFunction(alice.token, 'lockTimePlan', {
      planId,
      windowId: 'w1',
      activityId: 'activity_too_short',
      startsAt: lockStart,
      endsAt: iso(Date.parse(lockStart) + 10 * 60 * 1000),
    }),
  );
  await expectError('an off-grid lock is refused', 'INVALID_ARGUMENT', () =>
    callFunction(alice.token, 'lockTimePlan', {
      planId,
      windowId: 'w1',
      activityId: 'activity_off_grid',
      startsAt: iso(Date.parse(lockStart) + 60 * 1000),
      endsAt: lockEnd,
    }),
  );

  // A locked-notification id is deterministic, so one may already be there.
  // Writing it with `create` made that an unhandled ALREADY_EXISTS, which
  // reached the user as the word "INTERNAL".
  await db.doc(`notifications/timeplanlocked_${planId}_${bob.uid}`).set({
    recipientUid: bob.uid,
    kind: 'time_plan_locked',
    title: 'Alt',
    body: 'Alt',
    timePlanId: planId,
    createdAt: admin.firestore.Timestamp.now(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  });

  const activityId = 'activity_locked_1';
  await expectOk('locking survives a notification that already exists', () =>
    callFunction(alice.token, 'lockTimePlan', {
      planId,
      windowId: 'w1',
      activityId,
      startsAt: lockStart,
      endsAt: lockEnd,
    }),
  );

  const activity = (await db.doc(`activities/${activityId}`).get()).data();
  assert('the round became a real Activity', Boolean(activity));
  assert('it carries the chosen slot', activity.startsAt === lockStart && activity.endsAt === lockEnd);
  assert('a future slot is stored as a plan, not as running', activity.mode === 'soon');
  assert('the host sits at index 0, as firestore.rules requires', activity.participantUids[0] === alice.uid);
  assert(
    'people who said they can are carried over',
    activity.participantUids.includes(bob.uid) && activity.participantUids.includes(charlie.uid),
    JSON.stringify(activity.participantUids),
  );
  assert(
    'the audience is the round, not the whole friend list',
    !activity.audienceUids.includes(dave.uid),
    JSON.stringify(activity.audienceUids),
  );
  assert('the activity chat exists', (await db.doc(`chats/${activityId}`).get()).exists);
  assert('it points back at the round', activity.timePlanId === planId);

  const lockedPlan = (await db.doc(`timePlans/${planId}`).get()).data();
  assert('the plan is locked', lockedPlan.status === 'locked');
  assert('the plan points at the activity', lockedPlan.activityId === activityId);
  const lockedProjections = await db
    .collection('timePlanAudience')
    .where('planId', '==', planId)
    .get();
  assert(
    'all private audience projections close with the plan',
    lockedProjections.docs.every((entry) => entry.data().status === 'locked'),
  );

  // A round dies with the thing it was arranging. The stamp was cut from the
  // LAST proposed window at creation; locking re-cuts it from the chosen slot,
  // so proposing three days and locking the first cannot keep everyone's
  // availability alive until the third. The members carry the sensitive half
  // and live in a subcollection a TTL on the plan doc would never reach, so
  // they are checked separately and not by inference.
  const expectedExpiry = Date.parse(lockEnd) + 12 * 60 * 60 * 1000;
  assert(
    'the round now expires with the activity chat',
    lockedPlan.expireAt.toMillis() === expectedExpiry && activity.expireAt.toMillis() === expectedExpiry,
    `plan ${lockedPlan.expireAt.toMillis()} vs ${expectedExpiry}`,
  );
  assert(
    'the private projections expire with it',
    lockedProjections.docs.every((entry) => entry.data().expireAt.toMillis() === expectedExpiry),
  );
  const lockedMembers = await db.collection(`timePlans/${planId}/timePlanMembers`).get();
  assert(
    'the answers themselves expire with it',
    lockedMembers.size > 0 &&
      lockedMembers.docs.every((entry) => entry.data().expireAt.toMillis() === expectedExpiry),
    JSON.stringify(lockedMembers.docs.map((entry) => entry.data().expireAt?.toMillis())),
  );

  const lockNotices = await db
    .collection('notifications')
    .where('timePlanId', '==', planId)
    .where('kind', '==', 'time_plan_locked')
    .get();
  assert('every other member is told', lockNotices.size === 2, `got ${lockNotices.size}`);
  assert(
    'the host is not notified about their own decision',
    lockNotices.docs.every((doc) => doc.data().recipientUid !== alice.uid),
  );

  await expectOk('a retry with the same id is idempotent', () =>
    callFunction(alice.token, 'lockTimePlan', {
      planId,
      windowId: 'w1',
      activityId,
      startsAt: lockStart,
      endsAt: lockEnd,
    }),
  );
  await expectError('a locked round cannot be locked again', 'FAILED_PRECONDITION', () =>
    callFunction(alice.token, 'lockTimePlan', {
      planId,
      windowId: 'w2',
      activityId: 'activity_locked_2',
      startsAt: windows[1].startsAt,
      endsAt: windows[1].endsAt,
    }),
  );
  await expectError('a locked round takes no more members', 'FAILED_PRECONDITION', () =>
    callFunction(dave.token, 'joinTimePlan', {
      planId,
      responsesByWindow: { w1: [], w2: [], w3: [] },
    }),
  );

  console.log(`\n${passed} checks passed.\n`);
  await app.delete();
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}\n`);
  process.exit(1);
});
