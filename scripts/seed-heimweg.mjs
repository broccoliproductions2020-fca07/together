/**
 * Seeds a LIVE demo Heimweg (Mia) into the local RTDB emulator so the
 * companion experience — pulsing shield, Heimweg-Fokus map, floating console
 * panel (Fall 2/3) — is testable in the local emulator without a second device.
 *
 * Usage (emulators must be running; run `npm run emulators:seed` once first):
 *   npm run emulators:seed:heimweg              → Mia walks in a circle, blue
 *   node scripts/seed-heimweg.mjs --once        → static Mia session, then exit
 *   node scripts/seed-heimweg.mjs --count 2     → Mia + Ben (max 3: + Nora)
 *   node scripts/seed-heimweg.mjs --status orange|red   (applies to Mia only —
 *     the others stay blue, so mixed severity is testable: pill/sheet must
 *     show the worst one first)
 *   node scripts/seed-heimweg.mjs --end         → removes sessions + index
 *   node scripts/seed-heimweg.mjs --once --owner seed-mia --audience seed-amelie,seed-david
 *     → ONE session owned by the signed-in screenshot account, shared with
 *       exactly those two. That is the owner console ("Sicher angekommen"),
 *       not the companion view, and it is what the landing capture needs.
 *
 * Behaviour:
 *  - Shares with EVERY non-seed auth user (your dev account/s), plus the two
 *    supplied portrait companions used by the owner-side marketing capture.
 *  - Updates location/updatedAt every 20 s while running, so derived signals
 *    stay honestly fresh. Ctrl+C leaves the session standing — updatedAt goes
 *    stale, which IS the honest data-gap demo (orange after 4 min); clean up
 *    with --end. The standard active window is 2 h either way.
 *  - Admin SDK bypasses the RTDB rules on purpose (test seed, like the rest
 *    of scripts/seed-emulators.mjs). Production writes stay callable-owned.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { LANDING_CENTRE } from './lib/seed-scenarios.mjs';

const require = createRequire(import.meta.url);
const admin = require('./firebase-admin-tools.cjs');

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9000';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

const PROJECT_ID = 'demo-together';
// Must match the client's databaseURL namespace (src/shared/services/firebase.ts).
const DATABASE_URL = 'http://127.0.0.1:9000?ns=demo-together-default-rtdb';

/** Walkers use existing seed people (auth users + friendships come from the
 * main seed). Distinct radii/phases so their circles never overlap. */
const WALKERS = [
  { uid: 'seed-mia', displayName: 'Mia Sommer', initials: 'MS', radius: 0.004, phase: 0 },
  { uid: 'seed-amelie', displayName: 'Amelie Wagner', initials: 'AW', radius: 0.006, phase: 2.1 },
  { uid: 'seed-david', displayName: 'David Klein', initials: 'DK', radius: 0.0025, phase: 4.2 },
];
const LANDING_COMPANION_UIDS = ['seed-mia', 'seed-amelie', 'seed-david'];
const HOUR = 60 * 60 * 1000;
const NOTIFICATION_RETENTION_MS = 30 * 24 * HOUR;
const BLUE_RETENTION_MS = 3 * 60 * 1000;
const TICK_MS = 20_000;
/** Step per tick (~28 m ≈ walking pace). */
const STEP_RAD = 0.06;

const args = process.argv.slice(2);
const endMode = args.includes('--end');
const onceMode = args.includes('--once');
const statusIndex = args.indexOf('--status');
const status = statusIndex >= 0 ? args[statusIndex + 1] : 'blue';
if (!['blue', 'orange', 'red'].includes(status)) {
  console.error(`Ungültiger --status "${status}" (erlaubt: blue, orange, red).`);
  process.exit(1);
}
function argValue(name, fallback) {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? Number(args[index + 1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}
function stringArg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : undefined;
  return typeof value === 'string' && !value.startsWith('--') ? value : fallback;
}
/** Same centre rule as the other seeds: dev in Berlin, landing in Augsburg. */
const SCENARIO = stringArg('scenario', 'dev');
const DEFAULT_CENTER =
  SCENARIO === 'landing'
    ? { lat: LANDING_CENTRE.lat, lng: LANDING_CENTRE.lng }
    : { lat: 52.5208, lng: 13.4095 };
const CENTER = {
  lat: argValue('lat', DEFAULT_CENTER.lat),
  lng: argValue('lng', DEFAULT_CENTER.lng),
};
/** Who owns the session. Default: the demo companion set above. */
const ownerUid = stringArg('owner', null);
/** Who may watch it. Default: every dev account plus the portrait companions. */
const explicitAudience = stringArg('audience', '')
  .split(',')
  .map((uid) => uid.trim())
  .filter(Boolean);
const safetyNotificationId = (recipientUid, ownerUid) =>
  `seed-safety-${createHash('sha256')
    .update(`${recipientUid}:${ownerUid}`)
    .digest('hex')
    .slice(0, 16)}`;

async function clearSeedWalkers({ db, rtdb, audienceUids }) {
  const removals = {};
  for (const walker of WALKERS) {
    removals[`heimwege/${walker.uid}`] = null;
    audienceUids.forEach((uid) => {
      removals[`heimwegeIndex/${uid}/${walker.uid}`] = null;
    });
  }
  const notificationDeletes = [];
  for (const walker of WALKERS) {
    audienceUids.forEach((uid) => {
      notificationDeletes.push(
        db.doc(`notifications/${safetyNotificationId(uid, walker.uid)}`).delete(),
      );
    });
  }
  await Promise.all([rtdb.ref().update(removals), ...notificationDeletes]);
}

async function main() {
  const app = admin.initializeApp({ projectId: PROJECT_ID, databaseURL: DATABASE_URL });
  const auth = app.auth();
  const db = app.firestore();
  const rtdb = app.database();

  const { users } = await auth.listUsers(1000);
  const devUids = users.map((user) => user.uid).filter((uid) => !uid.startsWith('seed-'));
  // Ohne --owner/--audience wird das Publikum aus den Dev-Konten abgeleitet,
  // dann muss es welche geben. Die Aufnahme-Welt nennt beides ausdruecklich
  // und hat nach ihrem harten Reset absichtlich kein einziges Dev-Konto mehr.
  if (!devUids.length && !ownerUid && !explicitAudience.length) {
    console.error('Kein Dev-Account im Auth-Emulator — erst `npm run emulators:seed` ausführen.');
    process.exit(1);
  }

  if (endMode) {
    // Removes ALL possible walkers regardless of how many were started.
    await clearSeedWalkers({
      db,
      rtdb,
      audienceUids: [...new Set([...devUids, ...LANDING_COMPANION_UIDS])],
    });
    console.log(`Alle Demo-Heimwege entfernt (${WALKERS.length} Läufer).`);
    await app.delete();
    return;
  }

  // A fresh test mode must not retain walkers from a previous --count run.
  const sharedAudienceUids = explicitAudience.length
    ? explicitAudience
    : [...new Set([...devUids, ...LANDING_COMPANION_UIDS])];
  await clearSeedWalkers({
    db,
    rtdb,
    audienceUids: [...new Set([...sharedAudienceUids, ...devUids, ...LANDING_COMPANION_UIDS])],
  });

  // `--owner` turns the seed around: instead of friends whose Heimweg you
  // accompany, it is YOUR session, seen from the console. The identity comes
  // from the profile the main seed already wrote, so the name and the portrait
  // in the console are the ones the rest of the app shows.
  let roster = WALKERS;
  if (ownerUid) {
    const profile = (await db.doc(`publicProfiles/${ownerUid}`).get()).data();
    if (!profile) {
      console.error(`Kein Profil für --owner ${ownerUid}. Erst den Haupt-Seed ausführen.`);
      process.exit(1);
    }
    roster = [
      {
        uid: ownerUid,
        displayName: profile.displayName,
        initials: profile.initials,
        radius: 0.004,
        phase: 0,
      },
    ];
    // Nothing else may share with the owner, or the map behind the console
    // shows a stranger's Heimweg marker next to their own.
    await rtdb
      .ref(`heimwegeIndex/${ownerUid}`)
      .remove()
      .catch(() => {});
  }

  const count = ownerUid
    ? 1
    : Math.min(Math.max(Math.round(argValue('count', 1)), 1), roster.length);
  const walkers = roster.slice(0, count).map((walker, index) => ({
    ...walker,
    angle: walker.phase,
    // Mixed severity on purpose: --status colors only the FIRST walker.
    status: index === 0 ? status : 'blue',
  }));

  const now = Date.now();
  const expiresAt = now + 2 * HOUR;
  const locationOf = (walker, ms) => ({
    lat: Number((CENTER.lat + walker.radius * Math.cos(walker.angle)).toFixed(5)),
    lng: Number((CENTER.lng + walker.radius * Math.sin(walker.angle)).toFixed(5)),
    at: ms,
  });

  const writes = {};
  for (const walker of walkers) {
    const audienceUids = sharedAudienceUids.filter((uid) => uid !== walker.uid);
    const confirmedAt = now - 2 * 60 * 1000;
    const companions = Object.fromEntries(
      (ownerUid ? sharedAudienceUids : LANDING_COMPANION_UIDS)
        .filter((uid) => uid !== walker.uid)
        .map((uid) => [uid, { confirmedAt }]),
    );
    writes[`heimwege/${walker.uid}`] = {
      displayName: walker.displayName,
      initials: walker.initials,
      status: walker.status,
      startedAt: now,
      updatedAt: now,
      expiresAt,
      retainUntil: expiresAt + (walker.status === 'blue' ? BLUE_RETENTION_MS : 30 * 60 * 1000),
      location: locationOf(walker, now),
      audienceUids: Object.fromEntries(audienceUids.map((uid) => [uid, true])),
      companions,
    };
    audienceUids.forEach((uid) => {
      writes[`heimwegeIndex/${uid}/${walker.uid}`] = true;
    });
  }
  await rtdb.ref().update(writes);
  const notificationWrites = [];
  for (const walker of roster) {
    const audienceUids = sharedAudienceUids.filter((uid) => uid !== walker.uid);
    for (const recipientUid of audienceUids) {
      const ref = db.doc(`notifications/${safetyNotificationId(recipientUid, walker.uid)}`);
      if (!walkers.some((activeWalker) => activeWalker.uid === walker.uid)) {
        notificationWrites.push(ref.delete());
        continue;
      }
      notificationWrites.push(
        ref.set({
          recipientUid,
          kind: 'safety_request',
          title: `${walker.displayName} teilt den Heimweg`,
          body: 'Bestätige kurz, dass du erreichbar bist.',
          safetyOwnerUid: walker.uid,
          createdAt: admin.firestore.Timestamp.fromMillis(now - 2 * 60 * 1000),
          expireAt: admin.firestore.Timestamp.fromMillis(now + NOTIFICATION_RETENTION_MS),
        }),
      );
    }
  }
  await Promise.all(notificationWrites);
  console.log(
    `${walkers.map((walker) => `${walker.displayName} (${walker.status})`).join(', ')} ${walkers.length === 1 ? 'teilt ihren' : 'teilen ihren'} Heimweg mit ${sharedAudienceUids.length} ausgewählten Begleiter:innen.`,
  );

  if (onceMode) {
    console.log('Statischer Heimweg als Standard-Testdatum angelegt.');
    await app.delete();
    return;
  }

  console.log('Standort-Updates alle 20 s. Stoppen: Strg+C.');
  console.log('Strg+C lässt die Sessions stehen (ehrlicher Datenabriss-Test) — Aufräumen: --end.');

  setInterval(() => {
    const tick = Date.now();
    const updates = {};
    for (const walker of walkers) {
      walker.angle += STEP_RAD;
      updates[`heimwege/${walker.uid}/location`] = locationOf(walker, tick);
      updates[`heimwege/${walker.uid}/updatedAt`] = tick;
    }
    rtdb
      .ref()
      .update(updates)
      .catch((error) => console.warn('Update fehlgeschlagen:', error.message ?? error));
  }, TICK_MS);
}

main().catch((error) => {
  console.error('Heimweg-Seed fehlgeschlagen:', error.message ?? error);
  process.exit(1);
});
