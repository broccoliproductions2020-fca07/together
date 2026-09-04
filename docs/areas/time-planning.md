# Terminfindung

Ausgelagert aus `AGENTS.md`. Lies diese Datei, wenn du an diesem Bereich arbeitest.

---

## Terminfindung (mehrere Zeitvorschläge)

Der Host schlägt in der Wann-Bench mehrere Tage/Fenster vor (`PlanningOfferFields`);
daraus wird ein `timePlans/{planId}` mit `sourceWindows`. Das Feature lebt in
`src/features/time-planning/`. Es ist **keine Activity** — kein Chat, keine Anreise,
kein fixes Datum, bis der Host einen Slot festzurrt.

- **Beitreten IST Antworten — ein Callable, beides oder nichts.** `joinTimePlan`
  verlangt `responsesByWindow` und `parseTimePlanResponses` besteht auf einem Eintrag
  für JEDES Fenster. **Es gibt kein Mitglied ohne Antwort**: Wer das Sheet ohne
  Antwort schließt, ist einfach nicht dabei, es wird nichts halb gespeichert. Das war
  vorher zweistufig (erst beitreten, dann fragen) und erzeugte genau den Zustand, auf
  den der Host ewig wartet — ein Name in der Liste ohne Verfügbarkeit. Nebeneffekt:
  „kann nicht" und „hat noch nicht geantwortet" können sich in der Auswertung nicht
  mehr vermischen. **Nicht** über Entfernen-nach-Frist oder eine öffentliche
  „hat nicht geantwortet"-Markierung lösen: Das ist ein Pranger, und die App
  verzichtet aus demselben Grund schon beim Heimweg auf so eine Meldung.
- **Zwei Lese-Stufen in `firestore.rules`.** Die Antwortfläche muss aufgehen, BEVOR
  jemand Mitglied ist, also darf ein Eingeladener `timePlans/{planId}` lesen (Titel,
  Ort, Fenster — genau das, was man zum Antworten braucht), die
  `timePlanMembers`-Subcollection aber NICHT. Wer die eigenen Zeiten nicht geteilt
  hat, liest auch die fremden nicht. Die Invite-ID ist deterministisch
  (`{planId}_{uid}`), das Invite-Dokument selbst bleibt clientseitig unlesbar.
  Folge: Vor dem Beitreten zeigt die Antwortkarte **keine** fremde Verdichtung —
  dafür bräuchte es eine serverseitig gepflegte Zusammenfassung auf dem Plan-Dokument.
- **`lockTimePlan` ist der Abschluss, und ohne ihn ist alles andere Deko.** Host-only,
  Slot muss im gewählten Fenster liegen, client-generierte `activityId` als
  Idempotenzschlüssel (wie `createActivity`). Erzeugt eine echte Activity + Chat,
  setzt `status: 'locked'` + `activityId` auf dem Plan und benachrichtigt alle
  anderen (`time_plan_locked`). **Wer geantwortet hat, dass er zu genau diesem Slot
  kann, wird als Teilnehmer übernommen** — nochmal fragen hieße eine schon
  beantwortete Frage stellen. `participantUids[0] == hostId` bleibt gewahrt. Die
  Audience ist die Runde, nicht die ganze Freundesliste.
- **Eine Runde stirbt mit der Sache, die sie verabredet hat — auf derselben Uhr
  wie deren Chat** (`TIME_PLAN_RETENTION_MS === ACTIVITY_CHAT_RETENTION_MS`,
  12 h; September 2026, ersetzt 14 Tage nach dem letzten Vorschlagsfenster).
  „Wer konnte am Samstag" ist eine Antwort auf EINE Entscheidung und darf die
  Entscheidung nicht überleben. Beim Anlegen wird der Stempel aus dem letzten
  Fenster geschnitten, beim Festlegen aus dem **gewählten** Slot neu — sonst
  hielte eine Runde mit Fr/Sa/So, die am Freitag festgelegt wird, alle
  Verfügbarkeiten bis Sonntag am Leben. **Die Mitglieder müssen mitgestempelt
  werden**, und das ist keine Kosmetik: Eine TTL löscht das Plan-DOKUMENT, nie
  seine Subcollection — `timePlanMembers` trägt die heikle Hälfte und würde mit
  dem alten, späteren Stempel den Plan überleben. `scripts/seed-time-plan.mjs`
  spiegelt die Konstante; `test:time-plan-functions` prüft alle drei Ebenen.
- **Auswertung: `utils/availability.ts`, eine Quelle.** `aggregateWindow` teilt das
  Fenster an jeder Grenze und zählt Deckung → **harte Kanten**, nie ein Verlauf: Die
  Zahl der Verfügbaren springt an der Minute, ein Gradient würde eine Stetigkeit
  behaupten, die die Daten nicht haben. `bestSlot` nimmt den höchsten Zählstand,
  bei Gleichstand den längeren, dann den früheren; ein Peak unter 15 Minuten verliert
  gegen einen längeren, niedrigeren Lauf. `availabilityLevel` bildet auf **maximal 5
  Stufen** ab, unabhängig von der Gruppengröße — mehr unterscheidet das Auge nicht,
  und eine Runde darf 50 Leute haben. Die genaue Zahl steht immer daneben.
- **Eine gemeinsame Tageszeit-Achse — Prinzip, aktuell nicht implementiert.**
  `utils/dayAxis.ts` ist mit `TimeMatchingCard` gelöscht (September 2026); die
  Umfrage-Übersicht braucht sie nicht. Die Begründung steht hier, falls je wieder
  mehrere Tage nebeneinander gezeichnet werden: Alle Vorschlagstage wurden
  auf DIESELBE Achse gezeichnet (Minuten ab der jeweiligen Mitternacht, Werte > 1440
  für Fenster über Mitternacht). Würde jeder Tag die volle Zeilenbreite füllen, wäre
  eine Stunde in jeder Zeile anders breit und der Vergleich, den der Stapel geradezu
  einlädt, wäre falsch. Der leere Platz ist Information (man SIEHT, dass Samstag ein
  Nachmittag ist), keine Verschwendung.
- **Die Übersicht ist eine UMFRAGE, keine Verdichtungsgrafik** (September 2026;
  ersetzt die Availability-Matrix als Hauptfläche). Genau das Modell, das Leute
  aus WhatsApp-Umfragen kennen: `TimeTallyCard` zeigt pro Vorschlagstag eine
  Zeile mit Tag, Zeit, `N von M` und einem anteiligen Balken; Antippen öffnet
  `TimePlanDayAnswers` mit den Einzelantworten. **Es gibt nur noch diese eine
  Fläche.** `TimeMatchingCard` (Treppen auf gemeinsamer Achse, Auffächern,
  `staircase.ts`, `dayAxis.ts`, `TimeMatchingOverview`, `TimeMatchingHighlight`,
  `AvailabilityStrip`) ist **gelöscht** (September 2026) — sie war seit dem
  Umbau nirgends mehr gemountet; die Weiche `anyNarrowedAnswer` war schon vorher
  raus. Der Code liegt im Tag `v1-social`. Grund: Die Treppe
  war nicht falsch, aber sie war eine zweite Maschine für dieselbe Frage — zwei
  Karten mit verschiedenen Titeln, verschiedenen Layouts und einem Schalter
  dazwischen, sodass jemand, der beide sah, zwei Features sah. Nicht wieder
  einhängen, ohne dieselbe Frage neu zu beantworten.
- **Die Zeile nennt die beste GEMEINSAME Zeit, nie das Fenster des Hosts.** Die
  Zahl daneben kam schon immer aus `best.count` („zu der besten Zeit an diesem
  Tag können N"). Danebengedruckt stand aber das vorgeschlagene Fenster: bei
  einem Vorschlag 18–24, den vier von fünf nur 20–22 können, las sich die Zeile
  als „vier können den ganzen Abend". Zahl und Zeit müssen dieselbe Strecke
  meinen. Ohne `best` kann niemand — dann ist der Vorschlag selbst das Einzige,
  was ehrlich zu nennen bleibt.
- **Jeder darf einen Tag öffnen, nicht nur der Host**, und der Host legt IN der
  geöffneten Zeile fest — auf der besten gemeinsamen Strecke, nicht auf dem
  ganzen Vorschlag. Die Entscheidung sitzt dort, wo die Begründung steht; ein
  Knopf am Fuß der Karte, der ein anderes Zeitfenster festlegt als das, das
  darüber ausgewertet wurde, verliert genau die Leute, für die die Runde lief.
- **Abweichler werden NICHT markiert — sie sehen anders aus.** In
  `TimePlanDayAnswers` bekommt jede Person eine Zeile mit Namen und Balken auf
  der Breite des Vorschlags. Wer „Passt" gesagt hat, hat einen identischen
  Balken über die volle Breite; wer eingeschränkt hat, ist damit die einzige
  Zeile mit anderer FORM — und die einzige mit einer Uhrzeit rechts. **Uhrzeiten
  stehen nur dort, wo sie abweichen**: das Host-Fenster auf jeder vollen Zeile zu
  wiederholen sagt dieselbe Sache fünfmal. Eine Markierung wäre ein zweites
  Signal für das, was das Bild schon zeigt, und läse sich als Anprangern.
  Die beste gemeinsame Strecke liegt als EIN senkrechtes Band über allen Zeilen,
  in Tinte bzw. Papier (`peakOutline`), nie in Amber — Amber ist schon
  Bedienelement und Daten.
- **Die Balken fahren gestaffelt aus** (35 ms pro Zeile, 260 ms, Ease-out), und
  zwar über die BREITE, nicht über `scaleX`: `transformOrigin` ist hier nicht
  verlässlich, und eine mittige Skalierung ließe den Balken aus seiner eigenen
  Position wachsen — die Position IST die Information. Reduced Motion setzt
  direkt auf voll.
- **Farben: vier, je eine Aufgabe** (`planningTheme.ts`). Violett = Identität („das ist
  eine Planungsrunde", dasselbe Violett wie `GROUP_CHAT_ACCENT`). **Amber = das
  BEDIENELEMENT** — die Schiene des Hosts und dein eigener Balken darin, in der
  Übersicht auch deine eigene Zeile. **Grün = die DATEN** — was die anderen
  geantwortet haben, als Aggregat und als Einzelzeilen. Ein früherer Entwurf machte
  auch den eigenen Balken grün („eine Bedeutung pro Farbe"); das legte die Sache, die
  man EINSTELLT, in dieselbe Farbe wie die, gegen die man sie liest, getrennt nur
  durch einen Umriss — und zwang die Zeile „Du" beim Auffächern auf Fast-Schwarz, nur
  um überhaupt unterscheidbar zu sein. Amber passt außerdem zum Composer, wo derselbe
  Picker amber ist. „Alle können" wird über die **Form** markiert (kräftiger Rahmen +
  Wort), nie über eine zweite Farbstufe. **Ton-Rot (`DECLINED_COLOR`) = die eigene
  Absage**, und zwar ausschließlich im Antwortschalter: dort muss „nein" von „ja" auf
  einen Blick zu trennen sein. FREMDE Nichtverfügbarkeit bleibt `UNAVAILABLE_COLOR`
  — eine Spalte roter Zeilen mit Namen wäre ein Pranger.
- **Lesen ist chronologisch, Entscheiden ist sortiert.** Die Übersicht bleibt in
  Tagesreihenfolge — den besten Tag nach oben zu schieben, bevor jemand geantwortet
  hat, drückt ihn in eine Richtung. Gerankt wird nur dort, wo das Ranking die Frage
  IST: am „festlegen"-Knopf des Hosts.
- **Antippen öffnet einen Tag an Ort und Stelle** (nur einer offen, wie beim
  Kalender-Akkordeon). Die Zeile mit `N von M` bleibt darüber stehen, weil die
  Zahl buchstäblich diese Antworten zusammengefasst IST.
- **Antworten sind DREI Zustände pro Tag, und der Picker ist der dritte** (September
  2026; ersetzt „nur Ablehnung ist explizit", wo jede Zeile ein Zeit-Picker war). Eine
  Zeile ist ein segmentierter Schalter **Passt · Teilweise · Passt nicht**, Reihenfolge
  als Skala gelesen: ja, ja-aber, nein. Der Picker klappt AUSSCHLIESSLICH unter
  „Teilweise" auf. Begründung: Die alte Zeile war bereits eine Umfrage in Verkleidung —
  jeder Vorschlag startete aktiv und mit dem ganzen Host-Zeitraum, die normale Antwort
  war also „bei den Tagen, an denen ich nicht kann, auf X tippen" — sie stellte dafür
  aber jedem eine ziehbare Spanne vor die Nase, die er lesen und deuten musste. Der
  Normalfall kostet jetzt einen Tap.
  - **Freie Intervalle bleiben, sie sind nur nicht mehr die DEFAULT-Form der Frage.**
    „Samstag kann ich, aber erst ab 19" ist die häufigste echte Antwort auf einen
    Tagesvorschlag; ein reines Ja/Nein zwingt diese Person zu NEIN an einem Tag, an dem
    sie kann — schlechter als keine Antwort, weil es den Host aktiv vom passenden Slot
    wegschiebt. Der Ausweg wäre, dass der Host den Tag vorher in Slots schneidet: mehr
    Arbeit für ihn und genau das Checkbox-Raster, das Doodle unbenutzbar macht.
  - **Die drei Zustände werden ABGELEITET, nie gespeichert** (`responseDraft.ts`): leeres
    Array = `none`, Intervall deckt das Host-Fenster = `full`, alles Engere = `partial`.
    Das Wire-Format bleibt unverändert — der Server kennt weiterhin nur Intervalle und
    nichts von diesem Bedienelement —, und Antworten aus der Zwei-Zustands-UI öffnen
    ohne Migration im richtigen Zustand.
  - **`full` sendet das Host-Fenster, nie den letzten Picker-Stand.** Wer „Passt" sagt,
    meint den ganzen Tag; eine übriggebliebene enge Spanne aus einem früheren
    „Teilweise" würde ihm still widersprechen.
  - **Farbe im Schalter: Amber für beide Ja-Antworten, Ton-Rot für die Absage**
    (September 2026; ersetzt „der ausgewählte Schalter ist grün" UND „‚Passt nicht'
    bekommt KEINEN Akzent und dimmt die Zeile"). Das ist die Farbregel dieses
    Features, angewandt: **Amber ist das Bedienelement**, und der Schalter IST eines
    — er trägt also dasselbe Amber wie der Picker, den er aufklappt. Grün bleibt, was
    der Rest des Features damit meint: die DATEN, was andere geantwortet haben. Ein
    grüner Schalter hatte ausgerechnet die eine Fläche, die man bedient, in der Farbe
    der Antworten, die man liest. **„Passt" und „Teilweise" teilen sich damit eine
    Farbe, und das ist richtig** — beides ist ja, und WELCHE Stunden ist die Frage des
    Pickers, nicht der Pille; Position, Beschriftung und der aufklappende Picker
    trennen sie ohnehin lauter, als ein Farbton es könnte. Die Absage war in der
    Border-Farbe gemalt — derselbe Wert, den der Track ohnehin als Haarlinie trägt,
    gemessen 1,24:1 hell und 1,40:1 dunkel: von drei Antworten sah genau eine gar
    nicht ausgewählt aus. Sie ist weiterhin NICHT das Destruktiv-Rot der App (das
    gehört Absagen, Blockieren, Gruppe verlassen; ΔE00 9,7 bzw. 18,4 Abstand) — nicht
    zu können ist kein Fehler. Aber Farbe ist auch, womit man seine eigenen fünf
    Zeilen vor dem Senden überfliegt, und Grau trug das über einen Scroll nicht.
    Bedeutung hängt nie allein an der Farbe: Position und Beschriftung tragen sie mit.
  - **Über dem Schalter steht GENAU EINE Zeitangabe, direkt neben dem Tag.** Tag und
    Uhrzeit sind ein Hauptwort („Samstag · 20:00–02:00"); eine einzige Wortgruppe auf
    die beiden Enden einer Zeile zu verteilen — mit einer Lücke, die je nach Wochentag
    anders breit ist — ist genau das, was unfertig aussieht. Sie nennt die Stunden,
    nach denen der Host fragt, und „Teilweise" ERSETZT sie durch die selbst gewählten:
    dort SIND die Zeiten die Antwort, eine zweite Kopie des Host-Fensters daneben wäre
    nur die wiederholte Frage. Amber sagt, welche der beiden man liest, und bindet die
    Zeile an den Picker darunter. Der Picker kann die gewählte Spanne nicht allein
    tragen: sein Balken-Label ist eine DAUER und blendet sich aus, sobald der Balken
    schmaler als rund acht Zeichen ist — bei der 15-Minuten-Mindestdauer also immer.
    Bei einer Absage stand dort einmal „Du bist raus" — eine dritte Art, das zu sagen,
    was die gefüllte Pille und der ausgegraute Tag schon sagen, und der einzige
    Zustand, in dem die Zeile aufhörte, eine Zeit zu sein.
  - Erst „Zeiten übernehmen & beitreten" sendet den sichtbaren Gesamtstand; bis dahin
    ist die Vorbelegung keine veröffentlichte Aussage. **Aus dem Bearbeiten führt ein
    „Abbrechen" zurück**, das aus dem gespeicherten Stand neu seedet — „Meine Zeiten
    ändern" war sonst eine Einbahnstraße: senden oder das ganze Sheet schließen.
- **Der Picker zeichnet die Verdichtung selbst** (`layers`-Prop auf
  `TimeRangePicker`). Die Achse ist privat und ändert sich beim Ziehen gegen den Rand;
  ein vom Elternteil danebengemalter Streifen hätte eine zweite Zeit-zu-Pixel-Rechnung
  und würde genau während einer Geste verrutschen. Der Aufrufer liefert WAS, der
  Picker entscheidet WO. `core/` bleibt davon unberührt.
- **Die Detailfläche einer Runde ist eine kompakte LISTE, die Übersicht liegt einen Tap
  tiefer.** Zwei Zeilen in EINEM Kasten mit einer Haarlinie dazwischen — „N dabei" und
  „Terminfindung" — statt einer sofort ausgerollten Zeitmatching-Karte. Zwei getrennte
  Mini-Karten wären zwei Widgets, die zufällig übereinanderliegen; es sind zwei Aussagen
  über dieselbe Sache. Geometrie, Typografie und Chevron sind vom Teilnehmer-Row in
  `ActivityContent` übernommen, damit die Flächen als eine Familie lesbar bleiben. Die
  Terminfindungszeile bekommt **bewusst keinen zweiten Avatar-Stapel**: zwei gestapelte
  Zeilen, die beide mit Gesichtern anfangen, sind auf einen Blick nicht zu trennen — der
  linke Rand ist die billigste Stelle, sie zu unterscheiden, also steht dort das ambere
  Kalender-Icon. Aufklappen läuft über `planningView` im Sheet (`summary` | `full` |
  `members`) mit demselben Zurück-Kopf wie die Teilnehmerliste; ein offener Drill-in wird
  zurückgesetzt, sobald eine andere Runde angetippt wird.
- **Die Statuszeile führt mit der ANTWORT, und ihr Nenner sind die Antworten**
  (September 2026; ersetzt „Die Statuszeile zählt PERSONEN, die Zeitleiste zählt
  VERFÜGBARKEIT — nie vermischen"). Sie liest jetzt
  „Favorit: Mi 26. Aug, 19:00–21:00 · 4 von 5 können": erst die Zeit, dann wie
  viele der Antworten sie decken. **„N von M Antworten" ist ersatzlos weg** — M
  war `audienceCount`, also alle Adressierten. Bei „Alle Freunde" und vierzig
  Freunden steht dort für immer „5 von 40": keine Aufgabenliste, sondern die
  Größe der Kontaktliste, und jede Runde sieht nach Misserfolg aus. Der alte
  Grund für die Trennung bleibt trotzdem gültig — eine Runde darf nicht
  beantwortet AUSSEHEN, weil die wenigen Antwortenden sich zufällig einig sind —,
  und wird jetzt anders getragen: die Zahl der Antworten steht ohne Nenner
  daneben („5 Antworten") und ist dieselbe, gegen die „4 von 5" zählt.
  Die Wortwahl lebt allein in `describePlanStatus` (`utils/planSummary.ts`) und
  sagt **nie** eine Zeit als festgelegt an: davor steht immer „Favorit", und eine
  festgelegte Runde zeigt die Zeile gar nicht mehr. Mehrere gleichwertige
  Fenster werden zu „Mehrere Favoriten · je N von M können" — zwei lange
  Zeiträume passen nicht in die Zeile, und einen davon zu wählen erfände eine
  Entscheidung, die der Host nicht getroffen hat.
- **Für Eingeladene fehlt der Favorit, und das ist die Regel, nicht ein Bug.**
  `timePlanMembers` ist ihnen verschlossen, also gibt es keine fremde Verdichtung zu
  zeigen; die Zeile nennt dann nur die Zahl der Antworten (`canSeeFavourite: false`),
  die aus dem Plan-Dokument selbst kommt. Die Teilnehmerliste sagt es aus demselben Grund offen:
  „Wer schon dabei ist, siehst du, sobald du selbst geantwortet hast."
- **Eine Terminfindung IST eine `soon`-Aktivität, nur ohne feste Uhrzeit**
  (Produktentscheidung September 2026; ersetzt „ringloser Marker"). Sie bekommt den
  ganz normalen Soon-Marker in Amber — `timePlanToMapMarker` setzt `mode: 'soon'`
  und `planning: true` — und wird durch einen **gestrichelten Ring**
  gekennzeichnet, nicht durch einen fehlenden. Der Ring ist in dieser App die Uhr,
  und bei einer Runde ist genau die Uhr das Unentschiedene: dieselbe Farbe, derselbe
  Pfad, dieselbe Stelle, eine Eigenschaft anders. Legt der Host einen Slot fest,
  schließt sich der Ring und beginnt zu leeren. Ein fehlender Ring war zwar logisch
  („keine feste Zeit"), las sich aber als *da fehlt was* statt als *die Zeit wird
  gerade gesucht*, und gab der Runde keine sichtbare Verwandtschaft mit der Aktivität,
  die sie gleich wird. Kein Wort auf dem Marker und kein fünfter Anbau: oben links
  sitzt die Kategorie, oben rechts das Ungelesen-Abzeichen, unten der Titel.
  `activityMarkerPlanningDash` LEITET das Muster aus dem echten Umfang ab (ganze Zahl
  von Perioden, sonst sitzt an einer Zoomstufe ein Rest-Strich an der Naht) und zieht
  eine volle Strichstärke ab, weil runde Enden je eine halbe dazugeben — bei 3 px
  Strich und ~7,5 px Periode wäre die Lücke sonst zu und der Ring sähe geschlossen
  aus. Gemessen über alle Schalenbreiten: 18–38 Striche, sichtbar ~4,1 px mit ~3,3 px
  Lücke. `test-marker-geometry.mjs` prüft das.
- **Kein eigenes Sheet — alles im `MarkerDetailSheet`.** Antippen öffnet dieselbe Detailfläche wie jede
  Aktivität (Titel, Host, Ort), nur steht an der Stelle der Uhrzeit die Übersicht
  bzw. die Antwortzeilen (`PlanningContent` neben `ActivityContent`). Ein zweites
  Detail-Sheet ist genau das, was diese Fläche verhindern soll. Sichtbar wird die
  Runde über die private Projektion `timePlanAudience/{planId}_{uid}`. Sie enthält
  sichere Planfelder und Zähler, aber keine Liste der Eingeladenen oder Mitglieder;
  dadurch bleibt die eine begrenzte Inbox-Query erhalten, ohne Identitäten zu leaken.
- **Die Antwortfläche ist EINE Liste mit Haarlinien, kein Kartenstapel**
  (September 2026; ersetzt „eine ZEILE pro Tag" aus der Zeit, als jede Zeile ein
  Picker war). Vier Vorschläge waren vier Kästen mit eigenem Rand, 12 dp Polster
  ringsum und 12 dp Abstand dazwischen: 98 dp pro Tag, davon 26 Rahmen und
  Polster plus 12 Lücke. Es sind vier Antworten auf dieselbe Frage, also ein
  Kasten mit Haarlinien — dasselbe Muster wie `TimePlanRows`. Gemessen: 428 → 365
  dp bei vier Tagen. **Die Haarlinie gehört der ZEILE (`separated`), nicht der
  Liste:** die Zeile animiert ihre eigene Höhe, wenn der Picker aufklappt, und
  ein danebengesetzter Trenner spränge an seinen neuen Platz, während die Zeile
  dorthin gleitet.
- **Tag und Schalter bleiben ÜBEREINANDER, und das ist gemessen.** Bei
  `TYPE.caption` braucht „Passt nicht" rund 73 dp Glyphen, der Dreier-Schalter
  also mindestens ~273 dp; auf einem 390-dp-Gerät bleiben in der Liste ~318 dp,
  also 45 dp für ein „Sa · 20:00–02:00", das etwa 100 braucht. Nebeneinander
  bricht entweder der Tag oder der Schalter.
- **Über der Liste steht keine Anleitung.** „Sag pro Tag kurz Bescheid …" ist
  entfernt: Drei Segmente, die Passt · Teilweise · Passt nicht heißen, erklären
  sich selbst, und das Einzige, was der Satz hinzufügte — dass „Teilweise" den
  Picker öffnet —, erfährt man durch genau den Tap, der es tut. **Die
  Stundenskala im Picker bleibt** — sie sagt als Einziges, wohin man einen Griff
  zieht, und kostet nichts, weil der Picker sie in seinem eigenen Kasten
  zeichnet. **Aktionen nicht in den Balken legen:** bei der
  15-Minuten-Mindestdauer ist der ~16 dp breit, und an seinen Enden sitzen die
  Griffe.
- **Planungsflächen nehmen die App-Farben** (`usePlanningColors`). Sie waren zuerst
  für ein dunkles Sheet gezeichnet und hart auf Weiß gesetzt — im hellen
  Detail-Sheet war davon nichts mehr zu sehen.
- **Tests:** `npm run test:time-planning` (Aggregation, bester Slot, geteilte Achse,
  die drei Antwortzustände und die Formulierung der Statuszeile),
  `npm run test:time-plan-functions` (Callables im Emulator: kein Mitglied ohne
  Antwort, Lock-Regeln, Idempotenz), `npm run test:marker-countdown` (Ringe).

