import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

/**
 * Exercises the activity feed's re-anchor policy.
 *
 * The thing worth testing is a COST, not an output: `visibleUntil > <now>` is
 * part of the query, so every re-anchor tears the listener down and asks the
 * server again — a billed read per matching document. The feed used to
 * re-anchor on every single expiry, and nothing about the rendered list said
 * so. These cases therefore count listener attachments, not just documents.
 *
 * Run: `node scripts/test-activity-feed-listener.mjs`
 */

const sourcePath = new URL(
  '../src/features/activities/services/firebaseActivityService.ts',
  import.meta.url,
);
const compiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath.pathname,
});

/** Attachments made by the service, newest last. */
const attachments = [];

/** `toMillis()` in the service narrows with `instanceof`, so this must be a class. */
class Timestamp {
  constructor(ms) {
    this.__ms = ms;
  }
  static fromMillis(ms) {
    return new Timestamp(ms);
  }
  toMillis() {
    return this.__ms;
  }
}

const firestoreStub = {
  collection: () => ({ kind: 'collection' }),
  doc: () => ({ id: 'doc' }),
  limit: (value) => ({ limit: value }),
  orderBy: (field, dir) => ({ orderBy: field, dir }),
  query: (...parts) => ({ parts }),
  where: (field, op, value) => ({ where: field, op, value }),
  Timestamp,
  onSnapshot: (query, onNext, onError) => {
    const attachment = { query, onNext, onError, live: true };
    attachments.push(attachment);
    return () => {
      attachment.live = false;
    };
  },
};

const moduleExports = {};
const module = { exports: moduleExports };
// eslint-disable-next-line no-new-func
new Function('exports', 'module', 'require', compiled.outputText)(module.exports, module, (id) => {
  if (id === '@react-native-firebase/firestore') return firestoreStub;
  if (id === '@react-native-firebase/functions') return { httpsCallable: () => async () => ({}) };
  if (id === '@/shared/services/firebase') {
    return { getFirebaseDb: () => ({}), getFirebaseFunctions: () => ({}) };
  }
  if (id === '@/features/sync') {
    return {
      registerSyncOperationHandler: () => {},
      runOrEnqueueSyncOperation: async () => {},
    };
  }
  return {};
});

const { firebaseActivityService } = module.exports;
assert.ok(firebaseActivityService, 'service did not export');

/** The clock the service reads. Controlled so expiries are exact. */
let clock = 1_000_000;
const realNow = Date.now;
Date.now = () => clock;

/** Pending timers, so `setTimeout` never depends on real time. */
let timers = [];
let timerSeq = 0;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
globalThis.setTimeout = (fn, delay) => {
  const id = ++timerSeq;
  timers.push({ id, fn, dueAt: clock + Math.max(0, delay ?? 0) });
  return id;
};
globalThis.clearTimeout = (id) => {
  timers = timers.filter((timer) => timer.id !== id);
};

/** Advances the clock and fires every timer that comes due, in order. */
function advanceTo(nextMs) {
  clock = nextMs;
  for (;;) {
    const due = timers.filter((timer) => timer.dueAt <= clock).sort((a, b) => a.dueAt - b.dueAt);
    if (due.length === 0) return;
    const next = due[0];
    timers = timers.filter((timer) => timer.id !== next.id);
    next.fn();
  }
}

function activityDoc(id, visibleUntilMs) {
  return {
    id,
    data: () => ({
      hostId: 'host',
      title: id,
      mode: 'soon',
      status: 'active',
      participantUids: ['host'],
      participants: [{ uid: 'host', displayName: 'Host' }],
      audienceUids: ['me'],
      createdAt: new Timestamp(0),
      visibleUntil: new Timestamp(visibleUntilMs),
    }),
  };
}

/** The `visibleUntil` lower bound the newest listener was anchored with. */
function currentAnchorMs() {
  const parts = attachments.at(-1).query.parts;
  return parts.find((part) => part.where === 'visibleUntil').value.__ms;
}

function liveAttachmentCount() {
  return attachments.filter((attachment) => attachment.live).length;
}

let failures = 0;
function check(name, fn) {
  attachments.length = 0;
  timers = [];
  clock = 1_000_000;
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}

console.log('activity feed listener');

check('one expiry is answered locally — no second server query', () => {
  const emitted = [];
  const stop = firebaseActivityService.subscribeActivities({ uid: 'me' }, (docs) =>
    emitted.push(docs.map((item) => item.id)),
  );
  assert.equal(attachments.length, 1, 'expected exactly one listener at subscribe');

  attachments[0].onNext({
    docs: [activityDoc('a', clock + 10_000), activityDoc('b', clock + 60_000)],
  });
  assert.deepEqual(emitted.at(-1), ['a', 'b']);

  advanceTo(clock + 10_100);
  assert.deepEqual(emitted.at(-1), ['b'], 'expired entry must disappear');
  assert.equal(attachments.length, 1, 'an expiry must NOT re-query the server');
  stop();
});

check('the old behaviour would have re-queried — anchor stays put', () => {
  const anchors = [];
  const stop = firebaseActivityService.subscribeActivities({ uid: 'me' }, () => {});
  anchors.push(currentAnchorMs());

  attachments[0].onNext({
    docs: [
      activityDoc('a', clock + 10_000),
      activityDoc('b', clock + 20_000),
      activityDoc('c', clock + 30_000),
      activityDoc('d', clock + 999_000),
    ],
  });
  advanceTo(clock + 35_000);
  anchors.push(currentAnchorMs());

  assert.equal(anchors[0], anchors[1], 'three expiries must not move the anchor');
  assert.equal(attachments.length, 1, 'three expiries must not add listeners');
  stop();
});

check('re-anchors once the window silts up past the threshold', () => {
  const stop = firebaseActivityService.subscribeActivities({ uid: 'me' }, () => {});
  const firstAnchor = currentAnchorMs();

  // Five expire, one survives — so a boundary timer exists to notice the silt.
  attachments[0].onNext({
    docs: [
      activityDoc('a', clock + 1_000),
      activityDoc('b', clock + 2_000),
      activityDoc('c', clock + 3_000),
      activityDoc('d', clock + 4_000),
      activityDoc('e', clock + 5_000),
      activityDoc('survivor', clock + 900_000),
    ],
  });
  advanceTo(clock + 6_000);

  assert.equal(attachments.length, 2, 'expected exactly one re-anchor');
  assert.ok(currentAnchorMs() > firstAnchor, 'the new query must use a fresh bound');
  assert.equal(liveAttachmentCount(), 1, 'the previous listener must be detached');
  stop();
});

check('a fully expired window re-anchors even without a boundary timer', () => {
  const stop = firebaseActivityService.subscribeActivities({ uid: 'me' }, () => {});
  // Everything already expired: no survivor, so nothing arms `onBoundary`.
  attachments[0].onNext({
    docs: [
      activityDoc('a', clock - 5_000),
      activityDoc('b', clock - 4_000),
      activityDoc('c', clock - 3_000),
      activityDoc('d', clock - 2_000),
      activityDoc('e', clock - 1_000),
    ],
  });
  advanceTo(clock + 1);
  assert.equal(attachments.length, 2, 'a silted-up dead window must still re-anchor');
  assert.equal(liveAttachmentCount(), 1);
  stop();
});

check('re-anchoring does not loop', () => {
  const stop = firebaseActivityService.subscribeActivities({ uid: 'me' }, () => {});
  attachments[0].onNext({
    docs: [
      activityDoc('a', clock - 5_000),
      activityDoc('b', clock - 4_000),
      activityDoc('c', clock - 3_000),
      activityDoc('d', clock - 2_000),
      activityDoc('e', clock - 1_000),
    ],
  });
  advanceTo(clock + 1);
  // The fresh listener answers with an empty window, as the server would.
  attachments.at(-1).onNext({ docs: [] });
  advanceTo(clock + 60_000);
  assert.equal(attachments.length, 2, 'a fresh anchor must not trigger another re-anchor');
  stop();
});

check('unsubscribing detaches the listener and cancels every timer', () => {
  const stop = firebaseActivityService.subscribeActivities({ uid: 'me' }, () => {});
  attachments[0].onNext({ docs: [activityDoc('a', clock + 10_000)] });
  assert.ok(timers.length > 0, 'a boundary timer should be armed');
  stop();
  assert.equal(liveAttachmentCount(), 0, 'listener must be detached');
  assert.equal(timers.length, 0, 'no timer may survive unsubscribe');
});

check('a query error clears the list and arms nothing', () => {
  const emitted = [];
  const stop = firebaseActivityService.subscribeActivities({ uid: 'me' }, (docs) =>
    emitted.push(docs.map((item) => item.id)),
  );
  attachments[0].onNext({ docs: [activityDoc('a', clock + 10_000)] });
  attachments[0].onError(new Error('permission-denied'));
  assert.deepEqual(emitted.at(-1), []);
  assert.equal(timers.length, 0, 'an error must not leave a boundary timer behind');
  stop();
});

Date.now = realNow;
globalThis.setTimeout = realSetTimeout;
globalThis.clearTimeout = realClearTimeout;

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
