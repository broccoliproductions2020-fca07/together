/**
 * Seeds a LIVE demo Heimweg (Mia) into the local RTDB emulator so the
 * companion experience — pulsing shield, Heimweg-Fokus map, floating console
 * panel (Fall 2/3) — is testable in firebase mode without a second device.
 *
 * Usage (emulators must be running; run `npm run emulators:seed` once first):
 *   npm run emulators:seed:heimweg              → Mia walks in a circle, blue
 *   node scripts/seed-heimweg.mjs --once        → static Mia session, then exit
 *   node scripts/seed-heimweg.mjs --count 2     → Mia + Ben (max 3: + Nora)
 *   node scripts/seed-heimweg.mjs --status orange|red   (applies to Mia only —
 *     the others stay blue, so mixed severity is testable: pill/sheet must
 *     show the worst one first)
 *   node scripts/seed-heimweg.mjs --end         → removes sessions + index
 *
 * Behaviour:
 *  - Shares with EVERY non-seed auth user (your dev account/s), exactly like
 *    the main seed's friendships.
 *  - Updates location/updatedAt every 20 s while running, so derived signals
 *    stay honestly fresh. Ctrl+C leaves the session standing — updatedAt goes
 *    stale, which IS the honest data-gap demo (orange after 4 min); clean up
 *    with --end. The standard active window is 2 h either way.
 *  - Admin SDK bypasses the RTDB rules on purpose (test seed, like the rest
 *    of scripts/seed-emulators.mjs). Production writes stay callable-owned.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const admin = require(path.join(root, 'functions', 'node_modules', 'firebase-admin'));

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9000';

const PROJECT_ID = 'demo-together';
// Must match the client's databaseURL namespace (src/shared/services/firebase.ts).
const DATABASE_URL = 'http://127.0.0.1:9000?ns=demo-together-default-rtdb';

/** Walkers use existing seed people (auth users + friendships come from the
 * main seed). Distinct radii/phases so their circles never overlap. */
const WALKERS = [
  { uid: 'seed-mia', displayName: 'Mia Sommer', initials: 'MS', radius: 0.004, phase: 0 },
  { uid: 'seed-ben', displayName: 'Ben Otto', initials: 'BO', radius: 0.006, phase: 2.1 },
  { uid: 'seed-nora', displayName: 'Nora Weiß', initials: 'NW', radius: 0.0025, phase: 4.2 },
];
const HOUR = 60 * 60 * 1000;
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
const CENTER = { lat: argValue('lat', 52.5208), lng: argValue('lng', 13.4095) };

async function main() {
  const app = admin.initializeApp({ projectId: PROJECT_ID, databaseURL: DATABASE_URL });
  const auth = app.auth();
  const rtdb = app.database();

  const { users } = await auth.listUsers(1000);
  const devUids = users.map((user) => user.uid).filter((uid) => !uid.startsWith('seed-'));
  if (!devUids.length) {
    console.error('Kein Dev-Account im Auth-Emulator — erst `npm run emulators:seed` ausführen.');
    process.exit(1);
  }

  if (endMode) {
    // Removes ALL possible walkers regardless of how many were started.
    const removals = {};
    for (const walker of WALKERS) {
      removals[`heimwege/${walker.uid}`] = null;
      devUids.forEach((uid) => {
        removals[`heimwegeIndex/${uid}/${walker.uid}`] = null;
      });
    }
    await rtdb.ref().update(removals);
    console.log(`Alle Demo-Heimwege entfernt (${WALKERS.length} Läufer).`);
    await app.delete();
    return;
  }

  const count = Math.min(Math.max(Math.round(argValue('count', 1)), 1), WALKERS.length);
  const walkers = WALKERS.slice(0, count).map((walker, index) => ({
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

  const audienceUids = Object.fromEntries(devUids.map((uid) => [uid, true]));
  const writes = {};
  for (const walker of walkers) {
    writes[`heimwege/${walker.uid}`] = {
      displayName: walker.displayName,
      initials: walker.initials,
      status: walker.status,
      startedAt: now,
      updatedAt: now,
      expiresAt,
      retainUntil: expiresAt + (walker.status === 'blue' ? BLUE_RETENTION_MS : 30 * 60 * 1000),
      location: locationOf(walker, now),
      audienceUids,
      companions: {},
    };
    devUids.forEach((uid) => {
      writes[`heimwegeIndex/${uid}/${walker.uid}`] = true;
    });
  }
  await rtdb.ref().update(writes);
  console.log(
    `${walkers.map((walker) => `${walker.displayName} (${walker.status})`).join(', ')} ${walkers.length === 1 ? 'teilt ihren' : 'teilen ihren'} Heimweg mit ${devUids.length} Dev-Account(s) [${devUids.join(', ')}].`,
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
