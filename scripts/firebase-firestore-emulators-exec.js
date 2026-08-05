const { runFirebaseEmulators } = require('./firebase-test-runner.cjs');

const command = process.argv.slice(2).join(' ') || 'node scripts/test-firestore-rules.js';
process.exit(
  runFirebaseEmulators({
    config: 'firebase.firestore.test.json',
    only: 'auth,firestore',
    command,
    env: { TEST_AUTH_EMULATOR_PORT: '9199', TEST_FIRESTORE_EMULATOR_PORT: '8180' },
  }),
);
