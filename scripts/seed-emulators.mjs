/**
 * Seeds the LOCAL Firebase Emulator Suite with fake people, friendships,
 * presence, activities and chats. These records exist only in the local
 * Emulator Suite and are never mixed into client state.
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
 *  - Coordinates default to Berlin Mitte. Pass --lat/--lng to seed around the
 *    Android emulator's simulated GPS position.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('./firebase-admin-tools.cjs');
const { buildFriendSearchFields } = require('../functions/friend-search');

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
const DAY = 24 * HOUR;
const NOTIFICATION_RETENTION_MS = 30 * DAY;
const MAILBOX_ACCOUNT_LIMIT = 25;
const now = Date.now();
const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const iso = (ms) => new Date(ms).toISOString();
const stableSuffix = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);

/** Stable local roster for repeatable emulator scenarios. */
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
  {
    uid: 'seed-amelie',
    name: 'Amelie Wagner',
    username: 'amelie',
    vibe: 'Spaziergang',
    open: true,
    location: at(0.002, 0.007),
  },
  {
    uid: 'seed-david',
    name: 'David Klein',
    username: 'david',
    vibe: 'Kaffee',
    open: true,
    location: at(-0.003, 0.006),
  },
  {
    uid: 'seed-sofia',
    name: 'Sofia Neumann',
    username: 'sofia',
    vibe: null,
    open: true,
    location: at(0.006, -0.002),
  },
  {
    uid: 'seed-elias',
    name: 'Elias Becker',
    username: 'elias',
    vibe: 'Sport',
    open: true,
    location: at(-0.006, 0.003),
  },
  {
    uid: 'seed-hannah',
    name: 'Hannah Vogel',
    username: 'hannah',
    vibe: 'Essen',
    open: true,
    location: at(0.004, -0.008),
  },
  {
    uid: 'seed-felix',
    name: 'Felix Brandt',
    username: 'felix',
    vibe: null,
    open: true,
    location: at(-0.001, -0.009),
  },
  {
    uid: 'seed-lina',
    name: 'Lina Roth',
    username: 'lina',
    vibe: 'Kino',
    open: true,
    location: at(0.009, 0.002),
  },
  {
    uid: 'seed-tom',
    name: 'Tom Richter',
    username: 'tom',
    vibe: 'Drink',
    open: true,
    location: at(-0.009, -0.003),
  },
  {
    uid: 'seed-marie',
    name: 'Marie Schulz',
    username: 'marie',
    vibe: 'Spiele',
    open: true,
    location: at(0.007, 0.008),
  },
  {
    uid: 'seed-noah',
    name: 'Noah Fischer',
    username: 'noah',
    vibe: null,
    open: true,
    location: at(-0.008, 0.008),
  },
];

/** Kept outside PEOPLE so this account creates a real incoming request and is
 * never overwritten by the accepted-friendship loop below. */
const REQUESTER = {
  uid: 'seed-mailbox-requester',
  name: 'Leonie Hartmann',
  username: 'leonie-seed',
};

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

const friendSearchOf = (profile) => ({
  ...buildFriendSearchFields(profile, 'anyone'),
  updatedAt: ts(now),
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
    const searchFields = buildFriendSearchFields(
      profile,
      settings.friendRequestPolicy ?? 'anyone',
    );
    if (searchFields) {
      await db.doc(`friendSearch/${user.uid}`).set({ ...searchFields, updatedAt: ts(now) });
    }
  }
  const devUids = devProfiles.map((profile) => profile.uid);
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
    await db
      .doc(`publicProfiles/${person.uid}`)
      .set(
        { displayName: person.name, initials: profile.initials, username: person.username },
        { merge: true },
      );
    await db.doc(`friendSearch/${person.uid}`).set(friendSearchOf(profile), { merge: true });
    await db
      .doc(`usernames/${person.username}`)
      .set({ uid: person.uid, createdAt: ts(now) }, { merge: true });
  }

  await ensureAuthUser(auth, {
    uid: REQUESTER.uid,
    email: `${REQUESTER.username}@seed.together.dev`,
    password: 'seed-only',
    displayName: REQUESTER.name,
  });
  const requesterProfile = profileOf(REQUESTER);
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
    db.doc(`friendSearch/${REQUESTER.uid}`).set(friendSearchOf(requesterProfile), { merge: true }),
    db
      .doc(`usernames/${REQUESTER.username}`)
      .set({ uid: REQUESTER.uid, createdAt: ts(now) }, { merge: true }),
  ]);

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

  // A separate requester gives each mailbox demo account a genuinely incoming
  // action without changing any accepted seed relationship.
  for (const devProfile of mailboxProfiles) {
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
      ...(person.vibe ? { vibe: { label: person.vibe } } : {}),
      expireAt: ts(now + 3 * HOUR),
      shareLocation: Boolean(person.location),
      ...(person.location ? { coarseLocation: person.location } : {}),
      audienceUids: devUids.filter((uid) => uid !== person.uid).slice(0, 50),
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

  // A small private demo activity per dev account keeps every notification
  // target truthful: the recipient hosts it, Max is a real participant, and
  // the journey reminder points to a currently relevant destination.
  for (const [index, devProfile] of mailboxProfiles.entries()) {
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

  console.log(
    `Seed fertig: ${PEOPLE.length + 1} Personen, ${ACTIVITIES.length + mailboxProfiles.length} Activities, 1 offene Gruppe, ${mailboxProfiles.length} Postfach-Sets, Freundschaften für ${devUids.length} Dev-Account(s) [${devUids.join(', ')}].`,
  );
  console.log(`Zentrum: ${CENTER.lat}, ${CENTER.lng} (überschreibbar mit --lat/--lng).`);
  await app.delete();
}

main().catch((error) => {
  console.error('Seeding fehlgeschlagen:', error.message ?? error);
  process.exit(1);
});
