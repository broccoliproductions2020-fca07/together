const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function resolveJavaHome() {
  if (process.platform !== 'win32') return process.env.JAVA_HOME;

  const adoptium = 'C:\\Program Files\\Eclipse Adoptium';
  if (!fs.existsSync(adoptium)) return process.env.JAVA_HOME;

  const jdk = fs
    .readdirSync(adoptium)
    .filter((directory) => directory.startsWith('jdk'))
    .sort()
    .pop();

  return jdk ? path.join(adoptium, jdk) : process.env.JAVA_HOME;
}

/**
 * Some Firebase CLI versions print the environment supplied to
 * `emulators:exec`. Never inherit the host environment, because a local token
 * or CI secret would otherwise end up in a test log.
 */
function createSafeEnvironment(overrides = {}) {
  const originalHome = process.env.USERPROFILE || process.env.HOME;
  const sharedEmulatorCache = originalHome
    ? path.join(originalHome, '.cache', 'firebase', 'emulators')
    : null;
  const cliHome = path.join(PROJECT_ROOT, '.firebase-cli-home');
  const appData = path.join(cliHome, 'AppData', 'Roaming');
  const localAppData = path.join(cliHome, 'AppData', 'Local');
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(localAppData, { recursive: true });

  const javaHome = resolveJavaHome();
  const inheritedPath = process.env.PATH || process.env.Path || '';
  const executablePath = javaHome
    ? `${path.join(javaHome, 'bin')}${path.delimiter}${inheritedPath}`
    : inheritedPath;
  const environment = {
    PATH: executablePath,
    HOME: cliHome,
    USERPROFILE: cliHome,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    NO_UPDATE_NOTIFIER: '1',
    ...overrides,
  };

  // Required by Windows process creation; none of these variables contain app
  // secrets. Do not spread process.env here.
  for (const key of ['ComSpec', 'SystemRoot', 'WINDIR', 'PATHEXT', 'TEMP', 'TMP', 'OS', 'CI']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  if (process.platform === 'win32') environment.Path = executablePath;
  if (javaHome) environment.JAVA_HOME = javaHome;
  if (sharedEmulatorCache && fs.existsSync(sharedEmulatorCache)) {
    environment.FIREBASE_EMULATORS_PATH = sharedEmulatorCache;
  }

  return environment;
}

function runFirebaseEmulators({ config, only, command, env, silent = false }) {
  const firebaseBin = path.join(
    PROJECT_ROOT,
    'node_modules',
    'firebase-tools',
    'lib',
    'bin',
    'firebase.js',
  );
  const args = [
    firebaseBin,
    'emulators:exec',
    '--project',
    'demo-together',
    '--config',
    config,
    '--only',
    only,
  ];
  if (silent) args.push('--log-verbosity', 'SILENT');
  args.push(command);

  const result = spawnSync(process.execPath, args, {
    cwd: PROJECT_ROOT,
    env: createSafeEnvironment(env),
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Firebase-Emulator-Test konnte nicht gestartet werden: ${result.error.message}`);
  }
  return result.status ?? 1;
}

module.exports = { runFirebaseEmulators };
