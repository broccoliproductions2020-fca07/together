/**
 * Die Welten, die `scripts/seed-emulators.mjs` in die lokale Emulator Suite
 * schreibt. Nur Daten — kein einziger Firestore-Write lebt hier.
 *
 * Der Grund für die Trennung: Der Entwickler-Seed und der Marketing-Seed
 * brauchen dieselben Dokumentformen, aber unterschiedliche Inhalte. Ein
 * zweites Skript, das dieselben Formen noch einmal schreibt, wäre genau die
 * Parallel-Implementierung, die AGENTS.md verbietet („Seeds schreiben exakt
 * die Formen, die die Cloud Functions erzeugen — beide ändern"). Also: EIN
 * Schreiber, zwei Datensätze.
 *
 *   dev     — der bisherige Entwickler-Seed, unverändert. 16 Personen, volle
 *             Postfach-Fixtures, offene Gruppe, Freundschaftsanfrage.
 *   landing — die Aufnahme-Welt für die Landingpage. Bewusst klein und still:
 *             jedes Gesicht, das in einem Screenshot auftauchen kann, hat ein
 *             echtes Portrait, und alles, was in einem Werbebild als Rauschen
 *             wirkt (Einladungen, Anfragen, fremde Badges), fehlt.
 */

/**
 * @typedef {object} ScenarioContext
 * @property {(dLat: number, dLng: number) => {lat: number, lng: number}} at
 * @property {number} now
 * @property {number} HOUR
 * @property {number} DAY
 * @property {number} brunchStart
 * @property {number} brunchEnd
 */

export const SCENARIO_NAMES = ['dev', 'landing'];

/**
 * Der Account, aus dessen Sicht die Landingpage-Screenshots entstehen.
 * Eine Quelle fuer Seed, Pruefskript und Aufnahme-Rezepte - drei Stellen, die
 * sonst still auseinanderlaufen, sobald jemand die Rolle verschiebt.
 */
export const LANDING_ACCOUNT = {
  uid: 'seed-mia',
  email: 'mia@seed.together.dev',
  password: 'seed-only',
  displayName: 'Mia Sommer',
};

/**
 * @param {string} name
 * @param {ScenarioContext} ctx
 */
export function buildScenario(name, ctx) {
  if (name === 'landing') return landingScenario(ctx);
  if (name === 'dev') return devScenario(ctx);
  throw new Error(`Unbekanntes Szenario "${name}" (erlaubt: ${SCENARIO_NAMES.join(', ')}).`);
}

/* ────────────────────────────────────────────────────────────── dev ── */

function devScenario({ at, now, HOUR, brunchStart, brunchEnd }) {
  return {
    id: 'dev',
    reset: false,
    /** Kein Protagonist: „ich" ist jeder echte Auth-Account im Emulator. */
    me: null,
    myPresence: null,
    inboxFixtures: true,
    people: [
      {
        uid: 'seed-max',
        name: 'Max Krüger',
        username: 'max',
        vibe: 'Markt',
        open: true,
        location: at(-0.003, -0.003),
      },
      {
        uid: 'seed-lisa',
        name: 'Lisa Becker',
        username: 'lisa',
        vibe: 'Kaffee',
        open: true,
        location: at(-0.002, 0.002),
      },
      {
        uid: 'seed-jonas',
        name: 'Jonas Pohl',
        username: 'jonas',
        vibe: 'Sport',
        open: true,
        location: null,
      },
      {
        uid: 'seed-nora',
        name: 'Nora Weiß',
        username: 'nora',
        vibe: null,
        open: true,
        location: null,
      },
      {
        uid: 'seed-mia',
        name: 'Mia Sommer',
        username: 'mia',
        vibe: 'Frühstück',
        open: true,
        location: at(0.002, 0.001),
      },
      {
        uid: 'seed-ben',
        name: 'Ben Otto',
        username: 'ben',
        vibe: null,
        open: false,
        location: at(-0.012, 0.009),
      },
      {
        uid: 'seed-amelie',
        name: 'Amelie Wagner',
        username: 'amelie',
        vibe: 'Spaziergang',
        open: true,
        location: at(0.003, -0.002),
      },
      {
        uid: 'seed-david',
        name: 'David Klein',
        username: 'david',
        vibe: 'Kaffee',
        open: true,
        location: at(0.004, 0.003),
      },
      {
        uid: 'seed-sofia',
        name: 'Sofia Neumann',
        username: 'sofia',
        vibe: null,
        open: true,
        location: at(0.006, -0.002),
      },
      {
        uid: 'seed-elias',
        name: 'Elias Becker',
        username: 'elias',
        vibe: 'Radtour',
        open: true,
        location: at(-0.004, 0.004),
      },
      {
        uid: 'seed-hannah',
        name: 'Hannah Vogel',
        username: 'hannah',
        vibe: 'Essen',
        open: true,
        location: at(0.004, -0.008),
      },
      {
        uid: 'seed-felix',
        name: 'Felix Brandt',
        username: 'felix',
        vibe: null,
        open: true,
        location: at(-0.001, -0.009),
      },
      {
        uid: 'seed-lina',
        name: 'Lina Roth',
        username: 'lina',
        vibe: 'Kino',
        open: true,
        location: at(0.009, 0.002),
      },
      {
        uid: 'seed-tom',
        name: 'Tom Richter',
        username: 'tom',
        vibe: 'Drink',
        open: true,
        location: at(-0.009, -0.003),
      },
      {
        uid: 'seed-marie',
        name: 'Marie Schulz',
        username: 'marie',
        vibe: 'Spiele',
        open: true,
        location: at(0.007, 0.008),
      },
      {
        uid: 'seed-noah',
        name: 'Noah Fischer',
        username: 'noah',
        vibe: null,
        open: true,
        location: at(-0.008, 0.008),
      },
    ],
    /** Außerhalb von `people`, damit die Annahme-Schleife die Anfrage nicht überschreibt. */
    requester: { uid: 'seed-mailbox-requester', name: 'Leonie Hartmann', username: 'leonie-seed' },
    /**
     * Sechs Activities in sechs verschiedenen Himmelsrichtungen um CENTER,
     * je ~400–650 m entfernt (`at()`-Offsets 0.001 ≈ 111 m Lat / ~68 m Lng
     * bei Berlin-Breite): sichtbar verteilt fürs Rendering, aber alle noch
     * innerhalb des Standard-Nahbereichs (3 km) und nah genug beieinander,
     * dass sie nicht wie zufällige Einzelpins über ganz Berlin wirken.
     * Einige Personen tauchen bewusst in mehreren Activities auf (elias,
     * lisa, max), weil das im echten Freundeskreis der Normalfall ist.
     */
    activities: [
      {
        id: 'seed-act-kicker',
        host: 'seed-max',
        also: ['seed-elias', 'seed-mia'],
        mode: 'now',
        title: 'Kickerabend',
        category: 'spiele',
        startsAt: now - HOUR / 2,
        endsAt: now + 2 * HOUR,
        place: { label: 'Kieztreff am Park', visibility: 'pin', ...at(0.004, -0.004) },
        messages: [
          { author: 'seed-max', text: 'Der Tisch ist reserviert – kommt gern dazu.' },
          { author: 'seed-elias', text: 'Bin in zehn Minuten da.' },
        ],
      },
      {
        id: 'seed-act-lauf',
        host: 'seed-david',
        also: ['seed-lisa'],
        mode: 'now',
        title: 'Feierabendlauf am Kanal',
        category: 'sport',
        startsAt: now - HOUR / 4,
        endsAt: now + HOUR,
        maxParticipants: 6,
        place: { label: 'Landwehrkanal', visibility: 'pin', ...at(-0.005, 0) },
        messages: [{ author: 'seed-david', text: 'Lockeres Tempo, alle willkommen.' }],
      },
      {
        id: 'seed-act-brunch',
        host: 'seed-mia',
        also: ['seed-amelie'],
        includeDevAccount: true,
        mode: 'soon',
        title: 'Brunch am Sonntag',
        category: 'essen',
        startsAt: brunchStart,
        endsAt: brunchEnd,
        place: { label: 'Café Morgenrot', visibility: 'pin', ...at(0.001, 0.006) },
        messages: [
          { author: 'seed-mia', text: 'Ich reserviere uns einen Tisch.' },
          { author: 'seed-amelie', text: 'Freue mich, bin dabei.' },
          { author: 'seed-lisa', text: 'Ich bringe Obst mit.' },
        ],
      },
      {
        id: 'seed-act-padel',
        host: 'seed-nora',
        also: ['seed-hannah', 'seed-elias', 'seed-mia'],
        mode: 'soon',
        title: 'Runde Padel',
        category: 'sport',
        startsAt: now + 3 * HOUR,
        endsAt: now + 5 * HOUR,
        maxParticipants: 4,
        place: { label: 'Padelhalle Kreuzberg', visibility: 'pin', ...at(-0.004, 0.004) },
        messages: [
          { author: 'seed-nora', text: 'Court zwei ist für uns reserviert.' },
          { author: 'seed-hannah', text: 'Perfekt, ich bin pünktlich da.' },
        ],
      },
      {
        id: 'seed-act-kino',
        host: 'seed-lina',
        also: ['seed-tom', 'seed-lisa'],
        mode: 'soon',
        title: 'Kino: Spätvorstellung',
        category: 'kultur',
        startsAt: now + 6 * HOUR,
        endsAt: now + 8 * HOUR,
        place: { label: 'Kino International', visibility: 'pin', ...at(0.006, -0.001) },
        messages: [
          { author: 'seed-lina', text: 'Tickets sind schon gekauft, Reihe 5.' },
          { author: 'seed-tom', text: 'Perfekt, ich hol noch Popcorn.' },
        ],
      },
      {
        id: 'seed-act-picknick',
        host: 'seed-sofia',
        also: ['seed-felix', 'seed-noah', 'seed-max'],
        mode: 'now',
        title: 'Picknick im Park',
        category: 'outdoor',
        startsAt: now - HOUR,
        endsAt: now + 2 * HOUR,
        place: { label: 'Görlitzer Park', visibility: 'pin', ...at(0.0005, -0.006) },
        messages: [
          { author: 'seed-sofia', text: 'Decke liegt schon im Park, kommt vorbei!' },
          { author: 'seed-felix', text: 'Bringe Snacks mit.' },
        ],
      },
    ],
    openGroup: {
      id: 'seed-group-abend',
      title: 'Was geht heute Abend?',
      vibe: 'Egal',
      members: ['seed-lisa', 'seed-jonas'],
    },
    notifications: [],
  };
}

/* ────────────────────────────────────────────────────────── landing ── */

/**
 * Der Ankerpunkt der Aufnahme-Welt: **Flannigan's Post**, der Irish Pub in der
 * Augsburger Innenstadt. Alles andere wird um ihn herum gelegt.
 *
 * Fuggerstraße 5–7, 86150 Augsburg, geokodiert über OpenStreetMap. Eine
 * frühere Fassung stand hier mit einer geschätzten Koordinate „mitten in der
 * Altstadt" — die lag rund 250 m daneben, und der Kommentar behauptete
 * trotzdem, sie sei auf ein paar Dutzend Meter genau. Der Pub ist die einzige
 * echte Örtlichkeit in dieser Welt; alle anderen Ortsnamen sind erfunden und
 * dürfen es sein.
 *
 * Jede andere Position ist ein Meter-Offset hierauf (siehe SCENE), also
 * verschiebt eine Korrektur hier die ganze Szene geschlossen mit.
 */
export const LANDING_CENTRE = {
  lat: 48.36732,
  lng: 10.89353,
  label: "Flannigan's Post, Fuggerstraße 5, Augsburg",
};

/**
 * Aufnahme-Welt für die Landingpage.
 *
 * Fünf Regeln bestimmen jede einzelne Zahl hier:
 *
 * 1. **Jede Person hat ein Portrait — ausnahmslos.** Es liegen zwölf
 *    bereitgestellte Bilder in `assets/demo-avatars/`, und der Roster ist
 *    genau zwölf Personen. Kein Initialen-Kreis darf irgendwo auftauchen:
 *    nicht auf einem Marker, nicht in der Offen-Liste, nicht im Publikums-Tab
 *    des Composers.
 *
 * 2. **Kein Zustand widerspricht einem anderen.** „Offen" heißt „ich bin frei,
 *    noch nichts vor". Wer in einer laufenden `now`-Aktivität steckt, ist
 *    deshalb NICHT offen. Eine `soon`-Aktivität schließt „offen" dagegen nicht
 *    aus — man hat später etwas vor und ist jetzt trotzdem zu haben.
 *
 *    **Alles liegt in den nächsten zwei Tagen, und genau EINE Aktivität
 *    läuft**: „Split the G". Zwei grüne Marker würden die Aussage
 *    verwässern, und ein Plan drei Wochen voraus sieht in einem Werbebild
 *    aus wie eine Karteileiche. Die Zeiten sind absolute Tageszeiten
 *    (`dayAt`), keine Offsets — ein Kalender soll wie ein Kalender lesen.
 *
 * 3. **Kein Rauschen.** Keine Freundschaftsanfrage, keine Gruppeneinladung,
 *    keine spontane Runde, keine fremde Privataktivität auf der Karte. Ein
 *    Werbebild darf keine Aufgabenliste zeigen.
 *
 * 4. **Der Lauf setzt hart zurück** (`reset: true`). Firestore leer, RTDB
 *    leer, jedes fremde Auth-Konto weg. Zwei Läufe ergeben denselben Stand —
 *    ohne das sind zwei Renderings nicht vergleichbar.
 *
 * 5. **Kein Marker überlagert einen anderen.** Sonst fasst `markerCollision`
 *    sie zu einem Stapel-Pin zusammen, und genau die einzelnen Marker sind
 *    das, was das Bild zeigen soll. Siehe `SCENE` unten — dort steht die
 *    Rechnung, nicht nur das Ergebnis.
 *
 * Die Rollenverteilung der zwölf Portraits (Reihenfolge = Lieferreihenfolge
 * pb1..pb12; das `w`/`m` im Dateinamen bestimmt das Geschlecht des Namens,
 * sonst nichts):
 *
 *   Mia     w — der Aufnahme-Account selbst (Brunch-Gastgeberin, Padel, Heimweg)
 *   Lisa    w — offen · Lauf · Anreise
 *   Amelie  w — offen · Brunch · Heimweg-Begleitung
 *   Hannes  m — „Split the G" im Pub, läuft gerade, deshalb nicht offen
 *   David   m — offen · Lauf-Gastgeber · Anreise · Heimweg-Begleitung
 *   Sebbo   m — „Split the G" im Pub, läuft gerade, deshalb nicht offen
 *   Nora    w — Padel (morgen)
 *   Jonas   m — Padel (morgen)
 *   Hannah  w — Padel (morgen)
 *   Tom     m — kein Plan
 *   Sofia   w — offen · Gastgeberin der Solo-Aktivität (Kino, heute Abend)
 *   Noah    m — offen OHNE Standort (zeigt die zweite Sichtbarkeitsstufe)
 */

/**
 * Die Bühne, in Metern relativ zum Pub. Nord/Ost positiv.
 *
 * Warum überhaupt in Metern: Die Frage, die diese Zahlen beantworten, lautet
 * „überlagern sich zwei Marker?" — und die stellt sich in Pixeln auf dem
 * Schirm, nicht in Grad. Grad-Offsets sind für Länge und Breite verschieden
 * lang, sodass man die Antwort aus ihnen nicht ablesen kann.
 *
 * **Die Karte rendert GEKIPPT.** Ein erstes, flaches Modell rechnete mit
 * quadratischen Pixeln und gab jedem Marker ein 100-m-Band; am Gerät
 * verschmolzen zwei davon trotzdem zu einem Stapel-Pin. Nachgemessen aus dem
 * Screenshot (blauer Punkt gegen den Lauf-Marker, 50 m nördlich / 70 m
 * östlich = 84 px / 210 px): waagerecht 0.333 m/px, senkrecht 0.595 m/px.
 * Ein Marker ist 420 × 218 px und braucht damit **140 m in der Breite und
 * 130 m in der Höhe** — die Höhe war im flachen Modell um 55 m zu klein, und
 * genau dort ist es gerissen.
 *
 * **Sechs Marker in sechs Bänder zu legen, ist trotzdem falsch.** Bei 165 m
 * Abstand war zwar keine Kollision mehr da, aber der Stapel wurde 825 m hoch:
 * Oben stieß „Kino" an die Suchleiste, unten fiel „Grillen" aus dem Bild.
 * Also **zwei Marker pro Band, nebeneinander** — der Abstand kommt dann aus
 * der BREITE (195 m, mehr als die nötigen 140), und die Szene ist nur noch
 * 600 statt 825 m hoch. Der Pub kann nicht mitspielen: Er liegt, wo er liegt,
 * also bekommt er sein Band allein; ein Partner müsste 140 m östlich stehen
 * und wäre außerhalb der sichtbaren ±180 m.
 *
 * Der Streubereich bleibt ±105 m, weil ein Marker 70 m über seinen Punkt
 * hinausragt und sonst am Bildrand abgeschnitten wird.
 */

/**
 * Wo der Aufnahme-Account steht, in Metern vom Pub aus.
 *
 * Die Kamera zentriert beim ersten Standortfix auf den GERÄTESTANDORT, nicht
 * auf die Präsenz in Firestore — deshalb muss `npm run screens:geo` genau
 * diesen Punkt setzen, sonst sitzt die Szene schief im Bild.
 *
 * Nicht die Mitte der Bänder: Nach unten ist weniger Platz als nach oben, weil
 * der Core die unteren ~450 px deckt und die Suchleiste nur die oberen ~250.
 * Am Gerät gemessen sind das rund 470 m nach oben gegen 294 m nach unten. Der
 * Wert schiebt die Szene deshalb nach Norden.
 */
export const LANDING_VIEWER_OFFSET = { north: -208, east: 0 };

/**
 * Die Terminfindung liegt in `scripts/seed-time-plan.mjs`, gehört aber in
 * dieselbe Reihe — also steht ihr Platz hier, und das andere Skript liest ihn.
 */
export const LANDING_PLAN_OFFSET = { north: -590, east: 0 };

const SCENE = {
  me: LANDING_VIEWER_OFFSET,
  /**
   * VIER Baender ueber 975 m statt drei ueber 400 — die Marker sollen die
   * Karte fuellen, nicht in ihrer Mitte zusammenstehen.
   *
   * Die Zahlen haengen am Aufnahme-Zoom: `CAPTURE_ZOOM_OUT` (1,8) zieht die
   * Kamera zurueck, und die Szene ist um denselben Faktor gespreizt. Beim
   * normalen App-Zoom stiess der obere Marker schon an die Suchleiste und der
   * untere an den Core — es war schlicht kein Platz mehr da, in den man haette
   * verteilen koennen. Herauszoomen schafft beides auf einmal: mehr Stadt im
   * Bild UND Raum zwischen den Markern. Gemessen, nicht geschaetzt:
   *
   * - **Nord/Sued** ist grosszuegig: Der sichtbare Ausschnitt ist gut 1100 m
   *   hoch. Abzueglich der Suchleiste oben und des Core unten bleiben rund
   *   740 m nutzbar. Die Planungsrunde ganz unten war vorher schlicht AUS DEM
   *   BILD (bei -400 hinter dem Core) — sie gehoert zur Aussage
   *   „5 Aktivitaeten + 1 Terminfindung" und muss also sichtbar sein.
   * - **Ost/West ist der Engpass**, nicht die Hoehe: Der Ausschnitt ist nur
   *   gut 400 m breit, und ein Marker ist selbst rund 80 m breit. Mehr als
   *   ±120 m Abstand von der Mitte laeuft am Bildrand an. Deshalb wird in der
   *   BREITE nur wenig zugelegt (195 -> 240 m) und die Luft in der HOEHE
   *   geholt.
   *
   * Der Betrachter sitzt bei -213, damit die Szene im nutzbaren Fenster
   * zentriert liegt. Die Kamera folgt dem GERAETESTANDORT, nicht dem Pub —
   * bei -180 und drei Baendern hing alles im oberen Drittel und unten stand
   * eine halbe Bildschirmhoehe leere Karte.
   */
  kino: { north: 325, east: -170 },
  padel: { north: 325, east: 170 },
  // Band Mitte: der Pub allein, weil seine Lage nicht verhandelbar ist.
  pub: { north: 0, east: 0 },
  brunch: { north: -325, east: -170 },
  lauf: { north: -325, east: 170 },
  // Band ganz unten: die Planungsrunde, jetzt oberhalb des Core.
  planung: LANDING_PLAN_OFFSET,
  /**
   * Offene Freundinnen und Freunde bekommen KEINEN Kartenmarker (AGENTS.md:
   * „An open friend gets NO map pin"), ihre Koordinate liefert nur die
   * Entfernung in der Offen-Liste. Sie darf deshalb weit außerhalb des Bildes
   * liegen — und soll es auch, sonst liest sich jede Entfernung als „200 m".
   */
  amelie: { north: 125, east: 160 },
  lisa: { north: -535, east: 405 },
  sofia: { north: 505, east: -575 },
  david: { north: -905, east: 865 },
};

function landingScenario({ atMeters, dayAt, now, HOUR }) {
  const MINUTE = 60 * 1000;
  const spot = (key) => atMeters(SCENE[key].north, SCENE[key].east);

  /**
   * Das Kino faellt auf morgen, sobald der Seed nach 18 Uhr laeuft — eine
   * Spaetvorstellung, die schon begonnen hat, waere keine mehr.
   */
  const kinoToday = dayAt(0, 20, 0);
  const kinoStart = kinoToday > now + 45 * MINUTE ? kinoToday : dayAt(1, 20, 0);

  return {
    id: 'landing',
    reset: true,
    /**
     * Der Aufnahme-Account IST eine der Portrait-Personen. Ein eigener Account
     * ohne Bild stünde in der Top-Bar, in jeder Teilnehmerzeile und in der
     * Heimweg-Konsole als Initialen-Kreis — direkt neben lauter echten
     * Gesichtern.
     *
     * Anmeldung im Dev-Client: mia@seed.together.dev / seed-only
     */
    me: LANDING_ACCOUNT.uid,
    /**
     * Der eigene Offen-Status. Ablauf wird auf die nächste halbe Stunde
     * gerundet: Die App schreibt +3 h ab jetzt, was in der Zusammenfassung
     * „bis 17:43" ergibt — eine Zahl, die im Bild wie ein Zufall aussieht,
     * obwohl sie keiner ist. Die gerundete Variante ist derselbe legale Wert,
     * nur lesbar.
     */
    myPresence: {
      vibe: 'Kaffee',
      shareLocation: true,
      location: spot('me'),
      expiresAt: roundUpToHalfHour(now + 3 * HOUR),
    },
    inboxFixtures: false,
    people: [
      // ── Der Aufnahme-Account ───────────────────────────────────────────
      {
        uid: 'seed-mia',
        name: 'Mia Sommer',
        username: 'mia',
        vibe: null,
        open: false,
        location: null,
      },
      // ── Offen: die Offen-Liste des NearbySheet ─────────────────────────
      {
        uid: 'seed-amelie',
        name: 'Amelie Wagner',
        username: 'amelie',
        vibe: 'Spaziergang',
        open: true,
        location: spot('amelie'),
      },
      {
        uid: 'seed-lisa',
        name: 'Lisa Becker',
        username: 'lisa',
        vibe: 'Stadtmarkt',
        open: true,
        location: spot('lisa'),
      },
      {
        uid: 'seed-sofia',
        name: 'Sofia Neumann',
        username: 'sofia',
        vibe: 'Kino heute Abend',
        open: true,
        location: spot('sofia'),
      },
      {
        uid: 'seed-david',
        name: 'David Klein',
        username: 'david',
        vibe: null,
        open: true,
        location: spot('david'),
      },
      // Ohne Standort: zeigt die zweite Sichtbarkeitsstufe („Ohne Standort").
      {
        uid: 'seed-noah',
        name: 'Noah Fischer',
        username: 'noah',
        vibe: 'Skaten',
        open: true,
        location: null,
      },
      // ── Beschäftigt: laufende `now`-Aktivitäten, deshalb nicht offen ───
      {
        uid: 'seed-hannes',
        name: 'Hannes Macha',
        username: 'hannes',
        vibe: null,
        open: false,
        location: null,
      },
      {
        uid: 'seed-sebbo',
        name: 'Sebbo Regs',
        username: 'sebbo',
        vibe: null,
        open: false,
        location: null,
      },
      {
        uid: 'seed-nora',
        name: 'Nora Weiß',
        username: 'nora',
        vibe: null,
        open: false,
        location: null,
      },
      {
        uid: 'seed-jonas',
        name: 'Jonas Pohl',
        username: 'jonas',
        vibe: null,
        open: false,
        location: null,
      },
      {
        uid: 'seed-hannah',
        name: 'Hannah Vogel',
        username: 'hannah',
        vibe: null,
        open: false,
        location: null,
      },
      {
        uid: 'seed-tom',
        name: 'Tom Richter',
        username: 'tom',
        vibe: null,
        open: false,
        location: null,
      },
    ],
    requester: null,
    activities: [
      {
        /**
         * Der Pub-Termin und der Anker der ganzen Szene. Genau zwei
         * Teilnehmende, ausdrücklich keine weiteren: Hannes und Sebbo.
         *
         * „Split the G" ist der Guinness-Schluck, nach dem der Schaum genau
         * auf dem G des Glaslogos steht — deshalb `drinks` und deshalb `now`:
         * Die beiden sitzen gerade dort, der Marker trägt den grünen Ring.
         */
        id: 'seed-act-split-the-g',
        host: 'seed-hannes',
        also: ['seed-sebbo'],
        mode: 'now',
        title: 'Split the G',
        category: 'drinks',
        startsAt: now - 40 * MINUTE,
        endsAt: now + 80 * MINUTE,
        place: { label: "Flannigan's Post", visibility: 'pin', ...spot('pub') },
        messages: [
          { author: 'seed-hannes', text: 'Sitzen hinten links, erste Runde steht.' },
          { author: 'seed-sebbo', text: 'Meins war ein sauberer Split.' },
        ],
      },
      {
        /** Vier von vier Teilnehmenden: ein voller, aber eigener Plan der
         * Aufnahme-Person. Dadurch bleibt der Marker sichtbar und die
         * Kapazität ist im Rendering ehrlich. */
        id: 'seed-act-padel',
        host: 'seed-nora',
        also: ['seed-jonas', 'seed-hannah', 'seed-mia'],
        mode: 'soon',
        title: 'Runde Padel',
        category: 'sport',
        startsAt: dayAt(1, 11, 0),
        endsAt: dayAt(1, 13, 0),
        maxParticipants: 4,
        place: { label: 'Padelhalle Lechviertel', visibility: 'pin', ...spot('padel') },
        messages: [
          { author: 'seed-nora', text: 'Court zwei ist für uns reserviert.' },
          { author: 'seed-hannah', text: 'Perfekt, ich bin kurz vor elf da.' },
        ],
      },
      {
        /**
         * Der einzige Ein-Personen-Plan: Er erzeugt den Solo-Marker mit
         * Namensschild, während die anderen als Gruppenmarker rendern.
         *
         * Bewusst `soon`, nicht `now`: Sofia soll in der Offen-Liste stehen,
         * und Regel 2 verbietet „offen" nur bei einer LAUFENDEN Aktivität.
         */
        id: 'seed-act-kino',
        host: 'seed-sofia',
        also: [],
        mode: 'soon',
        title: 'Kino: Spätvorstellung',
        category: 'kultur',
        startsAt: kinoStart,
        endsAt: kinoStart + 2 * HOUR + 15 * MINUTE,
        place: { label: 'Thalia Augsburg', visibility: 'pin', ...spot('kino') },
        messages: [{ author: 'seed-sofia', text: 'Karten gibt es an der Abendkasse.' }],
      },
      {
        /**
         * Das Anreise-Ziel. Der Aufnahme-Account ist selbst dabei, weil man den
         * Anreise-Fokus nur als Teilnehmende:r sieht — und der Titel nennt
         * keinen Wochentag, damit die Aufnahme-Variante ihn nach vorn ziehen
         * kann, ohne dass die Überschrift lügt.
         */
        id: 'seed-act-lauf',
        host: 'seed-david',
        also: ['seed-lisa', 'seed-mia'],
        mode: 'soon',
        title: 'Feierabendlauf am Kanal',
        category: 'sport',
        startsAt: dayAt(1, 18, 30),
        endsAt: dayAt(1, 19, 30),
        maxParticipants: 6,
        place: { label: 'Vorderer Lech', visibility: 'pin', ...spot('lauf') },
        messages: [
          { author: 'seed-david', text: 'Lockeres Tempo, alle willkommen.' },
          { author: 'seed-lisa', text: 'Bin dabei, bringe Wasser mit.' },
        ],
      },
      {
        id: 'seed-act-brunch',
        host: 'seed-mia',
        also: ['seed-amelie'],
        mode: 'soon',
        // Kein Wochentag im Titel: Die Aktivitaet liegt bei „heute + 2“, und
        // „Brunch am Sonntag“ waere an den meisten Seed-Tagen schlicht falsch.
        title: 'Langer Brunch',
        category: 'essen',
        startsAt: dayAt(2, 10, 30),
        endsAt: dayAt(2, 12, 30),
        place: { label: 'Café Perlach', visibility: 'pin', ...spot('brunch') },
        messages: [
          { author: 'seed-mia', text: 'Ich reserviere uns einen Tisch für elf.' },
          { author: 'seed-amelie', text: 'Perfekt, ich komme direkt vom Markt.' },
          { author: 'seed-mia', text: 'Der Tisch am Fenster ist frei.' },
        ],
      },
    ],
    /** Keine offene Gruppe: Die „Am Planen“-Sektion würde in der Offen-Liste
     *  genau den Platz nehmen, den die Freunde brauchen. */
    openGroup: null,
    /**
     * Genau eine Mitteilung. Ohne sie ist das Postfach leer und wirkt tot; mit
     * mehreren wird aus dem Badge eine Aufgabenliste.
     */
    notifications: [
      {
        id: 'seed-landing-joined',
        forMe: true,
        kind: 'activity_joined',
        title: 'Amelie ist dabei',
        body: 'Amelie Wagner ist deiner Activity „Langer Brunch“ beigetreten.',
        activityId: 'seed-act-brunch',
        createdAtOffsetMs: -22 * MINUTE,
      },
    ],
  };
}

/** Nächste volle oder halbe Stunde ab `ms`. */
function roundUpToHalfHour(ms) {
  const half = 30 * 60 * 1000;
  return Math.ceil(ms / half) * half;
}
