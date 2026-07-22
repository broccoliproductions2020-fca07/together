const path = require('path');

const PROJECT_ID = 'demo-together';
const AUTH_PORT = Number(process.env.TEST_AUTH_EMULATOR_PORT ?? 9199);
const FIRESTORE_PORT = Number(process.env.TEST_FIRESTORE_EMULATOR_PORT ?? 8180);
const FUNCTIONS_PORT = Number(process.env.TEST_FUNCTIONS_EMULATOR_PORT ?? 5001);
const DATABASE_PORT = Number(process.env.TEST_DATABASE_EMULATOR_PORT ?? 8281);
const ACTIVITY_CHAT_RETENTION_MS = 12 * 60 * 60 * 1000;
const AUTH_BASE = `http://127.0.0.1:${AUTH_PORT}/identitytoolkit.googleapis.com/v1`;
const FUNCTIONS_BASE = `http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT_ID}/us-central1`;

process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FIRESTORE_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_PORT}`;
process.env.FIREBASE_DATABASE_EMULATOR_HOST = `127.0.0.1:${DATABASE_PORT}`;

const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

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
  const body = await response.json();
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

/** Polls for an async RTDB-trigger side effect (e.g. cleanupSafetyIndexOnSessionDeleted)
 * instead of racing it — the callable that causes the deletion returns before
 * the trigger necessarily finishes. */
async function waitFor(check, { attempts = 20, delayMs = 250 } = {}) {
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

  const createdActivityId = `visible-until-${now}`;
  const createdStartsAt = new Date(now + 5 * 60 * 60 * 1000).toISOString();
  const createdEndsAt = new Date(now + 7 * 60 * 60 * 1000).toISOString();
  await expectOk('new activity writes feed visibility separate from chat retention', () =>
    callFunction(alice.token, 'createActivity', {
      activityId: createdActivityId,
      activity: {
        mode: 'soon',
        title: 'Sichtbarkeit testen',
        audienceContext: { kind: 'all_friends' },
        startsAt: createdStartsAt,
        endsAt: createdEndsAt,
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
    createdRoom?.expireAt?.toMillis?.() !== expectedCreatedExpiry
  ) {
    throw new Error('New activity did not separate map visibility from chat retention.');
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
  console.log('OK activity feed returns only the explicit visibility window');

  await expectOk('open presence accepts a duration below twelve hours', () =>
    callFunction(alice.token, 'publishPresence', {
      presence: {
        expiresAt: Date.now() + 11 * 60 * 60 * 1000,
        shareLocation: false,
      },
    }),
  );
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
  console.log('OK group chat lifecycle is bounded and refreshed atomically');

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
        startsAt: editedStartsAt,
        endsAt: editedEndsAt,
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
  await db.doc('rateLimits/room_shared-activity').set({
    windowStart: burstWindow,
    count: 60,
    expireAt: admin.firestore.Timestamp.fromMillis(burstWindow + 60_000),
  });
  await expectError('room message burst is capped server-side', 'RESOURCE_EXHAUSTED', () =>
    callFunction(bob.token, 'sendChatMessage', {
      roomId: 'shared-activity',
      text: 'Zu schnell',
    }),
  );
  await db.doc('rateLimits/room_shared-activity').delete();

  await expectError('cannot join an already ended activity', 'FAILED_PRECONDITION', () =>
    callFunction(bob.token, 'joinActivity', { activityId: 'ended-activity' }),
  );

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
  const cancellationExpiry = now + ACTIVITY_CHAT_RETENTION_MS;
  if (
    cancelledActivity?.status !== 'cancelled' ||
    cancelledActivity?.journeyUnderwayCount !== 0 ||
    Math.abs((cancelledActivity?.visibleUntil?.toMillis?.() ?? 0) - now) > 60_000 ||
    Math.abs((cancelledActivity?.expireAt?.toMillis?.() ?? 0) - cancellationExpiry) > 60_000 ||
    Math.abs((cancelledRoom?.expireAt?.toMillis?.() ?? 0) - cancellationExpiry) > 60_000 ||
    journeySnapshot.exists() ||
    // Admin-SDK Firestore snapshot: `exists` is a property (the RTDB snapshot
    // one line up has it as a method).
    journeyStateSnapshot.exists
  ) {
    throw new Error('Cancellation did not close the planned activity lifecycle cleanly.');
  }
  console.log('OK cancellation removes live journey data and keeps a 12-hour chat window');

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
        [bob.uid]: { lat: 52.5, lng: 13.4, status: 'onTheWay', updatedAt: now, expiresAt: now + 60 * 60 * 1000 },
      },
    }),
  ]);
  await expectOk('leaving an activity revokes its live journey access', () =>
    callFunction(bob.token, 'leaveActivity', { activityId: leaveJourneyActivityId }),
  );
  const [leftActivitySnapshot, leftRoomSnapshot, leftJourneyState, leftJourneyMember, leftJourneyLocation] =
    await Promise.all([
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
    aliceAfterRequest.data()?.friendshipsVersion !== 1 ||
    bobAfterRequest.data()?.friendshipsVersion !== 1
  ) {
    throw new Error('A new friendship request did not invalidate both friendship caches.');
  }
  console.log('OK pending friendship stores contact-only snapshots');

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
    aliceAfterAcceptance.data()?.friendshipsVersion !== 2 ||
    bobAfterAcceptance.data()?.friendshipsVersion !== 2
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

  // cleanupSafetyIndexOnSessionDeleted is what actually sends this — it must
  // fire for a callable-triggered delete just as it does for a direct client
  // remove(), otherwise companions never learn their friend arrived safely.
  await waitFor(async () => {
    const snapshot = await db
      .collection('notifications')
      .where('recipientUid', '==', bob.uid)
      .where('kind', '==', 'safety_resolved')
      .get();
    return snapshot.empty ? null : snapshot;
  });
  console.log('OK Safety end notifies companions of the safe arrival');

  await expectOk('friend starts another Safety session before removing friendship', () =>
    callFunction(alice.token, 'startSafetySession', { audienceUids: [dave.uid] }),
  );
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
    aliceAfterRemoval.data()?.friendshipsVersion !== 3 ||
    daveAfterRemoval.data()?.friendshipsVersion !== 1
  ) {
    throw new Error('Removing friendship left an active Safety entitlement behind.');
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
    blockBatch.set(db.doc(`publicProfiles/${person.uid}`), { ...profile, username, createdAt: blockTimestamp });
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
        [gina.uid]: { lat: 52.5, lng: 13.4, status: 'onTheWay', updatedAt: now, expiresAt: blockExpiry },
      },
    },
    'journeys/block-hosted-by-gina': {
      expiresAt: blockExpiry,
      members: { [frank.uid]: true, [gina.uid]: true },
      locations: {
        [frank.uid]: { lat: 52.5, lng: 13.4, status: 'onTheWay', updatedAt: now, expiresAt: blockExpiry },
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
    throw new Error('Blocking left a friendship, shared Activity, chat, presence, or Journey entitlement behind.');
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
      [eve.uid]: { lat: 52.5, lng: 13.4, status: 'onTheWay', updatedAt: now, expiresAt: now + 60 * 60 * 1000 },
    },
  });
  await expectOk('user deletes their own account', () =>
    callFunction(eve.token, 'deleteMyAccount', {}),
  );
  const [deletedActivity, deletedJourneyMember, deletedJourneyLocation] = await Promise.all([
    db.doc(`activities/${eveActivityId}`).get(),
    realtimeDb.ref(`journeys/${eveActivityId}/members/${eve.uid}`).get(),
    realtimeDb.ref(`journeys/${eveActivityId}/locations/${eve.uid}`).get(),
  ]);
  if (deletedActivity.exists || deletedJourneyMember.exists() || deletedJourneyLocation.exists()) {
    throw new Error('Account deletion left the hosted activity or its live journey entry behind.');
  }
  console.log('OK account deletion also clears the live journey entry');

  await app.delete();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
