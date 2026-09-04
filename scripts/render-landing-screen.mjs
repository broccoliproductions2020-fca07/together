/**
 * Baut die Seed-Welt eines Landing-Screenshots, nimmt ihn im echten Dev Client
 * auf und aktualisiert anschliessend die WebP-Dateien der Landingpage.
 *
 * Voraussetzung: Emulatoren und Capture-Metro laufen bereits:
 *   npm run emulators
 *   npm run screens:metro
 *
 * Aufnahme:
 *   npm run screens:render -- mica-padel-activity
 *   npm run screens:render -- mica-time-matching
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RECIPES } from './lib/screen-recipes.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const landingRoot = resolve(repoRoot, 'landing');
const name = process.argv[2];
const recipe = RECIPES[name];

if (!name || !recipe) {
  console.error(`Screenshot angeben. Verfuegbar:\n  ${Object.keys(RECIPES).join('\n  ')}`);
  process.exit(1);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\n[1/3] Seed-Welt: npm run ${recipe.world}`);
run(npm, ['run', recipe.world]);

console.log(`\n[2/3] Aufnahme: ${name}`);
run(process.execPath, [resolve(repoRoot, 'scripts/capture-screens.mjs'), name]);

console.log('\n[3/3] Landing-WebPs aktualisieren');
run(npm, ['run', 'screenshots:build'], landingRoot);

console.log(`\nFertig: landing/screenshots-master/${name}.png`);
