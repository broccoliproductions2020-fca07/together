const { runFirebaseEmulators } = require('./firebase-test-runner.cjs');

const command = process.argv.slice(2).join(' ') || 'node scripts/test-journey-rtdb.js';
process.exit(
  runFirebaseEmulators({
    config: 'firebase.test.json',
    only: 'auth,database',
    command,
    env: { TEST_AUTH_EMULATOR_PORT: '9199', TEST_DATABASE_EMULATOR_PORT: '9101' },
  }),
);
