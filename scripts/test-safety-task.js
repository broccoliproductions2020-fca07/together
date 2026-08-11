const PROJECT_ID = 'demo-together';
const DATABASE_PORT = Number(process.env.TEST_DATABASE_EMULATOR_PORT ?? 8281);
const FUNCTIONS_PORT = Number(process.env.TEST_FUNCTIONS_EMULATOR_PORT ?? 5002);

process.env.FIREBASE_DATABASE_EMULATOR_HOST = `127.0.0.1:${DATABASE_PORT}`;

const admin = require('./firebase-admin-tools.cjs');

async function callTask(data) {
  const response = await fetch(
    `http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT_ID}/europe-west3/dispatchSafetyAutoExtend`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    },
  );
  if (!response.ok) throw new Error(`Safety-Task returned ${response.status}.`);
}

async function main() {
  const app = admin.initializeApp(
    { projectId: PROJECT_ID, databaseURL: 'https://demo-together-default-rtdb.firebaseio.com' },
    'safety-task-test',
  );
  const database = app.database();
  const uid = 'safety_task_test_uid';
  const expiresAt = Date.now() + 5 * 60 * 1000;
  await database.ref(`heimwege/${uid}`).set({
    status: 'blue',
    startedAt: Date.now() - 60 * 60 * 1000,
    expiresAt,
    retainUntil: expiresAt + 3 * 60 * 1000,
  });

  await callTask({ uid, expiresAt });
  const extended = (await database.ref(`heimwege/${uid}`).get()).val();
  if (
    extended?.expiresAt !== expiresAt + 20 * 60 * 1000 ||
    extended?.autoExtendCount !== 1
  ) {
    throw new Error('Safety-Task did not extend the exact expected session window.');
  }

  await callTask({ uid, expiresAt });
  const retried = (await database.ref(`heimwege/${uid}`).get()).val();
  if (retried?.autoExtendCount !== 1) {
    throw new Error('A stale Safety-Task was not a no-op.');
  }
  await app.delete();
  console.log('OK Safety Cloud Task extends once and stale delivery is a no-op');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
