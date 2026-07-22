/**
 * Executes callable-function integration tests against local Firebase
 * emulators only. It keeps Firebase CLI state inside the repository so no
 * developer account, cloud project or global firebase configuration is used.
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
    if (jdk) process.env.PATH = path.join(adoptium, jdk, 'bin') + path.delimiter + process.env.PATH;
  }
}

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

// Functions discovery is slow on this machine. Without this, firebase-tools
// can start the suite with Firestore but silently omit all callables.
process.env.FUNCTIONS_DISCOVERY_TIMEOUT = process.env.FUNCTIONS_DISCOVERY_TIMEOUT || '60';
process.env.TEST_AUTH_EMULATOR_PORT = '9199';
process.env.TEST_FIRESTORE_EMULATOR_PORT = '8180';
process.env.TEST_FUNCTIONS_EMULATOR_PORT = '5002';
process.env.TEST_DATABASE_EMULATOR_PORT = '8281';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:8281';
process.env.FIREBASE_DATABASE_URL = 'https://demo-together-default-rtdb.firebaseio.com';

const firebaseBin = path.join(
  __dirname,
  '..',
  'node_modules',
  'firebase-tools',
  'lib',
  'bin',
  'firebase.js',
);
const command = process.argv.slice(2).join(' ') || 'node scripts/test-functions.js';
const result = spawnSync(
  process.execPath,
  [
    firebaseBin,
    'emulators:exec',
    '--project',
    'demo-together',
    '--config',
    'firebase.functions.test.json',
    '--only',
    'auth,firestore,database,functions',
    '--log-verbosity',
    'SILENT',
    command,
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
