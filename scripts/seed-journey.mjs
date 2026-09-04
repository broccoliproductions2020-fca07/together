/**
 * Seeds ONE static Anreise (journey) for the "Brunch am Sonntag" activity in the
 * LOCAL emulator suite, so the marketing screen can be taken from the real app
 * instead of being mocked up.
 *
 * Usage:
 *   node scripts/seed-journey.mjs            (emulators must be running)
 *   node scripts/seed-journey.mjs --activity seed-act-lauf --viewer seed-mia --minutes 40
 *
 * Writes exactly the shapes the product writes:
 *  - RTDB `journeys/{activityId}`: `expiresAt`, `members/{uid}: true`,
 *    `sessions/{uid}: sessionId`, `locations/{sessionId}` with the full point.
 *  - Firestore `activities/{id}/journeyStates/{uid}` and `journeyUnderwayCount`
 *    exactly as `setJourneyLiveStatus` produces them.
 *
 * PRODUCT LIMIT, deliberately not worked around: a location point may only ever
 * carry `status: 'onTheWay'` (see `database.rules.json`). Arrival is kept on the
 * arriving person's own device and is never published to the other
 * participants, so a seed cannot show somebody else as "angekommen" without
 * faking a state the app never produces.
 *
 * Idempotent: fixed session ids derived from the uid, so re-running refreshes
 * the timestamps and never stacks up members.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('./firebase-admin-tools.cjs');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9000';

const PROJECT_ID = 'demo-together';
// Must match the client's databaseURL namespace (src/shared/services/firebase.ts).
const DATABASE_URL = `http://127.0.0.1:9000?ns=${PROJECT_ID}-default-rtdb`;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? Number(args[index + 1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
};
const stringArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : undefined;
  return typeof value === 'string' && !value.startsWith('--') ? value : fallback;
};
const ACTIVITY_ID = stringArg('activity', 'seed-act-lauf');

/** How far ahead the activity starts. Anreise only makes sense inside T-6h. */
const MINUTES_TO_START = argValue('minutes', 40);

const now = Date.now();
const MINUTE = 60 * 1000;
const sessionIdFor = (uid) => `seed${createHash('sha256').update(uid).digest('hex').slice(0, 20)}`;

/**
 * Metres → degrees. East depends on the latitude, so it is derived from the
 * destination instead of a hard-coded city: the same offset is 74 m in
 * Augsburg and 68 m in Berlin, and a traveller placed with the wrong constant
 * lands ~9 % off the distance the focus view prints next to their face.
 */
const metresNorth = (m) => m / 111_320;
const metresEastAt = (lat) => (m) => m / (111_320 * Math.cos((lat * Math.PI) / 180));

/**
 * Where the travellers stand: honest walking distances from the destination,
 * bearings from different directions so the focus view has a readable spread
 * instead of a cluster. Assigned BY POSITION, not by uid - who travels is
 * derived from the activity's real participants below.
 */
const POSITIONS = [
  { metres: 620, bearing: 205 },
  { metres: 1050, bearing: 320 },
  { metres: 340, bearing: 75 },
];

/**
 * Who is on their way. Derived from the activity's own participant list rather
 * than hard-coded, because a hard-coded name silently drops out of the scene
 * the moment the roster changes: the previous version listed two people, one
 * of whom was not a participant, so the capture showed one avatar and printed
 * a warning nobody read. `--viewer <uid>` keeps the account the screenshot is
 * taken from OUT of the list - watching two friends arrive is the picture,
 * being one of them is not.
 */
function travellersFor(participantUids) {
  const explicit = stringArg('travellers', '');
  const candidates = explicit
    ? explicit
        .split(',')
        .map((uid) => uid.trim())
        .filter(Boolean)
    : participantUids.filter((uid) => uid !== stringArg('viewer', ''));
  return candidates
    .filter((uid) => participantUids.includes(uid))
    .slice(0, POSITIONS.length)
    .map((uid, index) => ({ uid, ...POSITIONS[index] }));
}

const haversineKm = (a, b) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

async function main() {
  const app = admin.initializeApp({ projectId: PROJECT_ID, databaseURL: DATABASE_URL });
  const db = app.firestore();
  const rtdb = app.database();

  const activityRef = db.doc(`activities/${ACTIVITY_ID}`);
  const snapshot = await activityRef.get();
  if (!snapshot.exists) {
    console.error(
      `Activity ${ACTIVITY_ID} fehlt. Erst "node scripts/seed-emulators.mjs" ausführen.`,
    );
    process.exitCode = 1;
    return;
  }
  const activity = snapshot.data();
  const target = { lat: activity.place?.latitude, lng: activity.place?.longitude };
  if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng)) {
    console.error(`Activity ${ACTIVITY_ID} hat keine Zielkoordinate.`);
    process.exitCode = 1;
    return;
  }

  // Anreise is only offered inside T-6h, so the activity is moved into that
  // window. The title and place stay untouched.
  const startsAt = now + MINUTES_TO_START * MINUTE;
  const endsAt = startsAt + 2 * 60 * MINUTE;
  await activityRef.set(
    {
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      visibleUntil: admin.firestore.Timestamp.fromMillis(endsAt),
    },
    { merge: true },
  );

  const participantUids = Array.isArray(activity.participantUids) ? activity.participantUids : [];
  const travellers = travellersFor(participantUids);
  if (travellers.length === 0) {
    console.error(
      `Keine Anreisenden fuer ${ACTIVITY_ID}: ${participantUids.length} Teilnehmende, ` +
        `--viewer=${stringArg('viewer', '(keiner)')}.`,
    );
    process.exitCode = 1;
    return;
  }
  await activityRef.set({ journeyUnderwayCount: travellers.length }, { merge: true });

  // A journeyState from an earlier run whose person is not travelling now would
  // keep the sheet claiming somebody is underway. The RTDB node is replaced
  // wholesale below; this subcollection is not.
  const staleStates = await activityRef.collection('journeyStates').listDocuments();
  await Promise.all(
    staleStates
      .filter((ref) => !travellers.some((traveller) => traveller.uid === ref.id))
      .map((ref) => ref.delete().catch(() => {})),
  );
  const journeyExpiresAt = endsAt + 30 * MINUTE;

  // Members are every participant: they are the audience allowed to read the
  // live points. Only the travellers get a session and a location.
  const members = Object.fromEntries(participantUids.map((uid) => [uid, true]));
  const sessions = {};
  const locations = {};
  const distances = [];
  const metresEast = metresEastAt(target.lat);

  for (const traveller of travellers) {
    const rad = (traveller.bearing * Math.PI) / 180;
    const position = {
      lat: Number((target.lat + metresNorth(traveller.metres * Math.cos(rad))).toFixed(6)),
      lng: Number((target.lng + metresEast(traveller.metres * Math.sin(rad))).toFixed(6)),
    };
    const sessionId = sessionIdFor(traveller.uid);
    sessions[traveller.uid] = sessionId;
    locations[sessionId] = {
      uid: traveller.uid,
      sessionId,
      lat: position.lat,
      lng: position.lng,
      // The only value the RTDB rules accept. Arrival never leaves the device.
      status: 'onTheWay',
      updatedAt: now - 20 * 1000,
      expiresAt: now + 150 * 1000,
    };
    distances.push(`${traveller.uid}: ${(haversineKm(position, target) * 1000).toFixed(0)} m`);

    await db.doc(`activities/${ACTIVITY_ID}/journeyStates/${traveller.uid}`).set({
      status: 'underway',
      sessionId,
      startedAt: admin.firestore.Timestamp.fromMillis(now - 8 * MINUTE),
      locationUpdatedAt: now - 20 * 1000,
      expireAt: admin.firestore.Timestamp.fromMillis(journeyExpiresAt),
    });
  }

  await rtdb.ref(`journeys/${ACTIVITY_ID}`).set({
    expiresAt: journeyExpiresAt,
    members,
    sessions,
    locations,
  });

  console.log(
    `Anreise-Seed fertig für "${activity.title}" (@ ${activity.place?.label}).\n` +
      `  Start in ${MINUTES_TO_START} Min · ${travellers.length} unterwegs · ${distances.join(', ')}\n` +
      `  Hinweis: "angekommen" ist bewusst nicht seedbar — die App veröffentlicht Ankunft nie an andere.`,
  );

  await app.delete();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
