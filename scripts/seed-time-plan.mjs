import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('./firebase-admin-tools.cjs');

/**
 * Two Terminfindungen for the running emulator, one per role.
 *
 * Run AFTER `npm run emulators:seed` — it reuses that roster and befriends
 * nobody itself. Shapes mirror what `createTimePlan` / `joinTimePlan` write; if
 * one of those changes, change this too (same rule as the main seed).
 *
 *   node scripts/seed-time-plan.mjs
 */

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

const PROJECT_ID = 'demo-together';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const RETENTION_MS = 14 * DAY;
const STEP = 5 * 60 * 1000;

/** Near the seed roster's centre, so the locked Activity lands a pin you can
 * actually see. Without a place the resulting Activity has no coordinate and
 * therefore no marker at all — which made the payoff of locking invisible. */
const PLACE = {
  label: 'Volkspark am Weinberg',
  latitude: 52.5232,
  longitude: 13.4062,
  visibility: 'pin',
};

const now = Date.now();
const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const iso = (ms) => new Date(ms).toISOString();

/** Local wall-clock time on a future day, snapped to the 5-minute grid the
 * server insists on. */
function dayAt(daysAhead, hour, minute = 0) {
  const base = new Date(now + daysAhead * DAY);
  base.setHours(hour, minute, 0, 0);
  return Math.round(base.getTime() / STEP) * STEP;
}

function windowsFor(prefix, spec) {
  return spec.map(([daysAhead, fromHour, toHour], index) => ({
    id: `${prefix}_w${index + 1}`,
    groupId: `${prefix}_g1`,
    startsAt: iso(dayAt(daysAhead, fromHour)),
    endsAt: iso(dayAt(daysAhead, toHour)),
  }));
}

function memberDoc(profile, role, responsesByWindow, expireAt) {
  return {
    uid: profile.uid,
    displayName: profile.displayName,
    initials: profile.initials,
    role,
    responseStatus: 'responded',
    responsesByWindow,
    basedOnRevision: 1,
    updatedAt: ts(now),
    expireAt: ts(expireAt),
  };
}

/** A slice of a window, in the window's own clock. */
function part(window, fromMinutes, toMinutes) {
  const start = Date.parse(window.startsAt);
  return [
    {
      startsAt: iso(start + fromMinutes * 60 * 1000),
      endsAt: iso(start + toMinutes * 60 * 1000),
    },
  ];
}

function whole(window) {
  return [{ startsAt: window.startsAt, endsAt: window.endsAt }];
}

async function profileOf(db, uid, fallbackName) {
  const snapshot = await db.doc(`publicProfiles/${uid}`).get();
  const data = snapshot.data() ?? {};
  const displayName = data.displayName ?? fallbackName;
  return {
    uid,
    displayName,
    initials: data.initials ?? displayName.slice(0, 2).toUpperCase(),
  };
}

async function main() {
  const app = admin.initializeApp({ projectId: PROJECT_ID }, `seed-time-plan-${Date.now()}`);
  const auth = app.auth();
  const db = app.firestore();

  const { users } = await auth.listUsers(1000);
  const devUser = users.find((user) => !user.uid.startsWith('seed-'));
  if (!devUser) {
    console.error('Kein Dev-Account gefunden. Erst `npm run emulators:seed` laufen lassen.');
    process.exit(1);
  }

  const me = await profileOf(db, devUser.uid, devUser.displayName ?? 'Du');
  const max = await profileOf(db, 'seed-max', 'Max Krüger');
  const lisa = await profileOf(db, 'seed-lisa', 'Lisa Becker');
  const jonas = await profileOf(db, 'seed-jonas', 'Jonas Pohl');

  const batch = db.batch();

  // ── 1. Someone else is asking. You are INVITED and have not answered, so the
  // sheet must open on the answer cards — and must be readable without being a
  // member, which is the whole reason for the invitee tier in firestore.rules.
  const invitedWindows = windowsFor('tpinv', [
    [1, 18, 23],
    [2, 19, 23],
    [3, 14, 20],
  ]);
  const invitedExpire = Math.max(...invitedWindows.map((w) => Date.parse(w.endsAt))) + RETENTION_MS;
  const invitedId = 'timePlan_seed_invited';
  batch.set(db.doc(`timePlans/${invitedId}`), {
    hostId: max.uid,
    hostName: max.displayName,
    hostInitials: max.initials,
    title: 'Grillen im Park',
    category: 'essen',
    place: PLACE,
    sourceWindows: invitedWindows,
    revision: 1,
    status: 'collecting',
    // Same denormalisation createTimePlan writes: without it the client cannot
    // ask which rounds it is in, so the marker never appears.
    audienceUids: [max.uid, lisa.uid, jonas.uid, me.uid],
    memberUids: [max.uid, lisa.uid, jonas.uid],
    createdAt: ts(now - 2 * HOUR),
    updatedAt: ts(now - HOUR),
    expireAt: ts(invitedExpire),
  });
  batch.set(
    db.doc(`timePlans/${invitedId}/timePlanMembers/${max.uid}`),
    memberDoc(
      max,
      'host',
      Object.fromEntries(invitedWindows.map((w) => [w.id, whole(w)])),
      invitedExpire,
    ),
  );
  // Lisa can do all of day one, only the late half of day two, not day three.
  batch.set(
    db.doc(`timePlans/${invitedId}/timePlanMembers/${lisa.uid}`),
    memberDoc(
      lisa,
      'member',
      {
        [invitedWindows[0].id]: whole(invitedWindows[0]),
        [invitedWindows[1].id]: part(invitedWindows[1], 120, 240),
        [invitedWindows[2].id]: [],
      },
      invitedExpire,
    ),
  );
  // Jonas arrives late on day one and can do day three completely.
  batch.set(
    db.doc(`timePlans/${invitedId}/timePlanMembers/${jonas.uid}`),
    memberDoc(
      jonas,
      'member',
      {
        [invitedWindows[0].id]: part(invitedWindows[0], 60, 300),
        [invitedWindows[1].id]: [],
        [invitedWindows[2].id]: whole(invitedWindows[2]),
      },
      invitedExpire,
    ),
  );
  batch.set(db.doc(`timePlanInvites/${invitedId}_${me.uid}`), {
    planId: invitedId,
    inviteeUid: me.uid,
    status: 'pending',
    createdAt: ts(now - 2 * HOUR),
    expireAt: ts(invitedExpire),
  });
  batch.set(db.doc(`notifications/time_plan_${invitedId}_${me.uid}`), {
    recipientUid: me.uid,
    kind: 'time_plan_invite',
    title: `${max.displayName} sucht eine gemeinsame Zeit`,
    body: 'Grillen im Park',
    timePlanId: invitedId,
    createdAt: ts(now - 2 * HOUR),
    expireAt: ts(invitedExpire),
  });

  // ── 2. You are the HOST and everyone has answered, so the sheet opens on the
  // overview with a real spread to fan out and a slot worth locking.
  const hostedWindows = windowsFor('tphost', [
    [1, 17, 22],
    [4, 11, 16],
  ]);
  const hostedExpire = Math.max(...hostedWindows.map((w) => Date.parse(w.endsAt))) + RETENTION_MS;
  const hostedId = 'timePlan_seed_hosted';
  batch.set(db.doc(`timePlans/${hostedId}`), {
    hostId: me.uid,
    hostName: me.displayName,
    hostInitials: me.initials,
    title: 'Brunch oder Kino',
    place: { ...PLACE, label: 'Rosenthaler Platz', latitude: 52.5185, longitude: 13.4128 },
    sourceWindows: hostedWindows,
    revision: 1,
    status: 'collecting',
    audienceUids: [me.uid, max.uid, lisa.uid, jonas.uid],
    memberUids: [me.uid, max.uid, lisa.uid, jonas.uid],
    createdAt: ts(now - 5 * HOUR),
    updatedAt: ts(now - 20 * 60 * 1000),
    expireAt: ts(hostedExpire),
  });
  batch.set(
    db.doc(`timePlans/${hostedId}/timePlanMembers/${me.uid}`),
    memberDoc(
      me,
      'host',
      Object.fromEntries(hostedWindows.map((w) => [w.id, whole(w)])),
      hostedExpire,
    ),
  );
  batch.set(
    db.doc(`timePlans/${hostedId}/timePlanMembers/${max.uid}`),
    memberDoc(
      max,
      'member',
      {
        [hostedWindows[0].id]: part(hostedWindows[0], 60, 300),
        [hostedWindows[1].id]: whole(hostedWindows[1]),
      },
      hostedExpire,
    ),
  );
  batch.set(
    db.doc(`timePlans/${hostedId}/timePlanMembers/${lisa.uid}`),
    memberDoc(
      lisa,
      'member',
      {
        [hostedWindows[0].id]: part(hostedWindows[0], 60, 240),
        [hostedWindows[1].id]: whole(hostedWindows[1]),
      },
      hostedExpire,
    ),
  );
  // Jonas cannot make the evening at all — the one row that must read as
  // "kann nicht" rather than as a missing answer.
  batch.set(
    db.doc(`timePlans/${hostedId}/timePlanMembers/${jonas.uid}`),
    memberDoc(
      jonas,
      'member',
      {
        [hostedWindows[0].id]: [],
        [hostedWindows[1].id]: whole(hostedWindows[1]),
      },
      hostedExpire,
    ),
  );

  await batch.commit();
  console.log(`Terminfindungen angelegt für ${me.displayName} (${me.uid}):`);
  console.log(`  • ${invitedId} — du bist EINGELADEN (Antwortkarten, Postfach-Eintrag)`);
  console.log(`  • ${hostedId} — du bist HOST (Übersicht, Auffächern, Festlegen)`);
  await app.delete();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
