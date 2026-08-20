import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const auditDate = process.argv[2] ?? '2026-08-18';
const outputPath = path.join(root, 'docs', 'audits', `release-readiness-inventory-${auditDate}.md`);

const rootFiles = [
  '.firebaserc',
  '.github',
  '.node-version',
  '.npmrc',
  '.nvmrc',
  'admin',
  'android',
  'app.config.js',
  'app.json',
  'assets',
  'babel.config.js',
  'database.rules.json',
  'eas.json',
  'eslint.config.js',
  'expo-env.d.ts',
  'firebase',
  'firebase.auth-storage.test.json',
  'firebase.firestore.test.json',
  'firebase.functions.test.json',
  'firebase.json',
  'firebase.test.json',
  'firestore.indexes.json',
  'firestore.rules',
  'functions',
  'global.d.ts',
  'metro.config.js',
  'nativewind-env.d.ts',
  'package-lock.json',
  'package.json',
  'postcss.config.mjs',
  'react-native-css-env.d.ts',
  'scripts',
  'src',
  'storage.rules',
  'tsconfig.json',
];

const excludedSegments = new Set([
  '.cxx',
  '.gradle',
  'build',
  'dist',
  'node_modules',
  'release',
  'reports',
]);

const isExcluded = (relativePath) => {
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized.startsWith('docs/audits/')) return true;
  if (normalized.startsWith('scripts/expo-universe/')) return true;
  return normalized.split('/').some((segment) => excludedSegments.has(segment));
};

const walk = (relativePath, files) => {
  if (isExcluded(relativePath)) return;
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) return;
  const stat = statSync(absolutePath);
  if (stat.isFile()) {
    files.push(relativePath.replaceAll('\\', '/'));
    return;
  }
  for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
    walk(path.join(relativePath, entry.name), files);
  }
};

const files = [];
for (const entry of rootFiles) walk(entry, files);
files.sort((a, b) => a.localeCompare(b, 'en'));

const gitState = new Map();
try {
  const output = execFileSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  for (const line of output.split(/\r?\n/u)) {
    if (!line) continue;
    const state = line.slice(0, 2).trim() || 'modified';
    const rawPath = line.slice(3).split(' -> ').at(-1)?.replace(/^"|"$/gu, '') ?? '';
    gitState.set(rawPath.replaceAll('\\', '/'), state);
  }
} catch {
  // Inventory remains useful without Git metadata.
}

const textExtensions = new Set([
  '.cjs', '.css', '.gradle', '.html', '.js', '.json', '.kts', '.md', '.mjs',
  '.plist', '.ps1', '.rules', '.sql', '.ts', '.tsx', '.txt', '.xml', '.yml', '.yaml',
]);

const classify = (file) => {
  if (file.startsWith('src/app/')) return 'Routes / navigation';
  if (/Screen\.tsx$/u.test(file)) return 'Screens';
  if (/Sheet\.tsx$/u.test(file)) return 'Sheets / modals';
  if (file.includes('/components/')) return 'Components / UI';
  if (/Provider\.tsx$/u.test(file) || file.includes('/providers/')) return 'Providers / context';
  if (file.includes('/hooks/') || /\/use[A-Z][^/]*\.(ts|tsx)$/u.test(file)) return 'Hooks';
  if (file.includes('/services/')) return 'Services / Firebase seams';
  if (file.includes('/utils/')) return 'Selectors / utilities';
  if (file.startsWith('functions/')) return 'Cloud Functions';
  if (file === 'firestore.rules') return 'Firestore Rules';
  if (file === 'database.rules.json') return 'RTDB Rules';
  if (file === 'storage.rules') return 'Storage Rules';
  if (file === 'firestore.indexes.json') return 'Firestore indexes';
  if (file.startsWith('scripts/test-') || file.includes('.test.')) return 'Tests';
  if (file.startsWith('scripts/')) return 'Build / seed / release tooling';
  if (file.startsWith('android/')) return 'Android native project';
  if (file.startsWith('assets/')) return 'Runtime assets';
  if (file.startsWith('admin/')) return 'Local operations tooling';
  if (file.startsWith('.github/')) return 'CI / release automation';
  if (file.startsWith('firebase/')) return 'Native Firebase identities';
  if (file.startsWith('src/features/legal/') || file.startsWith('docs/legal/')) return 'Legal content';
  if (file.startsWith('src/domain/') || /\/types(\/|\.)/u.test(file)) return 'Domain / data models';
  if (file.startsWith('src/')) return 'Client module';
  return 'Configuration / dependencies';
};

const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const groups = new Map();
for (const file of files) {
  const group = classify(file);
  const entries = groups.get(group) ?? [];
  entries.push(file);
  groups.set(group, entries);
}

const lines = [
  `# Release-readiness inventory · ${auditDate}`,
  '',
  `Generated at ${new Date().toISOString()} from the current Dev/Staging worktree.`,
  '',
  'Reproduce from the repository root:',
  '',
  '```powershell',
  `node docs/audits/tools/generate-release-readiness-inventory.mjs ${auditDate}`,
  '```',
  '',
  `Total inventoried productive/configuration units: **${files.length}**. Generated audit artifacts, vendor trees, build outputs and design prototypes are excluded.`,
  '',
  'The SHA-256 column pins this audit to the exact executable/configuration state. “Git” is the working-tree state at generation time; `clean` means no path-local change was reported.',
  '',
  '## Area summary',
  '',
  '| Area | Units |',
  '| --- | ---: |',
];

for (const [group, entries] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  lines.push(`| ${escapeCell(group)} | ${entries.length} |`);
}

for (const [group, entries] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  lines.push('', `## ${group}`, '', '| Path | Lines | Bytes | Git | SHA-256 |', '| --- | ---: | ---: | --- | --- |');
  for (const file of entries) {
    const absolutePath = path.join(root, file);
    const buffer = readFileSync(absolutePath);
    const extension = path.extname(file).toLowerCase();
    const lineCount = textExtensions.has(extension)
      ? buffer.toString('utf8').split(/\r?\n/u).length
      : 'binary';
    const digest = createHash('sha256').update(buffer).digest('hex');
    lines.push(`| ${escapeCell(file)} | ${lineCount} | ${buffer.length} | ${gitState.get(file) ?? 'clean'} | ${digest} |`);
  }
}

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
process.stdout.write(`${path.relative(root, outputPath)}\t${files.length} units\n`);

