/**
 * Nimmt die Landingpage-Screenshots aus dem echten Development Client auf.
 *
 * Das Problem, das dieses Skript löst, ist nicht das Auslösen des Screenshots —
 * `adb screencap` ist eine Zeile. Es ist die Schleife davor: tippen, Bild
 * machen, Bild ANSEHEN, merken dass das Sheet nur halb offen war, korrigieren,
 * von vorn. Jedes angesehene Bild kostet, und dreißig Fehlversuche kosten
 * dreißigmal.
 *
 * Zwei Dinge brechen die Schleife:
 *
 * 1. **Tippen nach Beschriftung, nicht nach Koordinate.** `uiautomator dump`
 *    liefert den Viewbaum mit `text`, `content-desc` und `bounds`. React Native
 *    schreibt `accessibilityLabel` genau dorthin, also lässt sich „Offen
 *    stellen" finden und in seiner Mitte antippen, ohne zu wissen, wo es liegt.
 *    Eine Rezeptzeile überlebt damit auch ein Layout, das sich verschiebt.
 *
 * 2. **Prüfen VOR dem Auslösen.** `expect` verlangt, dass eine bestimmte
 *    Beschriftung sichtbar ist. Ist sie es nicht, bricht der Lauf ab und
 *    DRUCKT, was stattdessen zu sehen war. Das ist dieselbe Information, für
 *    die man sonst das Bild angesehen hätte — als Text, in einer Sekunde.
 *
 * Was das Skript NICHT tut: sich anmelden, seeden, die Welt bauen. Der
 * Datenstand kommt aus `npm run screens:world*`, die Prüfung aus
 * `npm run screens:verify`. Hier geht es nur um das Gerät.
 *
 * Usage:
 *   node scripts/capture-screens.mjs --list
 *   node scripts/capture-screens.mjs --ui               aktuellen Bildschirm auslesen
 *   node scripts/capture-screens.mjs --raw probe        nur auslösen, kein Rezept
 *   node scripts/capture-screens.mjs mica-open-status   Rezept fahren und auslösen
 *   node scripts/capture-screens.mjs --all              alle Rezepte nacheinander
 *   node scripts/capture-screens.mjs <name> --walk      Rezept kalibrieren
 *
 * `--walk` faehrt das Rezept Schritt fuer Schritt und druckt nach jedem, was
 * sichtbar ist, statt am Ende auszuloesen. Damit kalibriert man ein Rezept,
 * ohne ein einziges Bild anzusehen.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RECIPES, MASTER_SIZE } from './lib/screen-recipes.mjs';
import { centre, findNode, parseUiNodes, visibleLabels } from './lib/ui-tree.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const DEFAULT_OUT = join(repoRoot, 'landing', 'screenshots-master');
const APP_PACKAGE = process.env.SCREENS_APP_PACKAGE ?? 'com.broccolistudio.together.dev';
const APP_SCHEME = process.env.SCREENS_APP_SCHEME ?? 'together-dev';
const METRO_URL = process.env.SCREENS_METRO_URL ?? 'http://127.0.0.1:8081';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
/** True when args[index] is the VALUE of a preceding --option, not a shot name. */
const isOptionValue = (index) => index > 0 && args[index - 1].startsWith('--');
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : undefined;
  return typeof value === 'string' && !value.startsWith('--') ? value : fallback;
};

/* ─────────────────────────────────────────────────────────────── adb ── */

function adbPath() {
  if (process.env.ADB_PATH) return process.env.ADB_PATH;
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (sdk) {
    const candidate = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    if (existsSync(candidate)) return candidate;
  }
  // The documented location on this machine (AGENTS.md → Local Android Setup).
  const fallback = 'D:/Dokumente/AndroidDev/Android/Sdk/platform-tools/adb.exe';
  if (existsSync(fallback)) return fallback;
  return 'adb';
}

const ADB = adbPath();
let serial = option('device', null);

function adb(argv, { binary = false, timeout = 30_000 } = {}) {
  const full = serial ? ['-s', serial, ...argv] : argv;
  return execFileSync(ADB, full, {
    encoding: binary ? 'buffer' : 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });
}

function resolveDevice() {
  const lines = execFileSync(ADB, ['devices'], { encoding: 'utf8' }).split('\n').slice(1);
  const ready = lines
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device')
    .map((parts) => parts[0]);
  const offline = lines
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] !== 'device' && parts[0])
    .map((parts) => parts.join(' '));

  if (serial) {
    if (!ready.includes(serial))
      die(`Gerät ${serial} ist nicht bereit. Verfügbar: ${ready.join(', ') || 'keins'}`);
    return;
  }
  if (ready.length === 0) {
    die(
      'Kein bereites Android-Gerät.\n' +
        (offline.length ? `  Nicht bereit: ${offline.join(' · ')}\n` : '') +
        '  Starten: npm run emulator   danach: npm run android:launch',
    );
  }
  if (ready.length > 1)
    die(`Mehrere Geräte (${ready.join(', ')}) — mit --device <serial> auswählen.`);
  serial = ready[0];
}

const die = (message) => {
  console.error(message);
  process.exit(1);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Auf dem Geraet, nicht hier — Git Bash wuerde den Pfad sonst umschreiben. */
const UI_DUMP_PATH = '/sdcard/mica-ui.xml';

/* ────────────────────────────────────────────────────── status bar ── */

/**
 * SystemUI-Demomodus. Ohne ihn trägt jeder Screenshot die Benachrichtigungs-
 * symbole, den Akkustand und die Signalstärke des Moments — drei Dinge, die
 * auf einem Werbebild wie ein Versehen aussehen und von Bild zu Bild anders
 * sind. Die Uhr wird auf die ECHTE Uhrzeit gesetzt, nicht auf eine schöne:
 * Die App zeigt daneben Zeiten aus den Seed-Daten („Offen bis 22:00"), und
 * eine erfundene Statusleisten-Uhr würde ihnen widersprechen.
 */
function enterDemoMode() {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  adb(['shell', 'settings', 'put', 'global', 'sysui_demo_allowed', '1']);
  const demo = (extras) =>
    adb(['shell', 'am', 'broadcast', '-a', 'com.android.systemui.demo', ...extras]);
  demo(['-e', 'command', 'enter']);
  demo(['-e', 'command', 'clock', '-e', 'hhmm', hhmm]);
  demo(['-e', 'command', 'battery', '-e', 'plugged', 'false', '-e', 'level', '100']);
  // `fully true` is what removes the "!" overlay. Without it the icon keeps
  // the emulator's real "connected, no internet" state, which lands in every
  // capture as a small warning badge nobody can explain.
  demo(['-e', 'command', 'network', '-e', 'wifi', 'show', '-e', 'level', '4', '-e', 'fully', 'true']);
  demo(['-e', 'command', 'network', '-e', 'mobile', 'hide']);
  demo(['-e', 'command', 'notifications', '-e', 'visible', 'false']);
  return hhmm;
}

function exitDemoMode() {
  try {
    adb(['shell', 'am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', 'exit']);
  } catch {
    /* nothing to restore */
  }
}

/* ───────────────────────────────────────────────────────── ui tree ── */

/**
 * Der Viewbaum, und zwar der AKTUELLE.
 *
 * `uiautomator dump` wartet darauf, dass die Oberflaeche zur Ruhe kommt. Die
 * Karte, der pulsierende Schild und der Core animieren dauerhaft, also bricht
 * der Dump regelmaessig mit „could not get idle state" ab und schreibt keine
 * Datei. Vorher wurde in genau dem Fall die Datei vom LETZTEN Lauf
 * weitergelesen — der Lauf sah dann den vorherigen Bildschirm, hielt ihn fuer
 * den jetzigen und meldete eine Beschriftung als fehlend, die laengst da war.
 * Genau so ist das Kalender-Rezept gescheitert, obwohl der Kalender offen war.
 *
 * Deshalb: Datei zuerst loeschen. Ein fehlgeschlagener Dump liefert damit gar
 * nichts statt etwas Falschem, und die Schleife versucht es erneut.
 */
async function readUi(attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      adb(['shell', 'rm', '-f', UI_DUMP_PATH], { timeout: 20_000 });
      adb(['shell', 'uiautomator', 'dump', UI_DUMP_PATH], { timeout: 20_000 });
      const xml = adb(['shell', 'cat', UI_DUMP_PATH], { timeout: 20_000 });
      const nodes = parseUiNodes(xml);
      if (nodes.length > 0) return nodes;
    } catch {
      /* Kein Dump zustande gekommen — gleich nochmal. */
    }
    await wait(900);
  }
  die(
    'uiautomator liefert keinen Viewbaum. Laeuft die App im Vordergrund? ' +
      'Dauernde Animationen koennen den Dump blockieren.',
  );
}

/* ───────────────────────────────────────────────────────── recipes ── */

async function runStep(step, shotName) {
  if (typeof step.wait === 'number') {
    await wait(step.wait);
    return;
  }
  if (step.launch) {
    adb(['shell', 'am', 'force-stop', APP_PACKAGE]);
    await wait(450);
    adb(['shell', 'monkey', '-p', APP_PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1']);
    await wait(2500);
    const devClientUrl = `${APP_SCHEME}://expo-development-client/?url=${encodeURIComponent(METRO_URL)}`;
    adb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', devClientUrl]);
    await wait(step.wait ?? 4000);
    return;
  }
  if (step.back) {
    adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    await wait(600);
    return;
  }
  if (step.tapAt) {
    adb(['shell', 'input', 'tap', String(step.tapAt[0]), String(step.tapAt[1])]);
    await wait(step.settle ?? 900);
    return;
  }
  if (step.swipe) {
    const [x1, y1, x2, y2, ms] = step.swipe;
    adb([
      'shell',
      'input',
      'swipe',
      String(x1),
      String(y1),
      String(x2),
      String(y2),
      String(ms ?? 300),
    ]);
    await wait(step.settle ?? 900);
    return;
  }
  if (typeof step.type === 'string') {
    adb(['shell', 'input', 'text', step.type.replace(/ /g, '%s')]);
    await wait(step.settle ?? 600);
    return;
  }
  if (step.maybeTap) {
    const node = findNode(await readUi(), step.maybeTap);
    if (node) {
      const [x, y] = centre(node);
      adb(['shell', 'input', 'tap', String(x), String(y)]);
      await wait(step.settle ?? 900);
    }
    return;
  }
  if (step.tap || step.expect) {
    const needle = step.tap ?? step.expect;
    const nodes = await readUi();
    const node = findNode(nodes, needle);
    if (!node) {
      console.error(
        `\n${shotName}: „${needle}" ist nicht auf dem Bildschirm.\n` +
          `Sichtbar sind stattdessen:\n  ${visibleLabels(nodes).join('\n  ') || '(nichts beschriftet)'}\n`,
      );
      die('Rezept abgebrochen — kein Bild gespeichert.');
    }
    if (step.tap) {
      const [x, y] = centre(node);
      adb(['shell', 'input', 'tap', String(x), String(y)]);
      await wait(step.settle ?? 900);
    }
    return;
  }
  die(`Unbekannter Rezeptschritt: ${JSON.stringify(step)}`);
}

/* ───────────────────────────────────────────────────────── capture ── */

/**
 * Ein leeres Bild ist kein Bild.
 *
 * Der React-Native-Root steht nach einem Reload, einem Konfigurationswechsel
 * oder waehrend eines Bundle-Ladens fuer ein paar hundert Millisekunden WEISS
 * da. Frueher pruefte das Skript nur auf Schwarz und schrieb so einen weissen
 * 15-kB-Master ueber einen guten drueber, ohne ein Wort zu sagen — der Fehler
 * faellt erst auf der Landingpage auf. Beide Extreme gelten jetzt als „noch
 * nicht da" und werden erneut versucht, statt gespeichert.
 */
const BLANK_DARK = 4;
const BLANK_LIGHT = 250;

/**
 * Der Ladebildschirm ist WEDER schwarz noch weiss — dunkler Grund mit der
 * weissen Figur, Mittelwert 16 und dieselbe Streuung wie ein echter Screen. Er
 * rutschte deshalb durch und wurde als Master gespeichert.
 *
 * Was ihn verraet, ist seine Einfachheit: zwei Farben, sonst nichts. Gemessen
 * an den vorhandenen Mastern:
 *
 *   Ladebildschirm   0,21
 *   Kalender         1,83   (der schlichteste echte Screen)
 *   Zeitmatching     4,26
 *   Composer         5,48
 *
 * 1,0 liegt mit grossem Abstand zwischen beiden Gruppen.
 */
const MIN_ENTROPY = 1;

async function capture(name, outDir, attempts = 6) {
  const { default: sharp } = await import('sharp');
  let last = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const png = adb(['exec-out', 'screencap', '-p'], { binary: true });
    if (png.length < 10_000) die(`Screenshot ist leer (${png.length} Bytes).`);

    const meta = await sharp(png).metadata();
    if (meta.width !== MASTER_SIZE.width || meta.height !== MASTER_SIZE.height) {
      die(
        `Aufloesung ${meta.width}x${meta.height}, erwartet ${MASTER_SIZE.width}x${MASTER_SIZE.height}. ` +
          'Der Landing-Encoder verlangt genau diese Master-Groesse — AVD mit dieser Aufloesung verwenden.',
      );
    }

    const stats = await sharp(png).stats();
    const mean = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
    last = { mean, entropy: stats.entropy };
    if (mean > BLANK_DARK && mean < BLANK_LIGHT && stats.entropy >= MIN_ENTROPY) {
      mkdirSync(outDir, { recursive: true });
      const file = join(outDir, `${name}.png`);
      writeFileSync(file, png);
      console.log(
        `  → ${file} (${(png.length / 1024).toFixed(0)} kB, Mittelwert ${mean.toFixed(0)})`,
      );
      return file;
    }
    await wait(1500);
  }

  die(
    `Bild zeigt keinen Inhalt (Mittelwert ${last?.mean.toFixed(1)}, ` +
      `Entropie ${last?.entropy.toFixed(2)}) — Ladebildschirm oder leerer Root. ` +
      'Laeuft Metro? Haengt ein Reload?',
  );
}

/* ──────────────────────────────────────────────────────────── main ── */

async function main() {
  if (flag('list')) {
    for (const [name, recipe] of Object.entries(RECIPES)) {
      console.log(`${name}\n  Welt: npm run ${recipe.world}\n  ${recipe.note}\n`);
    }
    return;
  }

  resolveDevice();

  if (flag('ui')) {
    const nodes = await readUi();
    console.log(visibleLabels(nodes).join('\n'));
    return;
  }

  const outDir = resolve(option('out', DEFAULT_OUT));
  const walking = flag('walk');
  const raw = option('raw', null);
  const names = raw
    ? [raw]
    : flag('all')
      ? Object.keys(RECIPES)
      : args.filter((argument, index) => !argument.startsWith('--') && !isOptionValue(index));
  if (names.length === 0) die('Kein Screenshot genannt. --list zeigt die Rezepte.');

  const clock = enterDemoMode();
  console.log(`Demomodus an (Uhr ${clock.slice(0, 2)}:${clock.slice(2)}), Gerät ${serial}.`);
  try {
    for (const name of names) {
      const recipe = raw ? null : RECIPES[name];
      if (!raw && !recipe) die(`Kein Rezept für "${name}". --list zeigt die vorhandenen.`);
      console.log(`\n${name}${recipe ? ` — Welt: npm run ${recipe.world}` : ' (roh)'}`);
      for (const [index, step] of (recipe?.steps ?? []).entries()) {
        if (walking)
          console.log(`
  ${index + 1}. ${JSON.stringify(step)}`);
        await runStep(step, name);
        if (walking) {
          const nodes = await readUi();
          console.log(
            `     sichtbar: ${visibleLabels(nodes).join(' / ') || '(nichts beschriftet)'}`,
          );
        }
      }
      if (walking) {
        console.log('\n--walk: nichts gespeichert. Ohne --walk erneut aufrufen zum Ausloesen.');
        continue;
      }
      await capture(name, outDir);
    }
  } finally {
    if (!flag('keep-demo')) exitDemoMode();
  }

  console.log(
    '\nFertig. Weiter mit:\n' +
      '  cd landing && npm run screenshots:build     (AVIF + WebP in drei Breiten)',
  );
}

main().catch((error) => {
  exitDemoMode();
  console.error(error.message ?? error);
  process.exit(1);
});
