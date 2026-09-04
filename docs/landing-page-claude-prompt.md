# Prompt für Claude: Mica-Landingpage gezielt fertigstellen

Kopiere den folgenden Prompt unverändert in eine neue Claude-Code-Session mit dem
Arbeitsverzeichnis `D:\Dokumente\myapp`.

---

Du arbeitest im Repository `D:\Dokumente\myapp`. Unter `landing/` existiert bereits eine
vollständige erste Umsetzung der Mica-Landingpage. Führe jetzt einen **gezielten
Refinement- und Fertigstellungsauftrag** aus. Das ist weder ein neuer Planungsauftrag noch ein
Redesign von Grund auf.

Arbeite selbstständig bis zu einem visuell geprüften, buildbaren Ergebnis. Bewahre funktionierende
Brand-, Legal-, SEO-, Accessibility- und Performance-Grundlagen. Ersetze oder erweitere nur die
Bereiche, die dieser Auftrag und der aktualisierte Build-Spec festlegen.

## 1. Verbindliche Quellen und Priorität

Lies vor jeder Änderung vollständig und in dieser Reihenfolge:

1. `AGENTS.md`
2. `.agents/skills/frontend-design/SKILL.md`
3. `.agents/skills/ui-ux-pro-max/SKILL.md`
4. `docs/landing-page-build-spec.md`
5. `docs/safety-mode.md` für die ehrlichen Grenzen von „Sicher nach Hause“
6. die betroffenen bestehenden Landing-Komponenten, Contentdateien, Seed-Skripte und App-Screens

Nutze beide Design-Skills ausdrücklich. Führe die für den gezielten Landingpage-/Motion-Review
passenden Suchen aus, aber lass keine generische Empfehlung die konkrete Mica-Marke oder den
Build-Spec überschreiben. Bei Konflikten gilt:

1. Repository-/Sicherheitsregeln;
2. dieser Prompt und der Build-Spec vom 26. August 2026;
3. projektspezifische Produktquellen;
4. allgemeine Skill-Empfehlungen.

## 2. Erlaubter Änderungsumfang

Du darfst ändern:

- `landing/` vollständig, soweit es für diesen Auftrag erforderlich ist;
- lokale Demoassets für ausschließlich synthetische Profilbilder;
- `scripts/seed-emulators.mjs` und `scripts/seed-heimweg.mjs` fokussiert;
- einen neuen idempotenten lokalen Anreise-/Landing-Seed unter `scripts/`;
- die dafür notwendigen lokalen Root-`package.json`-Skripte;
- fokussierte Tests oder Dokumentation für diese Seeds.

Du darfst **nicht**:

- Staging- oder Produktionsdaten verändern;
- Firebase deployen;
- Functions, Firestore-/Storage-/RTDB-Regeln oder Releasekonfigurationen verändern;
- App-Produktlogik nur für einen Marketing-Screenshot verbiegen;
- EAS-, OTA- oder Hosting-Deploys ausführen;
- echte Personen, echte private Nachrichten oder private Adressen verwenden;
- fremde Stockporträts herunterladen.

Lokale Seeds müssen weiterhin exakt die Produktformen schreiben, die die App tatsächlich liest.
Keine zweite Client-Mockschicht und keine in React eingebauten Marketing-Seedarrays.

## 3. Zielbild

Die Seite bleibt eine professionelle, moderne, dunkle Mica-Landingpage mit eigener Desktop- und
Mobile-Komposition. Hero und Smartphone-Story sind bereits das visuelle Signaturelement. Der
Refinement-Pass soll:

- leere Desktopflächen gezielt mit Bedeutung füllen oder kompakter machen;
- eine zusammenhängende, positive Screenshot-Geschichte schaffen;
- Anreise und Heimweg verständlich mit echten lokalen App-Zuständen zeigen;
- die zu lange Scroll-Choreografie deutlich verkürzen;
- den falschen Downloadzustand durch eine ehrliche Coming-soon-Kommunikation ersetzen;
- ruhig und hochwertig bleiben, ohne generische Card-Flut oder zusätzliche Dekoration.

Produktname: **Mica**  
Domain: `micamapp.de`  
H1 exakt: **„Freie Zeit wird gemeinsame Zeit.“**

Sprache bleibt positiv, konkret und freiwilligkeitsorientiert. Niemals Beobachtungs-, Tracking-
oder FOMO-Sprache wie „Deine Freunde im Blick“. Keine Angriffe auf Messenger.

## 4. Pre-Launch statt Download

Mica ist noch nicht öffentlich verfügbar. Entferne überall die gegenteilige Suggestion.

### Header und Hero

- Header-Anker: **„Bald verfügbar“** führt zum finalen Coming-soon-Bereich.
- Im Hero gibt es kein „Mica laden“.
- Primärer Hero-Anker: **„So funktioniert Mica“**.
- Ergänze eine ruhige, nicht interaktive Statuszeile: **„Bald für iOS und Android“**.
- Die feste H1 und bestehende Subline bleiben erhalten.

### Finaler Bereich

- ID: `coming-soon`
- Eyebrow: **„Bald verfügbar“**
- Headline: **„Mica kommt bald.“**
- Text: **„Mica startet für iOS und Android. Sobald der Termin feststeht, findest du alle
  Informationen hier auf micamapp.de.“**
- Gestalte daraus einen vollbreiten Markenabschluss mit ruhiger Aurora und großem dezentem
  Mica-Logo, App-Icon oder Mica-Figur.
- Plattformzeile: **„Für iOS und Android“**.
- Kein QR-Code.
- Keine deaktivierten oder gestrichelten Storebuttons.
- Keine Warteliste ohne echte technische und rechtliche Grundlage.
- Keine weitere Smartphone-Choreografie.

`/download` bleibt als zukunftsfähige Route bestehen, zeigt ohne Storelinks aber nur einen ehrlichen
Coming-soon-Zustand und einen Rückweg zur Startseite. Erst echte konfigurierte Storelinks dürfen
später echte Storebuttons und optional einen QR-Code aktivieren. Expo Go, Development Client und
EAS sind niemals öffentliche Downloadziele.

Ändere die FAQ-Frage „Wo kann ich Mica laden?“ zu:

> **Wann erscheint Mica?**

> Mica startet für iOS und Android. Sobald der Termin feststeht, findest du alle Informationen hier
> auf micamapp.de.

## 5. Positive, zusammenhängende Kern-Screenshot-Geschichte

Die drei Kern-Smartphones bleiben:

1. `mica-open-status`
2. `mica-activity-composer`
3. `mica-activity-detail`

Sie erzählen künftig dieselbe freundliche Brunch-Geschichte:

### Screen 1 – Zeit teilen

- eigener Status: **„Du bist offen · Brunch · bis 13:30“** oder eine zur Aufnahmezeit logisch
  passende Endzeit;
- mehrere freundliche Demopersonen mit synthetischen Profilbildern;
- positive kurze Vibes wie Kaffee, Spaziergang oder Frühstück;
- keine nachträglich montierten Avatare.

Das korrekte App-Standardverhalten „Egal“ bleibt unverändert. Für den Marketing-Screenshot wird der
optionale Vibe in der echten App bewusst auf „Brunch“ gesetzt. Ändere nicht die Produktlogik oder
den Display-Fallback.

### Screen 2 – Planen

- Activity: **„Brunch am Sonntag“**;
- plausible späte Vormittagszeit, beispielsweise 11:00–13:00;
- erfundener Ort: **„Café Morgenrot“**;
- sinnvoll ausgefüllte Teilnehmenden-/Circle-Auswahl;
- keine offene Tastatur, Debuganzeige oder Benachrichtigung.

### Screen 3 – Zusammenkommen

- Detailansicht derselben Activity „Brunch am Sonntag“;
- gleiche Zeit und gleicher Ort wie im Composer;
- mehrere Teilnehmende mit denselben synthetischen Profilbildern;
- kurze freundliche Nachrichten, beispielsweise:
  - „Freue mich, bin dabei.“
  - „Ich bringe Obst mit.“
  - „Perfekt, ich reserviere uns einen Tisch.“
- Status, Uhrzeit und Tageszeit müssen zur Brunch-Szene passen.

Entferne die Marketinginkonsistenz aus „Egal“, „Spontane Runde Billard“ und
„Kickern im Süß war gestern“. Der lokale allgemeine Seed darf den unverständlichen Titel
„Kickern im Süß war gestern“ nicht behalten. Nutze für diese andere Demoaktivität beispielsweise:

- Titel: **„Kickerabend“**
- Ort: **„Kieztreff am Park“**
- Nachricht: **„Der Tisch ist reserviert – kommt gern dazu.“**

## 6. Synthetische Profilbilder und lokale Seed-Integration

Alle im Marketing sichtbaren Seedpersonen erhalten echte Bildassets von **vollständig
synthetischen, nicht existierenden Erwachsenen**.

Bildrichtung:

- freundlich, fröhlich und natürlich;
- unterschiedliche erwachsene Personen und natürliche Lächeln;
- keine gleichförmigen Werbegrinsen;
- einheitlicher Schulter-/Kopfausschnitt;
- weiches natürliches Licht und ruhiger Hintergrund;
- quadratisch, ungefähr 512×512, optimiertes JPEG;
- keine Prominenten, realen Personen, Logos, Schrift oder erkennbaren Marken.

Wenn deine Session ein echtes Bildgenerierungswerkzeug besitzt, nutze es. Wenn keines verfügbar
ist, lade keine fremden Bilder herunter und ersetze die Anforderung nicht still durch Initialen.
Bereite dann die vollständige Integration und eindeutige Dateislots vor und dokumentiere die
fehlenden Portraitmaster als externen Restpunkt.

Seed-Integration:

- Avatarbilder idempotent in den **lokalen Storage-Emulator** laden;
- stabile, lokale Download-URLs erzeugen;
- `avatarUrl` in allen tatsächlich gelesenen Identitätssnapshots mitführen, insbesondere:
  `users`, `publicProfiles`, `friendSearch`, `presence`, Activity-Teilnehmende sowie relevante
  Chat- und Postfachsnapshots;
- falls sinnvoll auch den Auth-Emulator-`photoURL` synchronisieren;
- alle sichtbaren Personen behalten über Open-Liste, Activity, Chat, Anreise und Heimweg dieselbe
  Identität und dasselbe Portrait;
- Seed bleibt idempotent und benutzt feste Seed-IDs;
- niemals externe Bild-URLs oder Produktions-Storage verwenden.

Änderungen an Seedformen müssen mit den vorhandenen Produktformen und Tests abgeglichen werden.

## 7. Kürzere Smartphone-Scrollstory

Die aktuelle Desktop-Story benötigt mit ungefähr `260dvh` zu viel Scrollweg. Verkürze sie auf
ungefähr `160–180dvh` und gestalte zwei vollständige Storyübergänge:

1. „Zeit teilen“ → „Planen“
2. „Planen“ → „Zusammenkommen“

Verhalten:

- Ein bewusster Wheel-/Trackpad-Scrollimpuls soll den jeweils nächsten Übergang vollständig
  anstoßen.
- Nach dem Scrollende rastet die Timeline sanft auf dem nächsten lesbaren Storyzustand ein.
- Ein Übergang läuft in ungefähr 500–650 ms vollständig aus.
- Kein hartes Scroll-Hijacking und kein Blockieren der natürlichen Seite.
- Schnelles Vorwärts- und Rückwärtsscrollen hinterlässt immer einen korrekten Zustand.
- Die Bühne bleibt die einzige große gepinnte Scrollsequenz.
- Keine neue Motion-Abhängigkeit installieren, wenn die vorhandene GSAP-/ScrollTrigger-Lösung das
  sauber leisten kann.
- Nur `transform` und `opacity` animieren.

Die initiale Hero-Einblendung bleibt vom Scrollen getrennt, blockiert nie und ist nach ungefähr
einer Sekunde vollständig abgeschlossen.

Mobile und Tablet bleiben im natürlichen Dokumentfluss. Keine gepinnte Langstrecke, kein
Scroll-Snap-Zwang und kein automatisches Karussell.

## 8. Mission-Abschnitt inhaltlich und räumlich ausbauen

Behalte die Headline:

> **Entstanden für mehr gemeinsame Zeit.**

Neue Einleitung:

> Die Idee zu Mica entstand aus einem vertrauten Moment: Man hat Zeit, möchte Freunde sehen und
> wünscht sich einen einfachen Anfang. Mica gibt diesem Moment einen Ort – vom ersten Impuls bis
> zum gemeinsamen Treffen.

Erzähle darunter über die Breite diese echte Sequenz:

1. **Freier Moment**  
   „Du hast Zeit und teilst diesen Moment mit den Freunden, die du erreichen möchtest.“
2. **Gemeinsame Idee**  
   „Jemand greift den Impuls auf. Ihr entscheidet gemeinsam, worauf ihr Lust habt.“
3. **Ein klarer Plan**  
   „Zeitpunkt, Ort und alle, die dabei sein möchten, kommen übersichtlich zusammen.“
4. **Gemeinsame Zeit**  
   „Aus einem spontanen Gedanken wird ein echtes Treffen.“

Desktop:

- fast volle Inhaltsbreite nutzen;
- eine ruhige durchgehende Verbindungslinie;
- die ersten drei Punkte in Grün, Amber und Blau der Mica-Figur;
- letzter Punkt größer und hell als gemeinsames Ziel;
- freie editoriale Stationen, keine vier Standardkarten.

Mobile:

- kompakte vertikale Linie mit allen vier Stationen;
- Visualisierung darf nicht mehr vollständig verschwinden.

Motion: Linie einmalig einzeichnen, Punkte kurz versetzt einblenden, kein Pinning, Scrub oder Loop.

## 9. Weitere Bereiche verfeinern

### Featureübersicht

- klare horizontale Indexstruktur statt generischer Cards;
- große dezente Nummern `01–04` und bei Bedarf eine verbindende Linie oder kleine
  produktspezifische UI-Fragmente;
- keine weiteren vollständigen Smartphones;
- Mobile vertikal und klar;
- kleine einmalige Reveals mit höchstens 8–16 px Bewegung.

### Privatsphäre

- bestehende Aufteilung bewahren;
- Diagramme auf Desktop präsenter skalieren;
- Auswahlpunkte, Zeitfenster und Laufzeiten beim ersten Eintritt einmalig aufbauen;
- keine Augen-, Radar-, Tracking- oder Zielkreuzmetaphern.

### FAQ

- Desktop vertikal kompakter machen;
- nicht jede Sektion erhält weiterhin denselben maximalen globalen Abstand;
- keine beliebige Dekoration in die freie linke Fläche setzen;
- eine zeitweise sticky Überschrift ist nur erlaubt, wenn Fokus- und Scrolltests sauber bleiben;
- Mobile weitgehend in der bestehenden klaren Form bewahren.

Führe semantische Abschnittsdichten ein oder bilde sie sauber ab:

- `editorial`: Hero/Mission;
- `content`: Features/Privatsphäre/Safety;
- `compact`: FAQ.

Freie Fläche ist nur dann richtig, wenn eine erkennbare Komposition sie trägt.

## 10. Anreise und Heimweg als echte Produktdarstellung

Behalte:

> **Anreise und Heimweg**  
> **Gemeinsam unterwegs.**

Ersetze den zu allgemeinen Einzeltext durch zwei verständliche Zustände.

### Anreise teilen

> Auf dem Weg zu einer Aktivität können die Teilnehmenden sehen, wer unterwegs oder bereits
> angekommen ist. Die Freigabe endet am Ziel automatisch.

Echter lokaler Renderzustand:

- Activity „Brunch am Sonntag“ am „Café Morgenrot“;
- ein Teilnehmer angekommen;
- zwei Teilnehmende unterwegs;
- synthetische Portraits statt Initialen;
- realistisch verteilte öffentliche Seed-Koordinaten ungefähr 500–1.200 Meter vom Ziel;
- Ziel, Marker, `distanceKm`, Status und Kamerarahmen müssen zusammenpassen;
- Screenshot-Account ist tatsächlicher Teilnehmer, nicht nur Teil von `audienceUids`.

### Sicher nach Hause

> Für deinen Heimweg wählst du bewusst die Freunde aus, die dich begleiten sollen. Sie sehen
> deinen aktuellen Standort nur während der Freigabe.

Echter lokaler Renderzustand:

- ruhiger Status `blue`;
- Mia teilt ihren Heimweg mit bewusst ausgewählten Freunden;
- aktuelle Position und „Letztes Update gerade eben“;
- synthetische Portraits und sichtbare Begleitung;
- „Sicher angekommen“ als klarer Abschluss;
- keine orange oder rote Alarmsituation als primäres Marketingbild;
- kein gespeicherter Zuhause-Pin, keine private Adresse und kein Zielmarker. Der Heimweg besitzt
  laut Produkt bewusst kein Zuhause-Geofence.

Der direkte Hinweis bleibt:

> **Mica ersetzt keinen Notruf. Im Notfall wähle 112.**

`docs/safety-mode.md` markiert das Feature derzeit als nicht releasebereit. Kennzeichne diesen
Teil deshalb sichtbar, aber ruhig als **„Vorschau“** oder **„In Entwicklung“**. Versprich niemals,
dass ein Gerät sofort klingelt, jemand garantiert reagiert oder Mica Sicherheit garantiert.

### Safety-Bühne

- Desktop: eine gemeinsame hochwertige Device-Bühne. Dasselbe sichtbare Smartphone wechselt von
  `mica-journey-focus` zu `mica-safety-home`.
- Keine zwei zusätzlichen Handys nebeneinander und kein zweiter Phone-Stack.
- Der Wechsel wird durch einen kurzen Scrollabschnitt ausgelöst und läuft in 500–650 ms vollständig
  aus.
- Mobile: beide Zustände linear als große, lesbare, rahmenlose App-Crops; kein Karussellzwang.
- Reduced Motion: beide Inhalte ohne Übergangsabhängigkeit vollständig verfügbar.

### Reproduzierbare lokale Seeds

Ergänze einen dokumentierten Befehl, vorzugsweise:

```bash
npm run emulators:seed:landing
```

Er führt lokal in korrekter Reihenfolge aus:

1. Kern-Seed inklusive synthetischer Profile und Brunch-Daten;
2. idempotenten statischen Anreise-Seed;
3. bestehenden beziehungsweise fokussiert erweiterten Heimweg-Seed mit `--once` und Status
   `blue`.

Der Anreise-Seed schreibt die echten Produktformen für Activity, `journeyStates` und
RTDB-`journeys/{activityId}` mit `members`, `sessions`, `locations` sowie dem korrekten
`journeyUnderwayCount`.

Der Heimweg-Seed bleibt unter RTDB `heimwege`/`heimwegeIndex`, verwendet nur lokale Dev-Accounts
als bewusst gesetzten Empfängerkreis und übernimmt Avatar-URLs. Keine Produktionsdaten und keine
privaten Zieladressen.

Nimm danach die Screens aus dem echten Development Client auf. Keine im Web nachgebauten
App-Screens und keine nachträglich in die PNGs montierten Identitäten.

## 11. Screenshot- und Assetpipeline

Verbindliche Screenmaster:

- `mica-open-status`
- `mica-activity-composer`
- `mica-activity-detail`
- `mica-journey-focus`
- `mica-safety-home`

Vorgaben:

- gleicher Development Client, Dark Mode, Gerätegröße und Pixeldichte;
- konsistente Statusleiste und plausible Uhrzeit;
- keine Debug-Menüs, Expo-Chrome, Cursor, Tastatur oder Banner;
- PNG-Master in der bestehenden Masterstruktur;
- responsive AVIF-/WebP-Ausgaben über die bestehende Assetpipeline;
- feste Aspect Ratios und sinnvolle Alt-Texte;
- Device Frames neutral und markenlos;
- keine erfundenen Mica-Oberflächen.

Die drei Kern-Screens bleiben die einzigen gleichzeitig aufgefächerten vollständigen Geräte.
Safety verwendet nur ein Gerät zur Zeit beziehungsweise Mobile-Crops.

## 12. Accessibility, Reduced Motion und Performance

- genau eine H1;
- semantische Landmarken und Heading-Reihenfolge;
- Skip-Link und sichtbare Fokuszustände;
- mindestens 44×44 px für interaktive Ziele;
- Alt-Texte beschreiben den konkreten App-Zustand, nicht „Handybild“;
- Farbe ist nie alleiniger Bedeutungsträger;
- ohne JavaScript bleiben alle Inhalte sichtbar und verständlich;
- Reduced Motion entfernt Pinning, Scrub, Aurora-Bewegung und dekorative Übergänge und zeigt
  sofort lesbare Endzustände;
- keine Animation von Layoutgrößen oder Positionseigenschaften;
- AVIF/WebP, reservierte Bildmaße und Lazy Loading unterhalb des Hero;
- keine horizontale Überbreite bei 360 px;
- keine erfundenen Ratings, Nutzerzahlen, Testimonials oder Storeverfügbarkeiten.

## 13. Arbeitsreihenfolge

1. Bestehende Seite lokal starten und Baseline-Screenshots in Desktop und Mobile aufnehmen.
2. Aktuelle Komponenten, Content, Storekonfiguration und Screenshotpipeline inventarisieren.
3. Pre-Launch-Content und Coming-soon-Zustände umstellen.
4. Lokale synthetische Avatar- und Brunch-Seeds integrieren.
5. Reproduzierbaren Anreise-/Heimweg-Marketingseed ergänzen und lokal verifizieren.
6. Fünf echte Screenmaster aufnehmen und Webassets erzeugen.
7. Mission, Features, Privatsphäre, Safety, FAQ und finalen Markenabschluss statisch verfeinern.
8. Kern-Scrollstory verkürzen und einrastende vollständige Übergänge implementieren.
9. Safety-Gerätewechsel ergänzen.
10. Desktop, Tablet, Mobile, Reduced Motion und Tastatur iterativ visuell prüfen.
11. Tests, Typecheck, Lint und Production Build ausführen.

Wenn die Emulatoren oder ein Bildgenerator fehlen, erledige alle unabhängigen Arbeiten weiter.
Erfinde keinen Erfolg. Dokumentiere den konkreten externen Restpunkt und die exakt vorbereiteten
Dateislots/Befehle.

## 14. Visuelle Prüfpflicht

Prüfe mindestens:

- 360×800;
- 390×844;
- 768×1024;
- 1024×768;
- 1440×900;
- 1920×1080.

Prüfe außerdem:

- Hero vor und nach der Einblendung;
- jeden Kern-Storyzustand, Einrasten und Rückwärtsscrollen;
- Mission-Linie auf Desktop und Mobile;
- Anreise- und Heimwegzustand inklusive Reduced Motion;
- Header-/Mobile-Menü;
- FAQ per Maus und Tastatur;
- Coming-soon-Zustand auf Startseite und `/download`;
- lange deutsche Umbrüche, Layout Shift und horizontale Überbreite.

Der erste Screenshot ist nicht automatisch fertig. Iteriere anhand der tatsächlichen Bilder.
Entferne beim finalen Review mindestens ein dekoratives Element, das keinen Produkt- oder
Strukturzweck erfüllt.

## 15. Verifikation

Im Rootprojekt, soweit durch die Änderungen betroffen:

- Syntaxcheck für alle geänderten/neuen Seed-Skripte;
- vorhandene fokussierte Seed-/Firebase-Tests;
- tatsächlicher lokaler Seedlauf, wenn die Emulatoren verfügbar sind;
- keine Änderung außerhalb der lokalen Emulatoren.

Im Landingprojekt mindestens:

- TypeScript-Typecheck;
- ESLint;
- Production Build;
- Browserprüfung für Accessibility und Reduced Motion;
- visuelle Screenshots aller Abnahmegrößen.

Behebe alle sicher lösbaren Fehler. Markiere die Aufgabe nicht als fertig, solange ein behebbarer
Layout-, Motion-, Seed-, Build- oder Accessibilityfehler übrig ist.

## 16. Abschlussbericht

Berichte knapp und konkret:

1. welche Landingbereiche geändert wurden;
2. welche Seeds und synthetischen Assets ergänzt wurden;
3. welche fünf Screenmaster tatsächlich neu aufgenommen wurden;
4. welche Desktop-/Mobile-Entscheidungen nach dem Screenshotreview angepasst wurden;
5. welche Prüfungen erfolgreich liefen;
6. welche externen Restpunkte bestehen, insbesondere fehlender Bildgenerator oder Storelinks;
7. wie Landingpage, Emulatoren und Landing-Seed lokal gestartet werden.

Führe keinen Deploy aus.

---
