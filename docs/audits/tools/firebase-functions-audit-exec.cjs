const { runFirebaseEmulators } = require('../../../scripts/firebase-test-runner.cjs');

const requested = process.argv.slice(2);
const emailVerification = requested[0] === '--email-verification';
const command = emailVerification
  ? 'node scripts/test-email-verification-gate.js'
  : requested.join(' ') || 'node scripts/test-functions.js';

process.exit(
  runFirebaseEmulators({
    config: 'firebase.functions.audit.json',
    only: emailVerification
      ? 'auth,firestore,database,functions'
      : 'auth,firestore,database,storage,functions',
    command,
    silent: true,
    env: {
      FUNCTIONS_DISCOVERY_TIMEOUT: '60',
      TEST_AUTH_EMULATOR_PORT: '9199',
      TEST_FIRESTORE_EMULATOR_PORT: '8180',
      TEST_FUNCTIONS_EMULATOR_PORT: '5002',
      TEST_DATABASE_EMULATOR_PORT: '8281',
      FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9298',
      FIREBASE_STORAGE_BUCKET: 'demo-together.appspot.com',
      FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:8281',
      FIREBASE_DATABASE_URL: 'https://demo-together-default-rtdb.firebaseio.com',
      CLOUD_TASKS_EMULATOR_HOST: '127.0.0.1:9599',
      ...(emailVerification ? { FUNCTIONS_ENFORCE_EMAIL_VERIFICATION: 'true' } : {}),
    },
  }),
);
