const { runFirebaseEmulators } = require('./firebase-test-runner.cjs');

const command = process.argv.slice(2).join(' ') || 'node scripts/test-email-verification-gate.js';
process.exit(
  runFirebaseEmulators({
    config: 'firebase.functions.test.json',
    only: 'auth,firestore,database,functions',
    command,
    silent: true,
    env: {
      FUNCTIONS_DISCOVERY_TIMEOUT: '60',
      TEST_AUTH_EMULATOR_PORT: '9199',
      TEST_FIRESTORE_EMULATOR_PORT: '8180',
      TEST_FUNCTIONS_EMULATOR_PORT: '5002',
      TEST_DATABASE_EMULATOR_PORT: '8281',
      FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:8281',
      FIREBASE_DATABASE_URL: 'https://demo-together-default-rtdb.firebaseio.com',
      FUNCTIONS_ENFORCE_EMAIL_VERIFICATION: 'true',
    },
  }),
);
