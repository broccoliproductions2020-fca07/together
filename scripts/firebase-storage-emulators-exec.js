const { runFirebaseEmulators } = require('./firebase-test-runner.cjs');

const command = process.argv.slice(2).join(' ') || 'node scripts/test-storage-rules.js';
process.exit(
  runFirebaseEmulators({
    config: 'firebase.auth-storage.test.json',
    only: 'auth,storage',
    command,
    env: { TEST_AUTH_EMULATOR_PORT: '9399', TEST_STORAGE_EMULATOR_PORT: '9398' },
  }),
);
