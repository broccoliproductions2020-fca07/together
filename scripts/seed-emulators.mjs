/**
 * Seeds the LOCAL Firebase Emulator Suite with fake people, friendships,
 * presence, activities and chats — the emulator-side replacement for the old
 * client-side demo seeds (PRESENCE_SEED / mock markers leaking into firebase
 * mode). Mock mode keeps its own offline data in src/data/mock.
 *
 * Usage:
 *   npm run emulators:seed            (emulators must be running)
 *   node scripts/seed-emulators.mjs [--lat 52.5208] [--lng 13.4095]
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
 *  - Coordinates default to Berlin Mitte (the mock world's center). Pass
 *    --lat/--lng to seed around the Android emulator's mocked GPS position.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// firebase-admin lives in functions/ (the only backend package in this repo).
const admin = require(path.join(root, 'functions', 'node_modules', 'firebase-admin'));

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

const PROJECT_ID = 'demo-together';
const DEMO_ACCOUNT = { email: 'demo@together.dev', password: 'together123', displayName: 'Demo' };

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? Number(args[index + 1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}
const CENTER = { lat: argValue('lat', 52.5208), lng: argValue('lng', 13.4095) };
/** Offsets in ~100m steps around CENTER (0.001 lat ≈ 111 m). */
const at = (dLat, dLng) => ({
  lat: Number((CENTER.lat + dLat).toFixed(3)),
  lng: Number((CENTER.lng + dLng).toFixed(3)),
});

const HOUR = 60 * 60 * 1000;
const now = Date.now();
const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const iso = (ms) => new Date(ms).toISOString();

/** The fake roster — mirrors the personalities of the old client mock data. */
const PEOPLE = [
  {
    uid: 'seed-max',
    name: 'Max Krüger',
    username: 'max',
    vibe: 'Kaffee',
    open: true,
    location: at(0.008, 0.003),
  },
  {
    uid: 'seed-lisa',
    name: 'Lisa Becker',
    username: 'lisa',
    vibe: 'Drink',
    open: true,
    location: at(-0.007, -0.011),
  },
  {
    uid: 'seed-jonas',
    name: 'Jonas Pohl',
    username: 'jonas',
    vibe: 'Sport',
    open: true,
    location: null,
  },
  { uid: 'seed-nora', name: 'Nora Weiß', username: 'nora', vibe: null, open: true, location: null },
  {
    uid: 'seed-mia',
    name: 'Mia Sommer',
    username: 'mia',
    vibe: null,
    open: false,
    location: at(0.004, -0.006),
  },
  {
    uid: 'seed-ben',
    name: 'Ben Otto',
    username: 'ben',
    vibe: null,
    open: false,
    location: at(-0.012, 0.009),
  },
];

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
});

/** Activities hosted by seed people. Times are relative so re-seeding always
 * produces a "live" world (one running now, two upcoming). */
const ACTIVITIES = [
  {
    id: 'seed-act-kicker',
    host: 'seed-max',
    also: ['seed-lisa'],
    mode: 'now',
    title: 'Kickern im Süß war gestern',
    category: 'spiele',
    startsAt: now - HOUR / 2,
    endsAt: now + 2 * HOUR,
    place: { label: 'Süß war gestern', visibility: 'pin', ...at(0.006, 0.012) },
    messages: [
      { author: 'seed-max', text: 'Tisch ist reserviert, kommt vorbei!' },
      { author: 'seed-lisa', text: 'Bin in 10 Minuten da 🏓' },
    ],
  },
  {
    id: 'seed-act-lauf',
    host: 'seed-jonas',
    also: [],
    mode: 'soon',
    title: 'Feierabendlauf am Kanal',
    category: 'sport',
    startsAt: now + 3 * HOUR,
    endsAt: now + 4 * HOUR,
    maxParticipants: 6,
    place: { label: 'Landwehrkanal', visibility: 'pin', ...at(-0.01, -0.004) },
    messages: [{ author: 'seed-jonas', text: 'Lockeres Tempo, alle willkommen.' }],
  },
  {
    id: 'seed-act-brunch',
    host: 'seed-mia',
    also: ['seed-ben', 'seed-nora'],
    mode: 'soon',
    title: 'Brunch am Sonntag',
    category: 'essen',
    startsAt: now + 26 * HOUR,
    endsAt: now + 28 * HOUR,
    place: { label: 'Café Morgenrot', visibility: 'pin', ...at(0.011, -0.009) },
    messages: [
      { author: 'seed-mia', text: 'Ich reserviere für 6 — wer ist dabei?' },
      { author: 'seed-ben', text: 'Dabei! Bringe Anna mit.' },
    ],
  },
];

async function ensureAuthUser(auth, { uid, email, password, displayName }) {
  try {
    await auth.createUser({ uid, email, password, displayName, emailVerified: true });
    return 'created';
  } catch (error) {
    if (error?.code !== 'auth/uid-already-exists' && error?.code !== 'auth/email-already-exists') {
      throw error;
    }
    await auth.updateUser(uid, { displayName }).catch(() => {});
    return 'exists';
  }
}

async function main() {
  const app = admin.initializeApp({ projectId: PROJECT_ID });
  const auth = app.auth();
  const db = app.firestore();

  // ── 1. Who is "me"? Every non-seed auth user becomes friends with the roster.
  const { users: allUsers } = await auth.listUsers(1000);
  let devUsers = allUsers.filter((user) => !user.uid.startsWith('seed-'));
  if (devUsers.length === 0) {
    await ensureAuthUser(auth, { uid: 'demo-user', ...DEMO_ACCOUNT });
    devUsers = [await auth.getUser('demo-user')];
    console.log(
      `Kein Dev-Account gefunden → Demo-Login angelegt: ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`,
    );
  }
  const devProfiles = [];
  for (const user of devUsers) {
    const profileRef = db.doc(`publicProfiles/${user.uid}`);
    const existing = (await profileRef.get()).data() ?? {};
    const displayName = existing.displayName ?? user.displayName ?? 'Du';
    const profile = {
      uid: user.uid,
      displayName,
      initials: existing.initials ?? initialsOf(displayName),
      ...(existing.username ? { username: existing.username } : {}),
    };
    devProfiles.push(profile);
    // Profile darf beim Seeden nie fehlen — joinActivity verlangt es.
    await profileRef.set(
      { displayName: profile.displayName, initials: profile.initials },
      { merge: true },
    );
  }
  const devUids = devProfiles.map((profile) => profile.uid);

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
    await db
      .doc(`publicProfiles/${person.uid}`)
      .set(
        { displayName: person.name, initials: profile.initials, username: person.username },
        { merge: true },
      );
    await db
      .doc(`usernames/${person.username}`)
      .set({ uid: person.uid, createdAt: ts(now) }, { merge: true });
  }

  // ── 3. Accepted friendships: every seed person ↔ every dev user.
  //      Doc id + shape mirror functions/index.js (friendshipId → `${a}__${b}` sorted).
  for (const person of PEOPLE) {
    for (const devProfile of devProfiles) {
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
      ...(person.vibe ? { vibe: { label: person.vibe } } : {}),
      expireAt: ts(now + 3 * HOUR),
      shareLocation: Boolean(person.location),
      ...(person.location ? { coarseLocation: person.location } : {}),
      audienceUids: [person.uid, ...devUids].slice(0, 50),
      updatedAt: ts(now),
    });
  }

  // ── 5. Activities + their chats (shape = createActivity/joinActivity output).
  for (const activity of ACTIVITIES) {
    const host = PEOPLE.find((person) => person.uid === activity.host);
    const others = activity.also.map((uid) => PEOPLE.find((person) => person.uid === uid));
    const participants = [host, ...others].map((person) => {
      const { uid, displayName, initials } = profileOf(person);
      return { uid, displayName, initials };
    });
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

  // ── 6. One planning group that opted into "Offen für Dazustoßer": private
  //      room + public teaser doc, audience = the dev account(s).
  const openGroup = {
    id: 'seed-group-abend',
    title: 'Was geht heute Abend?',
    vibe: 'Egal',
    members: ['seed-lisa', 'seed-jonas'],
  };
  const groupPeople = openGroup.members.map((uid) => PEOPLE.find((person) => person.uid === uid));
  await db.doc(`chats/${openGroup.id}`).set({
    type: 'group',
    title: openGroup.title,
    vibe: openGroup.vibe,
    memberIds: openGroup.members,
    adminUids: openGroup.members.slice(0, 1),
    joinable: true,
    messageCount: 0,
    readCount: {},
    createdAt: ts(now),
    expireAt: ts(now + 30 * 24 * HOUR),
  });
  await db.doc(`groupOpenings/${openGroup.id}`).set({
    roomId: openGroup.id,
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

  console.log(
    `Seed fertig: ${PEOPLE.length} Personen, ${ACTIVITIES.length} Activities, 1 offene Gruppe, Freundschaften für ${devUids.length} Dev-Account(s) [${devUids.join(', ')}].`,
  );
  console.log(`Zentrum: ${CENTER.lat}, ${CENTER.lng} (überschreibbar mit --lat/--lng).`);
  await app.delete();
}

main().catch((error) => {
  console.error('Seeding fehlgeschlagen:', error.message ?? error);
  process.exit(1);
});
