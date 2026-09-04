/**
 * Prüft die Aufnahme-Rezepte und den Viewbaum-Parser ohne Gerät.
 *
 * Was hier geprüft wird, kann sonst nur ein fehlgeschlagener Aufnahmelauf
 * zeigen — und der kostet einen Emulator-Start, einen Seed und ein Bild.
 *
 *   npm run test:screen-recipes
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MASTER_SIZE, RECIPES } from './lib/screen-recipes.mjs';
import { centre, findNode, parseUiNodes, visibleLabels } from './lib/ui-tree.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

let checks = 0;
const check = (label, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${label}`);
};

/* ── Rezepte ──────────────────────────────────────────────────────────── */

check('Jedes Rezept nennt eine Welt, die es als npm-Skript gibt', () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    assert.ok(recipe.world, `${name}: keine Welt genannt`);
    assert.ok(
      pkg.scripts[recipe.world],
      `${name}: npm-Skript "${recipe.world}" fehlt in package.json`,
    );
  }
});

check('Jedes Rezept endet mit einer Prüfung, nie mit einem blinden Auslöser', () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    const last = recipe.steps.at(-1);
    assert.ok(last?.expect, `${name}: letzter Schritt ist kein expect`);
  }
});

check('Jedes Rezept startet die App, statt anzunehmen, dass sie vorn liegt', () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    assert.ok(recipe.steps[0]?.launch, `${name}: erster Schritt ist kein launch`);
  }
});

check('Jedes Rezept hat eine Notiz für --list', () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    assert.ok(recipe.note?.length > 10, `${name}: keine brauchbare Notiz`);
  }
});

check('Master-Größe stimmt mit dem Landing-Encoder überein', () => {
  const encoder = readFileSync(
    join(repoRoot, 'landing', 'scripts', 'encode-screenshots.mjs'),
    'utf8',
  );
  const match = encoder.match(/masterSize\s*=\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)/);
  assert.ok(match, 'masterSize im Encoder nicht gefunden');
  assert.equal(Number(match[1]), MASTER_SIZE.width);
  assert.equal(Number(match[2]), MASTER_SIZE.height);
});

check('Jeder Screenshot, den die Landingpage erwartet, hat ein Rezept', () => {
  const encoder = readFileSync(
    join(repoRoot, 'landing', 'scripts', 'encode-screenshots.mjs'),
    'utf8',
  );
  const block = encoder.match(/screenshotNames\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(block, 'screenshotNames im Encoder nicht gefunden');
  const expected = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const missing = expected.filter((name) => !RECIPES[name]);
  assert.deepEqual(missing, [], `Ohne Rezept: ${missing.join(', ')}`);
});

/* ── Viewbaum ─────────────────────────────────────────────────────────── */

// Gekürzter, aber echter uiautomator-Aufbau: ein anklickbarer Knoten mit
// content-desc, der seinen Text als eigenen Kindknoten trägt.
const FIXTURE = `<?xml version='1.0' encoding='UTF-8'?>
<hierarchy rotation="0">
  <node index="0" text="" class="android.view.ViewGroup" bounds="[0,0][1080,2400]">
    <node index="0" text="" content-desc="Orte suchen" clickable="true" bounds="[120,180][960,292]" />
    <node index="1" text="" content-desc="Du bist offen bis 22:00. Status bearbeiten" clickable="true" bounds="[420,2020][660,2260]">
      <node index="0" text="Offen" clickable="false" bounds="[470,2100][610,2160]" />
    </node>
    <node index="2" text="Amelie Wagner" content-desc="" clickable="false" bounds="[80,900][600,980]" />
    <node index="3" text="" content-desc="Caf&#233; Morgenrot" clickable="false" bounds="[80,1000][600,1080]" />
  </node>
</hierarchy>`;

const nodes = parseUiNodes(FIXTURE);

check('Parser liest alle Knoten mit Bounds', () => {
  assert.equal(nodes.length, 6);
  assert.equal(nodes.filter((node) => node.bounds).length, 6);
});

check('content-desc gilt als Beschriftung, Text als Rückfall', () => {
  assert.deepEqual(visibleLabels(nodes), [
    'Amelie Wagner',
    'Café Morgenrot',
    'Du bist offen bis 22:00. Status bearbeiten',
    'Offen',
    'Orte suchen',
  ]);
});

check('Teilstring und Kleinschreibung finden die zustandsabhängige Beschriftung', () => {
  const node = findNode(nodes, 'offen');
  assert.ok(node);
  assert.equal(node.desc, 'Du bist offen bis 22:00. Status bearbeiten');
});

check('Der anklickbare Knoten gewinnt gegen den Text in seinem Inneren', () => {
  const node = findNode(nodes, 'Offen');
  assert.equal(node.clickable, true);
  assert.deepEqual(centre(node), [540, 2140]);
});

check('Eine fehlende Beschriftung liefert null statt eines Zufallstreffers', () => {
  assert.equal(findNode(nodes, 'Sicher angekommen'), null);
});

check('XML-Entities werden aufgelöst, sonst findet man Umlaute nie', () => {
  assert.ok(findNode(nodes, 'Café Morgenrot'));
});

console.log(`\n${checks} Prüfungen bestanden.`);
