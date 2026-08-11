/* global __dirname */

const { createHash } = require('node:crypto');

const PROJECT_ID = 'demo-together';
const AUTH_PORT = Number(process.env.TEST_AUTH_EMULATOR_PORT ?? 9199);
const FIRESTORE_PORT = Number(process.env.TEST_FIRESTORE_EMULATOR_PORT ?? 8180);
const FUNCTIONS_PORT = Number(process.env.TEST_FUNCTIONS_EMULATOR_PORT ?? 5001);
const DATABASE_PORT = Number(process.env.TEST_DATABASE_EMULATOR_PORT ?? 8281);
const ACTIVITY_CHAT_RETENTION_MS = 12 * 60 * 60 * 1000;
const AUTH_BASE = `http://127.0.0.1:${AUTH_PORT}/identitytoolkit.googleapis.com/v1`;
const FUNCTIONS_BASE = `http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT_ID}/europe-west3`;

process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FIRESTORE_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_PORT}`;
process.env.FIREBASE_DATABASE_EMULATOR_HOST = `127.0.0.1:${DATABASE_PORT}`;

const admin = require('./firebase-admin-tools.cjs');
const { cleanupExpiredSurfaces } = require('../functions/cleanup-expired-surfaces');

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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data }),
  });
  const responseText = await response.text();
  let body = null;
  if (responseText) {
    try {
      body = JSON.parse(responseText);
    } catch {
      body = responseText;
    }
  }
  return { status: response.status, ok: response.ok, body };
}

async function callTask(name, data) {
  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The emulator exposes task functions as HTTP endpoints with this wrapper.
    body: JSON.stringify({ data }),
  });
  const responseText = await response.text();
  let body = null;
  if (responseText) {
    try {
      body = JSON.parse(responseText);
    } catch {
      body = responseText;
    }
  }
  return { status: response.status, ok: response.ok, body };
}

async function expectOk(label, operation) {
  const result = await operation();
  if (!result.ok || result.body.error) {
    throw new Error(
      `${label} expected success, got ${result.status}: ${JSON.stringify(result.body)}`,
    );
  }
  console.log(`OK ${label}`);
  return result.body.result;
}

async function expectError(label, expectedStatus, operation) {
  const result = await operation();
  const status = result.body?.error?.status;
  if (result.ok || status !== expectedStatus) {
    throw new Error(
      `${label} expected ${expectedStatus}, got ${result.status}: ${JSON.stringify(result.body)}`,
    );
  }
  console.log(`DENIED ${label}`);
}

function friendshipId(firstUid, secondUid) {
  return [firstUid, secondUid].sort().join('__');
}

function pushTokenClaimId(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Polls for an async RTDB-trigger side effect (e.g. cleanupSafetyIndexOnSessionDeleted)
 * instead of racing it — the callable that causes the deletion returns before
 * the trigger necessarily finishes. */
async function waitFor(check, { attempts = 60, delayMs = 250 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Condition not met in time.');
}

async function main() {
  const app = admin.initializeApp(
    {
      projectId: PROJECT_ID,
      databaseURL: 'https://demo-together-default-rtdb.firebaseio.com',
    },
    'functions-test',
  );
  const db = app.firestore();
  const realtimeDb = app.database();
  const timestamp = admin.firestore.Timestamp.now();
  const now = Date.now();
  const sharedStartsAt = new Date(now + 30 * 60 * 1000).toISOString();
  const sharedEndsAt = new Date(now + 90 * 60 * 1000).toISOString();
  const [alice, bob, charlie, dave] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const profiles = [
    { ...alice, name: 'Alice Adams', username: 'alice' },
    { ...bob, name: 'Bob Berger', username: 'bob' },
    { ...charlie, name: 'Charlie Clark', username: 'charlie' },
    { ...dave, name: 'Dave Dietrich', username: 'dave' },
  ];

  const batch = db.batch();
  profiles.forEach((person) => {
    const initials = initialsOf(person.name);
    batch.set(db.doc(`users/${person.uid}`), {
      displayName: person.name,
      username: person.username,
      initials,
      avatarUrl: `https://example.test/${person.username}.jpg`,
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
  });
  const aliceDaveProfiles = profiles
    .filter((person) => person.uid === alice.uid || person.uid === dave.uid)
    .map((person) => ({
      uid: person.uid,
      displayName: person.name,
      username: person.username,
      initials: initialsOf(person.name),
      avatarUrl: `https://example.test/${person.username}.jpg`,
    }));
  batch.set(db.doc(`friendships/${friendshipId(alice.uid, dave.uid)}`), {
    participantUids: [alice.uid, dave.uid].sort(),
    requesterUid: alice.uid,
    status: 'accepted',
    profiles: aliceDaveProfiles,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  batch.set(db.doc('activities/shared-activity'), {
    hostId: alice.uid,
    mode: 'soon',
    title: 'Kaffee',
    audienceUids: [alice.uid, bob.uid, charlie.uid],
    startsAt: sharedStartsAt,
    endsAt: sharedEndsAt,
    participantUids: [alice.uid, bob.uid],
    participants: [
      { uid: alice.uid, displayName: 'Alice Adams', initials: 'AA' },
      { uid: bob.uid, displayName: 'Bob Berger', initials: 'BB' },
    ],
    status: 'active',
    createdAt: timestamp,
    visibleUntil: admin.firestore.Timestamp.fromMillis(Date.parse(sharedEndsAt)),
    expireAt: admin.firestore.Timestamp.fromMillis(now + 26 * 60 * 60 * 1000),
  });
  batch.set(db.doc('activities/other-activity'), {
    hostId: alice.uid,
    mode: 'soon',
    title: 'Sport',
    audienceUids: [alice.uid, bob.uid, charlie.uid],
    participantUids: [alice.uid, charlie.uid],
    participants: [
      { uid: alice.uid, displayName: 'Alice Adams', initials: 'AA' },
      { uid: charlie.uid, displayName: 'Charlie Clark', initials: 'CC' },
    ],
    status: 'active',
    createdAt: timestamp,
    visibleUntil: admin.firestore.Timestamp.fromMillis(now + 60 * 60 * 1000),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  });
  batch.set(db.doc('chats/room-shared'), {
    type: 'activity',
    title: 'Kaffee',
    memberIds: [alice.uid, bob.uid],
    messageCount: 0,
    readCount: {},
    createdAt: timestamp,
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  });
  batch.set(db.doc('chats/shared-activity'), {
    type: 'activity',
    title: 'Kaffee',
    memberIds: [alice.uid, bob.uid],
    messageCount: 0,
    readCount: {},
    createdAt: timestamp,
    expireAt: admin.firestore.Timestamp.fromMillis(now + 26 * 60 * 60 * 1000),
  });
  batch.set(db.doc('activities/ended-activity'), {
    hostId: alice.uid,
    mode: 'soon',
    title: 'Gestern',
    audienceUids: [alice.uid, bob.uid],
    startsAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now - 60 * 60 * 1000).toISOString(),
    participantUids: [alice.uid],
    participants: [{ uid: alice.uid, displayName: 'Alice Adams', initials: 'AA' }],
    status: 'active',
    createdAt: timestamp,
    visibleUntil: admin.firestore.Timestamp.fromMillis(now - 60 * 60 * 1000),
    expireAt: admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000),
  });
  batch.set(db.doc('activities/cancel-activity'), {
    hostId: alice.uid,
    mode: 'soon',
    title: 'Picknick',
    audienceUids: [alice.uid, bob.uid],
    startsAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
    participantUids: [alice.uid, bob.uid],
    participants: [
      { uid: alice.uid, displayName: 'Alice Adams', initials: 'AA' },
      { uid: bob.uid, displayName: 'Bob Berger', initials: 'BB' },
    ],
    status: 'active',
    journeyUnderwayCount: 1,
    createdAt: timestamp,
    visibleUntil: admin.firestore.Timestamp.fromMillis(now + 4 * 60 * 60 * 1000),
    expireAt: admin.firestore.Timestamp.fromMillis(now + 28 * 60 * 60 * 1000),
  });
  batch.set(db.doc('chats/cancel-activity'), {
    type: 'activity',
    title: 'Picknick',
    memberIds: [alice.uid, bob.uid],
    messageCount: 0,
    readCount: {},
    createdAt: timestamp,
    expireAt: admin.firestore.Timestamp.fromMillis(now + 28 * 60 * 60 * 1000),
  });
  await batch.commit();

  // Places must reject malformed input before it can trigger any paid Google
  // request. The emulator has no Places secret, so the valid-path behaviour is
  // covered by the email-verification gate test without external traffic.
  await expectError('unified place autocomplete rejects malformed session tokens', 'INVALID_ARGUMENT', () =>
    callFunction(alice.token, 'places', {
      action: 'autocomplete',
      query: 'Kino',
      sessionToken: 'not valid!',
    }),
  );
  await expectError('unified place details rejects malformed place IDs', 'INVALID_ARGUMENT', () =>
    callFunction(alice.token, 'places', {
      action: 'resolve',
      placeId: 'place/with/slash',
      sessionToken: 'safe-place-session-token-123456',
    }),
  );

  const avatarBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  const renamedProfile = await expectOk('profile display name change is server-owned', () =>
    callFunction(alice.token, 'updateOwnProfile', { displayName: 'Alice Neu' }),
  );
  const [renamedUser, renamedPublicProfile] = await Promise.all([
    db.doc(`users/${alice.uid}`).get(),
    db.doc(`publicProfiles/${alice.uid}`).get(),
  ]);
  if (
    renamedProfile.displayName !== 'Alice Neu' ||
    renamedUser.data()?.displayName !== 'Alice Neu' ||
    renamedPublicProfile.data()?.displayName !== 'Alice Neu' ||
    renamedPublicProfile.data()?.initials !== 'AN'
  ) {
    throw new Error('Profile display name was not updated consistently.');
  }
  await expectError('profile display name cooldown is enforced', 'RESOURCE_EXHAUSTED', () =>
    callFunction(alice.token, 'updateOwnProfile', { displayName: 'Alice Noch Neuer' }),
  );
  await db.doc(`rateLimits/${alice.uid}_profile`).set(
    {
      displayNameChanges: [
        admin.firestore.Timestamp.fromMillis(Date.now() - 18 * 60 * 1000),
        admin.firestore.Timestamp.fromMillis(Date.now() - 17 * 60 * 1000),
        admin.firestore.Timestamp.fromMillis(Date.now() - 16 * 60 * 1000),
      ],
    },
    { merge: true },
  );
  await expectError('profile display name daily limit is enforced', 'RESOURCE_EXHAUSTED', () =>
    callFunction(alice.token, 'updateOwnProfile', { displayName: 'Alice Zu Oft' }),
  );
  await db.doc(`rateLimits/${alice.uid}_profile`).set({ displayNameChanges: [] }, { merge: true });

  const avatarProfile = await expectOk('profile avatar upload is server-owned', () =>
    callFunction(alice.token, 'updateOwnProfile', { displayName: 'Alice Neu', avatarBase64 }),
  );
  const avatarUrl = avatarProfile.avatarUrl;
  const [avatarUser, avatarPublicProfile] = await Promise.all([
    db.doc(`users/${alice.uid}`).get(),
    db.doc(`publicProfiles/${alice.uid}`).get(),
  ]);
  if (
    typeof avatarUrl !== 'string' ||
    !avatarUrl.includes(`avatars%2F${alice.uid}%2F`) ||
    avatarUser.data()?.avatarUrl !== avatarUrl ||
    avatarPublicProfile.data()?.avatarUrl !== avatarUrl
  ) {
    throw new Error('Profile avatar was not written through the server-owned path.');
  }
  await db.doc(`rateLimits/${alice.uid}_profile`).set(
    {
      avatarChanges: Array.from({ length: 5 }, (_, index) =>
        admin.firestore.Timestamp.fromMillis(Date.now() - (index + 1) * 60_000),
      ),
    },
    { merge: true },
  );
  await expectError('profile avatar daily limit is enforced', 'RESOURCE_EXHAUSTED', () =>
    callFunction(alice.token, 'updateOwnProfile', { displayName: 'Alice Neu', avatarBase64 }),
  );

  const createdPrivateCircle = await expectOk('private Circle mutations stay server-owned', () =>
    callFunction(alice.token, 'createPrivateCircle', { name: 'Enger Kreis', emoji: '✨' }),
  );
  const createdPrivateCircleId = createdPrivateCircle.id;
  const createdPrivateCircleSnapshot = await db
    .doc(`users/${alice.uid}/privateCircles/${createdPrivateCircleId}`)
    .get();
  if (createdPrivateCircleSnapshot.data()?.name !== 'Enger Kreis') {
    throw new Error('Private Circle callable did not create the expected document.');
  }
  await expectOk('private Circle deletion stays server-owned', () =>
    callFunction(alice.token, 'deletePrivateCircle', { circleId: createdPrivateCircleId }),
  );
  if ((await db.doc(`users/${alice.uid}/privateCircles/${createdPrivateCircleId}`).get()).exists) {
    throw new Error('Private Circle callable did not delete the expected document.');
  }

  const createdActivityId = `visible-until-${now}`;
  const createdStartsAt = new Date(now + 5 * 60 * 60 * 1000).toISOString();
  const createdEndsAt = new Date(now + 7 * 60 * 60 * 1000).toISOString();
  const createdPlace = {
    label: 'Koordinaten-Regression',
    latitude: 48.137154,
    longitude: 11.576124,
    visibility: 'pin',
  };
  await expectOk('new activity writes feed visibility separate from chat retention', () =>
    callFunction(alice.token, 'createActivity', {
      activityId: createdActivityId,
      activity: {
        mode: 'soon',
        title: 'Sichtbarkeit testen',
        audienceContext: { kind: 'all_friends' },
        startsAt: createdStartsAt,
        endsAt: createdEndsAt,
        place: createdPlace,
      },
    }),
  );
  const [createdActivitySnapshot, createdRoomSnapshot] = await Promise.all([
    db.doc(`activities/${createdActivityId}`).get(),
    db.doc(`chats/${createdActivityId}`).get(),
  ]);
  const createdActivity = createdActivitySnapshot.data();
  const createdRoom = createdRoomSnapshot.data();
  const expectedCreatedExpiry = Date.parse(createdEndsAt) + ACTIVITY_CHAT_RETENTION_MS;
  if (
    createdActivity?.visibleUntil?.toMillis?.() !== Date.parse(createdEndsAt) ||
    createdActivity?.expireAt?.toMillis?.() !== expectedCreatedExpiry ||
    createdRoom?.expireAt?.toMillis?.() !== expectedCreatedExpiry ||
    createdActivity?.place?.latitude !== createdPlace.latitude ||
    createdActivity?.place?.longitude !== createdPlace.longitude
  ) {
    throw new Error(
      'New activity did not preserve its visibility, retention and real coordinates.',
    );
  }
  const activeFeed = await db
    .collection('activities')
    .where('audienceUids', 'array-contains', alice.uid)
    .where('status', '==', 'active')
    .where('visibleUntil', '>', admin.firestore.Timestamp.fromMillis(now))
    .orderBy('visibleUntil', 'asc')
    .limit(50)
    .get();
  if (!activeFeed.docs.some((document) => document.id === createdActivityId)) {
    throw new Error('The new live activity was not returned by the production feed query.');
  }
  await expectOk('activity retry with the same client id stays idempotent', () =>
    callFunction(alice.token, 'createActivity', {
      activityId: createdActivityId,
      activity: {
        mode: 'soon',
        title: 'Sichtbarkeit testen',
        audienceContext: { kind: 'all_friends' },
        startsAt: createdStartsAt,
        endsAt: createdEndsAt,
        place: createdPlace,
      },
    }),
  );
  const journeyReminderGeneration = createdActivity?.journeyReminderGeneration;
  if (typeof journeyReminderGeneration !== 'string' || !journeyReminderGeneration) {
    throw new Error('New activity did not receive a reminder task generation.');
  }
  const firstJourneyTask = await callTask('dispatchJourneyReminder', {
    activityId: createdActivityId,
    generation: journeyReminderGeneration,
  });
  if (!firstJourneyTask.ok) {
    throw new Error(
      `Journey reminder task failed with ${firstJourneyTask.status}: ${JSON.stringify(firstJourneyTask.body)}`,
    );
  }
  const firstJourneyReminder = await waitFor(async () => {
    const snapshot = await db
      .collection('notifications')
      .where('activityId', '==', createdActivityId)
      .where('kind', '==', 'journey_reminder')
      .get();
    return snapshot.size === 1 ? snapshot : null;
  });
  const repeatedJourneyTask = await callTask('dispatchJourneyReminder', {
    activityId: createdActivityId,
    generation: journeyReminderGeneration,
  });
  if (!repeatedJourneyTask.ok) {
    throw new Error(`Repeated journey reminder task failed with ${repeatedJourneyTask.status}.`);
  }
  const repeatedJourneyReminder = await db
    .collection('notifications')
    .where('activityId', '==', createdActivityId)
    .where('kind', '==', 'journey_reminder')
    .get();
  if (repeatedJourneyReminder.size !== firstJourneyReminder.size) {
    throw new Error('Journey reminder task was not idempotent.');
  }
  console.log('OK Journey reminder tasks are idempotent');
  console.log('OK activity feed returns only the explicit visibility window');

  await expectOk('open presence accepts a duration below twelve hours', () =>
    callFunction(alice.token, 'publishPresence', {
      presence: {
        expiresAt: Date.now() + 11 * 60 * 60 * 1000,
        shareLocation: false,
      },
    }),
  );
  const openedPresence = await db.doc(`presence/${alice.uid}`).get();
  const openedAudience = openedPresence.data()?.audienceUids ?? [];
  if (openedAudience.includes(alice.uid)) {
    throw new Error('Presence audience must not include its owner.');
  }
  await expectOk('open presence refinement reuses its server-derived audience', () =>
    callFunction(alice.token, 'publishPresence', {
      presence: {
        expiresAt: Date.now() + 10 * 60 * 60 * 1000,
        shareLocation: false,
        vibe: { label: 'Kaffee?' },
      },
    }),
  );
  const refinedPresence = await db.doc(`presence/${alice.uid}`).get();
  if ((refinedPresence.data()?.audienceUids ?? []).join(',') !== openedAudience.join(',')) {
    throw new Error('Presence refinement recalculated its audience instead of reusing it.');
  }
  await expectError('open presence rejects a duration above twelve hours', 'INVALID_ARGUMENT', () =>
    callFunction(alice.token, 'publishPresence', {
      presence: {
        expiresAt: Date.now() + 12 * 60 * 60 * 1000 + 60_000,
        shareLocation: false,
      },
    }),
  );
  await expectError('Socialize remains unavailable before its release', 'FAILED_PRECONDITION', () =>
    callFunction(alice.token, 'discoverSocial', {}),
  );

  // Chat guardrails are part of the production contract: groups stay small,
  // activity rooms retain their own lifecycle, and one busy room cannot turn a
  // burst into unbounded summary writes/fan-out.
  await expectError('group creation rejects more than 25 total members', 'INVALID_ARGUMENT', () =>
    callFunction(alice.token, 'createGroupChat', {
      memberUids: Array.from({ length: 25 }, (_, index) => `member_${index}`),
      title: 'Zu große Gruppe',
    }),
  );
  const group = await expectOk('friend planning group stays within the member cap', () =>
    callFunction(alice.token, 'createGroupChat', {
      memberUids: [dave.uid],
      title: 'Skalierungsprobe',
    }),
  );
  if (typeof group?.id !== 'string') throw new Error('Group creation did not return an id.');
  const groupRoomBeforeMessage = await db.doc(`chats/${group.id}`).get();
  if (groupRoomBeforeMessage.data()?.memberIds?.length !== 2) {
    throw new Error('Group member limit did not produce the expected room membership.');
  }
  const groupMessageBefore = Date.now();
  await expectOk('group message refreshes the 30-day inactivity retention', () =>
    callFunction(alice.token, 'sendChatMessage', { roomId: group.id, text: 'Bis gleich!' }),
  );
  const [groupRoomAfterMessage, groupMessages] = await Promise.all([
    db.doc(`chats/${group.id}`).get(),
    db.collection(`chats/${group.id}/messages`).limit(2).get(),
  ]);
  const groupRoomData = groupRoomAfterMessage.data();
  const groupMessage = groupMessages.docs[0]?.data();
  if (
    groupRoomData?.messageCount !== 1 ||
    groupRoomData?.lastMessage?.text !== 'Bis gleich!' ||
    groupRoomData?.expireAt?.toMillis?.() < groupMessageBefore + 29 * 24 * 60 * 60 * 1000 ||
    groupMessage?.expireAt?.toMillis?.() < groupMessageBefore + 29 * 24 * 60 * 60 * 1000
  ) {
    throw new Error('A group message did not refresh room and message retention together.');
  }
  // The next write is intentionally distinct, so respect the production burst guard.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const idempotentMessageId = `outbox_message_${now}`;
  await expectOk('chat message accepts a stable client id', () =>
    callFunction(alice.token, 'sendChatMessage', {
      roomId: group.id,
      text: 'Diese Nachricht darf nur einmal erscheinen.',
      clientMessageId: idempotentMessageId,
    }),
  );
  await expectOk('chat retry with the same client id stays idempotent', () =>
    callFunction(alice.token, 'sendChatMessage', {
      roomId: group.id,
      text: 'Diese Nachricht darf nur einmal erscheinen.',
      clientMessageId: idempotentMessageId,
    }),
  );
  const [idempotentRoom, idempotentMessage] = await Promise.all([
    db.doc(`chats/${group.id}`).get(),
    db.doc(`chats/${group.id}/messages/${idempotentMessageId}`).get(),
  ]);
  if (idempotentRoom.data()?.messageCount !== 2 || !idempotentMessage.exists) {
    throw new Error('A retry with the same client message id created a duplicate.');
  }
  console.log('OK group chat lifecycle is bounded and refreshed atomically');

  // Targeted planning-round invitations. The point of this path is that the
  // invitee DECIDES: an invite must never add anyone to a room, and every
  // guard is re-checked when the answer arrives, not only when it was sent.
  const inviteGroup = await expectOk('admin creates a planning round to invite into', () =>
    callFunction(alice.token, 'createGroupChat', {
      memberUids: [dave.uid],
      title: 'Einladungsprobe',
    }),
  );
  await expectError(
    'inviting someone who is not a confirmed friend is refused',
    'PERMISSION_DENIED',
    () =>
      callFunction(alice.token, 'inviteToGroupChat', {
        roomId: inviteGroup.id,
        inviteeUids: [charlie.uid],
      }),
  );
  await expectError('a non-admin member cannot invite', 'PERMISSION_DENIED', () =>
    callFunction(dave.token, 'inviteToGroupChat', {
      roomId: inviteGroup.id,
      inviteeUids: [bob.uid],
    }),
  );

  await db.doc(`friendships/${friendshipId(alice.uid, bob.uid)}`).set({
    participantUids: [alice.uid, bob.uid].sort(),
    requesterUid: alice.uid,
    status: 'accepted',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // A block in either direction hides the invitation entirely. Written
  // directly so the friendship survives and the block branch is what is
  // actually under test.
  await db.doc(`blocks/${bob.uid}_${alice.uid}`).set({
    blockerUid: bob.uid,
    blockedUid: alice.uid,
    createdAt: timestamp,
  });
  const blockedInvite = await expectOk('a blocked pair produces no invitation', () =>
    callFunction(alice.token, 'inviteToGroupChat', {
      roomId: inviteGroup.id,
      inviteeUids: [bob.uid],
    }),
  );
  if (blockedInvite?.invited !== 0 || blockedInvite?.skipped !== 1) {
    throw new Error('A blocked invitee was not skipped.');
  }
  await db.doc(`blocks/${bob.uid}_${alice.uid}`).delete();

  const sentInvite = await expectOk('admin invites a confirmed friend', () =>
    callFunction(alice.token, 'inviteToGroupChat', {
      roomId: inviteGroup.id,
      inviteeUids: [bob.uid],
    }),
  );
  if (sentInvite?.invited !== 1) throw new Error('The invitation was not created.');
  const [inviteDoc, inviteRoom, groupInviteNotifications] = await Promise.all([
    db.doc(`groupChatInvites/${inviteGroup.id}_${bob.uid}`).get(),
    db.doc(`chats/${inviteGroup.id}`).get(),
    db.collection('notifications').where('recipientUid', '==', bob.uid).get(),
  ]);
  if (!inviteDoc.exists || inviteDoc.data()?.status !== 'pending') {
    throw new Error('The pending invitation document is missing.');
  }
  if ((inviteRoom.data()?.memberIds ?? []).includes(bob.uid)) {
    throw new Error('An invitation added the invitee to the room — it must not.');
  }
  if (!groupInviteNotifications.docs.some((entry) => entry.data().kind === 'group_chat_invite')) {
    throw new Error('The invitation did not produce a notification.');
  }
  console.log('OK a planning-round invitation notifies without adding anyone');

  await expectOk('removing a friend retracts their pending planning invitation', () =>
    callFunction(alice.token, 'removeFriend', { uid: bob.uid }),
  );
  const [removedInvite, removedNotification] = await Promise.all([
    db.doc(`groupChatInvites/${inviteGroup.id}_${bob.uid}`).get(),
    db.doc(`notifications/groupinvite_${inviteGroup.id}_${bob.uid}`).get(),
  ]);
  if (removedInvite.exists || removedNotification.exists) {
    throw new Error('Removing a friend left a planning invitation or notification behind.');
  }
  await db.doc(`friendships/${friendshipId(alice.uid, bob.uid)}`).set({
    participantUids: [alice.uid, bob.uid].sort(),
    requesterUid: alice.uid,
    status: 'accepted',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await expectOk('admin re-invites after the friendship is restored', () =>
    callFunction(alice.token, 'inviteToGroupChat', {
      roomId: inviteGroup.id,
      inviteeUids: [bob.uid],
    }),
  );
  console.log('OK removing a friend retracts planning access immediately');

  await expectError('a stranger cannot answer somebody else’s invitation', 'NOT_FOUND', () =>
    callFunction(charlie.token, 'respondToGroupChatInvite', {
      roomId: inviteGroup.id,
      accept: true,
    }),
  );

  // The invitation was only valid because Alice and Bob were friends when it
  // was sent. Removing that relationship must revoke both the server invite
  // and its card; an old notification may never grant access back into a room.
  await db.doc(`friendships/${friendshipId(alice.uid, bob.uid)}`).delete();
  await expectError(
    'a former friend cannot accept an old planning invitation',
    'PERMISSION_DENIED',
    () =>
      callFunction(bob.token, 'respondToGroupChatInvite', { roomId: inviteGroup.id, accept: true }),
  );
  const [revokedInvite, revokedNotification] = await Promise.all([
    db.doc(`groupChatInvites/${inviteGroup.id}_${bob.uid}`).get(),
    db.doc(`notifications/groupinvite_${inviteGroup.id}_${bob.uid}`).get(),
  ]);
  if (revokedInvite.exists || revokedNotification.exists) {
    throw new Error('A revoked friendship left a usable planning invitation behind.');
  }
  await db.doc(`friendships/${friendshipId(alice.uid, bob.uid)}`).set({
    participantUids: [alice.uid, bob.uid].sort(),
    requesterUid: alice.uid,
    status: 'accepted',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await expectOk('admin can re-invite after friendship is restored', () =>
    callFunction(alice.token, 'inviteToGroupChat', {
      roomId: inviteGroup.id,
      inviteeUids: [bob.uid],
    }),
  );
  console.log('OK a removed friendship revokes the invitation and its notification');

  await expectOk('the invitee declines', () =>
    callFunction(bob.token, 'respondToGroupChatInvite', { roomId: inviteGroup.id, accept: false }),
  );
  const [declinedInvite, declinedRoom, declinedNotification] = await Promise.all([
    db.doc(`groupChatInvites/${inviteGroup.id}_${bob.uid}`).get(),
    db.doc(`chats/${inviteGroup.id}`).get(),
    db.doc(`notifications/groupinvite_${inviteGroup.id}_${bob.uid}`).get(),
  ]);
  if (declinedInvite.exists || declinedNotification.exists) {
    throw new Error('Declining did not clear the invitation and its notification.');
  }
  if ((declinedRoom.data()?.memberIds ?? []).includes(bob.uid)) {
    throw new Error('Declining added the invitee to the room.');
  }
  await expectError('an answered invitation cannot be answered again', 'NOT_FOUND', () =>
    callFunction(bob.token, 'respondToGroupChatInvite', { roomId: inviteGroup.id, accept: true }),
  );
  console.log('OK declining clears the invitation and never grants access');

  await expectOk('admin invites again after the decline', () =>
    callFunction(alice.token, 'inviteToGroupChat', {
      roomId: inviteGroup.id,
      inviteeUids: [bob.uid],
    }),
  );
  await expectOk('the invitee accepts', () =>
    callFunction(bob.token, 'respondToGroupChatInvite', { roomId: inviteGroup.id, accept: true }),
  );
  const [acceptedInvite, acceptedRoom, acceptedNotification] = await Promise.all([
    db.doc(`groupChatInvites/${inviteGroup.id}_${bob.uid}`).get(),
    db.doc(`chats/${inviteGroup.id}`).get(),
    db.doc(`notifications/groupinvite_${inviteGroup.id}_${bob.uid}`).get(),
  ]);
  if (!(acceptedRoom.data()?.memberIds ?? []).includes(bob.uid)) {
    throw new Error('Accepting did not add the invitee to the room.');
  }
  if (acceptedInvite.exists || acceptedNotification.exists) {
    throw new Error('Accepting left the invitation or its notification behind.');
  }
  await expectOk('an accepted member can post in the round', () =>
    callFunction(bob.token, 'sendChatMessage', { roomId: inviteGroup.id, text: 'Bin dabei!' }),
  );
  console.log('OK accepting joins the round and retracts the invitation');

  // A full round must reject the ANSWER, not the invitation — a seat can free
  // up again before the invite expires, so discarding it would turn "voll
  // gerade" into "nie eingeladen gewesen".
  await db.doc(`chats/${inviteGroup.id}`).update({ memberIds: [alice.uid, bob.uid] });
  await expectOk('admin invites while the round still has room', () =>
    callFunction(alice.token, 'inviteToGroupChat', {
      roomId: inviteGroup.id,
      inviteeUids: [dave.uid],
    }),
  );
  await db.doc(`chats/${inviteGroup.id}`).update({
    memberIds: [alice.uid, ...Array.from({ length: 24 }, (_, index) => `filler_${index}`)],
  });
  await expectError('a full round refuses the join', 'FAILED_PRECONDITION', () =>
    callFunction(dave.token, 'respondToGroupChatInvite', { roomId: inviteGroup.id, accept: true }),
  );
  if (!(await db.doc(`groupChatInvites/${inviteGroup.id}_${dave.uid}`).get()).exists) {
    throw new Error('A full round discarded the invitation instead of keeping it.');
  }
  console.log('OK a full round rejects the join but keeps the invitation');

  // Restore the shared fixture: later assertions rely on Alice and Bob NOT
  // being friends (minimal chat cards, friend-request policies).
  await db.doc(`friendships/${friendshipId(alice.uid, bob.uid)}`).delete();

  // Winks are private, short-lived invitations â€” not client-writable group
  // membership. Dave may receive more than one while open, but accepting one
  // atomically removes every competing pending wink and his open presence.
  await db.doc(`friendships/${friendshipId(bob.uid, dave.uid)}`).set({
    participantUids: [bob.uid, dave.uid].sort(),
    requesterUid: bob.uid,
    status: 'accepted',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await expectOk('Dave publishes open presence for direct friends', () =>
    callFunction(dave.token, 'publishPresence', {
      presence: { expiresAt: Date.now() + 60 * 60 * 1000, shareLocation: false },
    }),
  );
  const bobRound = await expectOk('first friend can send a private wink', () =>
    callFunction(bob.token, 'startSpontaneousRound', { inviteeUids: [dave.uid] }),
  );
  const aliceRound = await expectOk('second friend can send a competing private wink', () =>
    callFunction(alice.token, 'startSpontaneousRound', { inviteeUids: [dave.uid] }),
  );
  if (typeof bobRound?.id !== 'string' || typeof aliceRound?.id !== 'string') {
    throw new Error('Spontaneous round did not return a server-generated id.');
  }
  const [pendingOpening, pendingRoom, pendingInvite, pendingNotification] = await Promise.all([
    db.doc(`groupOpenings/${aliceRound.id}`).get(),
    db.doc(`chats/${aliceRound.id}`).get(),
    db.doc(`spontaneousRoundInvites/${aliceRound.id}_${dave.uid}`).get(),
    db.doc(`notifications/${aliceRound.id}_${dave.uid}`).get(),
  ]);
  if (
    pendingOpening.data()?.audienceUids?.join(',') !== alice.uid ||
    pendingRoom.exists ||
    !pendingInvite.exists ||
    !pendingNotification.exists
  ) {
    throw new Error('A pending wink exposed a room or did not create private server projections.');
  }
  const invitePreview = await expectOk('the intended recipient gets a compact round preview', () =>
    callFunction(dave.token, 'getSpontaneousRoundInvitePreview', { roundId: aliceRound.id }),
  );
  if (
    invitePreview?.state !== 'available' ||
    invitePreview?.roundId !== aliceRound.id ||
    invitePreview?.host?.uid !== alice.uid ||
    invitePreview?.memberCount !== 1 ||
    invitePreview?.memberPreview?.length !== 1
  ) {
    throw new Error('A recipient did not receive the minimal, current wink preview.');
  }
  const hiddenPreview = await expectOk('a non-recipient cannot probe a wink preview', () =>
    callFunction(charlie.token, 'getSpontaneousRoundInvitePreview', { roundId: aliceRound.id }),
  );
  if (hiddenPreview?.state !== 'unavailable') {
    throw new Error('A non-recipient could distinguish or inspect a private wink.');
  }
  await expectOk('a recipient can quietly decline a competing wink', () =>
    callFunction(dave.token, 'declineSpontaneousRound', { roundId: bobRound.id }),
  );
  const [declinedWinkInvite, declinedWinkNotification] = await Promise.all([
    db.doc(`spontaneousRoundInvites/${bobRound.id}_${dave.uid}`).get(),
    db.doc(`notifications/${bobRound.id}_${dave.uid}`).get(),
  ]);
  if (declinedWinkInvite.exists || declinedWinkNotification.exists) {
    throw new Error('Declining a wink did not retract only the recipient’s private state.');
  }
  await expectError('a non-recipient cannot accept a private wink', 'PERMISSION_DENIED', () =>
    callFunction(charlie.token, 'acceptSpontaneousRound', { roundId: aliceRound.id }),
  );
  await expectOk('returning one wink forms exactly one temporary round', () =>
    callFunction(dave.token, 'acceptSpontaneousRound', { roundId: aliceRound.id }),
  );
  await expectError('a member cannot accept a competing wink', 'FAILED_PRECONDITION', () =>
    callFunction(dave.token, 'acceptSpontaneousRound', { roundId: bobRound.id }),
  );
  const [formedOpening, formedRoom, davePresence, daveMembership, bobInvite, bobNotification] =
    await Promise.all([
      db.doc(`groupOpenings/${aliceRound.id}`).get(),
      db.doc(`chats/${aliceRound.id}`).get(),
      db.doc(`presence/${dave.uid}`).get(),
      db.doc(`spontaneousRoundMemberships/${dave.uid}`).get(),
      db.doc(`spontaneousRoundInvites/${bobRound.id}_${dave.uid}`).get(),
      db.doc(`notifications/${bobRound.id}_${dave.uid}`).get(),
    ]);
  if (
    formedOpening.data()?.memberIds?.length !== 2 ||
    formedOpening.data()?.audienceUids?.length !== 2 ||
    formedRoom.data()?.roundStatus !== 'forming' ||
    formedRoom.data()?.memberIds?.length !== 2 ||
    davePresence.exists ||
    daveMembership.data()?.roundId !== aliceRound.id ||
    bobInvite.exists ||
    bobNotification.exists
  ) {
    throw new Error('Returning a wink did not atomically form and exclusively claim the round.');
  }
  const roundMessageAt = Date.now();
  await expectOk('forming round messages keep the short round expiry', () =>
    callFunction(alice.token, 'sendChatMessage', {
      roomId: aliceRound.id,
      text: 'Lust auf einen Kaffee?',
    }),
  );
  const formingMessage = (
    await db.collection(`chats/${aliceRound.id}/messages`).limit(1).get()
  ).docs[0]?.data();
  if (
    !formingMessage?.expireAt ||
    formingMessage.expireAt.toMillis() > roundMessageAt + 31 * 60 * 1000
  ) {
    throw new Error('A forming round message received normal 30-day chat retention.');
  }
  const promotedStartsAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const promotedEndsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  await expectOk('a forming round promotes into one shared activity chat', () =>
    callFunction(alice.token, 'createActivity', {
      activityId: aliceRound.id,
      activity: {
        mode: 'soon',
        title: 'Spontaner Kaffee',
        audienceContext: { kind: 'all_friends' },
        startsAt: promotedStartsAt,
        endsAt: promotedEndsAt,
      },
    }),
  );
  const [promotedActivity, promotedRoom, deletedOpening, aliceMembership, deletedDaveMembership] =
    await Promise.all([
      db.doc(`activities/${aliceRound.id}`).get(),
      db.doc(`chats/${aliceRound.id}`).get(),
      db.doc(`groupOpenings/${aliceRound.id}`).get(),
      db.doc(`spontaneousRoundMemberships/${alice.uid}`).get(),
      db.doc(`spontaneousRoundMemberships/${dave.uid}`).get(),
    ]);
  if (
    promotedActivity.data()?.participantUids?.length !== 2 ||
    promotedRoom.data()?.type !== 'activity' ||
    promotedRoom.data()?.roundStatus !== undefined ||
    deletedOpening.exists ||
    aliceMembership.exists ||
    deletedDaveMembership.exists
  ) {
    throw new Error(
      'Round promotion did not convert membership, retention, and private guards together.',
    );
  }
  // Restore the fixture's original friendship graph for the independent guest
  // invite tests below, where Bob deliberately must not be able to invite Dave.
  await db.doc(`friendships/${friendshipId(bob.uid, dave.uid)}`).delete();
  console.log('OK winks are private, exclusive, temporary, and promote safely');

  const editedStartsAt = new Date(now + 45 * 60 * 1000).toISOString();
  const editedEndsAt = new Date(now + 3 * 60 * 60 * 1000).toISOString();
  await expectError('non-host cannot edit an activity', 'PERMISSION_DENIED', () =>
    callFunction(bob.token, 'updateActivity', {
      activityId: 'shared-activity',
      activity: { startsAt: editedStartsAt, endsAt: editedEndsAt },
    }),
  );
  await expectOk('host moves activity visibility and chat retention together', () =>
    callFunction(alice.token, 'updateActivity', {
      activityId: 'shared-activity',
      activity: {
        title: 'Kaffee im Park',
        note: 'Mit Decke',
        startsAt: editedStartsAt,
        endsAt: editedEndsAt,
        place: {
          label: 'Volkspark',
          latitude: 52.5301,
          longitude: 13.4012,
          visibility: 'pin',
        },
        maxParticipants: 3,
        category: 'kaffee',
      },
    }),
  );
  const [editedActivitySnapshot, editedRoomSnapshot] = await Promise.all([
    db.doc('activities/shared-activity').get(),
    db.doc('chats/shared-activity').get(),
  ]);
  const editedActivity = editedActivitySnapshot.data();
  const editedRoom = editedRoomSnapshot.data();
  const expectedEditedExpiry = Date.parse(editedEndsAt) + ACTIVITY_CHAT_RETENTION_MS;
  if (
    editedActivity?.title !== 'Kaffee im Park' ||
    editedActivity?.note !== 'Mit Decke' ||
    editedActivity?.place?.label !== 'Volkspark' ||
    editedActivity?.place?.visibility !== 'pin' ||
    editedActivity?.maxParticipants !== 3 ||
    editedActivity?.category !== 'kaffee' ||
    editedActivity?.startsAt !== editedStartsAt ||
    editedActivity?.endsAt !== editedEndsAt ||
    editedActivity?.visibleUntil?.toMillis?.() !== Date.parse(editedEndsAt) ||
    editedActivity?.expireAt?.toMillis?.() !== expectedEditedExpiry ||
    editedRoom?.title !== 'Kaffee im Park' ||
    editedRoom?.expireAt?.toMillis?.() !== expectedEditedExpiry
  ) {
    throw new Error('Activity edit did not keep visibility and chat lifecycle in sync.');
  }
  console.log('OK activity edit moves visibility and chat expiry together');

  const firstActivityUpdateNotifications = await waitFor(async () => {
    const snapshot = await db
      .collection('notifications')
      .where('recipientUid', '==', bob.uid)
      .where('kind', '==', 'activity_updated')
      .where('activityId', '==', 'shared-activity')
      .get();
    return snapshot.size === 1 ? snapshot : null;
  });
  const firstActivityUpdate = firstActivityUpdateNotifications.docs[0]?.data();
  if (
    firstActivityUpdate?.roomId !== 'shared-activity' ||
    !firstActivityUpdate?.body?.includes('Titel') ||
    !firstActivityUpdate?.body?.includes('Zeit') ||
    !firstActivityUpdate?.body?.includes('Ort')
  ) {
    throw new Error('Relevant activity edits did not produce one actionable participant update.');
  }
  console.log('OK relevant activity edits notify participants exactly once');

  await expectError('activity edit cannot rewrite its audience', 'INVALID_ARGUMENT', () =>
    callFunction(alice.token, 'updateActivity', {
      activityId: 'shared-activity',
      activity: { audienceUids: [alice.uid] },
    }),
  );
  await expectError('location-free edit cannot retain coordinates', 'INVALID_ARGUMENT', () =>
    callFunction(alice.token, 'updateActivity', {
      activityId: 'shared-activity',
      activity: {
        place: {
          label: 'Noch offen',
          latitude: 52.53,
          longitude: 13.4,
          visibility: 'none',
        },
      },
    }),
  );
  await db.doc('activities/shared-activity').update({ journeyUnderwayCount: 1 });
  await expectError('active journey locks the activity place', 'FAILED_PRECONDITION', () =>
    callFunction(alice.token, 'updateActivity', {
      activityId: 'shared-activity',
      activity: {
        place: {
          label: 'Alexanderplatz',
          latitude: 52.5219,
          longitude: 13.4132,
          visibility: 'pin',
        },
      },
    }),
  );
  await expectError('active journey locks the activity start time', 'FAILED_PRECONDITION', () =>
    callFunction(alice.token, 'updateActivity', {
      activityId: 'shared-activity',
      activity: { startsAt: new Date(now + 60 * 60 * 1000).toISOString() },
    }),
  );
  await db.doc('activities/shared-activity').update({
    journeyUnderwayCount: admin.firestore.FieldValue.delete(),
  });
  await new Promise((resolve) => setTimeout(resolve, 750));
  const afterJourneyCounterNotifications = await db
    .collection('notifications')
    .where('recipientUid', '==', bob.uid)
    .where('kind', '==', 'activity_updated')
    .where('activityId', '==', 'shared-activity')
    .get();
  if (afterJourneyCounterNotifications.size !== firstActivityUpdateNotifications.size) {
    throw new Error('Journey counter churn created a misleading activity update notification.');
  }
  console.log('OK journey counter changes stay out of participant update notifications');
  await expectOk('host can remove optional activity fields explicitly', () =>
    callFunction(alice.token, 'updateActivity', {
      activityId: 'shared-activity',
      activity: { note: null, place: null, maxParticipants: null, category: null },
    }),
  );
  const clearedActivity = (await db.doc('activities/shared-activity').get()).data();
  if (
    Object.prototype.hasOwnProperty.call(clearedActivity, 'note') ||
    Object.prototype.hasOwnProperty.call(clearedActivity, 'place') ||
    Object.prototype.hasOwnProperty.call(clearedActivity, 'maxParticipants') ||
    Object.prototype.hasOwnProperty.call(clearedActivity, 'category')
  ) {
    throw new Error('Activity edit did not remove optional fields cleanly.');
  }
  console.log('OK activity edit deletes optional fields without stale private data');

  const activityChatExpiry = editedRoom?.expireAt?.toMillis?.();
  await expectOk('activity message keeps the end-based chat retention', () =>
    callFunction(alice.token, 'sendChatMessage', {
      roomId: 'shared-activity',
      text: 'Ich bin gleich da.',
    }),
  );
  const activityChatAfterMessage = (await db.doc('chats/shared-activity').get()).data();
  if (
    activityChatAfterMessage?.messageCount !== 1 ||
    activityChatAfterMessage?.lastMessage?.text !== 'Ich bin gleich da.' ||
    activityChatAfterMessage?.expireAt?.toMillis?.() !== activityChatExpiry
  ) {
    throw new Error('An activity message must not extend its end-based chat retention.');
  }
  console.log('OK activity chat keeps its fixed retention window');

  const burstWindow = Math.floor(Date.now() / 60_000) * 60_000;
  await db.doc('chats/shared-activity/chatInternal/summary').set({
    roomRateWindowStart: burstWindow,
    roomRateCount: 60,
    expireAt: admin.firestore.Timestamp.fromMillis(burstWindow + 60_000),
  });
  await expectError('room message burst is capped server-side', 'RESOURCE_EXHAUSTED', () =>
    callFunction(bob.token, 'sendChatMessage', {
      roomId: 'shared-activity',
      text: 'Zu schnell',
    }),
  );
  await db.doc('chats/shared-activity/chatInternal/summary').delete();

  const repeatedText = 'Automatischer Wiederholungstext';
  const repeatedFingerprint = createHash('sha256')
    .update(repeatedText.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE'))
    .digest('hex');
  await db.doc(`rateLimits/${bob.uid}`).set({
    windowStart: burstWindow,
    count: 0,
    lastMessageAt: Date.now() - 1_000,
    lastMessageFingerprint: repeatedFingerprint,
    duplicateCount: 3,
    expireAt: admin.firestore.Timestamp.fromMillis(burstWindow + 60_000),
  });
  await expectError(
    'repeated automated chat text is capped server-side',
    'RESOURCE_EXHAUSTED',
    () =>
      callFunction(bob.token, 'sendChatMessage', {
        roomId: 'shared-activity',
        text: repeatedText,
      }),
  );
  await db.doc(`rateLimits/${bob.uid}`).delete();

  await expectError('cannot join an already ended activity', 'FAILED_PRECONDITION', () =>
    callFunction(bob.token, 'joinActivity', { activityId: 'ended-activity' }),
  );

  // ── Guest invites (participant-vouched, host opt-in) ──
  await db.doc('activities/guest-activity').set({
    hostId: alice.uid,
    mode: 'soon',
    title: 'Bouldern',
    audienceUids: [alice.uid, bob.uid],
    startsAt: sharedStartsAt,
    endsAt: sharedEndsAt,
    participantUids: [alice.uid, bob.uid],
    participants: [
      { uid: alice.uid, displayName: 'Alice Adams', initials: 'AA' },
      { uid: bob.uid, displayName: 'Bob Berger', initials: 'BB' },
    ],
    status: 'active',
    createdAt: timestamp,
    visibleUntil: admin.firestore.Timestamp.fromMillis(Date.parse(sharedEndsAt)),
    expireAt: admin.firestore.Timestamp.fromMillis(now + 26 * 60 * 60 * 1000),
  });
  await expectError(
    'guest invite is rejected while the host has not opted in',
    'FAILED_PRECONDITION',
    () =>
      callFunction(alice.token, 'inviteFriendToActivity', {
        activityId: 'guest-activity',
        targetUid: dave.uid,
      }),
  );
  await db.doc('activities/guest-activity').update({ guestInvitesEnabled: true });
  await expectError('non-participant cannot send a guest invite', 'PERMISSION_DENIED', () =>
    callFunction(charlie.token, 'inviteFriendToActivity', {
      activityId: 'guest-activity',
      targetUid: dave.uid,
    }),
  );
  await expectError(
    'participant cannot invite a stranger (not their friend)',
    'PERMISSION_DENIED',
    () =>
      callFunction(bob.token, 'inviteFriendToActivity', {
        activityId: 'guest-activity',
        targetUid: dave.uid,
      }),
  );
  const inviteResult = await expectOk('participant invites their own confirmed friend', () =>
    callFunction(alice.token, 'inviteFriendToActivity', {
      activityId: 'guest-activity',
      targetUid: dave.uid,
    }),
  );
  if (inviteResult?.state !== 'invited') {
    throw new Error(`Guest invite expected state "invited", got ${JSON.stringify(inviteResult)}`);
  }
  const invitedActivity = (await db.doc('activities/guest-activity').get()).data();
  if (!(invitedActivity?.audienceUids ?? []).includes(dave.uid)) {
    throw new Error('Guest invite did not widen the activity audience.');
  }
  const inviteNotifications = await db
    .collection('notifications')
    .where('recipientUid', '==', dave.uid)
    .where('kind', '==', 'activity_invite')
    .limit(1)
    .get();
  if (inviteNotifications.empty) {
    throw new Error('Guest invite did not create the invite notification.');
  }
  console.log('OK guest invite widens the audience and notifies the guest');
  const repeatInvite = await expectOk('repeated guest invite is idempotent', () =>
    callFunction(alice.token, 'inviteFriendToActivity', {
      activityId: 'guest-activity',
      targetUid: dave.uid,
    }),
  );
  if (repeatInvite?.state !== 'already_invited') {
    throw new Error(
      `Repeated invite expected "already_invited", got ${JSON.stringify(repeatInvite)}`,
    );
  }
  await expectOk('invited guest can join the activity', () =>
    callFunction(dave.token, 'joinActivity', { activityId: 'guest-activity' }),
  );

  await expectOk('participant gains guarded journey view access', () =>
    callFunction(bob.token, 'ensureJourneyMember', { activityId: 'shared-activity' }),
  );
  const journeyViewerMembership = await realtimeDb
    .ref(`journeys/shared-activity/members/${bob.uid}`)
    .get();
  if (journeyViewerMembership.val() !== true) {
    throw new Error('Accepted participant did not receive the guarded Journey viewer entitlement.');
  }
  console.log('OK accepted participant can receive guarded journey view access');

  await realtimeDb.ref(`journeys/shared-activity/locations/${bob.uid}`).set({
    status: 'onTheWay',
    updatedAt: Date.now(),
    expiresAt: Date.parse(editedEndsAt),
  });
  await realtimeDb.ref(`journeys/shared-activity/locations/${charlie.uid}`).set({
    status: 'onTheWay',
    updatedAt: Date.now(),
    expiresAt: Date.parse(editedEndsAt),
  });
  await expectOk('participant starts a location-free journey summary', () =>
    callFunction(bob.token, 'setJourneyLiveStatus', {
      activityId: 'shared-activity',
      underway: true,
    }),
  );
  const underwayActivity = (await db.doc('activities/shared-activity').get()).data();
  if (underwayActivity?.journeyUnderwayCount !== 1) {
    throw new Error('Journey start did not update the compact activity summary.');
  }
  console.log('OK journey start updates the compact activity summary');

  await expectError('non-participant cannot start a journey summary', 'PERMISSION_DENIED', () =>
    callFunction(charlie.token, 'setJourneyLiveStatus', {
      activityId: 'shared-activity',
      underway: true,
    }),
  );

  await expectOk('participant stops the journey summary', () =>
    callFunction(bob.token, 'setJourneyLiveStatus', {
      activityId: 'shared-activity',
      underway: false,
    }),
  );
  const stoppedActivity = (await db.doc('activities/shared-activity').get()).data();
  if (stoppedActivity?.journeyUnderwayCount !== 0) {
    throw new Error('Journey stop did not clear the compact activity summary.');
  }
  console.log('OK journey stop clears the compact activity summary');

  await Promise.all([
    db.doc(`activities/cancel-activity/journeyStates/${alice.uid}`).set({
      startedAt: timestamp,
      expireAt: admin.firestore.Timestamp.fromMillis(now + 60 * 60 * 1000),
    }),
    realtimeDb.ref('journeys/cancel-activity').set({
      members: { [alice.uid]: true },
      locations: { [alice.uid]: { lat: 52.5, lng: 13.4, updatedAt: now } },
    }),
  ]);
  const cancellationStartedAt = Date.now();
  await expectOk('host cancels an activity and revokes its journey', () =>
    callFunction(alice.token, 'cancelActivity', { activityId: 'cancel-activity' }),
  );
  const [cancelledActivitySnapshot, cancelledRoomSnapshot, journeySnapshot, journeyStateSnapshot] =
    await Promise.all([
      db.doc('activities/cancel-activity').get(),
      db.doc('chats/cancel-activity').get(),
      realtimeDb.ref('journeys/cancel-activity').get(),
      db.doc(`activities/cancel-activity/journeyStates/${alice.uid}`).get(),
    ]);
  const cancelledActivity = cancelledActivitySnapshot.data();
  const cancelledRoom = cancelledRoomSnapshot.data();
  if (
    cancelledActivity?.status !== 'cancelled' ||
    cancelledActivity?.journeyUnderwayCount !== 0 ||
    Math.abs((cancelledActivity?.visibleUntil?.toMillis?.() ?? 0) - cancellationStartedAt) >
      60_000 ||
    Math.abs(
      (cancelledActivity?.expireAt?.toMillis?.() ?? 0) -
        (cancellationStartedAt + ACTIVITY_CHAT_RETENTION_MS),
    ) > 60_000 ||
    Math.abs((cancelledRoom?.expireAt?.toMillis?.() ?? 0) - cancellationStartedAt) > 60_000 ||
    journeySnapshot.exists() ||
    // Admin-SDK Firestore snapshot: `exists` is a property (the RTDB snapshot
    // one line up has it as a method).
    journeyStateSnapshot.exists
  ) {
    throw new Error('Cancellation did not close the planned activity lifecycle cleanly.');
  }
  console.log('OK cancellation removes live journey data and closes its chat immediately');

  await waitFor(async () => {
    const snapshot = await db
      .collection('notifications')
      .where('recipientUid', '==', bob.uid)
      .where('kind', '==', 'activity_cancelled')
      .where('activityId', '==', 'cancel-activity')
      .get();
    return snapshot.empty ? null : snapshot;
  });
  const cancellationUpdates = await db
    .collection('notifications')
    .where('recipientUid', '==', bob.uid)
    .where('kind', '==', 'activity_updated')
    .where('activityId', '==', 'cancel-activity')
    .get();
  if (!cancellationUpdates.empty) {
    throw new Error('Activity cancellation also produced a redundant update notification.');
  }
  console.log('OK cancellation emits its dedicated notification without a duplicate update');

  const nowJoinActivityId = 'now-join-reminder-activity';
  await db.doc(`activities/${nowJoinActivityId}`).set({
    hostId: alice.uid,
    mode: 'now',
    title: 'Spontan im Park',
    audienceUids: [alice.uid, bob.uid, charlie.uid],
    startsAt: new Date(now - 5 * 60 * 1000).toISOString(),
    endsAt: new Date(now + 60 * 60 * 1000).toISOString(),
    place: {
      label: 'Volkspark',
      latitude: 52.5301,
      longitude: 13.4012,
      visibility: 'pin',
    },
    participantUids: [alice.uid],
    participants: [{ uid: alice.uid, displayName: 'Alice Adams', initials: 'AA' }],
    status: 'active',
    createdAt: timestamp,
    visibleUntil: admin.firestore.Timestamp.fromMillis(now + 60 * 60 * 1000),
    expireAt: admin.firestore.Timestamp.fromMillis(now + 13 * 60 * 60 * 1000),
  });
  await expectOk('user disables journey reminders', () =>
    callFunction(bob.token, 'setJourneyRemindersEnabled', { enabled: false }),
  );
  await expectOk('opted-out user joins a running activity', () =>
    callFunction(bob.token, 'joinActivity', { activityId: nowJoinActivityId }),
  );
  const optedOutJourneyReminders = await db
    .collection('notifications')
    .where('recipientUid', '==', bob.uid)
    .where('kind', '==', 'journey_reminder')
    .where('activityId', '==', nowJoinActivityId)
    .get();
  if (!optedOutJourneyReminders.empty) {
    throw new Error('Joining a running activity ignored the journey reminder opt-out.');
  }
  await expectOk('default-enabled user joins a running activity', () =>
    callFunction(charlie.token, 'joinActivity', { activityId: nowJoinActivityId }),
  );
  const defaultJourneyReminders = await db
    .collection('notifications')
    .where('recipientUid', '==', charlie.uid)
    .where('kind', '==', 'journey_reminder')
    .where('activityId', '==', nowJoinActivityId)
    .get();
  if (defaultJourneyReminders.size !== 1) {
    throw new Error('A default-enabled running-activity join did not create one journey reminder.');
  }
  await waitFor(async () => {
    const snapshot = await db
      .collection('notifications')
      .where('recipientUid', '==', alice.uid)
      .where('kind', '==', 'activity_joined')
      .where('activityId', '==', nowJoinActivityId)
      .get();
    return snapshot.size === 2 ? snapshot : null;
  });
  const joinUpdateNotifications = await db
    .collection('notifications')
    .where('kind', '==', 'activity_updated')
    .where('activityId', '==', nowJoinActivityId)
    .get();
  if (!joinUpdateNotifications.empty) {
    throw new Error('Joining an activity produced a misleading activity update notification.');
  }
  console.log('OK running-activity joins honor reminder opt-out without duplicate update notices');

  const leaveJourneyActivityId = 'leave-journey-activity';
  await Promise.all([
    db.doc(`activities/${leaveJourneyActivityId}`).set({
      hostId: alice.uid,
      mode: 'soon',
      title: 'Anreise verlassen',
      audienceUids: [alice.uid, bob.uid],
      participantUids: [alice.uid, bob.uid],
      participants: [
        { uid: alice.uid, displayName: 'Alice Adams', initials: 'AA' },
        { uid: bob.uid, displayName: 'Bob Berger', initials: 'BB' },
      ],
      status: 'active',
      journeyUnderwayCount: 1,
      createdAt: timestamp,
      visibleUntil: admin.firestore.Timestamp.fromMillis(now + 60 * 60 * 1000),
      expireAt: admin.firestore.Timestamp.fromMillis(now + 2 * 60 * 60 * 1000),
    }),
    db.doc(`chats/${leaveJourneyActivityId}`).set({
      type: 'activity',
      title: 'Anreise verlassen',
      memberIds: [alice.uid, bob.uid],
      messageCount: 0,
      readCount: {},
      createdAt: timestamp,
      expireAt: admin.firestore.Timestamp.fromMillis(now + 2 * 60 * 60 * 1000),
    }),
    db.doc(`activities/${leaveJourneyActivityId}/journeyStates/${bob.uid}`).set({
      startedAt: timestamp,
      expireAt: admin.firestore.Timestamp.fromMillis(now + 2 * 60 * 60 * 1000),
    }),
    realtimeDb.ref(`journeys/${leaveJourneyActivityId}`).set({
      expiresAt: now + 2 * 60 * 60 * 1000,
      members: { [alice.uid]: true, [bob.uid]: true },
      locations: {
        [bob.uid]: {
          lat: 52.5,
          lng: 13.4,
          status: 'onTheWay',
          updatedAt: now,
          expiresAt: now + 60 * 60 * 1000,
        },
      },
    }),
  ]);
  await expectOk('leaving an activity revokes its live journey access', () =>
    callFunction(bob.token, 'leaveActivity', { activityId: leaveJourneyActivityId }),
  );
  const [
    leftActivitySnapshot,
    leftRoomSnapshot,
    leftJourneyState,
    leftJourneyMember,
    leftJourneyLocation,
  ] = await Promise.all([
    db.doc(`activities/${leaveJourneyActivityId}`).get(),
    db.doc(`chats/${leaveJourneyActivityId}`).get(),
    db.doc(`activities/${leaveJourneyActivityId}/journeyStates/${bob.uid}`).get(),
    realtimeDb.ref(`journeys/${leaveJourneyActivityId}/members/${bob.uid}`).get(),
    realtimeDb.ref(`journeys/${leaveJourneyActivityId}/locations/${bob.uid}`).get(),
  ]);
  if (
    leftActivitySnapshot.data()?.participantUids?.includes(bob.uid) ||
    leftActivitySnapshot.data()?.journeyUnderwayCount !== 0 ||
    leftRoomSnapshot.data()?.memberIds?.includes(bob.uid) ||
    leftJourneyState.exists ||
    leftJourneyMember.exists() ||
    leftJourneyLocation.exists()
  ) {
    throw new Error('Leaving an Activity left a participant or Journey entitlement behind.');
  }
  console.log('OK leaving an activity removes all live journey access');

  await expectOk('sets shared-activity request policy', () =>
    callFunction(bob.token, 'setFriendRequestPolicy', { policy: 'shared_activity' }),
  );
  await expectError('username request respects shared-activity policy', 'PERMISSION_DENIED', () =>
    callFunction(alice.token, 'sendFriendRequest', { username: 'bob' }),
  );
  await expectError('context request requires the exact shared activity', 'PERMISSION_DENIED', () =>
    callFunction(alice.token, 'sendFriendRequest', {
      targetUid: bob.uid,
      activityId: 'other-activity',
    }),
  );

  const beforeFriendship = await expectOk('non-friend chat card is minimal', () =>
    callFunction(alice.token, 'getRoomMemberProfiles', { roomId: 'room-shared' }),
  );
  const nonFriendBob = beforeFriendship.members.find((member) => member.uid === bob.uid);
  if (!nonFriendBob || nonFriendBob.username || nonFriendBob.avatarUrl) {
    throw new Error('Non-friend chat card leaked profile details.');
  }

  const [aliceBeforeRequest, bobBeforeRequest] = await Promise.all([
    db.doc(`users/${alice.uid}`).get(),
    db.doc(`users/${bob.uid}`).get(),
  ]);
  const aliceFriendshipsVersionBeforeRequest = aliceBeforeRequest.data()?.friendshipsVersion ?? 0;
  const bobFriendshipsVersionBeforeRequest = bobBeforeRequest.data()?.friendshipsVersion ?? 0;

  await expectOk('shared activity creates a pending request', () =>
    callFunction(alice.token, 'sendFriendRequest', {
      targetUid: bob.uid,
      activityId: 'shared-activity',
    }),
  );
  const relationshipRef = db.doc(`friendships/${friendshipId(alice.uid, bob.uid)}`);
  const pending = (await relationshipRef.get()).data();
  if (pending?.profiles?.some((profile) => profile.username || profile.avatarUrl)) {
    throw new Error('Pending friendship leaked profile details.');
  }
  const [aliceAfterRequest, bobAfterRequest] = await Promise.all([
    db.doc(`users/${alice.uid}`).get(),
    db.doc(`users/${bob.uid}`).get(),
  ]);
  if (
    aliceAfterRequest.data()?.friendshipsVersion !== aliceFriendshipsVersionBeforeRequest + 1 ||
    bobAfterRequest.data()?.friendshipsVersion !== bobFriendshipsVersionBeforeRequest + 1
  ) {
    throw new Error('A new friendship request did not invalidate both friendship caches.');
  }
  const incomingRequestNotificationDocs = (
    await db.collection('notifications').where('recipientUid', '==', bob.uid).get()
  ).docs.filter((snapshot) => snapshot.data()?.title === 'Neue Freundschaftsanfrage');
  if (incomingRequestNotificationDocs.length) {
    throw new Error('Incoming friendship request was duplicated as a notification document.');
  }
  await expectOk('retrying the same pending request stays idempotent', () =>
    callFunction(alice.token, 'sendFriendRequest', {
      targetUid: bob.uid,
      activityId: 'shared-activity',
    }),
  );
  const [aliceAfterRequestRetry, bobAfterRequestRetry] = await Promise.all([
    db.doc(`users/${alice.uid}`).get(),
    db.doc(`users/${bob.uid}`).get(),
  ]);
  if (
    aliceAfterRequestRetry.data()?.friendshipsVersion !==
      aliceFriendshipsVersionBeforeRequest + 1 ||
    bobAfterRequestRetry.data()?.friendshipsVersion !== bobFriendshipsVersionBeforeRequest + 1
  ) {
    throw new Error('Retrying a pending friendship request created another relation change.');
  }
  console.log('OK pending friendship stores contact-only snapshots');
  console.log('OK incoming friendship requests stay single-source and idempotent');

  await expectOk('request recipient can accept', () =>
    callFunction(bob.token, 'respondToFriendRequest', {
      friendshipId: relationshipRef.id,
      accept: true,
    }),
  );
  const accepted = (await relationshipRef.get()).data();
  if (accepted?.status !== 'accepted' || !accepted.profiles?.every((profile) => profile.username)) {
    throw new Error('Accepted friendship did not receive full friend snapshots.');
  }
  const [aliceAfterAcceptance, bobAfterAcceptance] = await Promise.all([
    db.doc(`users/${alice.uid}`).get(),
    db.doc(`users/${bob.uid}`).get(),
  ]);
  if (
    aliceAfterAcceptance.data()?.friendshipsVersion !== aliceFriendshipsVersionBeforeRequest + 2 ||
    bobAfterAcceptance.data()?.friendshipsVersion !== bobFriendshipsVersionBeforeRequest + 2
  ) {
    throw new Error('Accepting a request did not invalidate both friendship caches.');
  }
  console.log('OK accepted friendship receives full snapshots');

  const afterFriendship = await expectOk('friend chat card includes friend details', () =>
    callFunction(alice.token, 'getRoomMemberProfiles', { roomId: 'room-shared' }),
  );
  const friendBob = afterFriendship.members.find((member) => member.uid === bob.uid);
  if (!friendBob?.username || !friendBob.avatarUrl) {
    throw new Error('Friend chat card did not include allowed details.');
  }

  await expectError('non-friend cannot be selected for Safety', 'PERMISSION_DENIED', () =>
    callFunction(charlie.token, 'startSafetySession', { audienceUids: [bob.uid] }),
  );

  await expectOk('friend starts a server-owned Safety session', () =>
    callFunction(alice.token, 'startSafetySession', { audienceUids: [bob.uid] }),
  );
  const safetySession = (await realtimeDb.ref(`heimwege/${alice.uid}`).get()).val();
  if (!safetySession || safetySession.audienceUids?.[bob.uid] !== true) {
    throw new Error('Safety session did not store the validated initial friend audience.');
  }
  const initialSafetyExpiry = Number(safetySession.expiresAt);
  if (
    initialSafetyExpiry < Date.now() + 119 * 60 * 1000 ||
    initialSafetyExpiry > Date.now() + 121 * 60 * 1000 ||
    Number(safetySession.retainUntil) !== initialSafetyExpiry + 3 * 60 * 1000
  ) {
    throw new Error('Safety session did not receive the two-hour default and blue retention.');
  }
  const requestNotifications = await db
    .collection('notifications')
    .where('recipientUid', '==', bob.uid)
    .where('kind', '==', 'safety_request')
    .get();
  if (requestNotifications.empty) {
    throw new Error('Safety start did not create the companion request notification.');
  }
  console.log('OK Safety start creates a companion request');

  await expectError('owner cannot add a non-friend companion', 'PERMISSION_DENIED', () =>
    callFunction(alice.token, 'updateSafetyAudience', {
      addUids: [charlie.uid],
      removeUids: [],
    }),
  );
  await expectOk('owner explicitly adds a confirmed friend companion', () =>
    callFunction(alice.token, 'updateSafetyAudience', {
      addUids: [dave.uid],
      removeUids: [],
    }),
  );
  const [addedAudience, addedIndex] = await Promise.all([
    realtimeDb.ref(`heimwege/${alice.uid}/audienceUids/${dave.uid}`).get(),
    realtimeDb.ref(`heimwegeIndex/${dave.uid}/${alice.uid}`).get(),
  ]);
  if (addedAudience.val() !== true || addedIndex.val() !== true) {
    throw new Error('Adding a Safety companion did not update audience and fan-out atomically.');
  }
  const addedRequestNotifications = await db
    .collection('notifications')
    .where('recipientUid', '==', dave.uid)
    .where('kind', '==', 'safety_request')
    .get();
  if (addedRequestNotifications.empty) {
    throw new Error('A newly added blue companion did not receive a Safety request.');
  }
  console.log('OK owner can explicitly add a companion during a blue session');

  await expectOk('owner explicitly revokes a companion', () =>
    callFunction(alice.token, 'updateSafetyAudience', {
      addUids: [],
      removeUids: [dave.uid],
    }),
  );
  const [removedAudience, removedIndex] = await Promise.all([
    realtimeDb.ref(`heimwege/${alice.uid}/audienceUids/${dave.uid}`).get(),
    realtimeDb.ref(`heimwegeIndex/${dave.uid}/${alice.uid}`).get(),
  ]);
  if (removedAudience.exists() || removedIndex.exists()) {
    throw new Error('Revoking a Safety companion left audience or fan-out access behind.');
  }
  await expectError('owner cannot remove the final companion', 'FAILED_PRECONDITION', () =>
    callFunction(alice.token, 'updateSafetyAudience', {
      addUids: [],
      removeUids: [bob.uid],
    }),
  );
  console.log('OK Safety audience changes preserve at least one companion');

  await expectError('early Safety extension is rejected', 'FAILED_PRECONDITION', () =>
    callFunction(alice.token, 'extendSafetySession', {}),
  );
  const extensionBase = Date.now() + 9 * 60 * 1000;
  await realtimeDb.ref(`heimwege/${alice.uid}`).update({
    expiresAt: extensionBase,
    retainUntil: extensionBase + 3 * 60 * 1000,
  });
  const extension = await expectOk('owner explicitly extends Safety by one hour', () =>
    callFunction(alice.token, 'extendSafetySession', {}),
  );
  if (extension.expiresAt !== extensionBase + 60 * 60 * 1000) {
    throw new Error('Safety extension did not add exactly one hour.');
  }

  const taskSafetyExpiresAt = Date.now() + 5 * 60 * 1000;
  await realtimeDb.ref(`heimwege/${dave.uid}`).set({
    displayName: 'Dave Dietrich',
    initials: 'DD',
    status: 'blue',
    startedAt: Date.now() - 60 * 60 * 1000,
    updatedAt: Date.now(),
    expiresAt: taskSafetyExpiresAt,
    retainUntil: taskSafetyExpiresAt + 3 * 60 * 1000,
    audienceUids: { [alice.uid]: true },
    companions: {},
  });
  // Give the separate Functions worker one RTDB-emulator turn to observe the write.
  await new Promise((resolve) => setTimeout(resolve, 250));
  const firstSafetyTask = await callTask('dispatchSafetyAutoExtend', {
    uid: dave.uid,
    expiresAt: taskSafetyExpiresAt,
  });
  if (!firstSafetyTask.ok) {
    throw new Error(
      `Safety auto-extension task failed with ${firstSafetyTask.status}: ${JSON.stringify(firstSafetyTask.body)}`,
    );
  }
  const extendedTaskSafety = (await realtimeDb.ref(`heimwege/${dave.uid}`).get()).val();
  if (
    extendedTaskSafety?.expiresAt !== taskSafetyExpiresAt + 20 * 60 * 1000 ||
    extendedTaskSafety?.autoExtendCount !== 1
  ) {
    throw new Error(
      `Safety auto-extension task did not extend exactly once: ${JSON.stringify({
        expectedExpiresAt: taskSafetyExpiresAt + 20 * 60 * 1000,
        actualExpiresAt: extendedTaskSafety?.expiresAt,
        actualCount: extendedTaskSafety?.autoExtendCount,
        taskResult: firstSafetyTask.body,
      })}`,
    );
  }
  const repeatedSafetyTask = await callTask('dispatchSafetyAutoExtend', {
    uid: dave.uid,
    expiresAt: taskSafetyExpiresAt,
  });
  const repeatedTaskSafety = (await realtimeDb.ref(`heimwege/${dave.uid}`).get()).val();
  if (!repeatedSafetyTask.ok || repeatedTaskSafety?.autoExtendCount !== 1) {
    throw new Error('Stale Safety auto-extension task was not a no-op.');
  }
  console.log('OK Safety auto-extension tasks reject stale windows');

  await expectError(
    'stranger cannot confirm another person’s Safety session',
    'PERMISSION_DENIED',
    () => callFunction(charlie.token, 'confirmSafetyCompanion', { ownerUid: alice.uid }),
  );
  await expectOk('selected companion confirms reachability', () =>
    callFunction(bob.token, 'confirmSafetyCompanion', { ownerUid: alice.uid }),
  );
  const confirmation = (
    await realtimeDb.ref(`heimwege/${alice.uid}/companions/${bob.uid}`).get()
  ).val();
  if (typeof confirmation?.confirmedAt !== 'number') {
    throw new Error('Companion confirmation was not persisted.');
  }
  const confirmationNotifications = await db
    .collection('notifications')
    .where('recipientUid', '==', alice.uid)
    .where('kind', '==', 'safety_confirmed')
    .get();
  if (confirmationNotifications.empty) {
    throw new Error('Safety confirmation did not notify the session owner.');
  }
  console.log('OK Safety confirmation is visible to the owner');

  await expectOk('companion withdraws reachability', () =>
    callFunction(bob.token, 'withdrawSafetyCompanion', { ownerUid: alice.uid }),
  );
  const withdrawnConfirmation = (
    await realtimeDb.ref(`heimwege/${alice.uid}/companions/${bob.uid}`).get()
  ).val();
  if (
    typeof withdrawnConfirmation?.unavailableAt !== 'number' ||
    withdrawnConfirmation.unavailableAt <= withdrawnConfirmation.confirmedAt
  ) {
    throw new Error('Withdrawing reachability did not invalidate the confirmation.');
  }
  const unavailableNotifications = await db
    .collection('notifications')
    .where('recipientUid', '==', alice.uid)
    .where('kind', '==', 'safety_unavailable')
    .get();
  if (unavailableNotifications.empty) {
    throw new Error('Withdrawing reachability did not notify the session owner.');
  }
  console.log('OK Safety reachability can be withdrawn explicitly');

  await expectOk('owner reports feeling unsafe', () =>
    callFunction(alice.token, 'setSafetyStatus', { status: 'orange' }),
  );
  const orangeSession = (await realtimeDb.ref(`heimwege/${alice.uid}`).get()).val();
  if (
    orangeSession?.status !== 'orange' ||
    typeof orangeSession?.checkIn?.requestedAt !== 'number' ||
    typeof orangeSession?.checkIn?.dueAt !== 'number' ||
    orangeSession?.alert?.status !== 'orange' ||
    typeof orangeSession?.alert?.at !== 'number' ||
    orangeSession?.retainUntil !== orangeSession?.expiresAt + 30 * 60 * 1000
  ) {
    throw new Error('Orange Safety state did not create its server-owned check-in window.');
  }
  const orangeNotifications = await db
    .collection('notifications')
    .where('recipientUid', '==', bob.uid)
    .where('kind', '==', 'safety_unwell')
    .get();
  if (orangeNotifications.empty) {
    throw new Error('Orange Safety state did not alert the current companion audience.');
  }
  console.log('OK Orange Safety state alerts companions');
  const orangeAlertAt = orangeSession.alert.at;
  const orangeNotification = orangeNotifications.docs[0].data();
  if (orangeNotification.safetyAlertAt !== orangeAlertAt) {
    throw new Error('Orange notification is not bound to the current alert generation.');
  }
  await expectError('stranger cannot acknowledge a Safety alert', 'PERMISSION_DENIED', () =>
    callFunction(charlie.token, 'confirmSafetyAlert', {
      ownerUid: alice.uid,
      alertAt: orangeAlertAt,
    }),
  );
  await expectOk('selected companion acknowledges the Orange alert', () =>
    callFunction(bob.token, 'confirmSafetyAlert', {
      ownerUid: alice.uid,
      alertAt: orangeAlertAt,
    }),
  );
  const orangeAcknowledgement = (
    await realtimeDb.ref(`heimwege/${alice.uid}/companions/${bob.uid}`).get()
  ).val();
  if (
    orangeAcknowledgement?.alertAt !== orangeAlertAt ||
    typeof orangeAcknowledgement?.alertAcknowledgedAt !== 'number'
  ) {
    throw new Error('Orange acknowledgement was not bound to the current alert.');
  }
  const alertSeenNotifications = await db
    .collection('notifications')
    .where('recipientUid', '==', alice.uid)
    .where('kind', '==', 'safety_alert_seen')
    .get();
  if (
    alertSeenNotifications.empty ||
    alertSeenNotifications.docs[0].data().safetyAlertAt !== orangeAlertAt
  ) {
    throw new Error('Alert acknowledgement was not surfaced to the session owner.');
  }
  console.log('OK Orange requires a fresh companion acknowledgement');

  await expectOk('owner adds another companion during the Orange alert', () =>
    callFunction(alice.token, 'updateSafetyAudience', {
      addUids: [dave.uid],
      removeUids: [],
    }),
  );
  const addedOrangeNotifications = await db
    .collection('notifications')
    .where('recipientUid', '==', dave.uid)
    .where('kind', '==', 'safety_unwell')
    .get();
  if (
    addedOrangeNotifications.empty ||
    addedOrangeNotifications.docs[0].data().safetyAlertAt !== orangeAlertAt
  ) {
    throw new Error('A companion added during Orange did not receive the current alert.');
  }
  await expectOk('new Orange companion acknowledges the current alert', () =>
    callFunction(dave.token, 'confirmSafetyAlert', {
      ownerUid: alice.uid,
      alertAt: orangeAlertAt,
    }),
  );
  await expectOk('owner revokes the newly added Orange companion', () =>
    callFunction(alice.token, 'updateSafetyAudience', {
      addUids: [],
      removeUids: [dave.uid],
    }),
  );
  const removedOrangeCompanion = await realtimeDb
    .ref(`heimwege/${alice.uid}/companions/${dave.uid}`)
    .get();
  if (removedOrangeCompanion.exists()) {
    throw new Error('Revoking a companion did not remove their confirmation state.');
  }
  await expectError(
    'removed companion cannot acknowledge the alert again',
    'PERMISSION_DENIED',
    () =>
      callFunction(dave.token, 'confirmSafetyAlert', {
        ownerUid: alice.uid,
        alertAt: orangeAlertAt,
      }),
  );
  console.log('OK Orange additions require a current acknowledgement and can be revoked');

  await expectOk('owner deliberately sends a help alert', () =>
    callFunction(alice.token, 'setSafetyStatus', { status: 'red' }),
  );
  const redSession = (await realtimeDb.ref(`heimwege/${alice.uid}`).get()).val();
  const redAlertAt = redSession?.alert?.at;
  if (
    redSession?.alert?.status !== 'red' ||
    typeof redAlertAt !== 'number' ||
    redAlertAt === orangeAlertAt
  ) {
    throw new Error('Red Safety state did not create a fresh alert generation.');
  }
  const emergencyNotifications = await db
    .collection('notifications')
    .where('recipientUid', '==', bob.uid)
    .where('kind', '==', 'safety_emergency')
    .get();
  if (emergencyNotifications.empty) {
    throw new Error('Red Safety state did not alert the current companion audience.');
  }
  if (emergencyNotifications.docs[0].data().safetyAlertAt !== redAlertAt) {
    throw new Error('Red notification is not bound to the fresh alert generation.');
  }
  console.log('OK Red Safety state alerts companions');
  await expectError('an Orange acknowledgement cannot confirm Red', 'FAILED_PRECONDITION', () =>
    callFunction(bob.token, 'confirmSafetyAlert', {
      ownerUid: alice.uid,
      alertAt: orangeAlertAt,
    }),
  );
  await expectOk('selected companion acknowledges the Red alert', () =>
    callFunction(bob.token, 'confirmSafetyAlert', { ownerUid: alice.uid, alertAt: redAlertAt }),
  );
  const redAcknowledgement = (
    await realtimeDb.ref(`heimwege/${alice.uid}/companions/${bob.uid}`).get()
  ).val();
  if (redAcknowledgement?.alertAt !== redAlertAt) {
    throw new Error('Red acknowledgement did not replace the stale Orange acknowledgement.');
  }
  console.log('OK Red requires another fresh companion acknowledgement');

  await expectOk('owner sends an all-clear update', () =>
    callFunction(alice.token, 'setSafetyStatus', { status: 'blue' }),
  );
  const resolvedSession = (await realtimeDb.ref(`heimwege/${alice.uid}`).get()).val();
  if (resolvedSession?.alert) {
    throw new Error('Safety all-clear left an active alert generation behind.');
  }
  const resolvedNotifications = await db
    .collection('notifications')
    .where('recipientUid', '==', bob.uid)
    .where('kind', '==', 'safety_resolved')
    .get();
  if (resolvedNotifications.empty) {
    throw new Error('Safety all-clear did not notify the current companion audience.');
  }
  const resolvedBeforeExplicitEnd = resolvedNotifications.size;
  console.log('OK Safety all-clear notifies companions');

  await expectOk('owner ends Safety session and fan-out', () =>
    callFunction(alice.token, 'endSafetySession', {}),
  );
  const [endedSession, endedIndex] = await Promise.all([
    realtimeDb.ref(`heimwege/${alice.uid}`).get(),
    realtimeDb.ref(`heimwegeIndex/${bob.uid}/${alice.uid}`).get(),
  ]);
  if (endedSession.exists() || endedIndex.exists()) {
    throw new Error('Safety end left live session or fan-out data behind.');
  }
  console.log('OK Safety end removes all live data');

  const resolvedAfterExplicitEnd = await db
    .collection('notifications')
    .where('recipientUid', '==', bob.uid)
    .where('kind', '==', 'safety_resolved')
    .get();
  if (resolvedAfterExplicitEnd.size !== resolvedBeforeExplicitEnd + 1) {
    throw new Error('Explicit Safety end did not create exactly one safe-arrival notification.');
  }
  await new Promise((resolve) => setTimeout(resolve, 750));
  const resolvedAfterDeleteTrigger = await db
    .collection('notifications')
    .where('recipientUid', '==', bob.uid)
    .where('kind', '==', 'safety_resolved')
    .get();
  if (resolvedAfterDeleteTrigger.size !== resolvedAfterExplicitEnd.size) {
    throw new Error('Generic Safety deletion duplicated the explicit safe-arrival notification.');
  }
  console.log('OK explicit Safety end sends one safe-arrival notification');
  console.log('OK generic Safety delete cleanup never invents a resolved event');

  const daveResolvedBeforeRevocation = await db
    .collection('notifications')
    .where('recipientUid', '==', dave.uid)
    .where('kind', '==', 'safety_resolved')
    .get();
  await expectOk('friend starts another Safety session before removing friendship', () =>
    callFunction(alice.token, 'startSafetySession', { audienceUids: [dave.uid] }),
  );
  const [aliceBeforeRemoval, daveBeforeRemoval] = await Promise.all([
    db.doc(`users/${alice.uid}`).get(),
    db.doc(`users/${dave.uid}`).get(),
  ]);
  const aliceFriendshipsVersionBeforeRemoval = aliceBeforeRemoval.data()?.friendshipsVersion ?? 0;
  const daveFriendshipsVersionBeforeRemoval = daveBeforeRemoval.data()?.friendshipsVersion ?? 0;
  await expectOk('removing friendship revokes Safety access immediately', () =>
    callFunction(alice.token, 'removeFriend', { uid: dave.uid }),
  );
  const [revokedSession, revokedIndex, aliceAfterRemoval, daveAfterRemoval] = await Promise.all([
    realtimeDb.ref(`heimwege/${alice.uid}`).get(),
    realtimeDb.ref(`heimwegeIndex/${dave.uid}/${alice.uid}`).get(),
    db.doc(`users/${alice.uid}`).get(),
    db.doc(`users/${dave.uid}`).get(),
  ]);
  if (
    revokedSession.exists() ||
    revokedIndex.exists() ||
    aliceAfterRemoval.data()?.friendshipsVersion !== aliceFriendshipsVersionBeforeRemoval + 1 ||
    daveAfterRemoval.data()?.friendshipsVersion !== daveFriendshipsVersionBeforeRemoval + 1
  ) {
    throw new Error('Removing friendship left an active Safety entitlement behind.');
  }
  await new Promise((resolve) => setTimeout(resolve, 750));
  const daveResolvedAfterRevocation = await db
    .collection('notifications')
    .where('recipientUid', '==', dave.uid)
    .where('kind', '==', 'safety_resolved')
    .get();
  if (daveResolvedAfterRevocation.size !== daveResolvedBeforeRevocation.size) {
    throw new Error('Safety revocation was incorrectly reported as a safe arrival.');
  }
  console.log('OK removing friendship revokes the live Safety entitlement');

  const [frank, gina] = await Promise.all([createTestUser(), createTestUser()]);
  const blockTimestamp = admin.firestore.Timestamp.now();
  const blockExpiry = Date.now() + 2 * 60 * 60 * 1000;
  const frankProfile = { uid: frank.uid, displayName: 'Frank Fischer', initials: 'FF' };
  const ginaProfile = { uid: gina.uid, displayName: 'Gina Graf', initials: 'GG' };
  const blockBatch = db.batch();
  [
    [frank, frankProfile, 'frank'],
    [gina, ginaProfile, 'gina'],
  ].forEach(([person, profile, username]) => {
    blockBatch.set(db.doc(`users/${person.uid}`), {
      ...profile,
      username,
      profileVisibility: 'friends',
      friendRequestPolicy: 'anyone',
      closeFriendUids: [person.uid === frank.uid ? gina.uid : frank.uid],
      friendshipsVersion: 0,
      createdAt: blockTimestamp,
    });
    blockBatch.set(db.doc(`publicProfiles/${person.uid}`), {
      ...profile,
      username,
      createdAt: blockTimestamp,
    });
  });
  blockBatch.set(db.doc(`friendships/${friendshipId(frank.uid, gina.uid)}`), {
    participantUids: [frank.uid, gina.uid].sort(),
    requesterUid: frank.uid,
    status: 'accepted',
    profiles: [frankProfile, ginaProfile],
    createdAt: blockTimestamp,
    updatedAt: blockTimestamp,
  });
  blockBatch.set(db.doc(`presence/${frank.uid}`), { audienceUids: [frank.uid, gina.uid] });
  blockBatch.set(db.doc(`presence/${gina.uid}`), { audienceUids: [frank.uid, gina.uid] });
  [
    ['block-hosted-by-frank', frank.uid, gina.uid, frankProfile, ginaProfile],
    ['block-hosted-by-gina', gina.uid, frank.uid, ginaProfile, frankProfile],
  ].forEach(([activityId, hostUid, guestUid, hostProfile, guestProfile]) => {
    blockBatch.set(db.doc(`activities/${activityId}`), {
      hostId: hostUid,
      mode: 'soon',
      title: 'Getrennter Raum',
      audienceUids: [frank.uid, gina.uid],
      participantUids: [hostUid, guestUid],
      participants: [hostProfile, guestProfile],
      status: 'active',
      journeyUnderwayCount: 1,
      createdAt: blockTimestamp,
      visibleUntil: admin.firestore.Timestamp.fromMillis(blockExpiry - 24 * 60 * 60 * 1000),
      expireAt: admin.firestore.Timestamp.fromMillis(blockExpiry),
    });
    blockBatch.set(db.doc(`chats/${activityId}`), {
      type: 'activity',
      title: 'Getrennter Raum',
      memberIds: [hostUid, guestUid],
      messageCount: 0,
      readCount: {},
      createdAt: blockTimestamp,
      expireAt: admin.firestore.Timestamp.fromMillis(blockExpiry),
    });
  });
  blockBatch.set(db.doc(`activities/block-hosted-by-frank/journeyStates/${gina.uid}`), {
    startedAt: blockTimestamp,
    expireAt: admin.firestore.Timestamp.fromMillis(blockExpiry),
  });
  blockBatch.set(db.doc(`activities/block-hosted-by-gina/journeyStates/${frank.uid}`), {
    startedAt: blockTimestamp,
    expireAt: admin.firestore.Timestamp.fromMillis(blockExpiry),
  });
  await blockBatch.commit();
  await realtimeDb.ref().update({
    'journeys/block-hosted-by-frank': {
      expiresAt: blockExpiry,
      members: { [frank.uid]: true, [gina.uid]: true },
      locations: {
        [gina.uid]: {
          lat: 52.5,
          lng: 13.4,
          status: 'onTheWay',
          updatedAt: now,
          expiresAt: blockExpiry,
        },
      },
    },
    'journeys/block-hosted-by-gina': {
      expiresAt: blockExpiry,
      members: { [frank.uid]: true, [gina.uid]: true },
      locations: {
        [frank.uid]: {
          lat: 52.5,
          lng: 13.4,
          status: 'onTheWay',
          updatedAt: now,
          expiresAt: blockExpiry,
        },
      },
    },
  });
  await expectOk('blocking a friend severs every shared Activity context', () =>
    callFunction(frank.token, 'blockUser', { targetUid: gina.uid }),
  );
  const [
    blockedFriendship,
    frankPresence,
    ginaPresence,
    frankHostedActivity,
    ginaHostedActivity,
    frankHostedChat,
    ginaHostedChat,
    frankJourneyState,
    ginaJourneyState,
    frankJourneyMember,
    ginaJourneyMember,
    frankJourneyLocation,
    ginaJourneyLocation,
    frankAfterBlock,
    ginaAfterBlock,
  ] = await Promise.all([
    db.doc(`friendships/${friendshipId(frank.uid, gina.uid)}`).get(),
    db.doc(`presence/${frank.uid}`).get(),
    db.doc(`presence/${gina.uid}`).get(),
    db.doc('activities/block-hosted-by-frank').get(),
    db.doc('activities/block-hosted-by-gina').get(),
    db.doc('chats/block-hosted-by-frank').get(),
    db.doc('chats/block-hosted-by-gina').get(),
    db.doc(`activities/block-hosted-by-frank/journeyStates/${gina.uid}`).get(),
    db.doc(`activities/block-hosted-by-gina/journeyStates/${frank.uid}`).get(),
    realtimeDb.ref(`journeys/block-hosted-by-frank/members/${gina.uid}`).get(),
    realtimeDb.ref(`journeys/block-hosted-by-gina/members/${frank.uid}`).get(),
    realtimeDb.ref(`journeys/block-hosted-by-frank/locations/${gina.uid}`).get(),
    realtimeDb.ref(`journeys/block-hosted-by-gina/locations/${frank.uid}`).get(),
    db.doc(`users/${frank.uid}`).get(),
    db.doc(`users/${gina.uid}`).get(),
  ]);
  const frankActivity = frankHostedActivity.data();
  const ginaActivity = ginaHostedActivity.data();
  if (
    blockedFriendship.exists ||
    frankPresence.data()?.audienceUids?.includes(gina.uid) ||
    ginaPresence.data()?.audienceUids?.includes(frank.uid) ||
    frankActivity?.audienceUids?.includes(gina.uid) ||
    frankActivity?.participantUids?.includes(gina.uid) ||
    ginaActivity?.audienceUids?.includes(frank.uid) ||
    ginaActivity?.participantUids?.includes(frank.uid) ||
    frankHostedChat.data()?.memberIds?.includes(gina.uid) ||
    ginaHostedChat.data()?.memberIds?.includes(frank.uid) ||
    frankJourneyState.exists ||
    ginaJourneyState.exists ||
    frankJourneyMember.exists() ||
    ginaJourneyMember.exists() ||
    frankJourneyLocation.exists() ||
    ginaJourneyLocation.exists() ||
    frankAfterBlock.data()?.friendshipsVersion !== 1 ||
    ginaAfterBlock.data()?.friendshipsVersion !== 1
  ) {
    throw new Error(
      'Blocking left a friendship, shared Activity, chat, presence, or Journey entitlement behind.',
    );
  }
  console.log('OK blocking revokes every shared Activity and Journey entitlement');

  await expectOk('sets nobody request policy', () =>
    callFunction(charlie.token, 'setFriendRequestPolicy', { policy: 'nobody' }),
  );
  await expectError('nobody policy rejects username requests', 'PERMISSION_DENIED', () =>
    callFunction(alice.token, 'sendFriendRequest', { username: 'charlie' }),
  );

  const eve = await createTestUser();
  await db.doc(`users/${eve.uid}`).set({
    displayName: 'Eve Evans',
    username: 'eve',
    initials: 'EE',
    profileVisibility: 'friends',
    friendRequestPolicy: 'anyone',
    createdAt: timestamp,
  });
  const eveActivityId = 'eve-journey-activity';
  await db.doc(`activities/${eveActivityId}`).set({
    hostId: eve.uid,
    mode: 'now',
    title: 'Eve unterwegs',
    audienceUids: [eve.uid],
    participantUids: [eve.uid],
    participants: [{ uid: eve.uid, displayName: 'Eve Evans', initials: 'EE' }],
    status: 'active',
    createdAt: timestamp,
    visibleUntil: admin.firestore.Timestamp.fromMillis(now + 60 * 60 * 1000),
    expireAt: admin.firestore.Timestamp.fromMillis(now + 60 * 60 * 1000),
  });
  await realtimeDb.ref(`journeys/${eveActivityId}`).set({
    members: { [eve.uid]: true },
    locations: {
      [eve.uid]: {
        lat: 52.5,
        lng: 13.4,
        status: 'onTheWay',
        updatedAt: now,
        expiresAt: now + 60 * 60 * 1000,
      },
    },
  });
  const evePushToken = 'ExponentPushToken[functions-deleted-account]';
  await expectOk('account registers a token before deletion', () =>
    callFunction(eve.token, 'registerPushToken', { token: evePushToken }),
  );
  await expectOk('user deletes their own account', () =>
    callFunction(eve.token, 'deleteMyAccount', {}),
  );
  const [deletedActivity, deletedJourneyMember, deletedJourneyLocation, deletedPushClaim] =
    await Promise.all([
      db.doc(`activities/${eveActivityId}`).get(),
      realtimeDb.ref(`journeys/${eveActivityId}/members/${eve.uid}`).get(),
      realtimeDb.ref(`journeys/${eveActivityId}/locations/${eve.uid}`).get(),
      db.doc(`pushTokenOwners/${pushTokenClaimId(evePushToken)}`).get(),
    ]);
  if (
    deletedActivity.exists ||
    deletedJourneyMember.exists() ||
    deletedJourneyLocation.exists() ||
    deletedPushClaim.exists
  ) {
    throw new Error(
      'Account deletion left Activity, live Journey, or push-token ownership behind.',
    );
  }
  console.log('OK account deletion clears live journey data and push-token ownership');

  const sharedPushToken = 'ExponentPushToken[functions-shared-device]';
  await expectOk('first account registers a push token', () =>
    callFunction(alice.token, 'registerPushToken', { token: sharedPushToken }),
  );
  await expectOk('second account takes over the same device push token', () =>
    callFunction(bob.token, 'registerPushToken', { token: sharedPushToken }),
  );
  let [alicePushTokens, bobPushTokens] = await Promise.all([
    db.doc(`users/${alice.uid}`).get(),
    db.doc(`users/${bob.uid}`).get(),
  ]);
  const sharedTokenClaim = await db
    .doc(`pushTokenOwners/${pushTokenClaimId(sharedPushToken)}`)
    .get();
  if (
    (alicePushTokens.data()?.pushTokens ?? []).includes(sharedPushToken) ||
    (bobPushTokens.data()?.pushTokens ?? []).filter((token) => token === sharedPushToken).length !==
      1 ||
    sharedTokenClaim.data()?.uid !== bob.uid
  ) {
    throw new Error('Push token takeover left the same device token on multiple accounts.');
  }
  await expectOk('re-registering the current push token is idempotent', () =>
    callFunction(bob.token, 'registerPushToken', { token: sharedPushToken }),
  );
  const [bobAfterIdempotentRegistration, claimAfterIdempotentRegistration] = await Promise.all([
    db.doc(`users/${bob.uid}`).get(),
    db.doc(`pushTokenOwners/${pushTokenClaimId(sharedPushToken)}`).get(),
  ]);
  if (
    bobAfterIdempotentRegistration.updateTime?.toMillis?.() !==
      bobPushTokens.updateTime?.toMillis?.() ||
    claimAfterIdempotentRegistration.updateTime?.toMillis?.() !==
      sharedTokenClaim.updateTime?.toMillis?.()
  ) {
    throw new Error('Idempotent push registration caused avoidable Firestore writes.');
  }
  const cappedTokens = Array.from(
    { length: 11 },
    (_, index) => `ExponentPushToken[functions-device-${index}]`,
  );
  for (const token of cappedTokens) {
    await expectOk('registers a bounded push token', () =>
      callFunction(bob.token, 'registerPushToken', { token }),
    );
  }
  bobPushTokens = await db.doc(`users/${bob.uid}`).get();
  const finalPushTokens = bobPushTokens.data()?.pushTokens ?? [];
  const evictedSharedClaim = await db
    .doc(`pushTokenOwners/${pushTokenClaimId(sharedPushToken)}`)
    .get();
  if (
    finalPushTokens.length !== 10 ||
    new Set(finalPushTokens).size !== 10 ||
    evictedSharedClaim.exists
  ) {
    throw new Error(
      'Push token registration did not deduplicate and cap the account at ten tokens.',
    );
  }
  console.log('OK push token ownership is unique, idempotent, and capped at ten');

  // Host succession is a server transaction, not a UI convention: the same
  // callable must transfer the Activity, chat membership and host invariant.
  const handoffActivityId = 'host-handoff-activity';
  const handoffExpiry = admin.firestore.Timestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000);
  await Promise.all([
    db.doc(`activities/${handoffActivityId}`).set({
      hostId: alice.uid,
      mode: 'soon',
      title: 'Übergabe testen',
      audienceUids: [alice.uid, bob.uid],
      participantUids: [alice.uid, bob.uid],
      participants: [
        { uid: alice.uid, displayName: 'Alice Adams', initials: 'AA' },
        { uid: bob.uid, displayName: 'Bob Berger', initials: 'BB' },
      ],
      status: 'active',
      createdAt: timestamp,
      visibleUntil: handoffExpiry,
      expireAt: handoffExpiry,
    }),
    db.doc(`chats/${handoffActivityId}`).set({
      type: 'activity',
      title: 'Übergabe testen',
      memberIds: [alice.uid, bob.uid],
      adminUids: [alice.uid],
      messageCount: 0,
      readCount: {},
      createdAt: timestamp,
      expireAt: handoffExpiry,
    }),
  ]);
  await expectOk('a host can hand an active activity to its longest-standing participant', () =>
    callFunction(alice.token, 'leaveActivity', { activityId: handoffActivityId }),
  );
  const [handedOffActivity, handedOffRoom] = await Promise.all([
    db.doc(`activities/${handoffActivityId}`).get(),
    db.doc(`chats/${handoffActivityId}`).get(),
  ]);
  if (
    handedOffActivity.data()?.hostId !== bob.uid ||
    handedOffActivity.data()?.participantUids?.join(',') !== bob.uid ||
    handedOffActivity.data()?.participants?.[0]?.uid !== bob.uid ||
    handedOffRoom.data()?.memberIds?.join(',') !== bob.uid ||
    handedOffRoom.data()?.adminUids?.join(',') !== bob.uid
  ) {
    throw new Error('Host succession did not atomically preserve Activity and chat invariants.');
  }
  await expectError(
    'the final host must cancel instead of leaving an orphaned activity',
    'FAILED_PRECONDITION',
    () => callFunction(bob.token, 'leaveActivity', { activityId: handoffActivityId }),
  );
  const hostChangeNotifications = await waitFor(async () => {
    const snapshot = await db
      .collection('notifications')
      .where('recipientUid', '==', bob.uid)
      .where('kind', '==', 'activity_host_changed')
      .where('activityId', '==', handoffActivityId)
      .get();
    return snapshot.size === 1 ? snapshot : null;
  });
  if (hostChangeNotifications.docs[0]?.data()?.roomId !== handoffActivityId) {
    throw new Error('Host succession did not create an actionable participant notification.');
  }
  console.log('OK host succession is atomic and the new host is informed');

  const cleanupCutoff = admin.firestore.Timestamp.fromMillis(Date.now());
  await db
    .doc('presence/expired-presence')
    .set({ expireAt: cleanupCutoff, audienceUids: [alice.uid] });
  await db.doc('presence/current-presence').set({
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60_000),
    audienceUids: [alice.uid],
  });
  await db.doc('activities/expired-surface-activity').set({
    status: 'active',
    visibleUntil: cleanupCutoff,
  });
  await db.doc('activities/current-surface-activity').set({
    status: 'active',
    visibleUntil: admin.firestore.Timestamp.fromMillis(Date.now() + 60_000),
  });
  await db.doc('groupOpenings/expired-opening').set({ expireAt: cleanupCutoff });
  await db.doc('groupOpenings/current-opening').set({
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60_000),
  });
  await db.doc('spontaneousRoundInvites/expired-round-invite').set({ expireAt: cleanupCutoff });
  await db.doc('spontaneousRoundInvites/current-round-invite').set({
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60_000),
  });
  await db.doc('spontaneousRoundMemberships/expired-round-member').set({ expireAt: cleanupCutoff });
  await db.doc('spontaneousRoundMemberships/current-round-member').set({
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60_000),
  });

  const expiredSurfaceResult = await cleanupExpiredSurfaces(db, cleanupCutoff);
  const [
    expiredPresence,
    currentPresence,
    expiredActivity,
    currentActivity,
    expiredOpening,
    currentOpening,
    expiredRoundInvite,
    currentRoundInvite,
    expiredRoundMember,
    currentRoundMember,
  ] = await Promise.all([
    db.doc('presence/expired-presence').get(),
    db.doc('presence/current-presence').get(),
    db.doc('activities/expired-surface-activity').get(),
    db.doc('activities/current-surface-activity').get(),
    db.doc('groupOpenings/expired-opening').get(),
    db.doc('groupOpenings/current-opening').get(),
    db.doc('spontaneousRoundInvites/expired-round-invite').get(),
    db.doc('spontaneousRoundInvites/current-round-invite').get(),
    db.doc('spontaneousRoundMemberships/expired-round-member').get(),
    db.doc('spontaneousRoundMemberships/current-round-member').get(),
  ]);
  if (
    expiredSurfaceResult.presence < 1 ||
    expiredSurfaceResult.activities < 1 ||
    expiredSurfaceResult.groupOpenings < 1 ||
    expiredSurfaceResult.spontaneousRoundInvites < 1 ||
    expiredSurfaceResult.spontaneousRoundMemberships < 1 ||
    expiredPresence.exists ||
    !currentPresence.exists ||
    expiredActivity.data()?.status !== 'expired' ||
    currentActivity.data()?.status !== 'active' ||
    expiredOpening.exists ||
    !currentOpening.exists ||
    expiredRoundInvite.exists ||
    !currentRoundInvite.exists ||
    expiredRoundMember.exists ||
    !currentRoundMember.exists
  ) {
    throw new Error('Expired public-surface data was not removed or sealed server-side.');
  }
  console.log('OK expired public-surface data is removed or sealed server-side');

  await app.delete();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
