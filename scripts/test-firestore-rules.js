const { initializeApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInAnonymously } = require('firebase/auth');
const {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} = require('firebase/firestore');

const authPort = Number(process.env.TEST_AUTH_EMULATOR_PORT ?? 9199);
const firestorePort = Number(process.env.TEST_FIRESTORE_EMULATOR_PORT ?? 8180);
const config = { apiKey: 'demo', authDomain: 'demo-together.local', projectId: 'demo-together' };
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${firestorePort}`;
const admin = require('./firebase-admin-tools.cjs');

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
  const adminApp = admin.initializeApp({ projectId: config.projectId }, `rules-${Date.now()}`);
  const adminDb = adminApp.firestore();
  const a = client('rules-a');
  const b = client('rules-b');
  const aCredential = await signInAnonymously(a.auth);
  const bCredential = await signInAnonymously(b.auth);
  const aUid = aCredential.user.uid;
  const bUid = bCredential.user.uid;
  const future = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
  const adminFuture = admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);

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
  const ownAvatarUrl = `https://firebasestorage.googleapis.com/v0/b/demo-together.appspot.com/o/avatars%2F${aUid}.jpg?alt=media&token=test`;
  await denied('client cannot update their avatar URL directly', () =>
    updateDoc(doc(a.db, 'users', aUid), { avatarUrl: ownAvatarUrl }),
  );
  await denied('client cannot update their display name directly', () =>
    updateDoc(doc(a.db, 'users', aUid), { displayName: 'Alice Direkt' }),
  );
  await denied('owner cannot attach an arbitrary external avatar URL', () =>
    updateDoc(doc(a.db, 'users', aUid), { avatarUrl: 'https://tracker.example/pixel.jpg' }),
  );
  await denied('owner cannot attach an avatar from another Firebase project', () =>
    updateDoc(doc(a.db, 'users', aUid), {
      avatarUrl: `https://firebasestorage.googleapis.com/v0/b/attacker-project.appspot.com/o/avatars%2F${aUid}.jpg?alt=media&token=test`,
    }),
  );
  await denied('owner cannot point their profile at another user avatar path', () =>
    updateDoc(doc(a.db, 'users', aUid), {
      avatarUrl: `https://firebasestorage.googleapis.com/v0/b/demo-together.appspot.com/o/avatars%2F${bUid}.jpg?alt=media&token=test`,
    }),
  );
  await allowed('owner can advance notification cursor with server time', () =>
    updateDoc(doc(a.db, 'users', aUid), { notificationsSeenAt: serverTimestamp() }),
  );
  await denied('owner cannot forge notification cursor time', () =>
    updateDoc(doc(a.db, 'users', aUid), { notificationsSeenAt: Timestamp.now() }),
  );
  await adminDb.doc(`users/${aUid}`).update({
    notificationsSeenAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  });
  await denied('notification cursor cannot move backwards even with server time', () =>
    updateDoc(doc(a.db, 'users', aUid), { notificationsSeenAt: serverTimestamp() }),
  );
  await denied('notification cursor cannot be mixed into a profile edit', () =>
    updateDoc(doc(a.db, 'users', aUid), {
      displayName: 'Alice Cursor',
      notificationsSeenAt: serverTimestamp(),
    }),
  );
  await denied('notification cursor cannot move back to missing', () =>
    updateDoc(doc(a.db, 'users', aUid), { notificationsSeenAt: deleteField() }),
  );
  await denied('other user cannot advance notification cursor', () =>
    updateDoc(doc(b.db, 'users', aUid), { notificationsSeenAt: serverTimestamp() }),
  );
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
  await denied('client cannot update public profile fields directly', () =>
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
  await adminDb.doc('activities/expired-activity').set({
    status: 'expired',
    audienceUids: [aUid],
  });
  await denied('former audience cannot read a server-expired activity', () =>
    getDoc(doc(a.db, 'activities', 'expired-activity')),
  );

  // Time plans have a stricter boundary than activities: an invitation alone
  // never exposes source windows or other people's availability. Membership is
  // callable-only, then the bounded member subcollection becomes readable.
  await adminDb.doc('timePlans/private-plan').set({
    hostId: aUid,
    hostName: 'Alice',
    hostInitials: 'AL',
    title: 'Termin finden',
    sourceWindows: [],
    revision: 1,
    status: 'collecting',
    memberUids: [aUid],
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    expireAt: adminFuture,
  });
  await adminDb.doc(`timePlans/private-plan/timePlanMembers/${aUid}`).set({
    uid: aUid,
    displayName: 'Alice',
    initials: 'AL',
    role: 'host',
    responseStatus: 'responded',
    responsesByWindow: {},
    updatedAt: admin.firestore.Timestamp.now(),
    expireAt: adminFuture,
  });
  await allowed('joined host can read their time plan', () => getDoc(doc(a.db, 'timePlans', 'private-plan')));
  await allowed('joined host can list time-plan members', () =>
    getDocs(query(collection(a.db, 'timePlans', 'private-plan', 'timePlanMembers'), limit(50))),
  );
  await denied('unjoined user cannot read a private time plan', () => getDoc(doc(b.db, 'timePlans', 'private-plan')));
  await denied('unjoined user cannot list private time-plan members', () =>
    getDocs(query(collection(b.db, 'timePlans', 'private-plan', 'timePlanMembers'), limit(50))),
  );
  await denied('client cannot forge a time-plan member', () =>
    setDoc(doc(b.db, 'timePlans', 'private-plan', 'timePlanMembers', bUid), {
      uid: bUid,
      displayName: 'Bob',
      initials: 'BO',
      role: 'member',
      responseStatus: 'pending',
      responsesByWindow: {},
      updatedAt: Timestamp.now(),
      expireAt: future,
    }),
  );
  // The answer surface has to open BEFORE anyone is a member, so an invitee
  // gets a narrower tier: the round itself, never anyone's availability.
  await adminDb.doc(`timePlanInvites/private-plan_${bUid}`).set({
    planId: 'private-plan',
    inviteeUid: bUid,
    status: 'pending',
    createdAt: admin.firestore.Timestamp.now(),
    expireAt: adminFuture,
  });
  await allowed('invited user can read the round they were asked to answer', () =>
    getDoc(doc(b.db, 'timePlans', 'private-plan')),
  );
  await denied("invited user still cannot read anyone else's availability", () =>
    getDocs(query(collection(b.db, 'timePlans', 'private-plan', 'timePlanMembers'), limit(50))),
  );
  await denied('an invitee cannot read the invitation itself', () =>
    getDoc(doc(b.db, 'timePlanInvites', `private-plan_${bUid}`)),
  );
  const stranger = client('rules-stranger');
  await signInAnonymously(stranger.auth);
  await denied("someone else's invitation grants nothing", () =>
    getDoc(doc(stranger.db, 'timePlans', 'private-plan')),
  );

  await adminDb.doc('timePlans/private-plan').update({ memberUids: [aUid, bUid] });
  await allowed('server-joined member can read the time plan', () => getDoc(doc(b.db, 'timePlans', 'private-plan')));

  await denied('client cannot create a private circle directly', () =>
    setDoc(doc(a.db, 'users', aUid, 'privateCircles', 'circle-a'), {
      name: 'Crew',
      friendUids: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }),
  );
  await adminDb.doc(`users/${aUid}/privateCircles/circle-a`).set({
    name: 'Crew',
    friendUids: [],
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  });
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
  // Proposal voting/locking: the "Aktivität" escalation is offered to the
  // whole group, so ANY room member may set planned; confirmedBy stays
  // strictly self-toggle-only.
  await adminDb.doc('chats/proposal-room').set({
    type: 'group',
    memberIds: [aUid, bUid],
    messageCount: 1,
    readCount: {},
    createdAt: admin.firestore.Timestamp.now(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  });
  await adminDb.doc('chats/proposal-room/messages/p1').set({
    authorId: aUid,
    authorName: 'Alice',
    initials: 'AL',
    text: 'Bouldern?',
    kind: 'proposal',
    proposal: { what: 'Bouldern?', confirmedBy: [aUid] },
    createdAt: admin.firestore.Timestamp.now(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  });
  await allowed('room member can toggle own proposal confirmation', () =>
    updateDoc(doc(b.db, 'chats', 'proposal-room', 'messages', 'p1'), {
      'proposal.confirmedBy': [aUid, bUid],
    }),
  );
  await denied('room member cannot remove someone else from confirmedBy', () =>
    updateDoc(doc(b.db, 'chats', 'proposal-room', 'messages', 'p1'), {
      'proposal.confirmedBy': [bUid],
    }),
  );
  await allowed('non-author room member can lock a proposal as planned', () =>
    updateDoc(doc(b.db, 'chats', 'proposal-room', 'messages', 'p1'), {
      'proposal.planned': true,
    }),
  );
  const c = client('rules-c');
  const cCredential = await signInAnonymously(c.auth);
  void cCredential;
  await denied('non-member cannot touch a proposal', () =>
    updateDoc(doc(c.db, 'chats', 'proposal-room', 'messages', 'p1'), {
      'proposal.planned': true,
    }),
  );
  await denied('proposal text stays immutable even for the author', () =>
    updateDoc(doc(a.db, 'chats', 'proposal-room', 'messages', 'p1'), { text: 'edited' }),
  );

  // Planning-round invitations are server-only in BOTH directions: a client
  // must not be able to grant itself an invitation, and must not be able to
  // probe who else was invited into a round.
  await adminDb.doc('groupChatInvites/server-owned-invite').set({
    roomId: 'proposal-room',
    inviteeUid: aUid,
    inviterUid: 'someone-else',
    status: 'pending',
    createdAt: admin.firestore.Timestamp.now(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60_000),
  });
  await denied('client cannot read a group chat invitation', () =>
    getDoc(doc(a.db, 'groupChatInvites', 'server-owned-invite')),
  );
  await denied('client cannot forge a group chat invitation', () =>
    setDoc(doc(a.db, 'groupChatInvites', 'forged-invite'), {
      roomId: 'proposal-room',
      inviteeUid: aUid,
      inviterUid: aUid,
      status: 'pending',
      createdAt: Timestamp.now(),
      expireAt: Timestamp.fromMillis(Date.now() + 60_000),
    }),
  );
  await denied('client cannot accept an invitation by editing it', () =>
    updateDoc(doc(a.db, 'groupChatInvites', 'server-owned-invite'), { status: 'accepted' }),
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
  await adminDb.doc('notifications/server-owned').set({
    recipientUid: aUid,
    kind: 'activity_updated',
    title: 'Activity aktualisiert',
    body: 'Die Zeit wurde geändert.',
    createdAt: admin.firestore.Timestamp.now(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  });
  await allowed('owner can read own immutable notification', () =>
    getDoc(doc(a.db, 'notifications', 'server-owned')),
  );
  await denied('other user cannot read notification', () =>
    getDoc(doc(b.db, 'notifications', 'server-owned')),
  );
  await allowed('owner can run bounded newest-first notification query', () =>
    getDocs(
      query(
        collection(a.db, 'notifications'),
        where('recipientUid', '==', aUid),
        where('expireAt', '>', Timestamp.fromMillis(Date.now())),
        orderBy('createdAt', 'desc'),
        limit(30),
      ),
    ),
  );
  await denied('other user cannot query owner notifications', () =>
    getDocs(
      query(
        collection(b.db, 'notifications'),
        where('recipientUid', '==', aUid),
        where('expireAt', '>', Timestamp.fromMillis(Date.now())),
        orderBy('createdAt', 'desc'),
        limit(30),
      ),
    ),
  );
  await denied('notification documents are client-immutable', () =>
    updateDoc(doc(a.db, 'notifications', 'server-owned'), { readAt: serverTimestamp() }),
  );
  await denied('notification documents cannot be client-deleted', () =>
    deleteDoc(doc(a.db, 'notifications', 'server-owned')),
  );
  await adminDb.doc('notifications/expired-server-owned').set({
    recipientUid: aUid,
    kind: 'activity_updated',
    title: 'Abgelaufen',
    body: 'Darf nicht mehr lesbar sein.',
    createdAt: admin.firestore.Timestamp.now(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000),
  });
  await denied('expired notification is sealed before TTL deletion', () =>
    getDoc(doc(a.db, 'notifications', 'expired-server-owned')),
  );
  await adminDb.doc('presence/current-rule-presence').set({
    uid: bUid,
    displayName: 'Bob',
    initials: 'BO',
    shareLocation: false,
    audienceUids: [aUid],
    updatedAt: admin.firestore.Timestamp.now(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  });
  await adminDb.doc('presence/expired-rule-presence').set({
    uid: bUid,
    displayName: 'Bob',
    initials: 'BO',
    shareLocation: false,
    audienceUids: [aUid],
    updatedAt: admin.firestore.Timestamp.now(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000),
  });
  await allowed('audience can read current presence', () =>
    getDoc(doc(a.db, 'presence', 'current-rule-presence')),
  );
  await denied('expired presence is sealed before TTL deletion', () =>
    getDoc(doc(a.db, 'presence', 'expired-rule-presence')),
  );
  await adminDb.doc('groupOpenings/current-rule-opening').set({
    audienceUids: [aUid],
    status: 'active',
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  });
  await adminDb.doc('groupOpenings/expired-rule-opening').set({
    audienceUids: [aUid],
    status: 'active',
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000),
  });
  await allowed('audience can read current group opening', () =>
    getDoc(doc(a.db, 'groupOpenings', 'current-rule-opening')),
  );
  await denied('expired group opening is sealed before TTL deletion', () =>
    getDoc(doc(a.db, 'groupOpenings', 'expired-rule-opening')),
  );

  await adminApp.delete();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
