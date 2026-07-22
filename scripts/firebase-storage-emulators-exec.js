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

// Firebase CLI preferences are not allowed to touch the host user's config in
// restricted/dev environments. Keep the emulator runner self-contained.
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

const firebaseBin = path.join(__dirname, '..', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
// Matches the ports already declared in firebase.auth-storage.test.json — stop
// the main dev emulator suite first, since both use 9099/9198.
process.env.TEST_AUTH_EMULATOR_PORT = '9099';
process.env.TEST_STORAGE_EMULATOR_PORT = '9198';
const command = process.argv.slice(2).join(' ') || 'node scripts/test-storage-rules.js';

const result = spawnSync(
  process.execPath,
  [
    firebaseBin,
    'emulators:exec',
    '--project',
    'demo-together',
    '--config',
    'firebase.auth-storage.test.json',
    '--only',
    'auth,storage',
    command,
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
