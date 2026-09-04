/**
 * Ein Rezept pro Screenshot: welche Welt er braucht und welche Schritte am
 * Gerät zu ihm führen.
 *
 * Die Schritte nennen **Beschriftungen, keine Koordinaten**. `capture-screens`
 * liest den Viewbaum (`uiautomator dump`), sucht die Beschriftung als
 * Teilstring und tippt in ihre Mitte. Das hat zwei Gründe: Ein Rezept überlebt
 * damit ein Layout, das sich verschiebt, und — wichtiger — ein fehlgeschlagener
 * Schritt kann SAGEN, was stattdessen zu sehen war. Genau die Information, für
 * die man sonst das Bild angesehen hätte.
 *
 * `expect` löst nichts aus, sondern verlangt nur, dass etwas sichtbar ist. Es
 * steht als letzter Schritt vor der Aufnahme, damit ein halb geöffnetes Sheet
 * gar nicht erst gespeichert wird.
 *
 * Beschriftungen stammen aus dem Quelltext (`accessibilityLabel`), nicht aus
 * dem Gedächtnis — siehe die Verweise an jedem Rezept. Ändert sich eine, bricht
 * der Lauf mit der Liste der echten Beschriftungen ab.
 *
 * KALIBRIERUNG: Die Reihenfolge einiger Schritte hängt vom Zustand ab, den die
 * App gerade zeigt (der Core beschriftet sich je nach eigenem Status anders).
 * `node scripts/capture-screens.mjs --walk <name>` fährt das Rezept Schritt für
 * Schritt und druckt nach jedem, was sichtbar ist.
 */

/** Der Landing-Encoder verlangt exakt diese Master-Größe. */
export const MASTER_SIZE = { width: 1080, height: 2400 };

export const RECIPES = {
  /**
   * Die Karte selbst: fünf Aktivitäten (Solo-Marker, 2×2-Quad, zwei Paare,
   * eine Dreierreihe) plus die ringlose Terminfindung, vier verschiedene
   * Kategorie-Münzen. Jeder Marker hat sein eigenes 100-m-Band, damit
   * `markerCollision` keinen Stapel-Pin daraus macht. Ohne
   * eigenen Offen-Status, damit die Pille die Freundeszahl trägt statt „Offen
   * bis HH:MM" — für ein Werbebild ist „sechs Freunde sind gerade offen" die
   * stärkere Aussage.
   */
  'mica-map': {
    world: 'screens:world:map',
    note: 'Karte: 5 Aktivitäten + 1 Terminfindung. Kein eigener Offen-Status.',
    steps: [
      { launch: true, wait: 9000 },
      // MapOverlay → RoundButton accessibilityLabel="Orte suchen"
      { expect: 'Orte suchen' },
    ],
  },

  /** Die Berliner Alltagswelt aus dem normalen Entwicklungs-Seed. Dieses Bild
   * ist die Kartenmitte des Landing-Hero und braucht deshalb ein eigenes,
   * wiederholbares Rezept statt eines manuell abgelegten Masters. */
  'mica-berlin-activities': {
    world: 'emulators:seed',
    note: 'Berlin: verteilte Demo-Aktivitäten für die zentrale Hero-Karte.',
    steps: [
      { launch: true, wait: 9000 },
      { maybeTap: 'Karte', settle: 900 },
      { expect: 'Orte suchen' },
    ],
  },

  /** Laufende Aktivität für die eigenständige Jetzt-Karte der Landingpage. */
  'mica-now-activity': {
    world: 'screens:world:berlin',
    note: 'Split the G: laufende Aktivität von Hannes und Sebbo als geöffnete Übersichtskarte.',
    steps: [
      { launch: true, wait: 24000 },
      { maybeTap: 'Menü schließen', settle: 600 },
      { maybeTap: 'Detail schließen', settle: 900 },
      { maybeTap: 'Offene Freunde schließen', settle: 900 },
      { tapAt: [540, 1248], settle: 1600 },
      { expect: "Flannigan's Post" },
    ],
  },

  /** Der volle Padel-Plan ist die reale Für-später-Karte der Landingpage. */
  'mica-padel-activity': {
    world: 'screens:world:berlin-soon',
    note: 'Runde Padel: geplanter, voller 4-von-4-Plan als geöffnete Kartenübersicht.',
    steps: [
      { launch: true, wait: 24000 },
      { maybeTap: 'SPÄTER', settle: 900 },
      { maybeTap: 'OK', settle: 900 },
      { maybeTap: 'Menü schließen', settle: 600 },
      { maybeTap: 'Detail schließen', settle: 900 },
      { maybeTap: 'Offene Freunde schließen', settle: 900 },
      { tapAt: [460, 720], settle: 5000 },
      { expect: 'Padelhalle Kreuzberg' },
    ],
  },

  /**
   * Die Offen-Liste. Eigener Status aktiv, vier Freunde mit
   * Entfernung, einer ohne Standort — beide Sichtbarkeitsstufen in einem Bild.
   */
  'mica-open-status': {
    world: 'screens:world:berlin-open',
    note: 'Berlin im Nachtmodus: Offen-Übersicht + 4 in der Nähe + 1 ohne Standort.',
    steps: [
      { launch: true, wait: 24000 },
      { maybeTap: 'Postfach schließen', settle: 900 },
      { maybeTap: 'Offen stellen', settle: 1400 },
      { maybeTap: 'Freunde in deiner Nähe öffnen', settle: 900 },
      // NearbySheet → die Zeile einer offenen Freundin (seed-scenarios: Amelie)
      { expect: 'Amelie Wagner' },
    ],
  },

  /**
   * Das Activity-Detail mit Chat-Vorschau. Der Aufnahme-Account ist Gastgeber
   * des Brunchs, also zeigt das Sheet den beigetretenen Zustand.
   */
  'mica-activity-detail': {
    world: 'screens:world',
    note: 'MarkerDetailSheet „Langer Brunch" mit Chat-Vorschau.',
    steps: [
      { launch: true, wait: 6000 },
      // MapCanvas → Marker accessibilityLabel = `${title}, …`. Google Maps legt
      // Marker als virtuelle Views offen; falls uiautomator sie auf diesem
      // Gerät nicht sieht, hier auf { tapAt: [x, y] } wechseln und die
      // Koordinate einmal mit --ui/--raw bestimmen.
      { tap: 'Langer Brunch', settle: 1600 },
      // MarkerDetailSheet zeigt den Ort als eigene Zeile.
      { expect: 'Café Perlach' },
    ],
  },

  /**
   * Der Composer. Bewusst mit getipptem Namen: ein leeres Formular zeigt nur
   * Platzhalter, und der Wann-Bench ist zugeklappt, solange das Namensfeld den
   * Fokus hat (AGENTS.md → Activity Composer).
   */
  'mica-activity-composer': {
    world: 'screens:world',
    note: 'ActivityComposerSheet mit Namen und offenem Wann-Bench.',
    steps: [
      { launch: true, wait: 6000 },
      // coreTargets.ts → id 'activity'
      { tap: 'Activity jetzt oder für später starten', settle: 1400 },
      { type: 'Feierabendbier im Park', settle: 800 },
      // Namensfeld verlassen, damit der Bench wieder aufgeht.
      { back: true },
      { expect: 'Wann' },
    ],
  },

  /**
   * Terminfindung: sieben Antworten auf drei Vorschlaege. Die Runde liegt als
   * ringloser Marker auf der Karte und oeffnet dieselbe Detailflaeche wie eine
   * Aktivitaet - dort steht statt einer Uhrzeit die Verfuegbarkeitsmatrix.
   */
  'mica-time-matching': {
    world: 'screens:world:berlin-time',
    note: 'Berlin bei Nacht: Terminfindung „Grillen am Wasser" mit 7 Antworten und Samstag 7/7.',
    steps: [
      { launch: true, wait: 24000 },
      { maybeTap: 'OK', settle: 900 },
      { maybeTap: 'Menü schließen', settle: 600 },
      { maybeTap: 'Detail schließen', settle: 900 },
      { maybeTap: 'Offene Freunde schließen', settle: 900 },
      { tapAt: [540, 1425], settle: 1600 },
      // MarkerDetailSheet -> PlanningContent, zweite Zeile im Kasten.
      { tap: 'Terminfindung', settle: 1400 },
      { expect: 'Bester gemeinsamer Zeitraum' },
      { expect: '7 von 7 können' },
    ],
  },

  /**
   * Anreise: zwei Teilnehmende sind unterwegs, der Aufnahme-Account schaut zu.
   * Die Welt zieht den Lauf auf T-40 Min, damit die Anreise überhaupt angeboten
   * wird (Fenster ist T-6 h).
   */
  'mica-journey-focus': {
    world: 'screens:world:anreise',
    note: 'Anreise-Fokus zum „Feierabendlauf am Kanal", 2 unterwegs.',
    steps: [
      { launch: true, wait: 6000 },
      { tap: 'Feierabendlauf am Kanal', settle: 1600 },
      // MarkerDetailSheet → JourneyShareRow
      { tap: 'Anreise', settle: 1600 },
      { expect: 'unterwegs' },
    ],
  },

  /**
   * Heimweg, blauer Normalzustand, aus der Sicht der Person, die ihn teilt.
   * „Sicher angekommen" ist der Abschluss und muss im Bild sein — es ist die
   * einzige Zeile, die die Konsole vom Begleiter-Panel unterscheidet.
   */
  'mica-safety-home': {
    world: 'screens:world:heimweg',
    note: 'Eigene Heimweg-Konsole, blau, zwei bestätigte Begleiter:innen.',
    steps: [
      { launch: true, wait: 6000 },
      // MapOverlay → Schild, Beschriftung bei laufender eigener Session.
      { maybeTap: 'Heimweg-Start schließen', settle: 900 },
      { tap: 'Sicher nach Hause', settle: 1800 },
      { tap: 'Heimweg mit 2 Personen starten', settle: 1800 },
      { expect: 'Sicher angekommen' },
    ],
  },

  /**
   * Der Kalender, und zwar GANZ: Wochenstreifen oben, Agenda mit den
   * Plan-Karten darunter. Eine einzelne Karte ist nicht das Feature — das
   * Feature ist, dass zugesagte Aktivitaeten als Tagesfolge dastehen.
   */
  'mica-calendar': {
    world: 'screens:world',
    note: 'Kalender: Wochenstreifen oben, Agenda mit Plan-Karten darunter.',
    steps: [
      { launch: true, wait: 6000 },
      // MapOverlay -> RoundButton accessibilityLabel="Plaene oeffnen"
      { tap: 'Pläne öffnen', settle: 1800 },
      // CalendarHeader -> Ansichtsumschalter, existiert nur im Kalender.
      { expect: 'Zur Monatsansicht wechseln' },
    ],
  },

  /**
   * Der Activity-Chat als aufgezogenes Panel, nicht als Vorschauzeile. Der
   * Aufnahme-Account ist Gastgeber des Brunchs, also ist er Mitglied und der
   * Thread traegt die geseedeten Nachrichten.
   */
  'mica-chat': {
    world: 'screens:world',
    note: 'Activity-Chat „Langer Brunch“ als aufgezogenes Panel.',
    steps: [
      { launch: true, wait: 6000 },
      { tap: 'Langer Brunch', settle: 1600 },
      // InlineChatPreview -> „Chat oeffnen" bzw. „Chat oeffnen, N neue Nachrichten"
      { tap: 'Chat öffnen', settle: 1800 },
      // MarkerDetailSheet im Chat-Modus: dieser Zurueck-Knopf gibt es nur dort.
      { expect: 'Zurück zu den Activity-Details' },
    ],
  },

  /**
   * Die Sichtbarkeit, aufgeklappt: Gruppenzeilen mit Tri-State-Haken ueber der
   * Freundesliste. Zugeklappt ist es eine Zeile und sagt nichts.
   */
  'mica-audience': {
    world: 'screens:world',
    note: 'Sichtbarkeit im Composer: Gruppen und Freunde mit Tri-State-Haken.',
    steps: [
      { launch: true, wait: 6000 },
      // coreTargets.ts -> id 'activity'
      { tap: 'Activity jetzt oder für später starten', settle: 1400 },
      { type: 'Feierabendbier im Park', settle: 800 },
      // Namensfeld verlassen, sonst bleibt jeder Bench zugeklappt.
      { back: true },
      // ComposerTabs -> accessibilityLabel = `${label}: ${value}`
      { tap: 'Wer:', settle: 1400 },
      // AudienceBench -> zugeklappte Zusammenfassung, Praefix des Labels.
      { tap: 'Sichtbar für', settle: 1400 },
      { expect: 'Gruppen' },
    ],
  },
};
