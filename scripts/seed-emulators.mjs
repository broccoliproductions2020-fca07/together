/**
 * Seeds the LOCAL Firebase Emulator Suite with fake people, friendships,
 * presence, activities and chats. These records exist only in the local
 * Emulator Suite and are never mixed into client state.
 *
 * Usage:
 *   npm run emulators:seed            (emulators must be running)
 *   npm run emulators:seed:landing    (the marketing world for screenshots)
 *   node scripts/seed-emulators.mjs [--scenario dev|landing] [--me open|idle]
 *                                   [--lat 52.5208] [--lng 13.4095]
 *                                   [--brunch-in-minutes 40] [--no-purge]
 *
 * The content of both worlds lives in scripts/lib/seed-scenarios.mjs; this file
 * is the only thing that writes them, so a document shape cannot drift.
 *
 * Behaviour:
 *  - Idempotent: fixed `seed-*` ids; re-running refreshes times/expiries.
 *  - Every EXISTING real auth user (your dev account/s) is befriended by all
 *    seed people and included in every presence/activity audience. If no dev
 *    account exists yet, a demo login is created (see DEMO_ACCOUNT below).
 *  - Writes exactly the doc shapes the cloud functions produce (activities/
 *    chats like `createActivity`, presence like `publishPresence`,
 *    friendships like `respondToFriendRequest`). Update BOTH places when a
 *    shape changes.
 *  - Coordinates default to Berlin Mitte for `dev` and to Flannigan's Post in
 *    Augsburg for `landing`. Pass --lat/--lng to seed around the
 *    Android emulator's simulated GPS position.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { applyDemoAvatars, DEMO_BUCKET, withAvatar } from './lib/demo-avatars.mjs';
import { purgeStaleSeeds, resetWorld } from './lib/seed-purge.mjs';
import { buildScenario, LANDING_CENTRE } from './lib/seed-scenarios.mjs';

const require = createRequire(import.meta.url);
const admin = require('./firebase-admin-tools.cjs');
const { buildFriendSearchFields } = require('../functions/friend-search');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9198';
process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9000';

/**
 * uid -> local Storage-emulator portrait URL, filled once in `main()`. Empty
 * when the demo portraits have not been supplied; every identity snapshot then
 * simply omits `avatarUrl` and the app falls back to its initials circle.
 */
let avatarUrls = new Map();

const PROJECT_ID = 'demo-together';
// Must match the client's databaseURL namespace (src/shared/services/firebase.ts).
const DATABASE_URL = `http://127.0.0.1:9000?ns=${PROJECT_ID}-default-rtdb`;
const DEMO_ACCOUNT = { email: 'demo@together.dev', password: 'together123', displayName: 'Demo' };

const args = process.argv.slice(2);
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
const SCENARIO_NAME = stringArg('scenario', 'dev');
/**
 * `dev` sits in Berlin Mitte, `landing` on Flannigan's Post in Augsburg — the
 * pub the whole capture scene is arranged around.
 */
const DEFAULT_CENTER =
  SCENARIO_NAME === 'landing'
    ? { lat: LANDING_CENTRE.lat, lng: LANDING_CENTRE.lng }
    : { lat: 52.5208, lng: 13.4095 };
const CENTER = {
  lat: argValue('lat', DEFAULT_CENTER.lat),
  lng: argValue('lng', DEFAULT_CENTER.lng),
};
/** Offsets in ~100m steps around CENTER (0.001 lat ≈ 111 m). */
const at = (dLat, dLng) => ({
  lat: Number((CENTER.lat + dLat).toFixed(3)),
  lng: Number((CENTER.lng + dLng).toFixed(3)),
});
/**
 * The same thing in METRES, north/east positive.
 *
 * Degrees are the wrong unit for the only geometric question a seed has to
 * answer — „do two markers overlap?“ — because a degree of longitude is
 * two thirds of a degree of latitude here, so equal offsets are unequal
 * distances. Six decimals keep a 10 cm grid; three would quantize to 111 m
 * in latitude and 74 m in longitude, which is coarser than the spacing the
 * markers need.
 */
const atMeters = (north, east) => ({
  lat: Number((CENTER.lat + north / 111_320).toFixed(6)),
  lng: Number((CENTER.lng + east / (111_320 * Math.cos((CENTER.lat * Math.PI) / 180))).toFixed(6)),
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/**
 * Lokale Mitternacht in `days` Tagen, dann `hour:minute`.
 *
 * Absolute Tageszeiten statt `now + X Stunden`: Eine Aufnahme-Welt soll wie ein
 * echter Kalender aussehen, und „Kino um 20:00" tut das, „Kino in 3 h 20" nicht.
 * Ueber `setDate` gerechnet, damit Monatswechsel und Sommerzeit stimmen.
 */
const dayAt = (days, hour, minute = 0) => {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
};
const NOTIFICATION_RETENTION_MS = 30 * DAY;
const MAILBOX_ACCOUNT_LIMIT = 25;
const now = Date.now();
const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const iso = (ms) => new Date(ms).toISOString();
const stableSuffix = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);

/**
 * Upcoming Sunday at `hour` local time — today if it is Sunday and the hour has
 * not passed. The brunch activity is the marketing centrepiece, so its time has
 * to agree with its name instead of drifting with the seed run.
 *
 * `--brunch-in-minutes N` overrides it for capture sessions that need the
 * activity inside the Anreise window (T-6h).
 */
function nextSundayAt(hour) {
  const date = new Date(now);
  date.setHours(hour, 0, 0, 0);
  const daysAhead = (7 - date.getDay()) % 7;
  if (daysAhead === 0 && date.getTime() <= now) date.setDate(date.getDate() + 7);
  else date.setDate(date.getDate() + daysAhead);
  return date.getTime();
}

const brunchOverrideMinutes = argValue('brunch-in-minutes', NaN);
const BRUNCH_START = Number.isFinite(brunchOverrideMinutes)
  ? now + brunchOverrideMinutes * 60 * 1000
  : nextSundayAt(11);
const BRUNCH_END = BRUNCH_START + 2 * HOUR;

/**
 * The world to write. `dev` is the everyday development seed; `landing` is the
 * deliberately quiet world the landing-page screenshots are taken from. Both
 * live in scripts/lib/seed-scenarios.mjs - one writer, two datasets, so a
 * document shape can never drift between them.
 *
 * Activity positions are constrained in BOTH, but for different reasons. On
 * the first location fix the camera lands on PLACE_FOCUS_LATITUDE_DELTA
 * (0.006) / _LONGITUDE_DELTA (0.005), which on a 1080x2400 phone shows about
 * 370 m across and 820 m down. `dev` keeps its coarse +/-0.001 grid; the
 * capture world places every marker in its own 90 m latitude band via
 * `atMeters`, because anything closer makes `markerCollision` merge two
 * markers into one stack pin. The derivation lives next to SCENE in
 * scripts/lib/seed-scenarios.mjs and is re-measured by `screens:verify`.
 */
const scenario = buildScenario(SCENARIO_NAME, {
  at,
  atMeters,
  dayAt,
  now,
  HOUR,
  DAY,
  brunchStart: BRUNCH_START,
  brunchEnd: BRUNCH_END,
});
const PEOPLE = scenario.people;
const REQUESTER = scenario.requester;
const ACTIVITIES = scenario.activities;

const initialsOf = (name) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

const profileOf = (person) => ({
  uid: person.uid,
  displayName: person.name,
  initials: initialsOf(person.name),
  username: person.username,
  ...withAvatar(avatarUrls, person.uid),
});

const friendSearchOf = (profile) => ({
  ...buildFriendSearchFields(profile, 'anyone'),
  updatedAt: ts(now),
});

async function ensureAuthUser(auth, { uid, email, password, displayName, photoURL }) {
  const profilePatch = { displayName, ...(photoURL ? { photoURL } : {}) };
  try {
    await auth.createUser({ uid, email, password, ...profilePatch, emailVerified: true });
    return 'created';
  } catch (error) {
    if (error?.code !== 'auth/uid-already-exists' && error?.code !== 'auth/email-already-exists') {
      throw error;
    }
    await auth.updateUser(uid, profilePatch).catch(() => {});
    return 'exists';
  }
}

async function main() {
  const app = admin.initializeApp({
    projectId: PROJECT_ID,
    storageBucket: DEMO_BUCKET,
    databaseURL: DATABASE_URL,
  });
  const auth = app.auth();
  const db = app.firestore();

  // ── 0. Remove what a PREVIOUS run left behind.
  //      A seed overwrites its own documents but cannot remove one it no
  //      longer writes, so switching datasets otherwise leaves the other
  //      scenario's activities, invitations and people standing. Only
  //      `seed-*` documents are touched — a real dev account and everything
  //      it owns is out of reach by construction. `--no-purge` skips it.
  if (scenario.reset && !args.includes('--no-purge')) {
    // Die Aufnahme-Welt setzt HART zurueck: Firestore leer, RTDB leer, jedes
    // Auth-Konto ausser dem Roster geloescht. Nur so ergeben zwei Laeufe
    // denselben Stand - und nur dann sind zwei Renderings vergleichbar.
    const reset = await resetWorld(app, {
      keepUids: new Set(PEOPLE.map((person) => person.uid)),
    });
    console.log(
      `Zuruecksetzen: ${reset.documents} Dokumente aus ${reset.collections} Sammlungen, ` +
        `RTDB geleert, ${reset.accounts} fremde Konten geloescht.`,
    );
  } else if (!args.includes('--no-purge')) {
    const purged = await purgeStaleSeeds(app, {
      FieldPath: admin.firestore.FieldPath,
      keepUids: new Set(
        PEOPLE.map((person) => person.uid).concat(REQUESTER ? [REQUESTER.uid] : []),
      ),
      keepActivityIds: new Set(ACTIVITIES.map((activity) => activity.id)),
      rtdb: app.database(),
    });
    if (purged.people + purged.activities + purged.other + purged.live > 0) {
      console.log(
        `Aufgeräumt: ${purged.people} Personen, ${purged.activities} Aktivitäten, ` +
          `${purged.other} weitere Dokumente, ${purged.live} Live-Zustände aus einem früheren Seed.`,
      );
    }
  }

  // ── 1. Who is "me"? Every non-seed auth user becomes friends with the roster.
  const { users: allUsers } = await auth.listUsers(1000);
  let devUsers = allUsers.filter((user) => !user.uid.startsWith('seed-'));
  // A scenario with its own protagonist (landing) already has an account to
  // sign in with, so a second empty demo login would only add a face-less
  // friend to every audience.
  if (devUsers.length === 0 && !scenario.me) {
    await ensureAuthUser(auth, { uid: 'demo-user', ...DEMO_ACCOUNT });
    devUsers = [await auth.getUser('demo-user')];
    console.log(
      `Kein Dev-Account gefunden → Demo-Login angelegt: ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`,
    );
  }
  const devProfiles = [];
  for (const user of devUsers) {
    const profileRef = db.doc(`publicProfiles/${user.uid}`);
    const userRef = db.doc(`users/${user.uid}`);
    const [profileSnapshot, userSnapshot] = await Promise.all([profileRef.get(), userRef.get()]);
    const existing = profileSnapshot.data() ?? {};
    const settings = userSnapshot.data() ?? {};
    const displayName = existing.displayName ?? user.displayName ?? 'Du';
    const profile = {
      uid: user.uid,
      displayName,
      initials: existing.initials ?? initialsOf(displayName),
      ...(typeof existing.username === 'string'
        ? { username: existing.username }
        : typeof settings.username === 'string'
          ? { username: settings.username }
          : {}),
    };
    devProfiles.push(profile);
    // Profile darf beim Seeden nie fehlen — joinActivity verlangt es.
    await profileRef.set(
      { displayName: profile.displayName, initials: profile.initials },
      { merge: true },
    );
    await userRef.set({ displayName: profile.displayName }, { merge: true });
    const searchFields = buildFriendSearchFields(profile, settings.friendRequestPolicy ?? 'anyone');
    if (searchFields) {
      await db.doc(`friendSearch/${user.uid}`).set({ ...searchFields, updatedAt: ts(now) });
    }
  }
  const mailboxProfiles = devProfiles.slice(0, MAILBOX_ACCOUNT_LIMIT);
  if (devProfiles.length > mailboxProfiles.length) {
    console.warn(
      `Postfach-Seeds auf ${MAILBOX_ACCOUNT_LIMIT} Dev-Accounts begrenzt (${devProfiles.length} gefunden).`,
    );
  }

  // ── 2. Seed people: auth users + users/publicProfiles/usernames docs.
  for (const person of PEOPLE) {
    await ensureAuthUser(auth, {
      uid: person.uid,
      email: `${person.username}@seed.together.dev`,
      password: 'seed-only',
      displayName: person.name,
    });
    const profile = profileOf(person);
    await db.doc(`users/${person.uid}`).set(
      {
        displayName: person.name,
        username: person.username,
        initials: profile.initials,
        friendshipsVersion: 0,
        createdAt: ts(now),
      },
      { merge: true },
    );
    await db.doc(`publicProfiles/${person.uid}`).set(
      {
        displayName: person.name,
        initials: profile.initials,
        username: person.username,
      },
      { merge: true },
    );
    await db.doc(`friendSearch/${person.uid}`).set(friendSearchOf(profile), { merge: true });
    await db
      .doc(`usernames/${person.username}`)
      .set({ uid: person.uid, createdAt: ts(now) }, { merge: true });
  }

  let requesterProfile = null;
  if (REQUESTER) {
    await ensureAuthUser(auth, {
      uid: REQUESTER.uid,
      email: `${REQUESTER.username}@seed.together.dev`,
      password: 'seed-only',
      displayName: REQUESTER.name,
    });
    requesterProfile = profileOf(REQUESTER);
    await Promise.all([
      db.doc(`users/${REQUESTER.uid}`).set(
        {
          displayName: REQUESTER.name,
          username: REQUESTER.username,
          initials: requesterProfile.initials,
          profileVisibility: 'friends',
          friendRequestPolicy: 'anyone',
          friendshipsVersion: mailboxProfiles.length,
          createdAt: ts(now),
        },
        { merge: true },
      ),
      db.doc(`publicProfiles/${REQUESTER.uid}`).set(
        {
          displayName: REQUESTER.name,
          initials: requesterProfile.initials,
          username: REQUESTER.username,
        },
        { merge: true },
      ),
      db
        .doc(`friendSearch/${REQUESTER.uid}`)
        .set(friendSearchOf(requesterProfile), { merge: true }),
      db
        .doc(`usernames/${REQUESTER.username}`)
        .set({ uid: REQUESTER.uid, createdAt: ts(now) }, { merge: true }),
    ]);
  }

  // ── 2b. Profile pictures, through the app's own mechanism.
  //      `updateOwnProfile` needs a finished profile (display name + username),
  //      so this runs after section 2 and before every snapshot that copies an
  //      identity (friendships, presence, activity participants, chats).
  const avatars = await applyDemoAvatars(app, {
    projectId: PROJECT_ID,
    displayNames: new Map(PEOPLE.map((person) => [person.uid, person.name])),
    force: args.includes('--force-avatars'),
  });
  avatarUrls = avatars.urls;
  if (avatarUrls.size > 0) {
    const fresh = avatarUrls.size - avatars.reused;
    console.log(
      `Demo-Portraits über updateOwnProfile gesetzt: ${avatarUrls.size}` +
        (avatars.reused > 0 ? ` (${fresh} neu, ${avatars.reused} unverändert)` : ''),
    );
  }

  // ── 2c. The scenario's protagonist, if it has one.
  //      The landing world takes its screenshots from one of the six portrait
  //      people, because there is no seventh portrait: an account without one
  //      would sit in the top bar, in every participant row and in the Heimweg
  //      console as an initials circle, next to nothing but real faces.
  //      From here on it is treated exactly like a real dev account.
  const mePerson = scenario.me ? PEOPLE.find((person) => person.uid === scenario.me) : null;
  if (scenario.me && !mePerson) {
    throw new Error(`Szenario "${scenario.id}": me="${scenario.me}" fehlt im Personen-Roster.`);
  }
  if (mePerson) {
    // The marketing world is exactly the protagonist and their roster. Any
    // other local account would otherwise be befriended too and show up as a
    // face-less extra in "Alle Freunde" — different number on every machine.
    devProfiles.length = 0;
    // `profileOf` already carries `avatarUrl`; spreading it whole is what
    // keeps the protagonist's own portrait inside every friendship snapshot.
    // Copying the fields by hand dropped it, and self-snapshots were the one
    // place in the whole world still showing an initials circle.
    devProfiles.push(profileOf(mePerson));
  }
  const devUids = devProfiles.map((profile) => profile.uid);

  // ── 3. Accepted friendships: every seed person ↔ every dev user.
  //      Doc id + shape mirror functions/index.js (friendshipId → `${a}__${b}` sorted).
  for (const person of PEOPLE) {
    for (const devProfile of devProfiles) {
      if (person.uid === devProfile.uid) continue;
      const id = [person.uid, devProfile.uid].sort().join('__');
      await db.doc(`friendships/${id}`).set({
        participantUids: [person.uid, devProfile.uid].sort(),
        requesterUid: person.uid,
        status: 'accepted',
        profiles: [profileOf(person), devProfile],
        createdAt: ts(now - 30 * 24 * HOUR),
        updatedAt: ts(now),
      });
    }
  }

  // The three supplied portraits used by the Heimweg capture are direct
  // friends too. This lets the owner see the chosen, confirmed companions via
  // exactly the same relationship snapshots as the production picker.
  const safetyCompanionUids = mePerson ? [] : ['seed-mia', 'seed-amelie', 'seed-david'];
  for (let first = 0; first < safetyCompanionUids.length; first += 1) {
    for (let second = first + 1; second < safetyCompanionUids.length; second += 1) {
      const firstPerson = PEOPLE.find((person) => person.uid === safetyCompanionUids[first]);
      const secondPerson = PEOPLE.find((person) => person.uid === safetyCompanionUids[second]);
      if (!firstPerson || !secondPerson) continue;
      const id = [firstPerson.uid, secondPerson.uid].sort().join('__');
      await db.doc(`friendships/${id}`).set({
        participantUids: [firstPerson.uid, secondPerson.uid].sort(),
        requesterUid: firstPerson.uid,
        status: 'accepted',
        profiles: [profileOf(firstPerson), profileOf(secondPerson)],
        createdAt: ts(now - 30 * 24 * HOUR),
        updatedAt: ts(now),
      });
    }
  }
  await Promise.all(
    safetyCompanionUids.map((uid) =>
      db.doc(`users/${uid}`).set(
        {
          friendshipsVersion: safetyCompanionUids.length - 1,
          ...(uid === 'seed-mia' ? { heimwegGroupUids: ['seed-amelie', 'seed-david'] } : {}),
        },
        { merge: true },
      ),
    ),
  );
  // The protagonist keeps the Heimweg quick-select the marketing capture uses,
  // and a friendshipsVersion that matches the friendships actually written.
  if (mePerson) {
    await db.doc(`users/${mePerson.uid}`).set(
      {
        friendshipsVersion: PEOPLE.length - 1,
        heimwegGroupUids: ['seed-amelie', 'seed-david'],
      },
      { merge: true },
    );
  }

  // A separate requester gives each mailbox demo account a genuinely incoming
  // action without changing any accepted seed relationship.
  for (const devProfile of REQUESTER ? mailboxProfiles : []) {
    const id = [REQUESTER.uid, devProfile.uid].sort().join('__');
    await Promise.all([
      db.doc(`friendships/${id}`).set({
        participantUids: [REQUESTER.uid, devProfile.uid].sort(),
        requesterUid: REQUESTER.uid,
        status: 'pending',
        profiles: [
          {
            uid: REQUESTER.uid,
            displayName: REQUESTER.name,
            initials: requesterProfile.initials,
          },
          {
            uid: devProfile.uid,
            displayName: devProfile.displayName,
            initials: devProfile.initials,
          },
        ],
        createdAt: ts(now - 12 * 60 * 1000),
        updatedAt: ts(now - 12 * 60 * 1000),
      }),
      db
        .doc(`users/${devProfile.uid}`)
        .set({ friendshipsVersion: admin.firestore.FieldValue.increment(1) }, { merge: true }),
    ]);
  }

  // ── 4. Presence for the "open" people (shape = publishPresence output).
  for (const person of PEOPLE) {
    const ref = db.doc(`presence/${person.uid}`);
    if (!person.open) {
      await ref.delete().catch(() => {});
      continue;
    }
    await ref.set({
      uid: person.uid,
      displayName: person.name,
      initials: initialsOf(person.name),
      ...withAvatar(avatarUrls, person.uid),
      ...(person.vibe ? { vibe: { label: person.vibe } } : {}),
      expireAt: ts(now + 3 * HOUR),
      shareLocation: Boolean(person.location),
      ...(person.location ? { coarseLocation: person.location } : {}),
      audienceUids: devUids.filter((uid) => uid !== person.uid).slice(0, 50),
      updatedAt: ts(now),
    });
  }

  // ── 4b. The protagonist's own open status, if the scenario asks for one.
  //      `--me idle` turns it off, which is what the map hero wants: the pill
  //      then reads the friend count instead of "Offen bis HH:MM".
  if (mePerson && scenario.myPresence && stringArg('me', 'open') !== 'idle') {
    const own = scenario.myPresence;
    const identity = profileOf(mePerson);
    await db.doc(`presence/${mePerson.uid}`).set({
      uid: mePerson.uid,
      displayName: identity.displayName,
      initials: identity.initials,
      ...withAvatar(avatarUrls, mePerson.uid),
      ...(own.vibe ? { vibe: { label: own.vibe } } : {}),
      expireAt: ts(own.expiresAt),
      shareLocation: Boolean(own.shareLocation && own.location),
      ...(own.shareLocation && own.location ? { coarseLocation: own.location } : {}),
      audienceUids: PEOPLE.filter((person) => person.uid !== mePerson.uid).map(
        (person) => person.uid,
      ),
      updatedAt: ts(now),
    });
  } else if (mePerson) {
    await db
      .doc(`presence/${mePerson.uid}`)
      .delete()
      .catch(() => {});
  }

  // A scenario with a protagonist owns the whole open list. Anything else that
  // is still "open" locally — a leftover fixture, a dev account somebody
  // published presence from — would appear in it as a face-less extra row.
  // Presence is ephemeral by design, so clearing it costs nothing.
  if (mePerson) {
    const rosterUids = new Set(PEOPLE.map((person) => person.uid));
    const strayPresence = await db.collection('presence').get();
    await Promise.all(
      strayPresence.docs
        .filter((doc) => !rosterUids.has(doc.id))
        .map((doc) => doc.ref.delete().catch(() => {})),
    );
  }

  // ── 5. Activities + their chats (shape = createActivity/joinActivity output).
  for (const activity of ACTIVITIES) {
    const host = PEOPLE.find((person) => person.uid === activity.host);
    const others = activity.also.map((uid) => PEOPLE.find((person) => person.uid === uid));
    const participants = [host, ...others].map((person) => {
      const { uid, displayName, initials, avatarUrl } = profileOf(person);
      return { uid, displayName, initials, ...(avatarUrl ? { avatarUrl } : {}) };
    });
    if (activity.includeDevAccount) {
      for (const devProfile of devProfiles) {
        if (participants.some((participant) => participant.uid === devProfile.uid)) continue;
        participants.push({
          uid: devProfile.uid,
          displayName: devProfile.displayName,
          initials: devProfile.initials,
        });
      }
    }
    const participantUids = participants.map((participant) => participant.uid);
    const audienceUids = [...new Set([activity.host, ...devUids, ...PEOPLE.map((p) => p.uid)])];

    await db.doc(`activities/${activity.id}`).set({
      hostId: activity.host,
      mode: activity.mode,
      title: activity.title,
      audienceUids,
      startsAt: iso(activity.startsAt),
      endsAt: iso(activity.endsAt),
      place: {
        label: activity.place.label,
        visibility: activity.place.visibility,
        latitude: activity.place.lat,
        longitude: activity.place.lng,
      },
      ...(activity.maxParticipants ? { maxParticipants: activity.maxParticipants } : {}),
      ...(activity.category ? { category: activity.category } : {}),
      participants,
      participantUids,
      status: 'active',
      createdAt: ts(now),
      visibleUntil: ts(activity.endsAt),
      expireAt: ts(activity.endsAt + 24 * HOUR),
    });

    const roomRef = db.doc(`chats/${activity.id}`);
    const chatExpireAt = activity.endsAt + 24 * HOUR;
    const messages = activity.messages ?? [];
    await roomRef.set({
      type: 'activity',
      title: activity.title,
      memberIds: participantUids,
      messageCount: messages.length,
      readCount: {},
      ...(messages.length
        ? {
            lastMessage: {
              text: messages[messages.length - 1].text,
              authorName: profileOf(
                PEOPLE.find((p) => p.uid === messages[messages.length - 1].author),
              ).displayName,
              at: ts(now),
            },
          }
        : {}),
      createdAt: ts(now),
      expireAt: ts(chatExpireAt),
    });
    for (const [index, message] of messages.entries()) {
      const author = profileOf(PEOPLE.find((person) => person.uid === message.author));
      await roomRef
        .collection('messages')
        .doc(`seed-msg-${index}`)
        .set({
          authorId: author.uid,
          authorName: author.displayName,
          initials: author.initials,
          text: message.text,
          kind: 'text',
          createdAt: ts(now - (messages.length - index) * 60 * 1000),
          expireAt: ts(chatExpireAt),
        });
    }
  }

  // A small private demo activity per dev account keeps every notification
  // target truthful: the recipient hosts it, Max is a real participant, and
  // the journey reminder points to a currently relevant destination.
  for (const [index, devProfile] of scenario.inboxFixtures ? mailboxProfiles.entries() : []) {
    const suffix = stableSuffix(devProfile.uid);
    const activityId = `seed-mailbox-${suffix}`;
    const startsAt = now + 55 * 60 * 1000;
    const endsAt = now + 2 * HOUR;
    const coordinate = at(0.002 + index * 0.0001, 0.004 + index * 0.0001);
    const maxProfile = profileOf(PEOPLE.find((person) => person.uid === 'seed-max'));
    const participants = [
      {
        uid: devProfile.uid,
        displayName: devProfile.displayName,
        initials: devProfile.initials,
      },
      {
        uid: maxProfile.uid,
        displayName: maxProfile.displayName,
        initials: maxProfile.initials,
      },
    ];
    const participantUids = participants.map((participant) => participant.uid);
    const title = 'Kaffee vor dem Feierabend';
    const chatExpireAt = endsAt + 24 * HOUR;

    await db.doc(`activities/${activityId}`).set({
      hostId: devProfile.uid,
      mode: 'soon',
      title,
      audienceUids: participantUids,
      startsAt: iso(startsAt),
      endsAt: iso(endsAt),
      place: {
        label: 'Five Elephant Mitte',
        visibility: 'pin',
        latitude: coordinate.lat,
        longitude: coordinate.lng,
      },
      maxParticipants: 8,
      category: 'kaffee',
      participants,
      participantUids,
      status: 'active',
      journeyReminderSentAt: ts(now - 42 * 60 * 1000),
      createdAt: ts(now - 2 * HOUR),
      visibleUntil: ts(endsAt),
      expireAt: ts(chatExpireAt),
    });

    const roomRef = db.doc(`chats/${activityId}`);
    const messageAt = now - 5 * 60 * 1000;
    await roomRef.set({
      type: 'activity',
      title,
      memberIds: participantUids,
      messageCount: 1,
      readCount: {},
      lastMessage: {
        text: 'Ich bin dabei – bis gleich!',
        authorId: maxProfile.uid,
        authorName: maxProfile.displayName,
        at: ts(messageAt),
      },
      createdAt: ts(now - 2 * HOUR),
      expireAt: ts(chatExpireAt),
    });
    await roomRef
      .collection('messages')
      .doc('seed-msg-max-joined')
      .set({
        authorId: maxProfile.uid,
        authorName: maxProfile.displayName,
        initials: maxProfile.initials,
        text: 'Ich bin dabei – bis gleich!',
        kind: 'text',
        createdAt: ts(messageAt),
        expireAt: ts(chatExpireAt),
      });

    const notificationExpireAt = ts(now + NOTIFICATION_RETENTION_MS);
    const notificationBase = `seed-notification-${suffix}`;
    await Promise.all([
      db.doc(`notifications/${notificationBase}-joined`).set({
        recipientUid: devProfile.uid,
        kind: 'activity_joined',
        title: 'Max ist dabei',
        body: `Max Krüger ist deiner Activity „${title}“ beigetreten.`,
        activityId,
        createdAt: ts(now - 4 * 60 * 1000),
        expireAt: notificationExpireAt,
      }),
      db.doc(`notifications/${notificationBase}-updated`).set({
        recipientUid: devProfile.uid,
        kind: 'activity_updated',
        title: 'Activity aktualisiert',
        body: `Der Treffpunkt für „${title}“ wurde aktualisiert.`,
        activityId,
        createdAt: ts(now - 18 * 60 * 1000),
        expireAt: notificationExpireAt,
      }),
      db.doc(`notifications/${notificationBase}-journey`).set({
        recipientUid: devProfile.uid,
        kind: 'journey_reminder',
        title: `${title} beginnt bald`,
        body: 'Anreise teilen? Zum Aktivieren tippen.',
        activityId,
        createdAt: ts(now - 42 * 60 * 1000),
        expireAt: notificationExpireAt,
      }),
    ]);
  }

  // ── 6. One planning group that opted into "Offen für Dazustoßer": private
  //      room + public teaser doc, audience = the dev account(s).
  const openGroup = scenario.openGroup;
  if (openGroup) {
    const groupPeople = openGroup.members.map((uid) => PEOPLE.find((person) => person.uid === uid));
    await db.doc(`chats/${openGroup.id}`).set({
      type: 'group',
      title: openGroup.title,
      vibe: openGroup.vibe,
      memberIds: openGroup.members,
      adminUids: openGroup.members.slice(0, 1),
      joinable: true,
      messageCount: 1,
      readCount: {},
      lastMessage: {
        text: 'Wer hat heute Abend Lust auf etwas?',
        authorId: 'seed-lisa',
        authorName: 'Lisa Becker',
        at: ts(now - 3 * 60 * 1000),
      },
      createdAt: ts(now),
      expireAt: ts(now + 30 * 24 * HOUR),
    });
    await db.doc(`chats/${openGroup.id}/messages/seed-proposal`).set({
      authorId: 'seed-lisa',
      authorName: 'Lisa Becker',
      initials: initialsOf('Lisa Becker'),
      text: 'Bowling und danach etwas essen',
      kind: 'proposal',
      proposal: {
        what: 'Bowling und danach etwas essen',
        when: 'Heute 19:30',
        where: 'Schwarzlicht, Gesundbrunnen',
        confirmedBy: ['seed-lisa'],
        planned: false,
      },
      createdAt: ts(now - 3 * 60 * 1000),
      expireAt: ts(now + 30 * 24 * HOUR),
    });
    await db.doc(`groupOpenings/${openGroup.id}`).set({
      roomId: openGroup.id,
      kind: 'joinable',
      status: 'active',
      title: openGroup.title,
      vibe: openGroup.vibe,
      memberCount: openGroup.members.length,
      memberPreview: groupPeople.map((person) => ({
        displayName: person.name,
        initials: initialsOf(person.name),
      })),
      audienceUids: devUids,
      expireAt: ts(now + 30 * 24 * HOUR),
      updatedAt: ts(now),
    });
  }

  // ── 7. Actionable inbox scenarios ───────────────────────────────────────
  // These are server-shaped documents so the app can exercise the real
  // callable responses (join/decline, accept/decline wink) without a second
  // device or hand-written client data. A marketing world switches them off:
  // a screenshot must not open on somebody else's to-do list.
  for (const [index, devProfile] of scenario.inboxFixtures && openGroup
    ? mailboxProfiles.entries()
    : []) {
    const host = PEOPLE[(index + 1) % PEOPLE.length];
    const hostIdentity = profileOf(host);
    const hostProfile = {
      uid: hostIdentity.uid,
      displayName: hostIdentity.displayName,
      initials: hostIdentity.initials,
    };
    const roundId = `seed-round-${stableSuffix(devProfile.uid)}`;
    const roundExpireAt = ts(now + 30 * 60 * 1000);

    // Reset the forming-room artefact from a previous accept before exposing
    // the invitation again. The real callable creates it on acceptance.
    await db
      .doc(`chats/${roundId}`)
      .delete()
      .catch(() => {});
    await db
      .doc(`spontaneousRoundMemberships/${devProfile.uid}`)
      .delete()
      .catch(() => {});
    await db.doc(`spontaneousRoundMemberships/${host.uid}`).set({
      roundId,
      expireAt: roundExpireAt,
      createdAt: ts(now),
    });
    await db.doc(`groupOpenings/${roundId}`).set({
      roomId: roundId,
      kind: 'spontaneous',
      status: 'active',
      hostUid: host.uid,
      title: 'Spontane Runde',
      memberIds: [host.uid],
      memberCount: 1,
      memberPreview: [hostProfile],
      audienceUids: [host.uid],
      createdAt: ts(now),
      updatedAt: ts(now),
      expireAt: roundExpireAt,
    });
    await db.doc(`spontaneousRoundInvites/${roundId}_${devProfile.uid}`).set({
      roundId,
      hostUid: host.uid,
      recipientUid: devProfile.uid,
      createdAt: ts(now),
      expireAt: roundExpireAt,
    });
    await db.doc(`notifications/${roundId}_${devProfile.uid}`).set({
      recipientUid: devProfile.uid,
      kind: 'spontaneous_round_invite',
      title: `${host.name} winkt dir zu`,
      body: 'Du bist offen. Willst du bei einer spontanen Runde dabei sein?',
      roomId: roundId,
      createdAt: ts(now - 2 * 60 * 1000),
      expireAt: roundExpireAt,
    });
    // Accepting a wink checks the recipient's current server presence. This
    // local-only fixture makes the confirmation sheet immediately testable.
    await db.doc(`presence/${devProfile.uid}`).set({
      uid: devProfile.uid,
      displayName: devProfile.displayName,
      initials: devProfile.initials,
      vibe: { label: 'Kaffee' },
      expireAt: ts(now + 3 * HOUR),
      shareLocation: false,
      audienceUids: [host.uid],
      updatedAt: ts(now),
    });

    const groupInviteId = `${openGroup.id}_${devProfile.uid}`;
    await db.doc(`groupChatInvites/${groupInviteId}`).set({
      roomId: openGroup.id,
      inviteeUid: devProfile.uid,
      inviterUid: 'seed-lisa',
      status: 'pending',
      createdAt: ts(now - 8 * 60 * 1000),
      expireAt: ts(now + 7 * DAY),
    });
    await db.doc(`notifications/groupinvite_${openGroup.id}_${devProfile.uid}`).set({
      recipientUid: devProfile.uid,
      kind: 'group_chat_invite',
      title: 'Lisa lädt dich ein',
      body: `Planung „${openGroup.title}“`,
      roomId: openGroup.id,
      createdAt: ts(now - 8 * 60 * 1000),
      expireAt: ts(now + NOTIFICATION_RETENTION_MS),
    });
    await db
      .doc(`chats/${openGroup.id}`)
      .set({ pendingInviteCount: mailboxProfiles.length }, { merge: true });

    // A normal activity invitation is also present, so the notification card
    // and the activity deep-link can be checked without creating a second app.
    await db.doc(`notifications/seed-act-kicker_${devProfile.uid}`).set({
      recipientUid: devProfile.uid,
      kind: 'activity_invite',
      title: 'Einladung zu „Kickerabend“',
      body: 'Max möchte, dass du dabei bist.',
      activityId: 'seed-act-kicker',
      createdAt: ts(now - 12 * 60 * 1000),
      expireAt: ts(now + NOTIFICATION_RETENTION_MS),
    });
  }

  // ── 8. The inbox: exactly what the scenario declares, nothing else.
  //      Cleared LAST on purpose. Writing an activity as admin still fires the
  //      real Firestore triggers, so `activity_updated` lands in the inbox from
  //      the seed's own writes — after section 5, not before it. The pause lets
  //      those triggers finish; without it the purge races them and the badge
  //      shows a notice nobody can explain.
  if (mePerson) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const stray = await db
      .collection('notifications')
      .where('recipientUid', '==', mePerson.uid)
      .get();
    await Promise.all(stray.docs.map((doc) => doc.ref.delete().catch(() => {})));
  }

  for (const notification of scenario.notifications ?? []) {
    const recipients = notification.forMe && mePerson ? [mePerson.uid] : devUids;
    await Promise.all(
      recipients.map((recipientUid) =>
        db.doc(`notifications/${notification.id}-${stableSuffix(recipientUid)}`).set({
          recipientUid,
          kind: notification.kind,
          title: notification.title,
          body: notification.body,
          ...(notification.activityId ? { activityId: notification.activityId } : {}),
          ...(notification.roomId ? { roomId: notification.roomId } : {}),
          createdAt: ts(now + (notification.createdAtOffsetMs ?? 0)),
          expireAt: ts(now + NOTIFICATION_RETENTION_MS),
        }),
      ),
    );
  }

  const openCount = PEOPLE.filter((person) => person.open).length;
  console.log(
    `Seed "${scenario.id}" fertig: ${PEOPLE.length + (REQUESTER ? 1 : 0)} Personen (${openCount} offen), ` +
      `${ACTIVITIES.length + (scenario.inboxFixtures ? mailboxProfiles.length : 0)} Activities, ` +
      `${openGroup ? 1 : 0} offene Gruppe(n), Konten: ${devUids.join(', ') || '—'}.`,
  );
  if (mePerson) {
    console.log(
      `Aufnahme-Account: ${mePerson.name} — ${mePerson.username}@seed.together.dev / seed-only` +
        `${scenario.myPresence && stringArg('me', 'open') !== 'idle' ? ' (offen)' : ' (nicht offen)'}.`,
    );
  }
  console.log(`Zentrum: ${CENTER.lat}, ${CENTER.lng} (überschreibbar mit --lat/--lng).`);
  await app.delete();
}

main().catch((error) => {
  console.error('Seeding fehlgeschlagen:', error.message ?? error);
  process.exit(1);
});
