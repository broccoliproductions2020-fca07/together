# Together — Backend-Plan (Firebase)

Stand: Juli 2026. Dieser Plan wurde aus dem bestehenden Projekt abgeleitet (Service-Seams,
Provider-Struktur, Privacy-Modell) — nicht als generische Firebase-Architektur übergestülpt.

## Leitprinzipien

1. **Service-Seam-Muster überall.** Wie `authService`: pro Domäne ein Interface,
   dahinter austauschbar `mock*Service` oder `firebase*Service`. UI und Provider
   ändern sich beim Backend-Wechsel nicht.
2. **Mock bleibt dauerhaft der Dev-Standard.** Umschaltung per
   `EXPO_PUBLIC_BACKEND=mock|firebase`. Web läuft immer mock (Karten sowieso).
3. **Emulator vor Cloud.** Firebase-Verhalten wird lokal gegen die Emulator Suite
   entwickelt (kostenlos, offline, `demo-together`-Projekt ohne Login). Echte
   Cloud erst für Staging/Release.
4. **Jedes Feature muss in BEIDEN Service-Implementierungen landen** (mock +
   firebase), sonst driftet der Mock-Modus ab.

## SDK-Entscheidung

**Native App: `@react-native-firebase`.** Auth, Firestore, Realtime Database,
Functions und Storage laufen auf iOS/Android über die nativen Firebase-SDKs. Das
bringt den persistenten Firestore-Cache, App Check und eine belastbare Grundlage
für Produktion. Der JavaScript-SDK bleibt nur als Node-Abhängigkeit der
Emulator-/Rules-Tests erhalten; Web bleibt dauerhaft Mock und ruft Firebase nicht auf.

Die Service-Seams halten UI/Provider vom SDK-Wechsel fern. Native Firebase verlangt
einen neuen Dev-/Preview-/Production-Build — nie ein OTA-Update — weil die Module
und Plattform-Konfiguration im Binary liegen.

## Datenmodell (Firestore)

```
users/{uid}                          Privates Profil: displayName, username, initials, avatarUrl,
                                     createdAt, pushTokens[], closeFriendUids[],
                                     profileVisibility: 'friends', friendRequestPolicy,
                                     friendshipsVersion (server-owned cache revision)
usernames/{username}                 → { uid }  (Eindeutigkeits-Claim, Transaktion)
friendships/{pairId}                 participantUids[], requesterUid, status,
                                     profiles[] (Profil-Snapshots, max. ein Doc pro Paar)
users/{uid}/privateCircles/{circleId} name, emoji?, friendUids[], createdAt, updatedAt
activities/{activityId}              hostId, mode (open|soon|now), title, note,
                                     audienceUids[] (denormalisiert!),
                                     startsAt, endsAt, visibleUntil, expireAt (TTL-Policy),
                                     place { label, lat?, lng?, visibility: pin|none },
                                     participants[] { uid, displayName, initials },
                                     category? (Enum, s. firestore.rules),
                                     status: active|expired
chats/{roomId}                       type: activity|group, memberIds[], vibe?,
                                     lastMessage { text, authorName, at },
                                     readAt { uid: timestamp }
chats/{roomId}/messages/{messageId}  authorId, authorName, initials, text,
                                     kind: text|proposal, proposal?, createdAt
```

- `roomId == activityId` bzw. `groupId` — entspricht dem bestehenden Raum-Schlüssel im `ChatProvider`.
- **Kalender-Pläne sind KEINE eigene Collection** — sie leiten sich aus `activities` ab
  (wie heute im `ActivityEntityProvider`).
- **Activity-Lifecycle:** Bearbeiten und Absagen laufen ausschließlich über Callables.
  Eine Zeitänderung verschiebt `activities.visibleUntil` (Karte/Kalender) und
  `activities.expireAt` plus `chats/{activityId}.expireAt` (Chat-Retention)
  gezielt; eine Startzeitänderung setzt eine alte Anreise-Erinnerung zurück. Ab
  `visibleUntil` landet eine Activity nicht mehr im Feed und ist serverseitig nicht
  mehr beitretbar. Eine Absage blendet sie sofort aus, beendet mögliche Anreise-Daten
  und lässt den Activity-Chat noch 12 Stunden erreichbar.
  **Migration vor dem ersten Cloud-Release:** Bestehende Activity-Dokumente brauchen
  einmalig `visibleUntil = endsAt` (oder bei alten Dokumenten `startsAt`). Ohne dieses
  Feld matchen sie bewusst nicht die neue, günstige Feed-Query. Emulator-Seeds enthalten
  das Feld bereits. `npm run test:activity-backfill` prüft den Backfill ausschließlich
  im Emulator; `npm run backfill:activity-visible-until -- --apply` ist ebenfalls hart
  auf einen lokalen Emulator beschränkt und kann keine Cloud-Daten berühren.
- **Ein Sichtbarkeitsraum pro Activity:** Beim Erstellen wird genau ein Kontext
  (`all_friends`, `close_friends` oder eine private Gruppe) serverseitig zu einem
  UID-Array aufgelöst. Es gibt keine Personenliste, keine Ausschlüsse und keine
  Kombination mehrerer Gruppen. „Freunde“ sind ausschließlich angenommene
  1:1-Freundschaften; private Gruppen sind nur persönliche Auswahl-Listen und
  werden nie mit anderen geteilt. Haupt-Feed =
  EINE Query: `activities where audienceUids array-contains me and status == 'active'`.
  Der Server löst den Kontext gegen bestätigte Freundschaften erneut auf. Das
  Veröffentlichen ist passiv: Personen im Sichtbarkeitsraum sehen die Activity
  im Feed bzw. auf der Karte, erhalten dabei keine Benachrichtigung. Wer sie sieht,
  darf beitreten, solange sie nicht voll ist.
- **Profile & Freundschaftsanfragen:** Es gibt kein clientlesbares Profilverzeichnis.
  Vollständige Kontakt-Snapshots erhält nur eine angenommene 1:1-Freundschaft;
  offene Anfragen und Activity-Teilnehmer enthalten nur Name/Initialen. Neue
  Anfragen folgen der Einstellung `anyone | shared_activity | nobody`. Der
  kontextuelle Weg prüft serverseitig mit genau einem Activity-Read, dass beide
  Personen tatsächlich Teilnehmer derselben Activity sind. QR-Codes folgen
  dem normalen Username-Weg und umgehen diese Regel nicht.
- Einstellungen (Radius, Theme) bleiben gerätelokal in AsyncStorage — nicht synchen.

## Realtime DB / Storage / Functions

- **Realtime Database: NUR für flüchtige Live-Standorte (Journey + Safety).** Grobe
  Nähe-Standorte bleiben Firestore + clientseitige Berechnung (`nearbySelectors`).
  RTDB wird gezielt für Live-Journey-Sharing und `heimwege/*` genutzt:
  - `journeys/{activityId}/{uid}` = `{ lat, lng, updatedAt, status: onTheWay|arrived }`
  - Explizit opt-in ("Ich bin unterwegs"-Button), nur für Teilnehmer der Aktivität
    lesbar (RTDB-Rules prüfen Mitgliedschaft), 30-Sekunden-Zielwert über den unten
    beschriebenen nativen Hintergrundtask.
  - Zeitlich hart begrenzt (arrived / Aktivitätsstart+Puffer / max 2 h) und flüchtig:
    letzter Punkt wird überschrieben (KEIN Bewegungspfad), `onDisconnect` räumt auf.
  - "Gleich da" = Luftlinie + Aktualität, KEINE Directions-API (Kosten).

### Journey / Live-Anreise (aktueller Stand)

> **Aktueller Produktionsvertrag (Juli 2026 — ersetzt die älteren
> Foreground-only-Hinweise darunter):** `expo-task-manager` übernimmt die explizit
> aktivierte, native Anreise-Automatisierung. Rund 60 Minuten vor Beginn erhält
> jeder zugesagte Teilnehmer genau eine Aktion **„Anreise automatisch teilen“**.
> Android verarbeitet diese Aktion bei gesperrtem Gerät im Hintergrund, ohne einen
> Activity-Screen zu öffnen. iOS kann eine gekillte App nicht verlässlich für eine
> Aktionsantwort wecken; bei einer nur hinterlegten App funktioniert sie, ansonsten
> bleibt die In-App-Aktivierung der sichtbare Fallback.
>
> Bis T−30 wird kein Standort gespeichert oder an Firebase geschrieben. Ab T−30
> verlangt Together zwei brauchbare Standortpunkte mit echter Bewegung — die Richtung
> zum Ziel spielt keine Rolle. Erst dann entsteht der erste RTDB-Live-Punkt. RTDB
> enthält weiter nur den letzten Punkt pro Teilnehmer, niemals einen Verlauf. Zwei
> Punkte im 100-m-Radius beenden die Anreise; der letzte „angekommen“-Punkt bleibt
> höchstens 15 Minuten sichtbar. Android zeigt während der aktivierten
> Hintergrund-Ortung seine verpflichtende Systemmeldung, iOS den nativen
> Standortindikator. Ein neuer Development/Release-Build ist erforderlich.

Backend-Seam + Emulator-Rules sind vorhanden; echte GerÃ¤te-Standortlogik ist bewusst noch nicht aktiv.

```
journeys/{activityId}/members/{uid}: true
journeys/{activityId}/locations/{uid}: {
  lat,
  lng,
  status: "onTheWay" | "arrived",
  updatedAt,
  expiresAt
}
```

- `journeyService` schaltet per `EXPO_PUBLIC_BACKEND` zwischen Mock und RTDB.
- RTDB speichert nur flÃ¼chtigen Live-Zustand: ein aktueller Punkt pro Teilnehmer, kein Verlauf.
- Rules erlauben Lesen nur fÃ¼r Mitglieder und Schreiben nur auf den eigenen Location-Knoten.
- Smoke-Test: `npm run test:journey-rtdb` startet Auth + Database Emulator und prÃ¼ft die Rules.
- Nach der bewussten Freigabe „Anreise mit Teilnehmern teilen“ holt der Client den
  aktuellen Standort und aktualisiert ihn im Vordergrund höchstens alle 30 Sekunden.
  Eine native Statusbenachrichtigung macht den sichtbaren Start und die Ankunft klar.
- Eine einzige serverseitige Erinnerung wird rund 60 Minuten vor Beginn an zugesagte
  Teilnehmer ausgelöst: „Anreise mit Teilnehmern teilen?“. Der Scheduler markiert
  die Activity idempotent, damit keine doppelten Erinnerungen entstehen.
- Eine automatische Bewegungserkennung bei gesperrter oder beendeter App ist bewusst
  noch nicht Teil des Produktionsvertrags: iOS/Android garantieren keinen exakten
  Start einer Hintergrundaufgabe. Der manuelle Start bleibt der zuverlässige Fallback.
- ✅ `onDisconnect().remove()` auf dem eigenen Location-Knoten (Start/Update) räumt
  auf, wenn die Verbindung stirbt (App gekillt / Netzverlust). Ersetzt die fehlende
  RTDB-TTL für den häufigsten Fall.

#### Journey-Härtung (umgesetzt)

- `ensureJourneyMember` prüft die Activity-Teilnahme serverseitig und setzt die
  RTDB-Mitgliedschaft mit dem Admin SDK. Clients können `members` nicht verändern.
- `cleanupJourneys` entfernt abgelaufene Journey-Knoten periodisch; der Client
  filtert abgelaufene Daten zusätzlich sofort aus der UI.
- `setJourneyLiveStatus` hält nur eine standortfreie Anzahl auf dem Activity-Dokument.

### Safety / Heimweg (Basis umgesetzt)

- Service-Seam `safetyService`: In-Memory-Mock und Firebase-Implementierung.
- RTDB `heimwege/{ownerUid}` enthält genau eine aktive Session mit letztem Punkt,
  Status, Check-in, bewusst festgelegter Audience und temporären Bestätigungen.
- `heimwegeIndex/{companionUid}/{ownerUid}` fan-outet nur aktive Sessions. Damit
  bleibt es bei einem Index-Listener plus wenigen Listenern für tatsächlich aktive Heimwege.
- `startSafetySession` akzeptiert höchstens 25 eindeutige, bestätigte direkte Freunde,
  schreibt Session/Index serverseitig und erzeugt `safety_request`-Benachrichtigungen.
- `setSafetyStatus` besitzt die Status-Trust-Boundary: Orange, Rot und Entwarnung werden
  serverseitig in RTDB geschrieben und erzeugen für die aktuell festgelegte Audience passende In-App-
  und Push-Benachrichtigungen. Orange und Rot erhalten jeweils eine monotone `alert.at`-Version;
  ein Client kann den Status nicht direkt an den Alarmen vorbeischreiben.
- `confirmSafetyCompanion` prüft Audience und Ablauf serverseitig, schreibt eine
  45-Minuten-Erreichbarkeitsbestätigung und benachrichtigt den Owner. `confirmSafetyAlert` akzeptiert
  nur die exakte aktuelle Orange-/Rot-Version und schreibt eine davon getrennte, temporäre
  „Ich habe dich im Blick“-Bestätigung. Dadurch benötigen Orange und Rot jeweils eine neue Zusage,
  ohne einen weiteren Listener einzuführen. Für das bewusste Ende darf der Owner per
  enger RTDB-Regel ausschließlich die komplette eigene Session löschen; Begleiter verlieren den
  Zugriff sofort und `cleanupSafetyIndexOnSessionDeleted` entfernt den server-owned Fan-out-Index.
- `updateSafetyAudience` ist der einzige Mutationspfad für einen laufenden Empfängerkreis. Die
  Function prüft bestätigte Freundschaft, Blockierungen, aktive Session, 25er-Limit und mindestens
  eine verbleibende Person. Sie aktualisiert RTDB-Audience, Bestätigungen und Fan-out; neu
  hinzugefügte Personen erhalten die normale Anfrage oder in Orange/Rot den aktuellen Alarm. Der
  bestehende Session-/Index-Listener reicht aus, zusätzliche dauerhafte Reads entstehen nicht.
- Entfreunden oder Blockieren widerruft bestehende Safety-Berechtigungen serverseitig in beide
  Richtungen; eine Session ohne verbleibende Begleitperson wird beendet.
- Safety-Callables schreiben In-App-Mitteilungen und einen dauerhaften `pushOutbox`-Auftrag in
  einem Firestore-Batch. `deliverPushOutbox` übernimmt Expo Push mit Retry, sodass die externe API
  den Sessionstart nicht blockiert und die Zustellung nicht bloßes Fire-and-forget ist.
- RTDB-Rules erlauben dem Owner ausschließlich den letzten Standort, die Antwort auf einen
  vorhandenen Check-in und das vollständige Löschen der eigenen Session. Status, Audience,
  Identität, Laufzeit, Bestätigungen und Index sind ausschließlich server-owned.
- Native Firebase-Builds verwenden für eine ausdrücklich gestartete Heimweg-Session einen
  wiederherstellbaren `expo-task-manager`-Standorttask (Blau etwa 30 s, Orange/Rot etwa 5 s),
  überschreiben weiterhin nur den letzten RTDB-Punkt und stoppen standardmäßig nach zwei Stunden.
  Zehn Minuten vorher kann der Nutzer bewusst um eine Stunde verlängern; der Server akzeptiert die
  Aktion ausschließlich in den letzten 15 Minuten. 45 Minuten ohne relevante Bewegung lösen eine
  lokale Rückfrage aus; erst zwei aufeinanderfolgende Punkte außerhalb eines 60-m-Radius setzen das
  Stillstandsfenster zurück. Unveränderte Punkte werden nicht laufend geschrieben.
  Android nutzt einen Foreground Service, iOS Background Location; OS-Drosselung bleibt sichtbar
  über die Aktualitätsanzeige und ist Teil der echten Geräte-Release-Tests.
- Es gibt bewusst kein `onDisconnect`-Delete: Ein App-/Netzabbruch darf nicht wie ein
  sicheres Ende aussehen. Regeln verweigern nach `expiresAt` jeden weiteren Standort-Write.
  Begleiter sehen den letzten Punkt bei Blau noch 3 Minuten, bei Orange/Rot 30 Minuten
  schreibgeschützt und eindeutig als „Automatisch beendet · Ankunft nicht bestätigt“.
  Der bestehende 15-Minuten-`cleanupJourneys`-Lauf entfernt danach Safety-Session und Fan-out-Index
  (kein zweiter Scheduler und damit keine Zusatzkosten).

### Presence / Offen-Status (umgesetzt)

Der „Ich bin offen"-Status ist als **Service-Seam** gebaut (`src/features/presence/`):
Mock offline per Default, Firestore bei `EXPO_PUBLIC_BACKEND=firebase`. Modell wie
der Activity-Feed — konsistent, kostenbegrenzt, DoS-sicher:

```
presence/{uid}: {
  uid, displayName, initials, avatarUrl?,
  vibe?: { label, emoji? },
  expireAt (Timestamp, TTL),
  shareLocation: bool,
  coarseLocation?: { lat, lng },   // NUR wenn shareLocation; sonst Feld ABWESEND
  audienceUids: [ ...Freunde ],    // max 50
  updatedAt
}
```

- **Ein Listener, nur bei sichtbarer Karte:** `presence where audienceUids array-contains me`,
  `limit(50)`, abgelaufene clientseitig gefiltert → **kein Composite-Index** nötig.
  Andere Oberflächen halten den Listener bewusst nicht offen; der eigene
  Offen-Status wird davon unabhängig weitergeschrieben.
- **Schreiben nur eigenes Doc** (`setDoc` ohne merge → ganzes Doc ersetzt).
- **Standort-Privatsphäre:** „auf privat" schreibt das Doc **ohne** `coarseLocation`
  (Feld wirklich entfernt, nicht nur ein Flag). „offline/aus" = `deleteDoc` →
  Freundes-Listener bekommen es **sofort** mit (nicht erst per TTL). Standort ist
  bewusst **grob** (~110 m, 3 Nachkommastellen) und läuft mit dem Status ab.
- **Rules:** `presence/{uid}` — Lesen nur für `audienceUids`, Schreiben/Löschen nur
  vom Owner, Feld-/Größen-Limits (`validPresence`). Löschen hier **erlaubt** (Owner)
  — bewusste Ausnahme fürs sofortige Privat-/Offline-Stellen.
- **TTL-Policy** auf `presence.expireAt` in der echten Cloud einrichten (Backstop;
  Default-Dauer 3 h). Bis dahin filtert der Client abgelaufene raus.
- Nearby-Liste/Pille: im Firebase-Modus aus echter Präsenz (`presenceToNearby`,
  Haversine-Distanz zur eigenen Position); Mock-Modus behält `mockNearbyFriends`.

### Datenlebensdauer (Retention)

- **Chats sind vergänglich (Produktentscheidung + DSGVO-Datenminimierung):**
  Activity-Chats laufen **12 h nach Aktivitätsende** ab, offene Gruppen nach
  **30 Tagen Inaktivität**. Umsetzung: `expireAt` auf Raum + Messages,
  Firestore-**TTL-Policy** löscht automatisch. Hinweis im Chat-Header anzeigen.
  Keine gesetzliche Aufbewahrungspflicht für Chatinhalte; Löschen ist die
  datenschutzfreundliche Position.
- Abgelaufene Activities: `visibleUntil` beendet die Feed-Sichtbarkeit exakt;
  `expireAt` löscht die Activity erst nach dem kurzen Chat-Aufbewahrungsfenster.
- Journey-Standorte: Sekunden-Lebensdauer, nie historisiert.
- **Storage:** nur Avatare (`avatars/{uid}.jpg`), Client-seitiges Resize vor Upload.
- **Cloud Functions (production foundation):**
  Activity-/Teilnehmer-Lifecycle, `searchPlaces`, serverseitige Presence- und
  Chat-Mitgliedschaft, Freundschaftsanfragen, private Circle-Validierung,
  Username-Transaktion, Socialize,
  Push-Token/Benachrichtigungen, Moderation, Account-Löschung und Journey-
  Cleanup laufen über Callable Functions bzw. Firestore-Trigger. Jede Funktion
  validiert Auth, Eingabe, Mitgliedschaft und Rate-Limit serverseitig.
- **Alles Lesende läuft clientseitig** mit Security Rules (Latenz + Kosten).

## Security & Kosten

### Spam & Missbrauch — Schichtenmodell (Status)

1. ✅ Rules: Auth-Pflicht, nur Mitglieder schreiben, Größen-/Mitglieder-Limits,
   Unveränderlichkeit, keine Client-Deletes. Spam-Radius strukturell klein
   (Freundes-Räume ≤ 25, keine Fremden erreichbar).
2. ✅ Kosten-Airbags: Query-Limits, TTL, (in echter Cloud) Tages-Quotas + Budget-Alerts.
3. ⚠ OFFEN: hartes Rate-Limit gegen skriptbasierten Spam durch legitime
   Mitglieder. Rules allein können das nicht wasserdicht. Schließt sich durch:
   **App Check** (nur die echte App darf reden — Hauptschutz; Schritt 8) und
   **Functions-Rate-Limit** (X Nachrichten/Minute/Nutzer; Schritt 5).
   Später Produktfeatures: Raum verlassen, Nutzer blockieren/melden.

- Rules: default-deny; Mitgliedschaft über Array-Felder des Dokuments selbst
  (`request.auth.uid in resource.data.memberIds/audienceUids`) — keine `get()`-Kaskaden.
- Nachrichten: nur Mitglieder, Autor unveränderlich, Länge begrenzt; Proposal-Updates
  nur eigene UID in `confirmedBy` / `planned` nur durch Autor.
- Standort: Koordinaten-Feld existiert nur bei `visibility == 'pin'` (wie im Mock:
  `none` hat gar keine Koordinate/Distanz).
- App Check: nativer Client ist implementiert; vor Cloud-Enforcement müssen die
  Plattformdateien, Apple App Attest und Android Play Integrity konfiguriert und
  in einem echten nativen Build verifiziert werden.
- **Listener-Budget:** Der Activity-Feed ist dauerhaft; Chat-Raum-Summaries liegen
  gerätelokal im Cache, werden beim Foreground einmalig abgeglichen und nur solange
  die sichtbare Activity-/Chatliste geöffnet ist live gestreamt. Nachrichten werden
  nur für den geöffneten Raum gestreamt. Ein Chat-Push enthält lediglich room id
  und Zähler, nie Nachrichtentext; er setzt lokal einen Hinweis und ersetzt den
  Firestore-Abgleich nicht. Präsenz, Einstellungen,
  Sperrliste sowie aktive Journey-/Safety-Sessions haben eigene, begründete und begrenzte
  Listener. Freundschaften und private Gruppen sind ausdrücklich **keine** Dauerlistener:
  beide werden pro Konto lokal gecacht. Die Freundschaftsliste lädt nur nach einer
  serverseitig auf dem bereits abonnierten `users/{uid}`-Dokument signalisierten
  `friendshipsVersion` erneut; Gruppen werden beim Öffnen ihrer Oberfläche einmalig
  geladen. Jede Firestore-Query bleibt `limit()`-begrenzt.
- Budget-Alerts ab Tag 1 der echten Cloud-Nutzung.
- **Chat-Burst-Grenzen:** Gruppen haben maximal 25 Mitglieder; Activities bleiben
  produktseitig bei maximal 50 Teilnehmern. Zusätzlich akzeptiert
  `sendChatMessage` höchstens 60 Nachrichten je Raum und Minute sowie 30 je
  Person und Minute. Beide Zähler liegen serverseitig im selben Firestore-
  Transaction-Commit wie Nachricht und Raum-Summary, laufen nach einer Minute
  über `rateLimits.expireAt` aus und sind keine Client-Sperre.

## Karten/Orte — ENTSCHIEDEN: "Option A" = Google Maps auf beiden Plattformen

Begründung: POI-Antippen (`onPoiClick`) — der Kern-Flow "Ort antippen → Activity
dort erstellen" — funktioniert in react-native-maps NUR mit dem Google-Provider
(verifiziert: nur in `AirGoogleMaps` implementiert; Apple Maps hat keinerlei
POI-Klick). Außerdem: Google-Places-Daten dürfen nur auf Google-Karten angezeigt
werden → mit Google-Karte auf beiden Plattformen ist Google Places die EINE
legale Such-API für alles. OSM/Photon wurde getestet und verworfen
(POI-Lücken bei Restaurants); Apple Maps Server API entfällt (an Apple-Karten
gekoppelt, auf der Android-Google-Karte nicht erlaubt).

- **Rendering:** Google Maps SDK mobil = unbegrenzt kostenlos (beide Plattformen).
  Keys per `app.config.js` aus `.env` injiziert (`GOOGLE_MAPS_API_KEY_ANDROID/_IOS`),
  in der Cloud-Konsole auf App-Signatur/Bundle-ID beschränkt.
- **Provider-Logik in `MapCanvas`:** Android immer Google; iOS Google nur im
  Dev-/Release-Build mit Key; iOS in Expo Go fällt auf Apple Maps zurück (Expo Go
  hat kein Google-SDK auf iOS — dort sind POI-Labels nicht antippbar, Ausweich:
  Long-Press/Suche). Web bleibt MockMapCanvas.
- **POI-Namen:** `onPoiClick` (gratis, gebaut). Reverse Geocoding: `expo-location` (gratis).
- **Ortssuche:** Google Places (New) läuft hinter einer `searchPlaces`-Cloud-Function
  (Key nur serverseitig). Kostenkontrolle: Field-Mask nur name/adresse/position/kategorie
  (günstigste Tiers, keine Fotos/Öffnungszeiten), Debounce + Session-Tokens,
  Freikontingent/Monat, **hartes Tages-Quota in der Cloud-Konsole** (Anfragen
  schlagen fehl statt Geld zu kosten; App fällt auf POI-Tap zurück).
- Voraussetzung fürs iOS-Google-Rendering: EAS Dev Build (kommt ohnehin, Plan Schritt 6+).

## Reihenfolge

0. ✅ Entscheidungen: nativer Firebase-SDK für iOS/Android; Freundschaften = explizite 1:1-Beziehungen, Circles = private Listen.
1. ✅ **Auth:** `firebaseAuthService`, `users/{uid}`, Emulator-Anbindung.
2. ✅ **Service-Seams:** `chatService` + `activityService` (Interface + mock + firebase),
   Provider umgestellt, UI unverändert. Listener-Budget eingehalten (Feed,
   gecachte/on-demand Raumliste, offener Raum). `lastMessage`/`messageCount`/`readCount` denormalisiert
   (Unread ohne Message-Reads). TTL-Felder (`expireAt`) überall gesetzt.
3. ✅ **Rules:** default-deny, users/activities/chats+messages, Größen- und
   Mitglieder-Limits, Autor-Unveränderlichkeit, Self-Join-Regel; per Emulator-
   Smoke-Test verifiziert (gültig 200 / Fremd-Host 403 / Nicht-Mitglied 403).
   ⚠ Gelernt (Juli 2026): **Read-Rules müssen für LIST-Queries beweisbar sein.**
   Bedingungen wie `expireAt > request.time` oder `keys().hasAll(...)` sind aus
   Query-Filtern nicht ableitbar → JEDER Listener wird still abgelehnt (`get`
   einzelner Docs funktioniert, deshalb haben die Smoke-Tests es nicht gesehen).
   Read-Rules prüfen deshalb nur die Privacy-Grenze (Audience/Membership);
   Ablauf/Frische erzwingen Query-Filter + Client + TTL. Neue Read-Rules immer
   zusätzlich mit einer echten List-Query testen, nicht nur mit `get`.
   Composite-Indexe in firestore.indexes.json.
   ⚠ Übergangslösungen bis Functions (Blaze): `audienceUids = [uid]` (Activities
   nur für den Ersteller sichtbar, bis Circles/Freunde kommen);
   lastMessage-Denormalisierung schreibt der Client (rules-beschränkt) statt
   `sendChatMessage` transaction (the message, room summary and retention
   deadline are committed together to avoid a second trigger write cycle).
4. ✅ **Freunde & private Circles:** `friendService` (Seam + mock + Firebase)
   cached offene und angenommene Anfragen lokal und lädt nur neu, wenn die
   serverseitige `friendshipsVersion` im bestehenden Nutzer-Dokument wechselt.
   Requests werden per eindeutigem Username (oder QR-Deep-Link)
   oder nach einer gemeinsamen Activity gesendet und müssen ausdrücklich
   angenommen werden. Die Richtlinie der Zielperson wird serverseitig geprüft;
   QR ist kein Bypass. Vollständige Profile liegen erst nach Annahme als
   Snapshots auf dem Freundschaftsdokument, daher keine Zusatz-Reads pro Zeile.
   `circleService` verwaltet nur noch owner-private Listen unter `users/{uid}`;
   der Server akzeptiert darin ausschließlich bestätigte Freunde. Die Audience
   von Activities wird aus genau einem Sichtbarkeitsraum und diesen Freundschaften
   berechnet und serverseitig erneut geprüft.
5. **Cloud Functions und produktive Lifecycles:** umgesetzt für Activities,
   Teilnehmer, Chats, Freundschaften/private Circles, Presence, Socialize, Moderation, Push-Token,
   Account-Löschung und `cleanupJourneys` (abgelaufene RTDB-`journeys` löschen
   — fehlende TTL). Callable-Eingaben bleiben serverseitig validiert und
   begrenzt; die Emulator-Suite ist der lokale Integrationspfad.
6. Push (Expo Push + Trigger; braucht Dev Builds).
7. "Unterwegs"-Feature (RTDB, siehe oben) + Standort-Teilen.
8. Storage/Avatare, App Check (natives SDK), Rules-Tests automatisiert, Budget-Alerts.
   **Release-Gate:** In Produktion MUSS `FUNCTIONS_ENFORCE_APP_CHECK=true` in der
   Functions-Umgebung gesetzt sein — der Flag steht lokal/Emulator bewusst auf aus,
   ohne ihn sind alle Callables aus beliebigen Skripten aufrufbar (Auth + Rate-Limits
   greifen weiter, aber die Geräte-Attestierung fehlt).
   **Aktueller Stand:** Der native Client und der App-Check-Provider sind integriert;
   `firebase/native/google-services.json` und `firebase/native/GoogleService-Info.plist`
   fehlen absichtlich noch und sind Git-ignoriert. Vor dem Aktivieren müssen Android
   Play Integrity sowie iOS App Attest mit DeviceCheck-Fallback in Firebase Console
   konfiguriert sein. Dann ein echter nativer Build, App Check zunächst im
   Monitoring-Modus prüfen und erst danach für Functions erzwingen. Ein Flag ohne
   diesen Client-Rollout würde echte Nutzer vollständig aussperren und ist kein Schutz.
   **Zweites Release-Gate (Juli 2026):** Gastkonten (`signInDemo`) gibt es im
   Produktivsystem nicht mehr — `firebaseAuthService.signInDemo` lehnt sie ab, sobald
   die App gegen ein echtes Cloud-Projekt statt die Emulator Suite läuft
   (`USE_EMULATORS` in `src/shared/services/firebase.ts`). Passend dazu MUSS
   `FUNCTIONS_ENFORCE_EMAIL_VERIFICATION=true` in der Functions-Umgebung gesetzt
   werden: `requireVerifiedAuth` (functions/index.js) verlangt dann für alle
   schreibenden Callables ein bestätigtes `email_verified`, außer für Lesezugriffe,
   `claimUsername` (läuft während der Registrierung selbst), `blockUser`/
   `unblockUser`/`reportUser` und `deleteMyAccount` (Selbstschutz bzw. Ausstieg
   müssen immer funktionieren) sowie die gesamte Safety/Heimweg-Domäne (darf nie
   zusätzliche Reibung bekommen, siehe docs/safety-mode.md). Beide Flags bleiben für
   die lokale Emulator Suite aus, weil deren anonyme Test-Accounts sonst von jeder
   geschützten Aktion ausgesperrt wären.

## Offene Punkte / Risiken

- Dev-/Preview-/Production-Builds (EAS) sind für jede native Firebase-Änderung
  nötig; reine UI/JS-Änderungen bleiben OTA-fähig.
- `audienceUids` ist ein Sichtbarkeits-Snapshot. Änderungen an privaten Circles
  wirken nur auf neue Activities; das Entfernen einer Freundschaft stoppt
  Presence sofort, bereits beigetretene kurzlebige Pläne laufen bewusst zu Ende.
- Apple-Login-Pflicht auf iOS, falls Google-Login angeboten wird.
- Web-Target bleibt dauerhaft Mock (Dev-Umgebung, kein Produkt).
- Emulator-Voraussetzung: Firestore-Emulator braucht Java 11+ (JDK).
