# Mica Landingpage — verbindlicher Build-Spec

Stand: 26. August 2026  
Ziel-Domain: `https://micamapp.de`  
Implementierungsziel: eigenständige Next.js-Landingpage unter `landing/`

Dieses Dokument ist die Source of Truth für die Landingpage und ihre aktuelle Refinement-Phase.
Unter `landing/` existiert bereits eine erste vollständige Umsetzung. Sie wird gezielt
weiterentwickelt; funktionierende Brand-, Legal-, SEO-, Accessibility- und Performance-Grundlagen
werden nicht unnötig neu gebaut.

## 1. Auftrag und feste Entscheidungen

- Produktname: **Mica**.
- Feste Headline aus dem Auth-Screen: **„Freie Zeit wird gemeinsame Zeit.“**
- Primäres Ziel der Seite vor dem öffentlichen Start: Mica verständlich und begehrenswert machen
  und den kommenden Launch für iOS und Android ehrlich ankündigen.
- Aktueller Status: **Coming soon**. Es gibt noch keinen öffentlichen Download, keine öffentlichen
  Storelinks und deshalb auf der Landingpage weder QR-Code noch deaktivierte Storebuttons.
- Spätere öffentliche Distribution: Apple App Store und Google Play Store. Expo/EAS baut und
  überträgt die App, ist aber nicht der öffentliche Downloadkanal.
- Sprache zum Start: Deutsch.
- Zielgruppe: bestehende Freundeskreise, Personen ab 16 Jahren.
- Stack: Next.js App Router, TypeScript strict, Tailwind CSS v4.
- Desktop und Mobile werden als eigenständige Kompositionen behandelt. Desktop nutzt die Breite
  für eine 12-Spalten-Struktur und großflächige Visuals; Mobile erhält eine eigene lineare
  Dramaturgie.
- Hero und Signature-Story verwenden genau drei Smartphone-Renderings mit echten Mica-Screenshots.
  Der Bereich „Anreise und Heimweg“ darf zusätzlich zwei echte Screenzustände in **einer**
  gemeinsamen Device-Bühne beziehungsweise als rahmenlose Mobile-Crops zeigen. Es entsteht kein
  zweiter Smartphone-Stapel und zu keinem Zeitpunkt sind dort mehrere zusätzliche Geräte sichtbar.
- **Hero- und Scroll-Animationen zeigen ausschließlich echte, unveränderte Mica-App-Renderings.**
  Ein Crop oder eine transparente Maske darf ein vorhandenes Interface-Element isolieren, aber es
  niemals nachbauen, umtexten oder durch eine erfundene Landing-UI ersetzen. Fehlt ein benötigter
  Zustand, wird zuerst ein neuer echter App-Rendering aufgenommen.
- Die Smartphone-Choreografie ist das eine große Signaturelement der Seite. Andere Animationen
  bleiben ruhig und funktional.
- Es gibt keine blockierende Splash- oder Intro-Sequenz vor dem Seiteninhalt.
- Die alten Together-Kreis-/Venn-Logoassets sind nicht mehr maßgeblich. Es wird ausschließlich
  die aktuelle Mica-Wortmarke und Mica-Figur aus dem App-Code verwendet.
- Keine erfundenen Bewertungen, Nutzerzahlen, Testimonials, Store-Ratings oder Verfügbarkeiten.
- Keine echten Namen, Profilbilder, Nachrichten oder privaten Standorte in Marketing-Screenshots.
  Erlaubt und ausdrücklich erwünscht sind vollständig synthetische Demopersonen, KI-generierte
  Erwachsenenporträts, erfundene Nachrichten und plausible lokale Seed-Koordinaten ohne Bezug zu
  einer realen Privatadresse.
- Keine Analyse-, Tracking- oder Marketing-Cookies ohne gesonderte Freigabe. Werden später
  nicht notwendige Dienste ergänzt, muss vorher ein passendes Consent-Konzept festgelegt werden.

## 2. Produktthese und Kommunikationsziel

Mica soll Freunde wieder häufiger zusammenbringen. Die Motivation ist nicht „Social Discovery“
und nicht das Beobachten anderer Personen. Häufig möchten Menschen sich grundsätzlich sehen,
aber die wiederholte Abstimmung über mehrere Chats macht aus einem einfachen Impuls viel
Organisation. Mica führt freie Zeit, Idee, Zeitpunkt, Ort und Teilnehmer bei einem gemeinsamen
Plan zusammen.

Die Landingpage muss nach wenigen Sekunden verständlich machen:

1. Mica ist für den bestehenden Freundeskreis.
2. Menschen teilen freiwillig, wann sie offen für gemeinsame Zeit sind.
3. Aus einem freien Moment kann direkt ein konkreter Plan entstehen.
4. Sichtbarkeit, Standort und Dauer bleiben bewusste Entscheidungen.
5. Mica startet künftig für iOS und Android; die Seite behauptet bis dahin keinen öffentlichen
   Download.

## 3. Sprachsystem

### 3.1 Ton

- menschlich, klar und ruhig;
- positiv und nutzenorientiert;
- aktive Verben und kurze Sätze;
- „ihr“ und „gemeinsam“ statt distanziertem Produktjargon;
- konkret genug, dass jede Aussage in der echten App wiedergefunden werden kann;
- keine Superlative wie „revolutionär“, „einzigartig“ oder „die beste App“.

### 3.2 Bevorzugte Begriffe

- freie Momente teilen
- einladen
- planen
- auswählen
- dazukommen
- zusammenfinden
- gemeinsam Zeit verbringen
- bestätigte Freunde
- zeitlich begrenzte Freigabe

### 3.3 Zu vermeidende Sprache

Folgende Richtungen dürfen in Marketingtexten nicht verwendet werden:

- „Deine Freunde im Blick“
- „Wissen, was alle machen“
- „Freunde verfolgen“
- „Sehen, wo deine Freunde sind“
- „Nie wieder etwas verpassen“
- FOMO-, Kontroll- oder Überwachungsmetaphern
- Angriffe auf WhatsApp, andere Messenger oder soziale Netzwerke
- lange Negativketten wie „kein Feed, kein Spam, kein Hickhack“

„Sehen“ ist nur erlaubt, wenn klar ist, dass es um freiwillig geteilte Inhalte geht, zum Beispiel:
„Sieh, welche Pläne deine Freunde mit dir teilen.“

### 3.4 Sicherheits- und Rechtstexte

Sicherheits- und Rechtshinweise bleiben direkt, auch wenn dafür eine negative Formulierung nötig
ist. Insbesondere darf folgender Hinweis nicht weich formuliert werden:

> Mica ersetzt keinen Notruf. Im Notfall wähle 112.

## 4. Visuelles System

### 4.1 Markenfarben

Die neutrale Marke bleibt unabhängig von den Activity-Zuständen:

| Rolle | Token | Wert |
| --- | --- | --- |
| Hauptgrund | Ink | `#070910` |
| Erhöhte Fläche | Ink Raised | `#0F1320` |
| Primärtext | Paper | `#F7F8FC` |
| Markenakzent | Indigo | `#8991FF` |
| Heller Akzent | Aqua | `#A8AEFF` |
| Tiefer Akzent | Violet | `#626BDD` |

Farben der aktuellen Mica-Figur:

| Figurteil | Wert |
| --- | --- |
| Arm/Grün | `#35BA84` |
| Kopf/Amber | `#E9A02B` |
| Körper/Blau | `#4772F8` |

Activity-Farben werden ausschließlich zur Erklärung echter Zustände verwendet:

| Zustand | Wert |
| --- | --- |
| Open | `#3B82F6` |
| Soon | `#E0A23E` |
| Now | `#41C08D` |

Keine orange Startup-Palette, keine zufälligen Gradient-Blobs und keine beliebig wechselnden
Akzentfarben. Dezente Aurora-Felder dürfen im Hero und im finalen CTA die drei Farben der
Mica-Figur aufnehmen, weil diese Bildsprache bereits im Auth-Screen verankert ist.

### 4.2 Typografie

- Display, Headlines und Body: **Schibsted Grotesk**, vorzugsweise lokal beziehungsweise über
  `next/font` geladen.
- Gewichte: 500 für Body/Utility, 600 für Labels und Navigation, 700 für Headlines.
- Optionale zweite Rolle: **IBM Plex Mono** nur für kurze Zeit-, Distanz- oder Statuswerte.
  Nicht für Fließtext und nicht als dekorative Tech-Schrift verwenden.
- Hero-H1 Desktop: `clamp(3.75rem, 7vw, 7.5rem)` mit kontrollierter Zeilenhöhe.
- Hero-H1 Mobile: `clamp(2.75rem, 12vw, 4.4rem)`.
- Body Mobile mindestens 16 px; Desktop 18–20 px für Hero- und Leadtext.
- Fließtext bleibt auf ungefähr 60–75 Zeichen pro Zeile begrenzt, auch wenn die visuelle Fläche
  über die gesamte Desktopbreite läuft.

### 4.3 Flächen und Formen

- Grundsätzlich dunkle, hochwertige Markenbühne.
- Keine helle Standard-SaaS-Seite und kein austauschbares Bento-Grid als Hauptsprache.
- Karten nur, wenn Inhalte tatsächlich eine abgegrenzte Einheit bilden.
- Radien orientieren sich an der App: Inputs 16 px, Karten 20 px, große Bühnenflächen 28 px.
- Smartphone-Rahmen sind neutral und markenlos. Keine Apple- oder Samsung-Logos.
- Schatten bleiben breit, weich und dunkel; keine leuchtenden Neonumrandungen.
- Sektionen verwenden keine einzige pauschale Maximalhöhe. Es gibt mindestens drei semantische
  Dichten: `editorial` für Hero/Mission, `content` für Produkt/Privatsphäre/Safety und `compact`
  für FAQ. Leere Fläche muss eine Komposition tragen; fehlt dieser Anker, wird entweder der Inhalt
  gestärkt oder der Abstand reduziert.

## 5. Responsive Grundstruktur

### 5.1 Breakpoints

- Mobile: 360–767 px
- Tablet: 768–1023 px
- Desktop: ab 1024 px
- Large Desktop: ab 1440 px
- Ultra-wide: ab 1920 px, mit visueller Bühne bis maximal ungefähr 1600–1760 px

### 5.2 Desktopprinzip

- Sektionen und Hintergründe laufen full-bleed über die gesamte Viewportbreite.
- Inhalte liegen auf einem 12-Spalten-Raster.
- Text belegt typischerweise 4–5 Spalten; Visuals 7–8 Spalten.
- Auf großen Screens wird zusätzliche Breite für Smartphone-Bühne, räumliche Tiefe und
  asymmetrische Komposition genutzt, nicht für immer größere Außenränder.
- Der Text selbst bleibt lesbar begrenzt.

### 5.3 Mobileprinzip

- Eigene lineare Erzählung mit klarer vertikaler Reihenfolge.
- Keine verkleinerte Desktop-Dreiergruppe.
- Ein Smartphone ist jeweils dominant; das nächste darf am Rand bereits leicht sichtbar werden.
- Keine horizontale Pflichtnavigation und kein automatisches Screenshot-Karussell.
- Volle Breite für visuelle Flächen, mindestens 20–24 px Innenabstand für Text.
- `min-height: 100dvh` statt festem `100vh` für bildschirmfüllende Abschnitte.

## 6. Seitenarchitektur und finale Texte

### 6.1 Header

Inhalt:

- aktuelle Mica-Wortmarke;
- Anker „So funktioniert Mica“;
- Anker „Gemeinsam planen“;
- Anker „Privatsphäre“;
- Anker „Fragen“;
- Pre-Launch-Anker „Bald verfügbar“ zum finalen Coming-soon-Bereich.

Desktop:

- transparente Navigation im Hero;
- nach ungefähr 48 px Scroll eine ruhige Ink-Fläche mit leichtem Blur und feiner Trennlinie;
- kein stark schwebendes Pill-Navigationsmuster.

Mobile:

- Wortmarke links, „Bald verfügbar“-Anker rechts;
- weitere Links in einem zugänglichen Menü;
- das Menü muss per Tastatur bedienbar sein, Fokus einschließen und mit Escape schließen.

Motion:

- Header erscheint gemeinsam mit dem Hero, wird aber nicht dauerhaft bewegt;
- Übergang zur gescrollten Fläche: 220 ms, nur Hintergrund, Border und Blur;
- bei Reduced Motion ohne gleitende Verschiebung.

### 6.2 Hero

ID: `hero`

Verbindliche Copy:

> **Freie Zeit wird gemeinsame Zeit.**

> Mit Mica teilt ihr freie Momente, macht daraus einen Plan und findet wieder häufiger zusammen.

Primärer Anker:

> So funktioniert Mica

Sekundäre Statuszeile:

> Bald für iOS und Android

Die Statuszeile ist kein Button. Sobald echte öffentliche Storelinks vorliegen, darf der Bereich
zu einem echten Download-CTA wechseln. Bis dahin gibt es im Hero kein „Mica laden“.

Spätere Utility-Zeile, sobald beide öffentlichen Storelinks vorliegen:

> Kostenlos für iOS und Android

Desktop-Layout:

- Full-bleed, mindestens eine Viewporthöhe.
- Copy links auf 5 Spalten.
- Rechts eine erste, noch kompakte Ansicht des dreifachen Smartphone-Stapels auf 7 Spalten.
- Die Geräte dürfen rechts und unten kontrolliert angeschnitten werden, damit die Fläche nicht wie
  ein zentrierter App-Screenshot wirkt.
- Die nächste Sektion muss am unteren Rand angedeutet werden; kein isolierter Vollbild-Splash.

Mobile-Layout:

- Wortmarke/Copy zuerst.
- CTA vollständig im ersten sinnvollen Viewportbereich erreichbar.
- Darunter ein großes dominantes Smartphone; die hinteren Geräte sind nur leicht sichtbar.
- Der Hero darf höher als ein Viewport sein, aber der Nutzer darf nicht auf die Animation warten
  müssen, um den CTA zu erreichen.

Hero-Einblendung beim ersten Laden:

1. Die Seite zeigt sofort den Ink-Hintergrund; kein vorgeschaltetes Overlay.
2. Mica-Wortmarke: Opacity 0→1, `translateY(6px)→0`, Scale `0.985→1`, 420 ms.
3. Die drei farbigen Figurteile dürfen mit 50 ms Abstand erscheinen; die Wortmarke hat als Ganzes
   genau ein zugängliches Label „Mica“.
4. Die zwei H1-Zeilen erscheinen als Zeilen, nicht buchstabenweise: `translateY(22px)→0`, 520 ms,
   90 ms Abstand.
5. Subline: `translateY(14px)→0`, 420 ms.
6. CTA-Gruppe: 380 ms, kleiner Opacity-/Y-Übergang.
7. Smartphone-Stapel: `translateY(56px)→0`, Scale `0.96→1`, `rotateY(-12deg)→0`, ungefähr
   700–760 ms.
8. Gesamte Einblendung bleibt unter ungefähr 1,2 Sekunden und blockiert nie Interaktion.

Easing:

- eintretende Elemente: `power2.out` beziehungsweise vergleichbare Deceleration;
- keine Bounces und kein elastisches Überschwingen.

Ambient Motion:

- maximal drei sehr schwache Aurora-Felder aus den Figurfarben;
- Zyklus 24–32 Sekunden, geringe Bewegung und Opacity;
- keine Bewegung von Text oder Bedienelementen;
- unter Reduced Motion vollständig statisch.

### 6.3 Signature-Sektion: Smartphone-Scrollstory

ID: `so-funktionierts`

Headline:

> **Ein Impuls wird zum gemeinsamen Plan.**

Intro:

> Teile, dass du Zeit hast, oder plane direkt etwas für später. Mica bringt Idee, Zeitpunkt, Ort und alle, die dabei sein möchten, übersichtlich zusammen.

Diese Sektion verwendet genau drei reale Mica-Screens:

1. **Zeit teilen**  
   Copy: „Ein Tap reicht. Zeitraum und Standortfreigabe bestimmst du selbst.“  
   Screen: geöffnete NearbySheet mit aktivem OpenStatusCard. Der eigene Status zeigt als bewusst
   gesetzten Vibe **„Brunch“**, nicht den leeren Darstellungswert „Egal“.

2. **Planen**  
   Copy: „Aus einer Idee werden Zeitpunkt, Ort und ein gemeinsamer Plan.“  
   Screen: ausgefüllter ActivityComposer für **„Brunch am Sonntag“**, sinnvoller Tageszeit,
   erfundenem Ort **„Café Morgenrot“** und ohne offene Tastatur.

3. **Zusammenkommen**  
   Copy: „Alle wichtigen Angaben bleiben direkt bei der Aktivität – für die Freunde, mit denen du sie teilst.“  
   Screen: MarkerDetailSheet beziehungsweise Activity-Detail derselben Brunch-Aktivität mit Zeit,
   Ort, mehreren freundlich wirkenden Teilnehmenden und kurzen positiven Nachrichten.

Die drei Screens erzählen **eine** zusammenhängende Geschichte. Unverbundene Testzustände wie
„Egal“, „Spontane Runde Billard“ und „Kickern im Süß war gestern“ dürfen nicht nebeneinander als
Marketinggeschichte erscheinen. Das korrekte App-Standardverhalten „Egal“ bleibt unverändert;
für die Aufnahme wird der optionale Vibe bewusst ausgefüllt.

#### Desktop-Choreografie

- Aktiv ab `min-width: 1024px` und nur ohne Reduced Motion.
- Wrapperhöhe ungefähr `160–180dvh`; die Bühne bleibt für eine Sektion sticky bei `top: 0` und
  `height: 100dvh`.
- Maximal diese eine Sektion wird gepinnt beziehungsweise sticky inszeniert.
- Linke 4 Spalten: Textzustände.
- Rechte 8 Spalten: Smartphone-Bühne mit CSS-`perspective`.
- Ein klarer Scrollimpuls soll jeweils einen vollständigen Story-Übergang anstoßen. Die Timeline
  darf weiterhin an Scrollpositionen gekoppelt sein, muss aber nach dem Scrollende sanft auf den
  nächsten Storyzustand einrasten. Ein Übergang läuft in ungefähr 500–650 ms vollständig aus.
- Kein hartes Scroll-Hijacking: natürliche Seitennavigation, Touch-Scroll und Rückwärtsscrollen
  bleiben erhalten.

Phasen:

| Fortschritt | Darstellung |
| --- | --- |
| 0–20 % | Drei Geräte stehen eng als Stapel. Das Open-Gerät liegt vorne; „Zeit teilen“ ist vollständig lesbar. |
| 20–50 % | Erster vollständiger Übergang: Frontgerät richtet sich aus, zweites Gerät fächert nach links auf; Text rastet auf „Planen“ ein. |
| 50–80 % | Zweiter vollständiger Übergang: drittes Gerät fächert nach rechts auf; Text rastet auf „Zusammenkommen“ ein. |
| 80–100 % | Alle drei Geräte ruhen aufgefächert und vollständig lesbar; die Sektion löst sich ohne weitere Wartefläche. |

Finale Desktop-Komposition:

- mittleres Gerät nahezu frontal;
- linkes Gerät ungefähr `rotateZ(-7deg)` und kleine positive `rotateY`-Tiefe;
- rechtes Gerät ungefähr `rotateZ(7deg)` und kleine negative `rotateY`-Tiefe;
- Geräte überlappen leicht, bleiben aber lesbar;
- keine Rotation größer als ungefähr 14 Grad im lesbaren Endzustand;
- keine Geräte fliegen vollständig aus dem Viewport;
- beim Rückwärtsscrollen läuft die Timeline kontrolliert rückwärts.

#### Mobile- und Tablet-Choreografie

- Bis 1023 px keine gepinnte 260-dvh-Bühne.
- Drei semantisch geordnete Artikel im normalen Dokumentfluss.
- Je Artikel ein großes Smartphone mit maximal ungefähr 84 vw beziehungsweise 360 px Breite.
- Geräte kommen abwechselnd leicht von links und rechts:
  `translateY(40–52px)`, `rotateY(±8–10deg)`, `rotateZ(±3–5deg)`, Scale `0.97→1`.
- Das nächste Gerät darf am unteren Rand bereits leicht sichtbar werden.
- Text steht immer vor beziehungsweise direkt nach dem zugehörigen Gerät; keine räumliche
  Anordnung darf die Screenreader-Reihenfolge verändern.
- Animation wird beim Eintritt in den Viewport einmal abgespielt. Keine automatische Schleife.

#### Technische Grenzen

- GSAP + ScrollTrigger sind vorgesehen; vorhandene saubere React-Integration darf beibehalten
  werden. Keine zusätzliche Motion-Abhängigkeit nur für das Einrasten installieren.
- Kein Three.js, WebGL oder Video für diese Sequenz.
- Nur `transform` und `opacity` animieren.
- GSAP in einem klar begrenzten Client Component verwenden und bei Unmount vollständig bereinigen.
- Nach dem Laden von Fonts und Screenshots `ScrollTrigger.refresh()` kontrolliert ausführen.
- Wichtige Inhalte dürfen ohne JavaScript nicht unsichtbar bleiben.

### 6.4 Mission-Interlude

ID: `gemeinsam-planen`

Headline:

> **Entstanden für mehr gemeinsame Zeit.**

Text:

> Die Idee zu Mica entstand aus einem vertrauten Moment: Man hat Zeit, möchte Freunde sehen und wünscht sich einen einfachen Anfang. Mica gibt diesem Moment einen Ort – vom ersten Impuls bis zum gemeinsamen Treffen.

Verbindliche inhaltliche Abfolge:

1. **Freier Moment**  
   „Du hast Zeit und teilst diesen Moment mit den Freunden, die du erreichen möchtest.“
2. **Gemeinsame Idee**  
   „Jemand greift den Impuls auf. Ihr entscheidet gemeinsam, worauf ihr Lust habt.“
3. **Ein klarer Plan**  
   „Zeitpunkt, Ort und alle, die dabei sein möchten, kommen übersichtlich zusammen.“
4. **Gemeinsame Zeit**  
   „Aus einem spontanen Gedanken wird ein echtes Treffen.“

Darstellung:

- keine fiktiven Namen oder unnötige Einzelfallgeschichte;
- kein Vergleich mit Messengern;
- auf Desktop nutzt eine Verbindungslinie mit vier echten Stationen nahezu die gesamte
  Inhaltsbreite. Grün, Amber und Blau markieren die ersten drei Punkte; der helle, etwas größere
  Zielpunkt steht für die gemeinsame Zeit;
- die Stationen stehen frei und editorial auf der Fläche, nicht in vier generischen Karten;
- auf Mobile wird dieselbe Abfolge als kompakte vertikale Verbindungslinie gezeigt und darf nicht
  vollständig verschwinden;
- die Linie zeichnet sich beim ersten Eintritt einmalig ein, anschließend erscheinen die Punkte
  mit kleinem zeitlichem Abstand. Kein Pinning, kein Scrub und keine Schleife.

### 6.5 Unterstützende Produktfunktionen

Headline:

> **Alles, was ihr zum Zusammenkommen braucht.**

Lead:

> Die wichtigsten Dinge bleiben direkt bei eurem gemeinsamen Plan.

Inhalte:

- **Karte**  
  „Geteilte Aktivitäten erscheinen dort, wo sie stattfinden.“
- **Circles**  
  „Wähle den Freundeskreis, für den dein Plan gedacht ist.“
- **Kalender**  
  „Zugesagte Aktivitäten bleiben übersichtlich an einem Ort.“
- **Chat**  
  „Kurze Absprachen bleiben direkt mit der Aktivität verbunden.“

Darstellung:

- keine vier gleichförmigen Standardkarten;
- Desktop: klare horizontale Indexstruktur über die verfügbare Breite. Große dezente Nummern
  `01–04`, eine verbindende Linie oder kleine abstrahierte, produktspezifische UI-Fragmente dürfen
  die vier Funktionen als zusammengehöriges System zeigen;
- Mobile: vier klar getrennte Text-/Icon-Blöcke;
- konsistente SVG-Icons, keine Emojis;
- höchstens kleine Interface-Crops, keine weiteren vollständigen Smartphone-Renderings.

Motion:

- Sektionstitel und Inhaltsgruppen erscheinen mit 8–16 px Y-Versatz und 350–450 ms;
- maximal 50 ms Stagger zwischen zusammengehörigen Elementen;
- Animation nur einmal, keine Scroll-Scrub-Bewegung.

Abstand:

- Der Abschnitt darf großzügig bleiben, aber seine Dichte wird aus dem tatsächlichen Inhalt
  abgeleitet. Nicht jede Sektion erhält automatisch denselben maximalen vertikalen Abstand.

### 6.6 Privatsphäre

ID: `privatsphaere`

Headline:

> **Du entscheidest, was du teilst.**

Lead:

> Mica gibt dir für jeden Moment klare Entscheidungen über Sichtbarkeit, Standort und Dauer.

Inhalte:

- **Dein Freundeskreis**  
  „Deine Inhalte erreichen bestätigte Freunde und die von dir gewählte Gruppe.“
- **Dein Standort**  
  „Standortfreigaben startest du bewusst und zeitlich begrenzt.“
- **Deine Zeit**  
  „Open-Status, Aktivitäten und Chats haben klare Laufzeiten und enden automatisch.“

Darstellung:

- ruhiger als die Produktsektionen;
- keine Augen-, Radar-, Zielkreuz- oder Überwachungsmetaphern;
- geeignet ist eine abstrakte Auswahl-/Freigabedarstellung mit klar abgegrenzten Kreisen und
  Zeitfenstern;
- die drei vorhandenen Diagramme dürfen auf Desktop präsenter skaliert werden. Auswahlpunkte,
  Zeitfenster und Laufzeiten bauen sich beim ersten Eintritt einmalig auf;
- Farben unterstützen nur, Text trägt die Bedeutung.

### 6.7 Anreise und Heimweg

ID: `unterwegs`

Eyebrow:

> **Anreise und Heimweg**

Headline:

> **Gemeinsam unterwegs.**

Einleitung:

> Zwei Situationen, zwei bewusste Freigaben: auf dem Weg zu einer Aktivität und auf deinem Heimweg.

Teil 1:

> **Anreise teilen**

> Auf dem Weg zu einer Aktivität können die Teilnehmenden sehen, wer unterwegs oder bereits angekommen ist. Die Freigabe endet am Ziel automatisch.

Teil 2:

> **Sicher nach Hause**

> Für deinen Heimweg wählst du bewusst die Freunde aus, die dich begleiten sollen. Sie sehen deinen aktuellen Standort nur während der Freigabe.

Verbindlicher Hinweis:

> Mica ersetzt keinen Notruf. Im Notfall wähle 112.

Darstellung:

- **Anreise** zeigt einen echten, lokal geseedeten App-Zustand: Aktivität „Brunch am Sonntag“,
  Ziel „Café Morgenrot“, einen angekommenen und zwei unterwegs befindliche Teilnehmende mit
  synthetischen Profilbildern. Ziel, Positionen, Distanzen und Status müssen rechnerisch
  zusammenpassen;
- **Sicher nach Hause** zeigt einen echten, lokal geseedeten blauen Normalzustand: eine Person
  teilt ihren Heimweg mit bewusst ausgewählten Freunden, letztes Update ist aktuell, Begleitung ist
  sichtbar und „Sicher angekommen“ bleibt der klare Abschluss;
- der Heimweg zeigt **keinen** gespeicherten Zuhause-Pin, keine private Adresse und keinen
  vorgegebenen Zielmarker. Ein Ziel gehört nur zur Anreise-Aktivität;
- Desktop verwendet eine gemeinsame hochwertige Device-Bühne. Dasselbe Gerät wechselt zwischen
  den beiden Screenzuständen; es erscheinen keine zwei zusätzlichen Handys nebeneinander;
- Mobile zeigt beide Zustände linear als große lesbare App-Crops, ohne automatische Rotation oder
  Karussellpflicht;
- ausgewählte Freunde werden als bestätigte Begleitung dargestellt, nicht als Beobachter;
- kein dramatischer Alarm-Look als Standardzustand;
- Safety-Farben nur dort einsetzen, wo der dargestellte Zustand sie wirklich benötigt.
- `docs/safety-mode.md` bezeichnet „Sicher nach Hause“ derzeit als nicht releasebereit. Bis die
  dort dokumentierten Release-Gates erfüllt sind, trägt dieser Teil sichtbar, aber ruhig die
  Kennzeichnung **„Vorschau“** beziehungsweise **„In Entwicklung“** und macht keine Zustell-,
  Reaktions- oder Sicherheitsgarantien.

Motion:

- die Anreise-Route darf sich einmal kontrolliert bis zum Aktivitätsziel aufbauen;
- Profilmarker und ausgewählte Kontakte erscheinen danach mit kleinem Fade;
- ein kurzer Scrollabschnitt wechselt das eine Desktop-Gerät vollständig von Anreise zu Heimweg;
  der Übergang dauert ungefähr 500–650 ms und rastet auf einem lesbaren Endzustand ein;
- keine dauerhafte pulsierende Ortung und keine bewegten Standortpunkte.

Seed- und Aufnahmevorgaben:

- Nur lokale Firebase-Emulatoren verwenden. Keine Staging- oder Produktionsdaten ändern.
- Einen idempotenten Anreise-Seed ergänzen, der reale Produktformen für Activity,
  `journeyStates`, RTDB-`members`, `sessions` und `locations` sowie den
  `journeyUnderwayCount` schreibt. Der Screenshot-Account muss wirklicher Teilnehmer der Activity
  sein; `audienceUids` allein reicht nicht.
- Den vorhandenen `scripts/seed-heimweg.mjs --once` für den Marketingzustand verwenden oder
  fokussiert erweitern: Status `blue`, aktuelle Position, synthetisches Profilbild, gewählte
  Begleitung und keine private Zieladresse.
- Ein dokumentierter Befehl wie `npm run emulators:seed:landing` darf die notwendigen lokalen
  Seeds reproduzierbar in richtiger Reihenfolge ausführen.
- Screens werden anschließend aus dem echten Development Client aufgenommen. Keine erfundenen
  App-Oberflächen und keine nachträglich montierten Profilbilder.

### 6.8 FAQ

ID: `fragen`

Headline:

> **Fragen zu Mica.**

Fragen und Antworten:

1. **Was ist Mica?**  
   Mica ist eine App für spontane Treffen im bestehenden Freundeskreis. Ihr teilt freie Momente,
   plant Aktivitäten und findet leichter zusammen.

2. **Wer kann sehen, was ich teile?**  
   Deine Inhalte sind für bestätigte Freunde und die von dir gewählte Zielgruppe bestimmt. Bei
   Aktivitäten kannst du alle direkten Freunde, enge Freunde oder einen Circle auswählen.

3. **Muss ich meinen Standort teilen?**  
   Du entscheidest selbst. Dein Open-Status startet ohne Standort. Standortfreigaben aktivierst
   du bewusst und zeitlich begrenzt.

4. **Was kostet Mica?**  
   Mica ist kostenlos.

5. **Ab welchem Alter kann ich Mica verwenden?**  
   Mica richtet sich an Personen ab 16 Jahren.

6. **Wann erscheint Mica?**  
   Mica startet für iOS und Android. Sobald der Termin feststeht, findest du alle Informationen
   hier auf micamapp.de.

Implementierung:

- native `<details>`/`<summary>` oder eine gleichwertig zugängliche Accordion-Lösung;
- alle Antworten bleiben im HTML vorhanden;
- keine automatische Öffnung beim Scrollen;
- Fokusindikatoren klar sichtbar.
- Desktop vertikal kompakter als die großen Erzählsektionen. Die freie linke Fläche wird nicht mit
  beliebiger Dekoration gefüllt; eine zeitweise sticky Überschrift ist erlaubt, wenn sie beim
  Tastatur- und Scrolltest nicht stört.

### 6.9 Finaler Coming-soon-Bereich

ID: `coming-soon`

Eyebrow:

> **Bald verfügbar**

Headline:

> **Mica kommt bald.**

Text:

> Mica startet für iOS und Android. Sobald der Termin feststeht, findest du alle Informationen hier auf micamapp.de.

Desktop:

- vollbreiter, klarer Abschluss mit ruhiger Rückkehr der Hero-Aurora;
- großes dezentes Mica-Logo, Mica-Figur oder App-Icon als Markenelement;
- sichtbare Plattformzeile „Für iOS und Android“;
- kein QR-Code, keine deaktivierten oder gestrichelten Storebuttons und keine weitere
  Smartphone-Choreografie;
- die Fläche wird als bewusste Markenszene komponiert und darf nicht wie ein kleiner Textblock mit
  einem isolierten Utility-Element wirken.

Mobile:

- lineare Reihenfolge: Eyebrow, Headline, Text, Plattformzeile, Markenelement;
- kein leeres Button- oder QR-Platzhalterfeld.

Späterer Zustandswechsel:

- keine Storelinks: ausschließlich Coming soon;
- ein verifizierter Storelink: nur dieser echte Storebutton;
- beide verifizierten Storelinks: beide echten Storebuttons und optional ein QR-Code zur
  plattformneutralen `/download`-Route;
- Expo-Go-, Development-Client- und EAS-Dashboard-QR-Codes sind niemals öffentliche
  Downloadziele.

### 6.10 Footer

Inhalte:

- Mica-Wortmarke;
- Impressum;
- Datenschutz;
- Nutzungsbedingungen;
- Kontakt, sobald eine verbindliche Kontaktadresse vorliegt;
- dynamisches Copyright-Jahr.

Die rechtlichen Texte werden nicht neu erfunden. Bestehende Quellen:

- `src/features/legal/impressum.de.json`
- `src/features/legal/datenschutz.de.json`
- `src/features/legal/nutzungsbedingungen.de.json`

Beim Überführen auf die Website muss vermieden werden, dass eine zweite manuell gepflegte und
später veraltete Textfassung entsteht. Die Implementierung soll entweder aus denselben JSON-
Quellen rendern oder einen klar dokumentierten Generierungsschritt verwenden.

## 7. Smartphone-Assets

### 7.1 Verbindliche Auswahl

Die drei vollständigen Kern-Smartphones:

1. `mica-open-status`
2. `mica-activity-composer`
3. `mica-activity-detail`

Zusätzliche Safety-Master für die gemeinsame Device-Bühne beziehungsweise rahmenlose Mobile-Crops:

4. `mica-journey-focus`
5. `mica-safety-home`

Die Safety-Master dürfen nicht als zwei weitere gleichzeitig sichtbare, vollständige Handys
inszeniert werden. Der Kalender kann als kleiner Crop in der Featuresektion auftauchen, ersetzt
aber nicht einen der drei Kern-Screens, solange die Hauptgeschichte „freier Moment → Plan →
Treffen“ bleibt.

### 7.2 Aufnahmevorgaben

- echte App aus dem Development Client;
- Firebase Emulator Suite mit Seed-Daten;
- ausschließlich künstliche Profile, Orte und Nachrichten;
- die drei Kern-Screens bilden die positive Brunch-Geschichte aus Abschnitt 6.3;
- alle sichtbaren Demoprofile erhalten vollständig synthetische, freundlich wirkende
  Erwachsenenporträts. Natürliche unterschiedliche Lächeln, einheitlicher quadratischer Ausschnitt,
  ruhiges Licht und Hintergrund; keine echten Personen, Prominenten, Stockfotos, Logos oder Texte;
- Zielgröße der Portraitmaster ungefähr 512×512 als optimiertes JPEG. Falls das ausführende Modell
  kein Bildgenerierungswerkzeug besitzt, darf es keine fremden Bilder herunterladen oder die
  Anforderung still durch Initialen ersetzen. Es dokumentiert die fehlenden Assets und lässt die
  vollständige technische Seed-Integration vorbereitet;
- Avatarbilder werden idempotent in den Storage-Emulator geladen. `avatarUrl` wird in allen
  tatsächlich gelesenen Identitäts-Snapshots mitgeführt, insbesondere `users`, `publicProfiles`,
  `friendSearch`, `presence`, Activity-Teilnehmende und relevante Chat-/Postfach-Snapshots;
- gleiche Gerätegröße, gleiche Pixeldichte und gleicher Farbstil;
- keine Debug-Menüs, Expo-Chrome, Cursor, Tastatur oder Benachrichtigungsbanner;
- Uhrzeit, Akku und Statusleiste konsistent;
- Screenshots möglichst als PNG-Master; Webausgabe als AVIF oder WebP;
- feste Aspect Ratio reservieren, damit beim Laden kein Layout Shift entsteht.

### 7.3 Device Frame

- neutraler, markenloser Smartphone-Rahmen als CSS/SVG-Komponente;
- keine fotografischen Renderings nötig;
- Bildschirmbild liegt maskiert innerhalb eines festen Aspect-Ratio-Containers;
- Rahmen, Reflexkante und Schatten sind eigene Ebenen;
- für die Scrollanimation wird der gesamte Frame transformiert, nicht das Screenshotbild separat.

## 8. Downloadfluss

Konfiguration:

- `NEXT_PUBLIC_APP_STORE_URL`
- `NEXT_PUBLIC_PLAY_STORE_URL`
- optional getrennte Testlinks für TestFlight und Google Play Testing

Route: `/download`

- Solange kein Storelink vorliegt, zeigt `/download` dieselbe ehrliche Coming-soon-Botschaft und
  verweist zurück zur Startseite. Es gibt dort keinen QR-Code und keine deaktivierten Storebuttons.
- Erst mit einem verifizierten Link wird auf iOS beziehungsweise Android der passende Store
  hervorgehoben. Auf Desktop und bei unklarer Plattform werden nur die tatsächlich verfügbaren
  Optionen angezeigt.
- Ein späterer QR-Code zeigt immer auf `https://micamapp.de/download`, nicht direkt auf einen
  einzelnen Store. Dadurch muss er beim späteren Storewechsel nicht neu produziert werden.
- Fehlende URLs dürfen weder auf `#` zeigen noch als scheinbar anklickbare Controls erscheinen.
- Expo-Go- und EAS-Dashboard-Links dürfen nicht als öffentlicher Download dargestellt werden.

## 9. Technische Architektur

Empfohlene Struktur:

```text
landing/
├─ app/
│  ├─ datenschutz/page.tsx
│  ├─ download/page.tsx
│  ├─ impressum/page.tsx
│  ├─ nutzungsbedingungen/page.tsx
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx
├─ components/
│  ├─ brand/
│  │  ├─ MicaFigure.tsx
│  │  └─ MicaWordmark.tsx
│  ├─ landing/
│  │  ├─ ComingSoon.tsx
│  │  ├─ Faq.tsx
│  │  ├─ FeatureOverview.tsx
│  │  ├─ Header.tsx
│  │  ├─ Hero.tsx
│  │  ├─ MissionStatement.tsx
│  │  ├─ PrivacySection.tsx
│  │  ├─ SafetySection.tsx
│  │  └─ SmartphoneStory.tsx
│  ├─ motion/
│  │  ├─ HeroEntrance.tsx
│  │  ├─ Reveal.tsx
│  │  └─ SmartphoneStoryMotion.tsx
│  └─ ui/
│     ├─ DeviceFrame.tsx
│     ├─ StoreBadge.tsx
│     └─ SectionHeading.tsx
├─ content/
│  └─ site.ts
├─ public/
│  ├─ brand/
│  ├─ screenshots/
│  └─ og/
├─ next.config.ts
├─ package.json
├─ postcss.config.mjs
└─ tsconfig.json
```

Regeln:

- Server Components sind Standard.
- Client Components nur für Header-Menü, Hero-Einblendung, Scrollstory, Safety-Screenwechsel und
  gegebenenfalls eine spätere Download-Plattformerkennung.
- Alle Marketingtexte liegen zentral in `content/site.ts`.
- Tailwind übernimmt Layout, Breakpoints, Abstände und einfache Zustände.
- Komplexe 3D-Transformationen und Motion-spezifische CSS-Variablen dürfen in fokussierten CSS-
  Modulen beziehungsweise in der Motion-Komponente liegen; sie müssen nicht künstlich in lange
  Utility-Class-Ketten gepresst werden.
- GSAP/ScrollTrigger unterhalb des Hero möglichst verzögert laden.
- Keine zusätzliche UI-Komponentenbibliothek ohne nachgewiesenen Bedarf.
- SVG-Icons aus einem konsistenten Set; keine Emojis als Icons.

## 10. SEO und Metadaten

Vorgeschlagener Title:

> Mica – Freie Zeit wird gemeinsame Zeit.

Vorgeschlagene Description:

> Mica hilft Freunden, freie Momente zu teilen, Aktivitäten zu planen und leichter zusammenzukommen. Für iOS und Android.

Erforderlich:

- Canonical: `https://micamapp.de`
- deutsche `lang`-Angabe;
- Open-Graph- und Social-Metadaten;
- statisches OG-Bild 1200×630 mit Wortmarke, Headline und ruhiger Smartphone-Komposition;
- `robots.txt` und `sitemap.xml`;
- Favicons aus der aktuellen Mica-Figur;
- `theme-color: #070910`;
- strukturierte Daten nur mit verifizierten Storelinks und ohne erfundene Ratings.

## 11. Accessibility und Reduced Motion

- Skip-Link zum Hauptinhalt.
- Semantische Landmarken und genau eine H1.
- Überschriftenhierarchie ohne Sprünge.
- Keyboard-Reihenfolge entspricht der visuellen Reihenfolge.
- Sichtbare Fokusindikatoren mit ausreichendem Kontrast.
- Bedienelemente mindestens 44×44 CSS-Pixel beziehungsweise großzügiger.
- Store-Badges und ein späterer QR-Code erhalten nur dann verständliche zugängliche Namen, wenn
  sie mit echten Zielen tatsächlich gerendert werden.
- Smartphone-Screens stehen als `<figure>` mit konkreter Beschreibung im DOM; Rahmen- und
  Reflexebenen sind dekorativ und `aria-hidden`.
- Farbe ist nie der einzige Bedeutungsträger für Open/Soon/Now.
- `prefers-reduced-motion: reduce`:
  - keine Logo-Sequenz;
  - keine Aurora-Bewegung;
  - keine Scroll-Scrub- oder Pinning-Animation;
  - alle drei Kern-Smartphones sofort in einer ruhigen, lesbaren Endkomposition;
  - beide Safety-Zustände ohne Übergangsabhängigkeit vollständig verständlich;
  - alle Texte sofort sichtbar;
  - funktionale Hover-/Fokuszustände bleiben erhalten.

## 12. Performance

- `next/image` beziehungsweise gleichwertige responsive Optimierung für Screenshots und OG-
  Assets.
- AVIF/WebP für die Webausgabe; PNG-Master bleiben als Produktionsquelle außerhalb des initialen
  Bundles.
- Exakte Bildmaße beziehungsweise Aspect Ratios reservieren.
- Hero-Bild priorisieren, weitere Screens lazy laden, solange die Scrollstory dadurch nicht beim
  Eintritt sichtbar nachlädt.
- Nur tatsächlich benötigte Fontgewichte laden.
- Keine Animation von `width`, `height`, `top` oder `left`.
- `will-change` nur während der aktiven Smartphone-Sequenz setzen und danach entfernen.
- Scrollhandler nicht manuell pro Frame ausführen; ScrollTrigger übernimmt die Synchronisierung.
- Auf einem durchschnittlichen Android-Gerät testen, nicht nur auf Desktop-Hardware.
- Keine horizontale Überbreite bei 360 px.

## 13. Abnahmekriterien

Die Umsetzung ist erst fertig, wenn alle Punkte erfüllt sind:

### Inhalt

- Die H1 lautet exakt „Freie Zeit wird gemeinsame Zeit.“
- Texte verwenden keine Beobachtungs-, Tracking- oder FOMO-Sprache.
- Open wird als freiwilliger Status und nicht als Activity dargestellt.
- Soon/Now werden als konkrete Aktivitäten dargestellt.
- Keine unbestätigten Produkt-, Store- oder Datenschutzversprechen.
- Pre-Launch-Zustand zeigt „Mica kommt bald“, keinen QR-Code und kein „Mica laden“.
- Die Kern-Screens erzählen konsistent dieselbe positive Brunch-Geschichte und enthalten keine
  unzusammenhängenden Testtitel oder „Egal“ als Marketing-Vibe.
- Anreise und Heimweg werden als zwei unterschiedliche Freigaben erklärt; nur die Anreise besitzt
  ein Aktivitätsziel.

### Responsive Design

- geprüft bei 360×800, 390×844, 768×1024, 1024×768, 1440×900 und 1920×1080;
- Desktop nutzt die Breite sichtbar und wirkt nicht wie eine schmale Mobile-Seite mit großen
  Außenrändern;
- Mobile ist eine eigene Komposition und kein verkleinertes Desktoplayout;
- kein horizontaler Scrollbereich.

### Motion

- genau eine große Scrollstory;
- genau drei vollständige Kern-Smartphones; die Safety-Bühne zeigt nur ein zusätzliches Gerät zur
  Zeit beziehungsweise rahmenlose Crops auf Mobile;
- Bewegung folgt dem Scrollen ruhig und reversibel;
- ein bewusster Scrollimpuls führt einen Story-Übergang vollständig zu Ende; die Desktop-Story
  benötigt keine 260-dvh-Langstrecke;
- Texte bleiben während der Bewegung lesbar;
- keine unendlichen Geräte-, CTA- oder Textanimationen;
- Reduced Motion liefert sofort den statischen Endzustand;
- Rückwärts- und schnelles Scrollen hinterlassen immer einen korrekten Zustand.

### Qualität

- TypeScript, ESLint und Production Build laufen sauber;
- Tastaturnavigation vollständig;
- Fokus wird nicht von Sticky Header oder Scrollstage verdeckt;
- Bilder haben reservierten Platz und verursachen keinen sichtbaren Layout Shift;
- alle Links haben reale Ziele oder einen klaren deaktivierten Zustand;
- rechtliche Seiten sind vorhanden und mit den bestehenden Quellen synchronisiert;
- echte Screenshots enthalten ausschließlich Seed-/Demodaten.
- synthetische Profilbilder werden aus dem lokalen Storage-Emulator geladen und sind nicht erst
  nachträglich in Marketingbilder montiert;
- ein dokumentierter lokaler Landing-Seed reproduziert Brunch-, Anreise- und Heimwegzustände,
  ohne Staging oder Produktion zu berühren.

## 14. Empfohlene Implementierungsreihenfolge für Codex

1. Diesen Spec vollständig lesen und die festen Entscheidungen extrahieren.
2. Bestehende Brandpfade und Rechtstexte aus den genannten Quellen prüfen.
3. Bestehendes `landing/` inventarisieren; funktionierende Brand-, Legal-, SEO- und
   Accessibility-Grundlagen bewahren.
4. Contentmodell auf Pre-Launch, erweiterte Mission und getrennte Safety-Texte aktualisieren.
5. Lokale synthetische Profilassets sowie reproduzierbare Brunch-/Anreise-/Heimweg-Seeds
   vorbereiten; niemals Staging oder Produktion verwenden.
6. Fünf freigegebene Screenmaster aus dem echten Development Client aufnehmen und optimieren:
   drei Kern-Screens plus zwei Safety-Zustände.
7. Mission, Featureübersicht, Safety und Coming-soon-Abschluss statisch und responsiv verfeinern.
8. Desktop- und Mobilelayout separat screenshotten; Abschnittsdichten statt globaler
   Maximalabstände verwenden.
9. Smartphone-Scrollstory auf `160–180dvh` verkürzen und auf vollständige, einrastende
   Storyübergänge umbauen.
10. Safety-Devicewechsel und einmalige Diagramm-/Linien-Reveals ergänzen.
11. Reduced Motion und No-JS-Fallback prüfen.
12. `/download` und Storekonfiguration auf ehrlichen Pre-Launch-Zustand umstellen; kein QR-Code.
13. Rechtliche Routen, SEO, OG-Bild, Sitemap und Robots prüfen.
14. Alle Abnahme-Viewports screenshotten und Layout/Motion iterieren.
15. Root-Seed-Tests sowie Landing-Typecheck, Lint, Production Build und
    Accessibility-/Performanceprüfung ausführen.

## 15. Noch zu liefernde externe Werte

Diese Werte sind bewusst nicht erfunden und müssen vor dem finalen Go-live eingetragen werden:

- späterer öffentlicher Apple-App-Store-Link;
- späterer öffentlicher Google-Play-Link;
- verbindliche Kontaktadresse für den Footer;
- finale Anbieterangaben in den Rechtstexten, falls dort noch Platzhalter stehen;
- freigegebene synthetische Profilporträts, falls im Claude-Kontext kein Bildgenerator verfügbar
  ist;
- freigegebene fünf Marketing-Screenmaster: drei Kern-Screens und zwei Safety-Zustände;
- gewünschtes Hosting und DNS-Ziel für `micamapp.de`.
