const { initializeApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInAnonymously } = require('firebase/auth');
const {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  Timestamp,
  updateDoc,
} = require('firebase/firestore');

const authPort = Number(process.env.TEST_AUTH_EMULATOR_PORT ?? 9199);
const firestorePort = Number(process.env.TEST_FIRESTORE_EMULATOR_PORT ?? 8180);
const config = { apiKey: 'demo', authDomain: 'demo-together.local', projectId: 'demo-together' };

function client(name) {
  const app = initializeApp(config, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', firestorePort);
  return { auth, db };
}

async function denied(label, operation) {
  try {
    await operation();
    throw new Error(`${label}: expected PERMISSION_DENIED`);
  } catch (error) {
    if (error.message.startsWith(`${label}: expected`)) throw error;
    console.log(`DENIED ${label}`);
  }
}

async function allowed(label, operation) {
  await operation();
  console.log(`ALLOWED ${label}`);
}

async function main() {
  const a = client('rules-a');
  const b = client('rules-b');
  const aCredential = await signInAnonymously(a.auth);
  const bCredential = await signInAnonymously(b.auth);
  const aUid = aCredential.user.uid;
  const bUid = bCredential.user.uid;
  const future = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);

  await allowed('owner can write private profile', () =>
    setDoc(doc(a.db, 'users', aUid), {
      displayName: 'Alice',
      username: 'alice',
      initials: 'AL',
      createdAt: Timestamp.now(),
    }),
  );
  await allowed('owner can read private profile', () => getDoc(doc(a.db, 'users', aUid)));
  await denied('other user cannot read private profile', () => getDoc(doc(b.db, 'users', aUid)));
  await allowed('owner can create internal profile projection', () =>
    setDoc(doc(a.db, 'publicProfiles', aUid), {
      displayName: 'Alice',
      username: 'alice',
      initials: 'AL',
      createdAt: Timestamp.now(),
    }),
  );
  await denied('owner cannot read internal profile projection', () =>
    getDoc(doc(a.db, 'publicProfiles', aUid)),
  );
  await denied('other user cannot read internal profile projection', () =>
    getDoc(doc(b.db, 'publicProfiles', aUid)),
  );
  await allowed('owner can update allowed publicProfiles fields', () =>
    updateDoc(doc(a.db, 'publicProfiles', aUid), { displayName: 'Alice A.' }),
  );
  await denied('owner cannot rewrite publicProfiles.createdAt on update', () =>
    updateDoc(doc(a.db, 'publicProfiles', aUid), { createdAt: Timestamp.now() }),
  );

  await denied('client cannot create activity', () =>
    setDoc(doc(a.db, 'activities', 'direct-create'), { hostId: aUid, status: 'active' }),
  );
  await denied('client cannot update an activity directly', () =>
    updateDoc(doc(a.db, 'activities', 'direct-update'), { status: 'cancelled' }),
  );

  await allowed('owner can create a private circle', () =>
    setDoc(doc(a.db, 'users', aUid, 'privateCircles', 'circle-a'), {
      name: 'Crew',
      friendUids: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }),
  );
  await denied('client cannot add people to a private circle directly', () =>
    updateDoc(doc(a.db, 'users', aUid, 'privateCircles', 'circle-a'), {
      friendUids: [bUid],
      updatedAt: Timestamp.now(),
    }),
  );
  await denied('other user cannot read a private circle', () =>
    getDoc(doc(b.db, 'users', aUid, 'privateCircles', 'circle-a')),
  );
  await denied('legacy shared circles are sealed', () =>
    setDoc(doc(a.db, 'circles', 'circle-a'), {
      name: 'Crew',
      ownerId: aUid,
      memberIds: [aUid],
      members: [{ uid: aUid, displayName: 'Alice', initials: 'AL' }],
      createdAt: Timestamp.now(),
    }),
  );
  await denied('client cannot forge friendship', () =>
    setDoc(doc(a.db, 'friendships', `${aUid}__${bUid}`), {
      participantUids: [aUid, bUid],
      status: 'accepted',
    }),
  );

  await denied('client cannot create a chat room directly', () =>
    setDoc(doc(a.db, 'chats', 'room-a'), {
      type: 'group',
      memberIds: [aUid],
      messageCount: 0,
      readCount: {},
      createdAt: Timestamp.now(),
      expireAt: future,
    }),
  );
  await denied('other user cannot read chat room', () => getDoc(doc(b.db, 'chats', 'room-a')));
  await denied('client cannot create message directly', () =>
    setDoc(doc(a.db, 'chats', 'room-a', 'messages', 'm1'), {
      authorId: aUid,
      authorName: 'Alice',
      initials: 'AL',
      text: 'hello',
      kind: 'text',
      createdAt: Timestamp.now(),
      expireAt: future,
    }),
  );
  await denied('client cannot create notification directly', () =>
    setDoc(doc(a.db, 'notifications', 'n1'), {
      recipientUid: aUid,
      kind: 'system',
      title: 'Fake',
      body: 'Fake',
      createdAt: Timestamp.now(),
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
