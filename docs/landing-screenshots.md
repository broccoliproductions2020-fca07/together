# App-Renderings für die Landingpage

Wie die Screenshots entstehen, die auf der Landingpage in den Handy-Rahmen
stecken — und wie man sie **jederzeit neu** erzeugt, ohne sich an irgendetwas
erinnern zu müssen.

Alles hier läuft ausschließlich gegen die **lokale Firebase Emulator Suite**.
Staging und Produktion werden nie berührt, es wird nie deployt.

---

## Der Ablauf in vier Zeilen

```bash
npm run emulators            # Terminal 1, muss laufen bleiben
npm run screens:world        # Welt bauen
npm run screens:device       # Gerät vorbereiten, dann App NEU STARTEN
npm run screens:verify       # Welt prüfen  (Text, kein Bild)
npm run screens:capture mica-open-status
```

Danach in `landing/`:

```bash
npm run screenshots:build    # PNG-Master → AVIF + WebP in drei Breiten
```

---

## Warum das so gebaut ist

Der teure Teil an einem App-Screenshot ist nicht das Auslösen, sondern die
Schleife davor: tippen, Bild machen, **Bild ansehen**, merken dass das Sheet nur
halb offen war, korrigieren, von vorn. Jedes angesehene Bild kostet, und dreißig
Fehlversuche kosten dreißigmal.

Drei Dinge nehmen die Schleife auseinander:

1. **Die Welt ist geprüft, bevor das Gerät angefasst wird.**
   `npm run screens:verify` liest den Datenstand und sagt in Textform, was auf
   dem Bild zu sehen sein wird: wie viele Freunde offen sind, wie weit sie
   entfernt sind, ob jemand ohne Portrait in einer Liste landet, ob eine Person
   gleichzeitig „offen" ist und in einer laufenden Aktivität steckt. Das sind
   genau die Fehler, die man sonst erst im fertigen Bild sieht.

2. **Getippt wird nach Beschriftung, nicht nach Koordinate.**
   `capture-screens` liest den Viewbaum (`uiautomator dump`) und findet
   „Offen stellen" oder „Brunch am Sonntag" über `accessibilityLabel`. Ein
   Rezept überlebt damit ein Layout, das sich verschiebt.

3. **Ein Rezept prüft, bevor es auslöst.**
   Der letzte Schritt jedes Rezepts ist ein `expect`. Fehlt die erwartete
   Beschriftung, bricht der Lauf ab und **druckt, was stattdessen sichtbar
   war** — dieselbe Information, für die man sonst das Bild angesehen hätte.
   Es wird kein falsches Bild gespeichert.

---

## Die Welt

Der Datenstand kommt aus **einem** Seed-Schreiber mit **zwei** Datensätzen
(`scripts/lib/seed-scenarios.mjs`):

| Szenario  | Wofür                                                                 |
| --------- | --------------------------------------------------------------------- |
| `dev`     | der alltägliche Entwickler-Seed, 16 Personen, volle Postfach-Fixtures |
| `landing` | die Aufnahme-Welt: zwölf Personen, alle mit Portrait, kein Rauschen   |

Vier Regeln bestimmen die Aufnahme-Welt:

- **Jede Person hat ein Portrait — ausnahmslos.** Es liegen zwölf
  bereitgestellte Bilder in `assets/demo-avatars/`, und der Roster ist genau
  diese zwölf. Kein Initialen-Kreis darf irgendwo auftauchen, auch nicht im
  Publikums-Tab des Composers, wo früher stille Zusatzpersonen ohne Bild
  standen. `screens:verify` prüft das namentlich.
- **Kein Zustand widerspricht einem anderen.** Wer in einer laufenden
  `now`-Aktivität steckt, ist nicht „offen". Fünf Personen tun gerade etwas,
  sechs sind offen, eine ist der Aufnahme-Account.
- **Kein Rauschen.** Keine Freundschaftsanfrage, keine Gruppeneinladung, keine
  spontane Runde, keine fremde Privataktivität auf der Karte. Ein Werbebild darf
  keine Aufgabenliste zeigen.
- **Jeder Lauf setzt hart zurück.** Firestore leer, RTDB leer, jedes fremde
  Auth-Konto gelöscht — siehe unten.

### Der Aufnahme-Account

**Mia Sommer — `mia@seed.together.dev` / `seed-only`**

Der Account, aus dessen Sicht aufgenommen wird, **ist** eine der sechs
Portrait-Personen. Grund: Es gibt kein siebtes Portrait. Ein eigener Account
ohne Bild stünde in der Top-Bar, in jeder Teilnehmerzeile und in der
Heimweg-Konsole als Initialen-Kreis — direkt neben lauter echten Gesichtern.

Mia ist damit Brunch-Gastgeberin, Teilnehmerin des Laufs und Besitzerin des
Heimwegs. Die anderen elf:

| Person        | Rolle in der Aufnahme-Welt                           |
| ------------- | ---------------------------------------------------- |
| Amelie Wagner | offen, ~200 m · Brunch · Heimweg-Begleitung          |
| Lisa Becker   | offen, ~670 m · Lauf · Anreise                       |
| Sofia Neumann | offen, ~760 m · Gastgeberin der Solo-Aktivität       |
| David Klein   | offen, ~1,25 km · Lauf-Gastgeber · Anreise · Heimweg |
| Noah Fischer  | offen **ohne Standort** (zeigt die zweite Stufe)     |
| Hannes Macha  | „Split the G" im Pub, läuft gerade                   |
| Sebbo Regs    | „Split the G" im Pub, läuft gerade                   |
| Nora Weiß     | Bouldern, läuft gerade                               |
| Jonas Pohl    | Bouldern, läuft gerade                               |
| Hannah Vogel  | Bouldern, läuft gerade                               |
| Tom Richter   | Bouldern, läuft gerade                               |

Hannes und Sebbo benutzen die Portraits pb4 und pb6, die im Dev-Seed Max und
Elias gehören — die beiden Welten laufen nie gleichzeitig, also zeigt keine
von beiden ein Gesicht doppelt.

Die Zuordnung Bild zu Name folgt der Lieferreihenfolge (`pb1`…`pb12`) und dem
`w`/`m` im Dateinamen, sonst nichts — kein Name wird nach dem Aussehen einer
Person vergeben.

### Die Aktivitäten

| Aktivität               | Modus  | Dabei | Ort                      | Marker                           |
| ----------------------- | ------ | ----- | ------------------------ | -------------------------------- |
| Kino: Spätvorstellung   | `soon` | 1     | Thalia Augsburg          | Solo-Marker mit Namensschild     |
| Bouldern in der Halle   | `now`  | 4     | Boulderhalle Lechviertel | 2x2-Avatar-Quad                  |
| Split the G             | `now`  | 2     | **Flannigan's Post**     | Paar-Marker, der Anker der Szene |
| Feierabendlauf am Kanal | `soon` | 3     | Vorderer Lech            | Gruppenmarker, Ziel der Anreise  |
| Brunch am Sonntag       | `soon` | 2     | Café Perlach             | Gruppenmarker, trägt den Chat    |

Eine Karte zeigt so alle drei Marker-Bauformen, beide Modus-Farben, beide
Ring-Arten und vier verschiedene Kategorie-Münzen.

**„Split the G" ist der Anker.** Der Pub ist echt und gibt der Szene ihren
Mittelpunkt; alles andere liegt drumherum. Genau zwei Teilnehmende, Hannes und
Sebbo, ausdrücklich keine weiteren.

**Flannigan's Post, Fuggerstraße 5–7, 86150 Augsburg** — die Koordinate in
`LANDING_CENTRE` ist über OpenStreetMap geokodiert (48.36732, 10.89353). Eine
frühere Fassung stand dort mit einer geschätzten Koordinate „mitten in der
Altstadt" und lag rund 250 m daneben; der Kommentar behauptete trotzdem
Genauigkeit. Der Pub ist die EINZIGE echte Örtlichkeit in dieser Welt — Thalia,
Café Perlach, Boulderhalle Lechviertel, Vorderer Lech und Lechwiese sind
erfundene Namen und dürfen es sein. Weil jede andere Position ein Meter-Offset
auf `LANDING_CENTRE` ist, verschiebt eine Korrektur dort die ganze Szene
geschlossen mit.

**Die Solo-Aktivität ist `soon`, nicht `now`.** Sofia soll in der Offen-Liste
stehen, und die Regel „wer gerade etwas tut, ist nicht offen" gilt nur für
laufende Aktivitäten. Der Solo-Marker sieht gleich aus, nur der Ring ist amber
statt grün.

### Warum die Marker so weit auseinanderliegen

`markerCollision` fasst überlappende Marker zu EINEM Stapel-Pin zusammen. Im
Produkt ist das richtig, im Werbebild falsch: Zu sehen sein sollen die
einzelnen Karten.

**Die Karte rendert gekippt, und daran ist die erste Fassung gescheitert.** Sie
rechnete den Maßstab aus `PLACE_FOCUS_*_DELTA` und der Schirmgröße aus, unter
der Annahme quadratischer Pixel, kam auf 144 x 75 m pro Marker und gab jedem ein
100-m-Band. `screens:verify` meldete 25 m Luft — am Gerät verschmolzen Bouldern
und Split the G trotzdem zu einem „2 Activities"-Pin.

Nachgemessen aus einem Screenshot (blauer Punkt gegen den Lauf-Marker,
50 m nördlich / 70 m östlich = 84 px / 210 px):

```
waagerecht   0,333 m/px
senkrecht    0,595 m/px      Nord-Süd ist um Faktor 1,79 gestaucht
```

Ein Marker ist 420 x 218 px und braucht damit **140 m in der Breite, 130 m in
der Höhe**. Die Höhe war im gerechneten Modell um 55 m zu klein.

Sechs Marker in sechs Bänder zu legen löste die Kollision, machte den Stapel
aber 825 m hoch: Oben stieß „Kino" an die Suchleiste, unten fiel „Grillen"
aus dem Bild. Die Bauform ist deshalb **zwei Marker pro Band, nebeneinander** —
der Abstand kommt dann aus der Breite (195 m statt der nötigen 140), und die
Szene ist nur noch 600 m hoch. Der Pub bekommt sein Band allein: Er liegt, wo er
liegt, und ein Partner müsste 140 m östlich stehen, also außerhalb der
sichtbaren ±180 m.

`screens:verify` rechnet das bei jedem Lauf mit den echten Marker-Konstanten aus
dem App-Code und den gemessenen Maßstäben nach und nennt den engsten Abstand
(aktuell 55 m Luft). **Wer Kamera, Kippung oder Schirmgröße ändert, muss die
zwei Zahlen in `verify-landing-world.mjs` neu messen** — eine gerechnete Zahl
war bequemer und nachweislich falsch.

### Die Terminfindung

Dazu kommt eine **Planungsrunde** — im Produkt keine Activity, sondern eine
eigene Entität: kein Chat, keine Anreise, kein festes Datum, bis der Host einen
Slot festzurrt. Sie liegt als ringloser Marker auf der Karte und öffnet
dieselbe Detailfläche wie eine Aktivität, nur steht dort statt einer Uhrzeit
die Verfügbarkeitsmatrix.

**„Grillen am Wasser" · Lechwiese · Host Mia · 7 von 9 Antworten**

Drei Vorschläge, immer der nächste Freitag, Samstag und Sonntag — echte
Wochentage statt „in zwei Tagen", damit die Runde an jedem Tag, an dem der Seed
läuft, gleich sinnvoll aussieht.

Die Antworten sind so gewählt, dass die Verdichtung im Samstag-Fenster eine
saubere Glocke ergibt, ohne dass eine einzelne Zeile unglaubwürdig wird:

```
Sa 17:00–23:00   2 3 4 5 6 7 6 5 4 3      Spitze 7/7 um 19:30–21:00
Fr 18:00–23:00   3 4 5 4 3                Spitze 5/7 um 20:00–21:00
So 11:00–16:00   2 4 5 4 3                Spitze 5/7 um 13:00–14:00
```

Jede Zeile hat eine Begründung, keine Zahl ist gewürfelt: Mia beantwortet als
Gastgeberin das ganze Fenster (genau das schreibt `createTimePlan`), Amelie muss
um zehn weg, Noah kommt halb sechs und fährt halb zehn, Lisa kommt nach der
Schicht, Sofia erst um sieben, Elias hat nur die anderthalb Stunden dazwischen.
(Die Runde ist älter als die Umbenennung und benutzt weiterhin `seed-elias` als
Antwortenden — in der Aufnahme-Welt trägt dieselbe uid den Namen Sebbo Regs.)
Zwei Personen können freitags gar nicht, zwei sonntags — `[]` ist eine echte
Antwort („kann nicht"), nicht eine fehlende.

Samstag gewinnt mit 7 gegen 5 und 5. Das ist Absicht: Bei einem Gleichstand
würde die Statuszeile „Mehrere Favoriten" sagen, und der Screenshot hätte keine
Empfehlung zu zeigen.

`screens:verify` rechnet diese Kurven mit der **echten** App-Mathematik nach
(`aggregateWindow`, `bestSlot` aus `src/features/time-planning/utils/`), nicht
mit einer zweiten Implementierung, und prüft zusätzlich, dass jede Zeile genau
eine Spitze hat — zwei gleich hohe Gipfel mit einem Tal dazwischen sähen aus
wie zwei Vorschläge in einer Zeile.

### Varianten

Manche Screenshots brauchen einen anderen Weltzustand. Jede Variante ist ein
kompletter, idempotenter Neuaufbau — einfach die passende Zeile laufen lassen:

| Befehl                          | Unterschied                                                   |
| ------------------------------- | ------------------------------------------------------------- |
| `npm run screens:world`         | Basis, **eigener Offen-Status an** (Pille: „Offen bis 22:00") |
| `npm run screens:world:map`     | Basis, eigener Status aus (Pille: Freundeszahl)               |
| `npm run screens:world:anreise` | Lauf auf T−40 Min gezogen, zwei Teilnehmende unterwegs        |
| `npm run screens:world:heimweg` | eigene Heimweg-Session, blau, zwei bestätigte Begleiter:innen |

### Der harte Reset

Jeder Lauf der Aufnahme-Welt **setzt zuerst alles zurück**: Firestore komplett
leer, RTDB komplett leer, jedes Auth-Konto außer den zwölf Roster-Personen
gelöscht. Erst dann wird geschrieben.

Das ist der Unterschied zum Entwickler-Seed, der nur chirurgisch `seed-*`
aufräumt. Für ein Rendering reicht das nicht: Ein Konto aus einem früheren Lauf,
eine von der App selbst geschriebene Benachrichtigung, eine per Hand angelegte
Aktivität — nichts davon trägt ein `seed-`-Präfix, und alles davon steht danach
im Bild. Zwei Läufe ergeben nur dann denselben Stand, wenn vorher wirklich
nichts übrig ist.

Der Preis: Ein eigenes Testkonto im Emulator wird mitgelöscht. Das gilt
ausschließlich für das Landing-Szenario; `npm run emulators:seed` fasst es nicht
an. `--no-purge` schaltet den Reset ab.

Zwei Dinge überleben bewusst:

- **die Auth-Konten der zwölf** — an ihnen hängt die `photoURL`, die die
  Function beim Portrait-Upload gesetzt hat;
- **der Storage-Bucket** — die Bilddateien sind Eingabe, nicht Zustand.

Ohne beides müsste jeder Reset zwölf Portraits neu hochladen, und der Server
erlaubt nur fünf Bildwechsel pro Person und Tag: Ab dem fünften Lauf eines Tages
wäre die Welt kaputt.

---

## Das Gerät

```bash
npm run emulator          # AVD starten (Together_Pixel_7)
npm run android:launch    # Dev-Client installieren/öffnen + Metro
```

Dann in der App als **mia@seed.together.dev / seed-only** anmelden.

Zwei Dinge liegen im Gerätespeicher, nicht in der Datenbank, und überleben jeden
Seed — beim ersten Start einmal wegtippen:

- die einmalige Willkommensfläche (`together:welcomeSeen:v2`)
- die einmalige Heimweg-Übersicht (`together.safety.introSeen.v1`)

### Das Gerät vorbereiten (`npm run screens:device`)

Drei Dinge hängen am Gerät und an keinem Seed. Alle drei überleben keinen
Kaltstart des Emulators, gehören also in den Ablauf und nicht in die
Einrichtung.

**1. Zeitzone.** Der Emulator startet auf **GMT**, der Seed schreibt aber
absolute Ortszeiten des Rechners. Ohne Angleichung zeigt die App jede Uhrzeit
verschoben — gemessen: „Kino 20:00" erschien als 18:00, der Brunch als 08:30,
und der Core nannte „Morgen 16:30" statt 18:30. `persist.sys.timezone` geht auf
einem Play-Image nicht (`adb root` wird abgelehnt); der Weg ist
`cmd time_zone_detector`, und die Auto-Erkennung muss zuerst aus, sonst
überschreibt sie den Wert wieder.

**2. Dev-Menü-Knopf.** Das schwebende Zahnrad oben rechts gehört zu
`expo-dev-client`, nicht zur App — im Screenshot wäre es trotzdem drin. Es ist
der „Tools button" aus dem Dev-Menü, Flag `showFab` in dessen SharedPreferences.
Die App muss beim Setzen **gestoppt** sein, sonst schreibt sie ihre Preferences
beim Beenden zurück. `--restore` schaltet ihn wieder ein. Beim Schreiben muss
der ganze `run-as`-Befehl EIN String sein, sonst wertet die Geräte-Shell die
Umleitung selbst aus — als shell-uid, die dort nicht schreiben darf.

**3. Standort.**

**`adb emu geo fix` funktioniert auf diesem Image nicht — und verschweigt es.**
Die Konsole antwortet jedes Mal `OK`, während `dumpsys location` die
gespeicherte Position unverändert zeigt; 170 Fixe im Sekundentakt haben sie um
keinen Meter bewegt. Der Grund steht im selben Dump: `gps provider:
mStarted=false`. Die GNSS-Engine läuft nur, solange eine App aktiv hochgenaue
Ortung anfordert, und außerhalb dieses Fensters verwirft der Emulator jeden
eingespeisten Fix. Dass die Konsole selbst in Ordnung ist, zeigt
`adb emu power capacity 76` — das wirkt sofort.

Stattdessen ein Test-Provider über `gps` UND
`fused` (beide, weil `expo-location` mit Play Services den Fused Provider
benutzt, der sonst weiter seine alte Position liefert) und liest danach nach, ob
die Position wirklich angekommen ist. Der Mock überlebt keinen Kaltstart des
Emulators, gehört also in den Ablauf, nicht in die Einrichtung.

**Zwei Dinge, die sonst Zeit kosten:**

- Die Karte zentriert auf den **Gerätestandort**, nicht auf die Präsenz in
  Firestore — und nur beim ERSTEN Fix. Standort geändert heisst App neu
  starten. Deshalb setzt das Skript nicht den Pub, sondern den Punkt, an dem
  der Aufnahme-Account steht (`LANDING_VIEWER_OFFSET`).
- **Nach jedem `screens:world` muss die App neu starten.** Sonst zeichnet sie
  aus ihrem Firestore-Cache weiter: Die Marker der alten Welt bleiben stehen
  und verschmelzen dabei zu einem Stapel-Pin, der wie ein Layoutfehler aussieht
  und keiner ist.

### Aufnehmen

```bash
npm run screens:list                          # welche Rezepte es gibt
npm run screens:capture mica-open-status      # eines fahren und auslösen
node scripts/capture-screens.mjs --all        # alle nacheinander
```

Vor jeder Aufnahme schaltet das Skript den **SystemUI-Demomodus** ein: volle
Akku- und WLAN-Anzeige, keine Benachrichtigungssymbole, kein Mobilfunk. Die Uhr
wird auf die **echte** Uhrzeit gesetzt, nicht auf eine schöne — daneben stehen
Zeiten aus den Seed-Daten („Offen bis 22:00"), und eine erfundene
Statusleisten-Uhr würde ihnen widersprechen. Nach dem Lauf wird der Demomodus
wieder verlassen (`--keep-demo` behält ihn).

Gespeichert wird als `landing/screenshots-master/<name>.png`, geprüft auf
1080×2400 und darauf, dass das Bild nicht praktisch schwarz ist.

### Ein Rezept kalibrieren

Manche Beschriftungen hängen vom Zustand ab — der Core heißt „Offen stellen",
„Du bist offen bis 22:00. Status bearbeiten" oder trägt den Titel der nächsten
eigenen Aktivität. Wenn ein Schritt danebengreift:

```bash
node scripts/capture-screens.mjs --walk mica-open-status
```

fährt das Rezept Schritt für Schritt und druckt nach jedem, **was sichtbar
ist** — ohne ein einziges Bild zu speichern. Danach die Beschriftung in
`scripts/lib/screen-recipes.mjs` anpassen.

`npm run screens:ui` druckt dasselbe für den Bildschirm, der gerade offen ist.

Kartenmarker sind gerenderte Bilder; ihre `accessibilityLabel` legt Google Maps
als virtuelle View offen. Falls `uiautomator` sie auf einem bestimmten Gerät
nicht sieht, im Rezept auf `{ tapAt: [x, y] }` wechseln — die Koordinate einmal
über `--ui` beziehungsweise ein Rohbild bestimmen und im Rezept festhalten.

### Ohne Gerät prüfbar

```bash
npm run test:screen-recipes
```

Prüft, dass jedes Rezept eine existierende Welt nennt, mit einem `expect`
endet, die App selbst startet — und dass der Viewbaum-Parser Umlaute findet
(`uiautomator` kodiert „Café" als `Caf&#233;`; ohne Auflösung findet ein Rezept
fast keine deutsche Beschriftung).

---

## Offene Punkte

- **`mica-journey-focus` und `mica-safety-home` haben noch keine Master.** Die
  Welten dafür stehen (`screens:world:anreise`, `screens:world:heimweg`), die
  Rezepte auch; es fehlt der Aufnahmelauf am Gerät. Der Encoder überspringt
  fehlende Master mit einer Warnung, statt abzubrechen.
- **Die drei vorhandenen Master sind älter als die Portraits.** Sie zeigen
  Initialen-Kreise statt der Gesichter und müssen neu aufgenommen werden.
- **Die Abstandsprüfung hängt an zwei gemessenen Zahlen**, nicht an einer
  Formel (siehe oben). Sie gelten für diesen Schirm, diese Kamera und diese
  Kippung. Ein anderes Gerät heisst: neu messen.
- **Kein Rezept wurde bisher am Gerät gefahren.** Beschriftungen stammen aus dem
  Quelltext (`accessibilityLabel`), nicht aus einem Lauf. Der erste Lauf pro
  Rezept ist eine Kalibrierung (`--walk`).
