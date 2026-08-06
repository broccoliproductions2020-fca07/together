/*
 * Recovery helper for a Functions source drift. It reads one Function's
 * deployed source archive with the existing Firebase CLI login and saves it to
 * the operating system temp directory for comparison. It never deploys,
 * changes Cloud Storage, or prints credentials.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const auth = require('firebase-tools/lib/auth');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const FIREBASE_BIN = path.join(
  PROJECT_ROOT,
  'node_modules',
  'firebase-tools',
  'lib',
  'bin',
  'firebase.js',
);

function parseArguments(argv) {
  let project;
  let functionId;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') project = argv[++index];
    else if (argv[index] === '--function') functionId = argv[++index];
    else throw new Error(`Unbekannte Option: ${argv[index]}`);
  }
  if (!project || !functionId) {
    throw new Error('Verwendung: --project <Projekt> --function <Function-Name>');
  }
  return { project, functionId };
}

function parseJsonOutput(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Firebase lieferte keine lesbare Function-Liste.');
  return JSON.parse(output.slice(start, end + 1));
}

function deployedFunction(project, functionId) {
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
  const payload = parseJsonOutput(result.stdout);
  const target = payload.result?.find(
    (item) => item.id === functionId && item.codebase === 'default',
  );
  if (!target?.source?.storageSource?.bucket || !target.source.storageSource.object) {
    throw new Error(`Keine Cloud-Quelle fuer ${functionId} gefunden.`);
  }
  return target;
}

async function downloadSource({ project, functionId }) {
  const target = deployedFunction(project, functionId);
  const account = auth.getProjectDefaultAccount(PROJECT_ROOT);
  if (!account?.tokens?.refresh_token) {
    throw new Error(
      'Keine Firebase-CLI-Anmeldung gefunden. Bitte zuerst firebase login ausfuehren.',
    );
  }
  const token = await auth.getAccessToken(account.tokens.refresh_token, []);
  const source = target.source.storageSource;
  const url = new URL(
    `https://storage.googleapis.com/download/storage/v1/b/${source.bucket}/o/${encodeURIComponent(source.object)}`,
  );
  url.searchParams.set('alt', 'media');
  if (source.generation) url.searchParams.set('generation', source.generation);

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!response.ok)
    throw new Error(`Cloud-Quelle konnte nicht geladen werden (HTTP ${response.status}).`);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'together-functions-recovery-'));
  const archivePath = path.join(directory, 'function-source.zip');
  await fs.promises.writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  await fs.promises.writeFile(
    path.join(directory, 'source-metadata.json'),
    JSON.stringify(
      {
        functionId,
        project,
        bucket: source.bucket,
        object: source.object,
        generation: source.generation,
      },
      null,
      2,
    ),
  );
  console.log(archivePath);
}

if (require.main === module) {
  downloadSource(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseArguments };
