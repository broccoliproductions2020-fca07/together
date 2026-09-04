/**
 * Prüft die geseedete Marketing-Welt, BEVOR ein Screenshot gemacht wird.
 *
 * Der Grund ist Kosten: Ein Datenfehler — jemand ohne Portrait in der
 * Offen-Liste, eine vierte Stecknadel aus einem alten Lauf, eine Person, die
 * gleichzeitig „offen" ist und in einer laufenden Aktivität steckt — ist auf
 * dem fertigen Bild sichtbar, aber erst, nachdem man das Bild aufgenommen und
 * angesehen hat. Jeder solche Durchlauf kostet Aufnahme, Ansehen, Korrigieren,
 * Wiederholen. Hier steht dieselbe Prüfung als Text, in einer Sekunde.
 *
 * Prüft ausschließlich Daten. Layout, Kamera und Tastbarkeit sieht man nur am
 * Gerät; dafür ist scripts/capture-screens.mjs zuständig.
 *
 * Usage:
 *   npm run screens:verify        (Emulatoren müssen laufen und geseedet sein)
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import ts from 'typescript';

import { LANDING_ACCOUNT } from './lib/seed-scenarios.mjs';

const require = createRequire(import.meta.url);
const admin = require('./firebase-admin-tools.cjs');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9000';

const PROJECT_ID = 'demo-together';
const DATABASE_URL = `http://127.0.0.1:9000?ns=${PROJECT_ID}-default-rtdb`;
const ME = LANDING_ACCOUNT.uid;
/** Mirrors the app's default nearby radius (AGENTS.md → Nearby Radius). */
const DEFAULT_RADIUS_KM = 3;

/**
 * Laedt die echten Terminfindungs-Utilities aus dem App-Quelltext. Die Kurve
 * hier nachzurechnen waere eine zweite Implementierung derselben Mathematik —
 * und genau die koennte still von der abweichen, die im Bild gezeichnet wird.
 * Derselbe Lader wie in scripts/test-time-planning.mjs.
 */
const loadedModules = new Map();
function loadTimePlanning(relativePath) {
  if (loadedModules.has(relativePath)) return loadedModules.get(relativePath);
  const url = new URL(`../src/features/time-planning/utils/${relativePath}.ts`, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: url.pathname,
  });
  const module = { exports: {} };
  loadedModules.set(relativePath, module.exports);
  new Function('exports', 'module', 'require', compiled.outputText)(
    module.exports,
    module,
    (request) => (request.startsWith('./') ? loadTimePlanning(request.slice(2)) : {}),
  );
  loadedModules.set(relativePath, module.exports);
  return module.exports;
}

/**
 * Laedt ein beliebiges App-Modul (TypeScript) nach Pfad, relativ zu `src/`.
 * Aufloesung relativer Importe geschieht ueber den Ordner des Aufrufers, sonst
 * findet ein Modul seine eigenen Nachbarn nicht.
 */
const tsModules = new Map();
function loadAppModule(relativeToSrc) {
  const key = relativeToSrc.replace(/\.ts$/, '');
  if (tsModules.has(key)) return tsModules.get(key);
  const url = new URL(`../src/${key}.ts`, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: url.pathname,
  });
  const module = { exports: {} };
  tsModules.set(key, module.exports);
  const dir = key.slice(0, key.lastIndexOf('/'));
  new Function('exports', 'module', 'require', compiled.outputText)(
    module.exports,
    module,
    (request) => {
      if (!request.startsWith('.')) return {};
      const parts = dir.split('/');
      for (const segment of request.split('/')) {
        if (segment === '.') continue;
        else if (segment === '..') parts.pop();
        else parts.push(segment);
      }
      return loadAppModule(parts.join('/'));
    },
  );
  tsModules.set(key, module.exports);
  return module.exports;
}

/**
 * Der Massstab der Hero-Kamera — GEMESSEN, nicht hergeleitet.
 *
 * Ein erster Versuch rechnete ihn aus `PLACE_FOCUS_*_DELTA` und der
 * Schirmgroesse aus, unter der Annahme quadratischer Pixel. Das Ergebnis war
 * zu optimistisch und meldete "25 m Luft" fuer ein Paar, das am Geraet zu
 * einem Stapel-Pin verschmolz. Der Grund: **Die Karte rendert gekippt.**
 * Nord-Sued ist dadurch gestaucht, ein Meter Norden kostet weniger Pixel als
 * ein Meter Osten.
 *
 * Abgelesen aus einem Screenshot (blauer Punkt gegen den Lauf-Marker,
 * 50 m noerdlich / 70 m oestlich = 84 px / 210 px):
 *
 *   waagerecht  0.333 m/px
 *   senkrecht   0.595 m/px      (Faktor 1.79)
 *
 * Wer die Kamera, die Kippung oder die Schirmgroesse aendert, muss hier neu
 * messen. Eine gerechnete Zahl waere bequemer und war nachweislich falsch.
 */
const MEASURED_SCALE = { east: 0.333, north: 0.595 };

/**
 * Der Aufnahme-Lauf zoomt heraus (`CAPTURE_ZOOM_OUT` in
 * `features/map/utils/quietCaptureStyle`), also deckt ein Pixel entsprechend
 * mehr Meter ab und ein Marker braucht mehr Abstand. Die Konstante wird aus
 * der App gelesen statt hier abgeschrieben — sonst prueft dieses Skript
 * irgendwann einen Zoom, den es gar nicht mehr gibt.
 */
const CAPTURE_ZOOM_OUT = 1.45;
const SCALE = {
  east: MEASURED_SCALE.east * CAPTURE_ZOOM_OUT,
  north: MEASURED_SCALE.north * CAPTURE_ZOOM_OUT,
};
const SCREEN = { density: 420 };

/**
 * Prueft, ob zwei Aktivitaets-Marker auf der Hero-Kamera aneinanderstossen.
 *
 * Warum ueberhaupt: `markerCollision` fasst ueberlappende Marker zu EINEM
 * Stapel-Pin zusammen. Das ist im Produkt richtig und im Werbebild falsch —
 * dort sollen die einzelnen Karten zu sehen sein. Die Kollision am Geraet zu
 * entdecken kostet einen kompletten Aufnahme-Durchlauf; hier kostet sie nichts.
 */
function checkMarkerSpacing(points, centreLat) {
  const layout = loadAppModule('features/map/components/activityMarkerLayout');
  const dp = SCREEN.density / 160;
  const boxWidthPx = layout.ACTIVITY_MARKER_CAPTURE_WIDTH * dp;
  const boxHeightPx =
    (layout.ACTIVITY_MARKER_VISIBLE_ABOVE_ANCHOR + layout.ACTIVITY_MARKER_VISIBLE_BELOW_ANCHOR) *
    dp;
  const needEast = boxWidthPx * SCALE.east;
  const needNorth = boxHeightPx * SCALE.north;

  ok(
    'Marker-Kasten auf der Hero-Kamera',
    `${boxWidthPx.toFixed(0)}x${boxHeightPx.toFixed(0)} px = ` +
      `${needEast.toFixed(0)} m breit, ${needNorth.toFixed(0)} m hoch ` +
      `(${SCALE.east} / ${SCALE.north} m/px, gekippt)`,
  );

  let worst = null;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const north = Math.abs(a.latitude - b.latitude) * 111_320;
      const east =
        Math.abs(a.longitude - b.longitude) * 111_320 * Math.cos((centreLat * Math.PI) / 180);
      // Zwei Kaesten ueberlappen nur, wenn sie sich auf BEIDEN Achsen naeher
      // sind als ihre halbe Summe. Ein sauberer Abstand auf einer reicht.
      const slack = Math.max(north - needNorth, east - needEast);
      if (!worst || slack < worst.slack) worst = { a: a.label, b: b.label, slack, north, east };
      expect(
        slack > 0,
        `Kein Stapel-Pin: ${a.label} / ${b.label}`,
        `${north.toFixed(0)} m noerdlich, ${east.toFixed(0)} m oestlich`,
      );
    }
  }
  if (worst) {
    ok(
      'Engster Marker-Abstand',
      `${worst.a} / ${worst.b} - ${worst.slack.toFixed(0)} m Luft ` +
        `(${worst.north.toFixed(0)} m N, ${worst.east.toFixed(0)} m O)`,
    );
  }
}

const checks = [];
const ok = (label, detail = '') => checks.push({ pass: true, label, detail });
const fail = (label, detail = '') => checks.push({ pass: false, label, detail });
const expect = (condition, label, detail) => (condition ? ok(label, detail) : fail(label, detail));

const haversineKm = (a, b) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude));
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

const metres = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
const clock = (value) =>
  new Date(
    typeof value === 'string' || typeof value === 'number' ? value : value.toMillis(),
  ).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });

async function main() {
  const app = admin.initializeApp({ projectId: PROJECT_ID, databaseURL: DATABASE_URL });
  const db = app.firestore();
  const rtdb = app.database();

  // ── Wer bin ich? ────────────────────────────────────────────────────────
  const meDoc = await db.doc(`users/${ME}`).get();
  if (!meDoc.exists) {
    console.error(`Kein Aufnahme-Account ${ME}. Erst "npm run emulators:seed:landing" ausführen.`);
    process.exit(1);
  }
  const me = meDoc.data();
  expect(typeof me.avatarUrl === 'string', 'Aufnahme-Account hat ein Portrait', me.displayName);

  // ── Portraits: jede Person, nicht nur die gerade sichtbaren ────────────
  // „Alle sollen ein Profilbild haben" ist eine Aussage ueber den Roster, nicht
  // ueber den aktuellen Bildschirm. Wer heute still ist, steht morgen in einer
  // Liste - und faellt dann als einziger Initialen-Kreis auf.
  const roster = await db
    .collection('users')
    .orderBy('__name__')
    .startAt('seed-')
    .endAt('seed-')
    .get();
  const rosterByUid = new Map(roster.docs.map((doc) => [doc.id, doc.data()]));
  const withoutPortrait = [];
  for (const doc of roster.docs) {
    const [profile, search] = await Promise.all([
      db.doc(`publicProfiles/${doc.id}`).get(),
      db.doc(`friendSearch/${doc.id}`).get(),
    ]);
    const url = doc.data().avatarUrl;
    if (!url || profile.data()?.avatarUrl !== url || search.data()?.avatarUrl !== url) {
      withoutPortrait.push(doc.data().displayName ?? doc.id);
    }
  }
  expect(
    withoutPortrait.length === 0,
    `Alle ${roster.size} Personen haben ein Portrait in allen drei Identitaetsdokumenten`,
    withoutPortrait.join(', ') || 'sauber',
  );

  // ── Freundschaften ──────────────────────────────────────────────────────
  const friendships = await db
    .collection('friendships')
    .where('participantUids', 'array-contains', ME)
    .get();
  const accepted = friendships.docs.filter((doc) => doc.data().status === 'accepted');
  const pending = friendships.docs.filter((doc) => doc.data().status === 'pending');
  ok('Bestätigte Freundschaften', String(accepted.length));
  const snapshotsWithoutPortrait = accepted.flatMap((doc) =>
    (doc.data().profiles ?? []).filter((profile) => !profile.avatarUrl).map((p) => p.displayName),
  );
  expect(
    snapshotsWithoutPortrait.length === 0,
    'Jeder Freundschafts-Schnappschuss traegt ein Portrait',
    [...new Set(snapshotsWithoutPortrait)].join(', ') || 'sauber',
  );
  expect(
    pending.length === 0,
    'Keine offene Freundschaftsanfrage',
    pending.length ? `${pending.length} offen — erzeugt ein Badge in der Top-Bar` : 'sauber',
  );

  // ── Presence: die Offen-Liste ───────────────────────────────────────────
  const presence = await db.collection('presence').get();
  const own = presence.docs.find((doc) => doc.id === ME)?.data() ?? null;
  const friendsOpen = presence.docs.filter((doc) => doc.id !== ME).map((doc) => doc.data());

  if (own) {
    ok(
      'Eigener Offen-Status',
      `${own.vibe?.label ?? 'Egal'} · bis ${clock(own.expireAt)}` +
        `${own.shareLocation ? ' · Standort geteilt' : ' · ohne Standort'}`,
    );
  } else {
    ok('Eigener Offen-Status', 'aus (Karten-Pille zeigt die Freundeszahl)');
  }

  const myLocation = own?.coarseLocation
    ? { latitude: own.coarseLocation.lat, longitude: own.coarseLocation.lng }
    : null;
  const withLocation = friendsOpen.filter((p) => p.shareLocation && p.coarseLocation);
  const withoutLocation = friendsOpen.filter((p) => !p.shareLocation || !p.coarseLocation);

  for (const friend of friendsOpen) {
    expect(
      typeof friend.avatarUrl === 'string',
      `Portrait: ${friend.displayName}`,
      friend.avatarUrl ? 'ja' : 'FEHLT — die Zeile zeigt einen Initialen-Kreis',
    );
  }

  if (myLocation) {
    const rows = withLocation
      .map((friend) => ({
        name: friend.displayName,
        km: haversineKm(myLocation, {
          latitude: friend.coarseLocation.lat,
          longitude: friend.coarseLocation.lng,
        }),
      }))
      .sort((a, b) => a.km - b.km);
    const inRadius = rows.filter((row) => row.km <= DEFAULT_RADIUS_KM);
    expect(
      inRadius.length === rows.length,
      `Alle Standort-Freunde im Standardradius (${DEFAULT_RADIUS_KM} km)`,
      rows.map((row) => `${row.name} ${metres(row.km)}`).join(' · ') || 'keine',
    );
    ok('Offen-Liste „In deiner Nähe"', `${inRadius.length} Zeilen`);
  }
  ok('Offen-Liste „Ohne Standort"', `${withoutLocation.length} Zeilen`);

  // ── Aktivitäten: was auf der Karte liegt ────────────────────────────────
  const activities = await db.collection('activities').where('status', '==', 'active').get();
  const visible = activities.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((activity) => (activity.audienceUids ?? []).includes(ME));
  const pinned = visible.filter((activity) => activity.place?.visibility === 'pin');
  ok('Aktivitäten für mich sichtbar', `${visible.length} (davon ${pinned.length} mit Stecknadel)`);

  /** Alles, was als Marker auf der Karte landet - fuer die Abstandspruefung. */
  const mapPoints = pinned.map((activity) => ({
    label: activity.title,
    latitude: activity.place.latitude,
    longitude: activity.place.longitude,
  }));

  const nowMs = Date.now();
  const runningNow = new Set();
  for (const activity of visible) {
    const started = Date.parse(activity.startsAt) <= nowMs;
    const label =
      `${activity.title} · ${activity.mode}${started ? ' (läuft)' : ''} · ` +
      `${activity.participantUids?.length ?? 0} dabei · ${activity.place?.label ?? 'ohne Ort'}`;
    ok(`Aktivität ${activity.id}`, label);
    if (activity.mode === 'now' && started) {
      (activity.participantUids ?? []).forEach((uid) => runningNow.add(uid));
    }
    for (const participant of activity.participants ?? []) {
      expect(
        typeof participant.avatarUrl === 'string',
        `Portrait im Marker: ${participant.displayName}`,
        participant.avatarUrl ? 'ja' : 'FEHLT — der Marker zeigt einen Initialen-Kreis',
      );
    }
  }

  const contradiction = friendsOpen.filter((friend) => runningNow.has(friend.uid));
  expect(
    contradiction.length === 0,
    'Niemand ist gleichzeitig offen und in einer laufenden Aktivität',
    contradiction.map((friend) => friend.displayName).join(', ') || 'sauber',
  );

  // ── Rauschen, das ein Werbebild ruinieren würde ─────────────────────────
  const noise = [];
  for (const [collection, field] of [
    ['groupOpenings', 'audienceUids'],
    ['spontaneousRoundInvites', 'recipientUid'],
    ['groupChatInvites', 'inviteeUid'],
  ]) {
    const snapshot =
      field === 'audienceUids'
        ? await db.collection(collection).where(field, 'array-contains', ME).get()
        : await db.collection(collection).where(field, '==', ME).get();
    if (!snapshot.empty) noise.push(`${collection}: ${snapshot.size}`);
  }
  expect(noise.length === 0, 'Keine offenen Einladungen für mich', noise.join(' · ') || 'sauber');

  const notifications = await db.collection('notifications').where('recipientUid', '==', ME).get();
  ok('Mitteilungen', `${notifications.size}`);

  // ── Anreise und Heimweg, falls geseedet ─────────────────────────────────
  for (const activity of visible) {
    const journey = await rtdb.ref(`journeys/${activity.id}/locations`).get();
    const points = journey.exists() ? Object.values(journey.val()) : [];
    if (points.length === 0) continue;
    const target = { latitude: activity.place.latitude, longitude: activity.place.longitude };
    ok(
      `Anreise zu „${activity.title}"`,
      points
        .map(
          (point) =>
            `${point.uid} ${metres(haversineKm(target, { latitude: point.lat, longitude: point.lng }))}`,
        )
        .join(' · '),
    );
    const strangers = points.filter(
      (point) => !(activity.participantUids ?? []).includes(point.uid),
    );
    expect(
      strangers.length === 0,
      `Alle Anreisenden sind Teilnehmende von „${activity.title}"`,
      strangers.map((point) => point.uid).join(', ') || 'sauber',
    );
  }

  // ── Terminfindung: die Verdichtung, wie die App sie rechnet ────────────
  const plans = await db.collection('timePlans').where('memberUids', 'array-contains', ME).get();
  const { aggregateWindow, bestSlot } = loadTimePlanning('availability');
  for (const planDoc of plans.docs) {
    const plan = planDoc.data();
    if (plan.place?.latitude != null) {
      mapPoints.push({
        label: plan.title,
        latitude: plan.place.latitude,
        longitude: plan.place.longitude,
      });
    }
    const memberDocs = await planDoc.ref.collection('timePlanMembers').get();
    const members = memberDocs.docs.map((doc) => doc.data());
    ok(
      `Terminfindung "${plan.title}"`,
      `${members.length} von ${plan.audienceCount} Antworten · ` +
        `${plan.sourceWindows.length} Vorschlaege · Host ${plan.hostName}`,
    );
    // Gegen den ROSTER pruefen, nicht gegen die offenen Freunde: Eine uid, die
    // es in dieser Welt gar nicht gibt, ist der schlimmere Fehler und ist genau
    // hier durchgerutscht, als zwei Personen umbenannt wurden.
    const badMembers = members.filter((member) => {
      const person = rosterByUid.get(member.uid);
      return !person || !person.avatarUrl;
    });
    expect(
      badMembers.length === 0,
      `Alle Antwortenden in "${plan.title}" sind im Roster und haben ein Portrait`,
      badMembers
        .map(
          (m) =>
            `${m.displayName ?? m.uid} (${rosterByUid.has(m.uid) ? 'ohne Bild' : 'unbekannt'})`,
        )
        .join(', ') || 'sauber',
    );

    let peakOfRound = 0;
    for (const window of plan.sourceWindows) {
      const availability = aggregateWindow(window, members);
      if (!availability) {
        fail(`Fenster ${window.id} liefert keine Verdichtung`, 'aggregateWindow gab null');
        continue;
      }
      const counts = availability.segments.map((segment) => segment.count);
      const best = bestSlot(availability.segments, members.length);
      peakOfRound = Math.max(peakOfRound, best?.count ?? 0);
      const day = new Date(Date.parse(window.startsAt)).toLocaleDateString('de-DE', {
        weekday: 'short',
      });
      ok(
        `  ${day} ${clock(window.startsAt)}-${clock(window.endsAt)}`,
        `Treppe ${counts.join(' ')} · Spitze ${best?.count ?? 0}/${members.length} um ` +
          `${best ? `${clock(best.startMs)}-${clock(best.endMs)}` : '-'}`,
      );
      // Eine Glocke steigt und faellt. Zwei gleich hohe Gipfel mit einem Tal
      // dazwischen sehen aus wie zwei Vorschlaege in einer Zeile.
      const peak = Math.max(...counts);
      const firstPeak = counts.indexOf(peak);
      const lastPeak = counts.lastIndexOf(peak);
      const unimodal =
        counts.slice(0, firstPeak).every((value, index) => value <= counts[index + 1]) &&
        counts
          .slice(lastPeak)
          .every((value, index, list) => index === 0 || value <= list[index - 1]);
      expect(unimodal, `  ${day}: eine Spitze, kein Zickzack`, counts.join(' '));
    }
    expect(
      peakOfRound === members.length,
      `"${plan.title}" hat einen Slot, an dem ALLE koennen`,
      `${peakOfRound} von ${members.length}`,
    );
  }

  // ── Marker-Abstaende: kein Stapel-Pin auf der Hero-Kamera ──────────
  checkMarkerSpacing(mapPoints, own?.location?.lat ?? mapPoints[0]?.latitude ?? 0);

  const heimweg = await rtdb.ref(`heimwege/${ME}`).get();
  if (heimweg.exists()) {
    const session = heimweg.val();
    const companions = Object.keys(session.audience ?? session.audienceUids ?? {});
    ok(
      'Eigener Heimweg',
      `Status ${session.status} · ${companions.length} Begleitung · letztes Update vor ` +
        `${Math.round((Date.now() - (session.updatedAt ?? 0)) / 1000)} s`,
    );
  } else {
    ok('Eigener Heimweg', 'keiner (für den Safety-Screenshot seed-heimweg mit --owner ' + ME + ')');
  }

  // ── Ausgabe ─────────────────────────────────────────────────────────────
  const failures = checks.filter((check) => !check.pass);
  for (const check of checks) {
    console.log(
      `${check.pass ? '  ok ' : '  XX '} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`,
    );
  }
  console.log(
    failures.length === 0
      ? `\nAlles sauber (${checks.length} Prüfungen). Aufnahme kann starten.`
      : `\n${failures.length} von ${checks.length} Prüfungen fehlgeschlagen.`,
  );
  await app.delete();
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Prüfung fehlgeschlagen:', error.message ?? error);
  process.exit(1);
});
