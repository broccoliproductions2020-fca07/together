/**
 * Runs the small Firebase Emulator Suite smoke tests with the same Java PATH
 * bootstrap as scripts/emulators.js. No global firebase CLI needed.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform === 'win32') {
  const adoptium = 'C:\\Program Files\\Eclipse Adoptium';
  if (fs.existsSync(adoptium)) {
    const jdk = fs
      .readdirSync(adoptium)
      .filter((dir) => dir.startsWith('jdk'))
      .sort()
      .pop();
    if (jdk) {
      process.env.PATH = path.join(adoptium, jdk, 'bin') + path.delimiter + process.env.PATH;
    }
  }
}

// Keep Firebase CLI preferences inside the workspace. Without this, the RTDB
// smoke test tries to read the host user's configstore file and fails in the
// restricted test environment even though the emulator itself is local.
const originalHome = process.env.USERPROFILE || process.env.HOME;
const sharedEmulatorCache = originalHome
  ? path.join(originalHome, '.cache', 'firebase', 'emulators')
  : null;
if (sharedEmulatorCache && fs.existsSync(sharedEmulatorCache)) {
  process.env.FIREBASE_EMULATORS_PATH = sharedEmulatorCache;
}
const cliHome = path.join(__dirname, '..', '.firebase-cli-home');
fs.mkdirSync(cliHome, { recursive: true });
process.env.HOME = cliHome;
process.env.USERPROFILE = cliHome;
process.env.APPDATA = path.join(cliHome, 'AppData', 'Roaming');
process.env.LOCALAPPDATA = path.join(cliHome, 'AppData', 'Local');
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.LOCALAPPDATA, { recursive: true });

const firebaseBin = path.join(
  __dirname,
  '..',
  'node_modules',
  'firebase-tools',
  'lib',
  'bin',
  'firebase.js',
);
const command = process.argv.slice(2).join(' ') || 'node scripts/test-journey-rtdb.js';
process.env.TEST_AUTH_EMULATOR_PORT = process.env.TEST_AUTH_EMULATOR_PORT ?? '9199';
process.env.TEST_DATABASE_EMULATOR_PORT = process.env.TEST_DATABASE_EMULATOR_PORT ?? '9101';

const result = spawnSync(
  process.execPath,
  [
    firebaseBin,
    'emulators:exec',
    '--project',
    'demo-together',
    '--config',
    'firebase.test.json',
    '--only',
    'auth,database',
    command,
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
