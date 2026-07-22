const PROJECT_ID = 'demo-together';
const DATABASE_NS = 'demo-together-default-rtdb';
const AUTH_PORT = process.env.TEST_AUTH_EMULATOR_PORT ?? '9199';
const DATABASE_PORT = process.env.TEST_DATABASE_EMULATOR_PORT ?? '9100';
const AUTH_BASE = `http://127.0.0.1:${AUTH_PORT}/identitytoolkit.googleapis.com/v1`;
const DB_BASE = `http://127.0.0.1:${DATABASE_PORT}`;
process.env.FIREBASE_DATABASE_EMULATOR_HOST = `127.0.0.1:${DATABASE_PORT}`;
const admin = require('../functions/node_modules/firebase-admin');

async function signInAnon() {
  const response = await fetch(`${AUTH_BASE}/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Auth signUp failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return { uid: json.localId, token: json.idToken };
}

function dbUrl(path, token) {
  const params = new URLSearchParams({ ns: DATABASE_NS });
  if (token) params.set('auth', token);
  return `${DB_BASE}${path}.json?${params.toString()}`;
}

async function dbRequest(method, path, token, body) {
  const response = await fetch(dbUrl(path, token), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, ok: response.ok, json };
}

async function expectOk(label, promise) {
  const result = await promise;
  if (!result.ok) {
    throw new Error(`${label} expected OK, got ${result.status}: ${JSON.stringify(result.json)}`);
  }
  console.log(`OK ${label}`);
  return result;
}

async function expectDenied(label, promise) {
  const result = await promise;
  if (result.ok) {
    throw new Error(`${label} expected deny, got OK: ${JSON.stringify(result.json)}`);
  }
  console.log(`DENIED ${label}`);
  return result;
}

async function main() {
  process.env.GCLOUD_PROJECT = PROJECT_ID;

  const alice = await signInAnon();
  const bob = await signInAnon();
  const stranger = await signInAnon();
  const activityId = `smoke-${Date.now()}`;
  const validLocation = {
    lat: 52.5208,
    lng: 13.4095,
    status: 'onTheWay',
    updatedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };

  const emptyOwnSession = await expectOk(
    'owner can subscribe before a Safety session exists',
    dbRequest('GET', `/heimwege/${alice.uid}`, alice.token),
  );
  if (emptyOwnSession.json !== null) {
    throw new Error('empty owner Safety path expected null');
  }

  // Membership is now an Admin/Cloud Function responsibility. No client may
  // create or expand the RTDB membership map, even when it knows an activity ID.
  await expectDenied(
    'client cannot create journey membership',
    dbRequest('PUT', `/journeys/${activityId}/members`, alice.token, {
      [alice.uid]: true,
    }),
  );

  await expectDenied(
    'client cannot write location before server membership approval',
    dbRequest('PUT', `/journeys/${activityId}/locations/${alice.uid}`, alice.token, validLocation),
  );

  await expectDenied(
    'stranger cannot read journey room',
    dbRequest('GET', `/journeys/${activityId}`, stranger.token),
  );

  await expectDenied(
    'unauthenticated client cannot create journey membership',
    dbRequest('PUT', `/journeys/${activityId}/members`, null, {
      [alice.uid]: true,
    }),
  );

  await expectDenied(
    'invalid coordinate payload is rejected without membership',
    dbRequest('PUT', `/journeys/${activityId}/locations/${alice.uid}`, alice.token, {
      ...validLocation,
      lat: 200,
    }),
  );

  const adminApp = admin.initializeApp(
    {
      projectId: PROJECT_ID,
      databaseURL: `https://${DATABASE_NS}.firebaseio.com`,
    },
    `rtdb-rules-${Date.now()}`,
  );
  const now = Date.now();
  await adminApp
    .database()
    .ref()
    .update({
      [`heimwege/${alice.uid}`]: {
        displayName: 'Alice',
        initials: 'AA',
        status: 'blue',
        startedAt: now,
        // Make the first client heartbeat eligible for the blue-mode 25s
        // minimum; the next immediate write below must then be rejected.
        updatedAt: now - 30_000,
        expiresAt: now + 60 * 60 * 1000,
        retainUntil: now + 60 * 60 * 1000 + 3 * 60 * 1000,
        audienceUids: { [bob.uid]: true },
        companions: {},
      },
      [`heimwegeIndex/${bob.uid}/${alice.uid}`]: true,
      [`journeys/${activityId}`]: {
        expiresAt: now + 60 * 60 * 1000,
        members: { [alice.uid]: true, [bob.uid]: true },
      },
    });

  await expectDenied(
    'client cannot create a Safety session',
    dbRequest('PUT', `/heimwege/${bob.uid}`, bob.token, {
      displayName: 'Bob',
      status: 'blue',
      startedAt: now,
      updatedAt: now,
      expiresAt: now + 60_000,
      retainUntil: now + 120_000,
      audienceUids: { [alice.uid]: true },
    }),
  );
  await expectOk(
    'selected companion can read Safety session',
    dbRequest('GET', `/heimwege/${alice.uid}`, bob.token),
  );
  await expectDenied(
    'stranger cannot read Safety session',
    dbRequest('GET', `/heimwege/${alice.uid}`, stranger.token),
  );
  await expectOk(
    'owner can update live Safety location fields',
    dbRequest('PATCH', `/heimwege/${alice.uid}`, alice.token, {
      updatedAt: Date.now(),
      location: { lat: 52.52, lng: 13.4, at: Date.now() },
    }),
  );
  await expectDenied(
    'owner cannot flood blue Safety location updates',
    dbRequest('PATCH', `/heimwege/${alice.uid}`, alice.token, {
      updatedAt: Date.now(),
      location: { lat: 52.5201, lng: 13.4001, at: Date.now() },
    }),
  );
  const approvedJourneyLocation = {
    lat: 52.5208,
    lng: 13.4095,
    status: 'onTheWay',
    updatedAt: Date.now(),
    expiresAt: now + 30 * 60 * 1000,
  };
  await expectOk(
    'approved member can publish one journey location',
    dbRequest('PUT', `/journeys/${activityId}/locations/${alice.uid}`, alice.token, approvedJourneyLocation),
  );
  await expectDenied(
    'approved member cannot flood journey locations',
    dbRequest('PUT', `/journeys/${activityId}/locations/${alice.uid}`, alice.token, {
      ...approvedJourneyLocation,
      lat: 52.521,
      updatedAt: Date.now(),
    }),
  );
  await expectDenied(
    'invalid coordinate payload is rejected after membership approval',
    dbRequest('PUT', `/journeys/${activityId}/locations/${alice.uid}`, alice.token, {
      ...approvedJourneyLocation,
      lat: 200,
      updatedAt: approvedJourneyLocation.updatedAt + 20_000,
    }),
  );
  await expectDenied(
    'owner cannot bypass server-owned Safety status alerts',
    dbRequest('PATCH', `/heimwege/${alice.uid}`, alice.token, {
      status: 'orange',
      updatedAt: Date.now(),
    }),
  );
  const checkIn = { requestedAt: Date.now(), dueAt: Date.now() + 90_000 };
  await adminApp.database().ref(`heimwege/${alice.uid}/checkIn`).set(checkIn);
  await expectOk(
    'owner can answer the server-owned Safety check-in',
    dbRequest('PUT', `/heimwege/${alice.uid}/checkIn`, alice.token, {
      ...checkIn,
      answeredAt: Date.now(),
    }),
  );
  await expectDenied(
    'owner cannot rewrite the Safety check-in deadline',
    dbRequest('PUT', `/heimwege/${alice.uid}/checkIn`, alice.token, {
      requestedAt: checkIn.requestedAt,
      dueAt: checkIn.dueAt + 60_000,
      answeredAt: Date.now(),
    }),
  );
  await expectDenied(
    'owner cannot rewrite server-owned Safety audience directly',
    dbRequest('PATCH', `/heimwege/${alice.uid}`, alice.token, {
      audienceUids: { [stranger.uid]: true },
    }),
  );
  await expectDenied(
    'companion cannot forge a direct confirmation',
    dbRequest('PUT', `/heimwege/${alice.uid}/companions/${bob.uid}`, bob.token, {
      confirmedAt: Date.now(),
    }),
  );
  await expectDenied(
    'companion cannot directly delete Safety session',
    dbRequest('DELETE', `/heimwege/${alice.uid}`, bob.token),
  );
  await expectDenied(
    'owner cannot forge Safety fan-out index',
    dbRequest('PUT', `/heimwegeIndex/${stranger.uid}/${alice.uid}`, alice.token, true),
  );

  await adminApp.database().ref(`journeys/${activityId}/expiresAt`).set(Date.now() - 1_000);
  await expectDenied(
    'member cannot read an expired journey room',
    dbRequest('GET', `/journeys/${activityId}/locations`, bob.token),
  );
  await expectDenied(
    'member cannot write to an expired journey room',
    dbRequest('PUT', `/journeys/${activityId}/locations/${alice.uid}`, alice.token, {
      ...approvedJourneyLocation,
      updatedAt: approvedJourneyLocation.updatedAt + 40_000,
    }),
  );

  await adminApp
    .database()
    .ref(`heimwege/${alice.uid}`)
    .update({
      status: 'orange',
      expiresAt: Date.now() - 1_000,
      retainUntil: Date.now() + 30 * 60 * 1000,
    });
  await expectOk(
    'selected companion can read retained last point after timeout',
    dbRequest('GET', `/heimwege/${alice.uid}`, bob.token),
  );
  await expectDenied(
    'owner cannot publish location after automatic timeout',
    dbRequest('PATCH', `/heimwege/${alice.uid}`, alice.token, {
      updatedAt: Date.now(),
      location: { lat: 52.521, lng: 13.401, at: Date.now() },
    }),
  );

  await expectOk(
    'owner can directly end own Safety session',
    dbRequest('DELETE', `/heimwege/${alice.uid}`, alice.token),
  );
  const deletedOwnSession = await expectOk(
    'owner can observe Safety session deletion',
    dbRequest('GET', `/heimwege/${alice.uid}`, alice.token),
  );
  if (deletedOwnSession.json !== null) {
    throw new Error('deleted owner Safety path expected null');
  }
  await expectDenied(
    'former companion cannot read a deleted Safety session',
    dbRequest('GET', `/heimwege/${alice.uid}`, bob.token),
  );

  await adminApp.delete();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
