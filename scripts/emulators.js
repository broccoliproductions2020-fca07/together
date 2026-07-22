/**
 * Starts the Firebase Emulator Suite in a terminal-proof way:
 *  - Finds the Eclipse Adoptium JDK and prepends it to PATH, so the Firestore
 *    emulator works even in terminals opened before Java was installed
 *    (fresh installs only land in NEW shells — this removes that footgun).
 *  - Invokes firebase-tools directly from node_modules (no global install,
 *    no npx resolution needed).
 *
 * Usage: node scripts/emulators.js [extra firebase args]
 * Wired up as `npm run emulators` / `npm run emulators:persist`.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Make Java visible even if this shell predates the JDK install (Windows).
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

// functions/index.js takes >10s to load on this machine (many deps, cold FS cache);
// firebase-tools' default discovery timeout then silently starts the suite WITHOUT
// any functions ("Failed to load function definition from source" → every callable
// fails with FirebaseError: internal). 60s makes discovery reliable.
process.env.FUNCTIONS_DISCOVERY_TIMEOUT = process.env.FUNCTIONS_DISCOVERY_TIMEOUT || '60';

const firebaseBin = path.join(__dirname, '..', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');

const result = spawnSync(
  process.execPath,
  [firebaseBin, 'emulators:start', '--project', 'demo-together', ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
