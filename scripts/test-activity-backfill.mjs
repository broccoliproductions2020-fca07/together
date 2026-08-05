import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const admin = require('./firebase-admin-tools.cjs');

const PROJECT_ID = 'demo-together';
// The test runner chooses an isolated local port. This explicit default keeps
// the nested migration process emulator-only even when Firebase CLI does not
// export FIRESTORE_EMULATOR_HOST for a child command.
process.env.FIRESTORE_EMULATOR_HOST ??= `127.0.0.1:${process.env.TEST_FIRESTORE_EMULATOR_PORT ?? 8180}`;
const host = process.env.FIRESTORE_EMULATOR_HOST;

const now = Date.now();
const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const iso = (ms) => new Date(ms).toISOString();

function activity({ id, startsAt, endsAt, expireAt, visibleUntil }) {
  return {
    id,
    hostId: 'backfill-owner',
    mode: 'soon',
    title: id,
    audienceUids: ['backfill-viewer'],
    participantUids: ['backfill-owner'],
    participants: [{ uid: 'backfill-owner', displayName: 'Backfill Owner', initials: 'BO' }],
    status: 'active',
    createdAt: ts(now),
    ...(startsAt ? { startsAt: iso(startsAt) } : {}),
    ...(endsAt ? { endsAt: iso(endsAt) } : {}),
    ...(expireAt ? { expireAt: ts(expireAt) } : {}),
    ...(visibleUntil ? { visibleUntil: ts(visibleUntil) } : {}),
  };
}

function millis(snapshot) {
  return snapshot.data()?.visibleUntil?.toMillis?.();
}

async function main() {
  const app = admin.initializeApp({ projectId: PROJECT_ID }, 'activity-backfill-test');
  const db = app.firestore();
  const fixture = [
    activity({
      id: 'backfill-end',
      startsAt: now + 15 * 60 * 1000,
      endsAt: now + 60 * 60 * 1000,
      expireAt: now + 25 * 60 * 60 * 1000,
    }),
    activity({
      id: 'backfill-start',
      startsAt: now + 2 * 60 * 60 * 1000,
      expireAt: now + 26 * 60 * 60 * 1000,
    }),
    activity({ id: 'backfill-expiry', expireAt: now + 3 * 60 * 60 * 1000 }),
    activity({
      id: 'backfill-ended',
      startsAt: now - 2 * 60 * 60 * 1000,
      endsAt: now - 60 * 60 * 1000,
      expireAt: now + 23 * 60 * 60 * 1000,
    }),
    activity({
      id: 'backfill-current',
      startsAt: now + 60 * 60 * 1000,
      endsAt: now + 4 * 60 * 60 * 1000,
      visibleUntil: now + 4 * 60 * 60 * 1000,
      expireAt: now + 28 * 60 * 60 * 1000,
    }),
  ];
  const batch = db.batch();
  fixture.forEach(({ id, ...data }) => batch.set(db.doc(`activities/${id}`), data));
  await batch.commit();

  const result = spawnSync(process.execPath, ['scripts/backfill-activity-visible-until.mjs', '--apply'], {
    cwd: root,
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: host },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Backfill fehlgeschlagen:\n${result.stdout}\n${result.stderr}`);
  }

  const [end, start, expiry, ended, current] = await Promise.all(
    ['backfill-end', 'backfill-start', 'backfill-expiry', 'backfill-ended', 'backfill-current'].map(
      (id) => db.doc(`activities/${id}`).get(),
    ),
  );
  if (
    millis(end) !== now + 60 * 60 * 1000 ||
    millis(start) !== now + 2 * 60 * 60 * 1000 ||
    millis(expiry) !== now + 3 * 60 * 60 * 1000 ||
    millis(ended) !== now - 60 * 60 * 1000 ||
    millis(current) !== now + 4 * 60 * 60 * 1000
  ) {
    throw new Error('Backfill setzte visibleUntil nicht mit der erwarteten Fallback-Reihenfolge.');
  }

  const feed = await db
    .collection('activities')
    .where('audienceUids', 'array-contains', 'backfill-viewer')
    .where('status', '==', 'active')
    .where('visibleUntil', '>', ts(now))
    .orderBy('visibleUntil', 'asc')
    .get();
  const ids = new Set(feed.docs.map((document) => document.id));
  if (!ids.has('backfill-end') || !ids.has('backfill-start') || !ids.has('backfill-expiry')) {
    throw new Error('Der Feed enthält nach dem Backfill nicht alle weiterhin sichtbaren Activities.');
  }
  if (ids.has('backfill-ended')) {
    throw new Error('Eine bereits beendete Activity gelangte nach dem Backfill in den Feed.');
  }

  console.log('OK activity backfill preserves schedule fallbacks and feed visibility');
  await app.delete();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
