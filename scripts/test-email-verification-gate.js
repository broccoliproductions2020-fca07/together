const PROJECT_ID = 'demo-together';
const AUTH_PORT = Number(process.env.TEST_AUTH_EMULATOR_PORT ?? 9199);
const FIRESTORE_PORT = Number(process.env.TEST_FIRESTORE_EMULATOR_PORT ?? 8180);
const FUNCTIONS_PORT = Number(process.env.TEST_FUNCTIONS_EMULATOR_PORT ?? 5001);
const DATABASE_PORT = Number(process.env.TEST_DATABASE_EMULATOR_PORT ?? 8281);
const AUTH_BASE = `http://127.0.0.1:${AUTH_PORT}/identitytoolkit.googleapis.com/v1`;
const FUNCTIONS_BASE = `http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT_ID}/europe-west3`;

process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FIRESTORE_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_PORT}`;
process.env.FIREBASE_DATABASE_EMULATOR_HOST = `127.0.0.1:${DATABASE_PORT}`;

const admin = require('./firebase-admin-tools.cjs');

async function createAnonymousUser() {
  const response = await fetch(`${AUTH_BASE}/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Anonymous sign-up failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function createUnverifiedUser(app, email, password) {
  const user = await app.auth().createUser({ email, password, emailVerified: false });
  const response = await fetch(`${AUTH_BASE}/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Unverified sign-in failed: ${JSON.stringify(body)}`);
  return { uid: user.uid, token: body.idToken };
}

async function createVerifiedUser(app, email, password) {
  const user = await app.auth().createUser({ email, password, emailVerified: true });
  const response = await fetch(`${AUTH_BASE}/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Verified sign-in failed: ${JSON.stringify(body)}`);
  return { uid: user.uid, token: body.idToken };
}

async function callFunction(token, name, data) {
  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

async function main() {
  const app = admin.initializeApp({ projectId: PROJECT_ID }, 'email-verification-gate');
  const db = app.firestore();
  const now = Date.now();
  const startsAt = new Date(now).toISOString();
  const endsAt = new Date(now + 60 * 60 * 1000).toISOString();

  const anonymous = await createAnonymousUser();
  await expectError(
    'unverified caller cannot create an activity while the gate is on',
    'FAILED_PRECONDITION',
    () =>
      callFunction(anonymous.token, 'createActivity', {
        activityId: 'gate-test-activity-blocked',
        activity: {
          mode: 'now',
          title: 'Gate Test',
          audienceContext: { kind: 'all_friends' },
          startsAt,
          endsAt,
        },
      }),
  );
  await expectError(
    'unverified caller cannot use place autocomplete while the gate is on',
    'FAILED_PRECONDITION',
    () =>
      callFunction(anonymous.token, 'places', {
        action: 'autocomplete',
        query: 'Kino',
        sessionToken: 'email-gate-session-token-1234',
      }),
  );
  await expectOk(
    'unverified caller can still block another user (self-protection stays open)',
    () => callFunction(anonymous.token, 'blockUser', { targetUid: 'someone-else' }),
  );
  await expectOk('unverified caller can still claim a username (runs during sign-up itself)', () =>
    callFunction(anonymous.token, 'claimUsername', { username: 'gatetestuser' }),
  );

  const verified = await createVerifiedUser(
    app,
    'verified@example.test',
    'correct horse battery staple',
  );
  await db.doc(`publicProfiles/${verified.uid}`).set({
    displayName: 'Verified Person',
    username: 'verifiedperson',
    initials: 'VP',
    createdAt: admin.firestore.Timestamp.now(),
  });
  await expectOk('verified caller can create an activity while the gate is on', () =>
    callFunction(verified.token, 'createActivity', {
      activityId: 'gate-test-activity-allowed',
      activity: {
        mode: 'now',
        title: 'Gate Test Verified',
        audienceContext: { kind: 'all_friends' },
        startsAt,
        endsAt,
      },
    }),
  );

  await expectOk('verified caller can use place autocomplete while the gate is on', () =>
    callFunction(verified.token, 'places', {
      action: 'autocomplete',
      query: 'Kino',
      sessionToken: 'email-gate-session-token-5678',
    }),
  );

  // --- Branded verification mail ---------------------------------------
  // The callable that SENDS the confirmation must itself stay reachable while
  // unconfirmed, or the gate locks from the inside. Delivery is asynchronous,
  // so what is asserted here is the queued job, not a sent mail.

  const pending = await createUnverifiedUser(
    app,
    'pending@example.test',
    'correct horse battery staple',
  );
  await expectOk('unverified caller can request the verification mail (the gate needs it)', () =>
    callFunction(pending.token, 'sendVerificationEmail', {}),
  );

  const queued = await db
    .collection('emailOutbox')
    .where('recipientEmail', '==', 'pending@example.test')
    .get();
  if (queued.size !== 1) {
    throw new Error(`expected exactly one queued mail, found ${queued.size}`);
  }
  const job = queued.docs[0].data();
  if (job.kind !== 'verification') throw new Error(`unexpected job kind ${job.kind}`);
  if (typeof job.actionLink !== 'string' || !job.actionLink.startsWith('http')) {
    throw new Error(`queued job carries no usable action link: ${job.actionLink}`);
  }
  if (!job.expireAt) throw new Error('queued job has no expireAt, so TTL cannot reap it');
  console.log('OK verification mail is queued with a real action link');

  // An already-confirmed account asks too, because the gate polls; answering
  // with a second mail for finished work would only confuse.
  const settled = await callFunction(verified.token, 'sendVerificationEmail', {});
  if (!settled.ok || settled.body.result?.alreadyVerified !== true) {
    throw new Error(`expected alreadyVerified answer, got ${JSON.stringify(settled.body)}`);
  }
  const none = await db
    .collection('emailOutbox')
    .where('recipientEmail', '==', 'verified@example.test')
    .get();
  if (!none.empty) throw new Error('a verified account must not queue another mail');
  console.log('OK verified account is answered without queueing a second mail');

  // The SDK throttled resends for us; sending ourselves means owning that.
  const limited = await createUnverifiedUser(
    app,
    'flooder@example.test',
    'correct horse battery staple',
  );
  // EMAIL_VERIFICATION_PER_WINDOW is 3, so three go through and the next does not.
  await callFunction(limited.token, 'sendVerificationEmail', {});
  await callFunction(limited.token, 'sendVerificationEmail', {});
  await callFunction(limited.token, 'sendVerificationEmail', {});
  await expectError('a fourth resend inside the window is refused', 'RESOURCE_EXHAUSTED', () =>
    callFunction(limited.token, 'sendVerificationEmail', {}),
  );

  await app.delete();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
