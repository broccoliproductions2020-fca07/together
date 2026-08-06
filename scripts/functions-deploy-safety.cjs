/*
 * A Function can remain live in Firebase even when its export has disappeared
 * from the local source. A broad `firebase deploy --only functions` then risks
 * proposing a destructive deletion. Every supported deploy path goes through
 * this guard before it can deploy.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_ENTRY = path.join(PROJECT_ROOT, 'functions', 'index.js');
const FIREBASE_BIN = path.join(
  PROJECT_ROOT,
  'node_modules',
  'firebase-tools',
  'lib',
  'bin',
  'firebase.js',
);
const FUNCTION_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

function parseArguments(argv) {
  let project;
  let only;
  let deploy = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--project') {
      project = argv[++index];
    } else if (argument === '--only') {
      only = argv[++index];
    } else if (argument === '--deploy') {
      deploy = true;
    } else {
      throw new Error(`Unbekannte Option: ${argument}`);
    }
  }

  if (!project) throw new Error('Bitte --project dev oder --project prod angeben.');
  const targetIds = only
    ? only
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
  if (only && (!targetIds.length || targetIds.some((id) => !FUNCTION_ID_PATTERN.test(id)))) {
    throw new Error('--only erwartet kommagetrennte Function-Namen, z. B. autocompletePlaces.');
  }
  return { project, targetIds, deploy };
}

function localFunctionIds() {
  const source = fs.readFileSync(FUNCTIONS_ENTRY, 'utf8');
  return new Set(
    [...source.matchAll(/\bexports\.([A-Za-z][A-Za-z0-9_]*)\s*=/g)].map((match) => match[1]),
  );
}

function parseJsonOutput(output, label) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`${label} hat keine JSON-Antwort geliefert.`);
  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    throw new Error(`${label} hat keine lesbare JSON-Antwort geliefert.`);
  }
}

function remoteFunctionIds(project) {
  if (!fs.existsSync(FIREBASE_BIN)) {
    throw new Error('Lokales firebase-tools fehlt. Bitte zuerst npm ci ausfuehren.');
  }
  const result = spawnSync(
    process.execPath,
    [FIREBASE_BIN, 'functions:list', '--project', project, '--json', '--non-interactive'],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Firebase Functions konnten nicht gelesen werden:\n${result.stderr || result.stdout}`,
    );
  }
  const payload = parseJsonOutput(result.stdout, 'firebase functions:list');
  if (payload.status !== 'success' || !Array.isArray(payload.result)) {
    throw new Error('Firebase Functions konnten nicht verifiziert werden.');
  }
  return new Set(
    payload.result.filter((item) => item.codebase === 'default').map((item) => item.id),
  );
}

function assertTargetIdsExist(targetIds) {
  const localIds = localFunctionIds();
  const missing = targetIds.filter((id) => !localIds.has(id));
  if (missing.length) {
    throw new Error(
      `Der gezielte Deploy wurde blockiert: lokal nicht exportiert: ${missing.join(', ')}`,
    );
  }
}

function assertFullDeployIsSafe(project) {
  const localIds = localFunctionIds();
  const missing = [...remoteFunctionIds(project)].filter((id) => !localIds.has(id)).sort();
  if (missing.length) {
    throw new Error(
      [
        'Vollstaendiger Functions-Deploy blockiert.',
        'Diese live Functions fehlen im lokalen functions/index.js:',
        `- ${missing.join('\n- ')}`,
        'Zuerst den Source-Drift bereinigen. Fuer eine bewusst eng begrenzte Aenderung',
        'muss ein deploy:functions:<feature>:<umgebung>-Skript mit expliziten Namen verwendet werden.',
      ].join('\n'),
    );
  }
  console.log(
    `Functions-Deploy-Schutz: ${localIds.size} lokale Exports stimmen mit ${project} ueberein.`,
  );
}

function runDeploy({ project, targetIds }) {
  const only = targetIds.length ? targetIds.map((id) => `functions:${id}`).join(',') : 'functions';
  const scope = targetIds.length ? 'targeted' : 'checked-full';
  const result = spawnSync(
    process.execPath,
    [FIREBASE_BIN, 'deploy', '--project', project, '--only', only, '--non-interactive'],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, TOGETHER_FUNCTIONS_DEPLOY_SCOPE: scope },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.targetIds.length) {
    assertTargetIdsExist(options.targetIds);
    console.log(`Gezielter Functions-Deploy verifiziert: ${options.targetIds.join(', ')}`);
  } else {
    assertFullDeployIsSafe(options.project);
  }
  if (options.deploy) runDeploy(options);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { assertFullDeployIsSafe, assertTargetIdsExist, localFunctionIds, parseArguments };
