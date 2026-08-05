const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const safeDirectory = root.replace(/\\/g, '/');
const git = (args) =>
  execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

if (process.env.TOGETHER_RELEASE_CONFIRM !== 'production') {
  console.error(
    'Production-Deploy gesperrt. Setze TOGETHER_RELEASE_CONFIRM=production erst nach dem Staging-Release-Gate.',
  );
  process.exit(1);
}

const changes = git(['status', '--porcelain']);
if (changes) {
  console.error(
    'Production-Deploy gesperrt: Der Git-Arbeitsstand enthält uncommittete Änderungen.',
  );
  process.exit(1);
}

const branch = git(['branch', '--show-current']);
if (!['main', 'master'].includes(branch)) {
  console.error(
    `Production-Deploy gesperrt: Branch "${branch || 'detached HEAD'}" ist kein Release-Branch.`,
  );
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const expectedTag = `v${appJson.expo?.version}`;
let currentTag;
try {
  currentTag = git(['describe', '--tags', '--exact-match', 'HEAD']);
} catch {
  console.error(`Production-Deploy gesperrt: HEAD muss mit ${expectedTag} getaggt sein.`);
  process.exit(1);
}
if (currentTag !== expectedTag) {
  console.error(
    `Production-Deploy gesperrt: Tag ${currentTag} passt nicht zur App-Version ${expectedTag}.`,
  );
  process.exit(1);
}

console.log(`Production-Deploy bestätigt: ${branch} @ ${git(['rev-parse', '--short', 'HEAD'])}`);
