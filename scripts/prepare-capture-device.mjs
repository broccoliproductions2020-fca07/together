/**
 * Bringt den Android-Emulator in den Zustand, in dem die Aufnahme-Welt richtig
 * aussieht. Drei Dinge, die alle am Gerät hängen und keinen Seed betreffen:
 *
 * 1. **Standort** auf den Punkt, an dem der Aufnahme-Account steht.
 * 2. **Zeitzone** gleich der des Rechners, der die Welt geschrieben hat.
 * 3. **Dev-Menü-Knopf aus**, damit kein Zahnrad im Bild klebt.
 *
 * Alle drei überleben keinen Kaltstart des Emulators — das hier gehört in den
 * Aufnahme-Ablauf, nicht in die einmalige Einrichtung. Danach muss die App neu
 * starten: Die Karte zentriert nur auf den ERSTEN Standortfix, und die
 * Dev-Menü-Einstellung wird beim Beenden der App zurückgeschrieben.
 *
 * Aufruf:
 *   node scripts/prepare-capture-device.mjs
 *   node scripts/prepare-capture-device.mjs --lat 52.5208 --lng 13.4095
 *   node scripts/prepare-capture-device.mjs --restore   (Standort + Zahnrad zurück)
 */
import { execFileSync } from 'node:child_process';

import { LANDING_CENTRE, LANDING_VIEWER_OFFSET } from './lib/seed-scenarios.mjs';

const args = process.argv.slice(2);
const numberArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? Number(args[index + 1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
};
const stringArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : undefined;
  return typeof value === 'string' && !value.startsWith('--') ? value : fallback;
};

const DEVICE = stringArg('device', 'emulator-5554');
const PACKAGE = stringArg('package', 'com.broccolistudio.together.dev');
const RESTORE = args.includes('--restore');

/**
 * Nicht der Pub, sondern der Punkt, an dem der Aufnahme-Account STEHT: Die
 * Karte zentriert beim ersten Fix auf den Gerätestandort, also entscheidet
 * dieser Wert, wie die Marker im Bild sitzen. Eine Quelle für Seed und Gerät.
 */
const VIEWER = {
  lat: LANDING_CENTRE.lat + LANDING_VIEWER_OFFSET.north / 111_320,
  lng:
    LANDING_CENTRE.lng +
    LANDING_VIEWER_OFFSET.east / (111_320 * Math.cos((LANDING_CENTRE.lat * Math.PI) / 180)),
};
const LAT = numberArg('lat', Number(VIEWER.lat.toFixed(6)));
const LNG = numberArg('lng', Number(VIEWER.lng.toFixed(6)));

/** `gps` für die Plattform, `fused` für Play Services. Siehe setLocation(). */
const PROVIDERS = ['gps', 'fused'];
const DEV_MENU_PREFS = `/data/data/${PACKAGE}/shared_prefs/expo.modules.devmenu.sharedpreferences.xml`;

function adb(command, options = {}) {
  return execFileSync('adb', ['-s', DEVICE, ...command], {
    encoding: 'utf8',
    ...options,
  }).trim();
}

/**
 * `adb emu geo fix` funktioniert auf diesem Image NICHT und verschweigt es: Die
 * Konsole antwortet `OK`, während `dumpsys location` unverändert bleibt — 170
 * Fixe im Sekundentakt haben nichts bewegt. Grund ist `mStarted=false`: Die
 * GNSS-Engine läuft nur, solange eine App aktiv hochgenaue Ortung anfordert.
 * Also der offizielle Weg über einen Test-Provider.
 */
function setLocation() {
  adb(['shell', 'appops', 'set', '--uid', '2000', 'android:mock_location', 'allow']);
  for (const provider of PROVIDERS) {
    try {
      adb(['shell', 'cmd', 'location', 'providers', 'add-test-provider', provider]);
    } catch {
      // Beim zweiten Lauf existiert er schon.
    }
    adb(['shell', 'cmd', 'location', 'providers', 'set-test-provider-enabled', provider, 'true']);
    adb([
      'shell',
      'cmd',
      'location',
      'providers',
      'set-test-provider-location',
      provider,
      '--location',
      `${LAT},${LNG}`,
      '--accuracy',
      '8',
    ]);
  }

  const seen = adb(['shell', 'dumpsys', 'location']).match(
    /last location=Location\[fused ([\d.]+),([\d.]+)/,
  );
  if (!seen || Math.abs(Number(seen[1]) - LAT) > 0.0005) {
    throw new Error(`Standort nicht uebernommen (gelesen: ${seen ? seen[1] : 'nichts'})`);
  }
  return `${LAT}, ${LNG}`;
}

/**
 * Der Emulator startet auf GMT, der Seed schreibt aber absolute Ortszeiten des
 * Rechners. Ohne Angleichung zeigt die App jede Uhrzeit um den Zonenunterschied
 * verschoben — gemessen: „Kino 20:00" erschien als 18:00, der Brunch als 08:30.
 *
 * `persist.sys.timezone` geht auf einem Play-Image nicht (kein root, `adb root`
 * wird abgelehnt); der Weg ist der Time-Zone-Detector. Die Auto-Erkennung muss
 * zuerst aus, sonst überschreibt sie den Wert wieder.
 */
function setTimeZone() {
  const zone = stringArg('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  adb(['shell', 'cmd', 'time_zone_detector', 'set_auto_detection_enabled', 'false']);
  adb([
    'shell',
    'cmd',
    'time_zone_detector',
    'set_time_zone_state_for_tests',
    '--zone_id',
    zone,
    '--user_should_confirm_id',
    'false',
  ]);
  const state = adb(['shell', 'cmd', 'time_zone_detector', 'get_time_zone_state']);
  if (!state.includes(zone)) throw new Error(`Zeitzone nicht uebernommen: ${state}`);
  return zone;
}

/**
 * Das schwebende Zahnrad ist der Dev-Menü-Knopf von `expo-dev-client`
 * („Tools button" im Dev-Menü, Flag `showFab`). Er gehört nicht zur App, wäre
 * aber in jedem Screenshot drin. Die App muss dafür gestoppt sein: Sie
 * schreibt ihre Preferences beim Beenden zurück.
 */
function setDevMenuButton(visible) {
  adb(['shell', 'am', 'force-stop', PACKAGE]);
  const xml = [
    `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>`,
    `<map>`,
    `    <boolean name="isOnboardingFinished" value="true" />`,
    `    <boolean name="showsAtLaunch" value="false" />`,
    `    <boolean name="showFab" value="${visible}" />`,
    `    <float name="fabPositionX" value="1.0" />`,
    `    <float name="fabPositionY" value="0.17468314" />`,
    `</map>`,
    ``,
  ].join('\n');
  // Der Befehl muss als EIN String gehen. Gibt man ihn als einzelne Argumente,
  // fuegt adb sie zusammen und die GERAETE-Shell wertet das `>` selbst aus -
  // also als shell-uid, die in das App-Verzeichnis nicht schreiben darf
  // ("Permission denied"). In Anfuehrungszeichen gehoert die Umleitung zur
  // inneren `sh`, die run-as bereits auf die App-uid umgestellt hat.
  adb(['shell', `run-as ${PACKAGE} sh -c 'cat > ${DEV_MENU_PREFS}'`], { input: xml });
  const written = adb(['shell', 'run-as', PACKAGE, 'cat', DEV_MENU_PREFS]);
  if (!written.includes(`name="showFab" value="${visible}"`)) {
    throw new Error('Dev-Menue-Knopf nicht gesetzt');
  }
}

function main() {
  try {
    adb(['get-state']);
  } catch {
    console.error(`Kein Geraet ${DEVICE}. Laeuft der Emulator? ("npm run emulator")`);
    process.exit(1);
  }

  try {
    if (RESTORE) {
      for (const provider of PROVIDERS) {
        try {
          adb(['shell', 'cmd', 'location', 'providers', 'remove-test-provider', provider]);
        } catch {
          // Ein Provider, den es nicht gibt, ist der gewuenschte Zustand.
        }
      }
      setDevMenuButton(true);
      console.log('Zurueckgesetzt: eigener Standort, Dev-Menue-Knopf wieder sichtbar.');
      return;
    }

    const where = setLocation();
    const zone = setTimeZone();
    setDevMenuButton(false);

    console.log(`Standort   ${where}  (${LANDING_CENTRE.label})`);
    console.log(`Zeitzone   ${zone}`);
    console.log(`Dev-Knopf  aus`);
    console.log('');
    console.log('App jetzt neu starten - die Karte zentriert nur auf den ERSTEN Fix.');
  } catch (error) {
    console.error(String(error.message ?? error));
    process.exit(1);
  }
}

main();
