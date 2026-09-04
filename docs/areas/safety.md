# Safety-Modus „Heimweg"

Ausgelagert aus `AGENTS.md`. Lies diese Datei, wenn du an diesem Bereich arbeitest.

---

## Safety-Modus „Heimweg“

Der verbindliche Vertrag lebt in [docs/safety-mode.md](docs/safety-mode.md). Die Basis ist gebaut,
aber bis zu den dortigen Release-Gates nicht produktionsreif.

- **Einstiege (bewusste Revision Juli 2026 — „Präsenz ≠ Prominenz"):** Auf der KARTE gibt es einen
  stillen Schild-`RoundButton` in der Top-Bar (zweites Element links, RECHTS neben dem
  Profil-Button — das Profil bleibt als Identitätsanker außen in der Ecke, Plattform-Konvention;
  die Leiste bleibt symmetrisch: 2 Buttons · Suchfeld · 2 Buttons; gleiche Optik wie der
  Kalender-Button) — Begründung: Auffindbarkeit und Muskelgedächtnis sind bei einem
  Sicherheitsfeature selbst eine Sicherheitseigenschaft. **Ein Element, eine Bedeutung (Revision
  Juli 2026):** Der Schild ist AUSSCHLIESSLICH der eigene Heimweg — Ruhezustand → Start-Sheet,
  eigene Session → Konsole/Panel; er wechselt seine Funktion NIE danach, was andere tun (nachts
  tippen muss immer „meinen Heimweg starten" heißen), Färbung nur eigener Status. Während jeder
  eigenen Session pulsiert ein Ring in der eigenen Statusfarbe und das Schildsymbol atmet sehr
  dezent in der Größe (Blau ruhig, Orange schneller, Rot deutlich; Reduced Motion statisch), damit
  die laufende Freigabe nach dem Schließen der Konsole
  nicht vergessen wird; er bleibt
  auch im Heimweg-Fokus sichtbar. Er startet nie selbst Tracking oder Alarm. Die
  Kalenderkarte bekommt KEINEN eigenen Button. Zweiter stabiler Einstieg ist die
  Profil-Funktionskarte **„Sicher nach Hause"** (weit oben, gleiche Verzweigung).
  Alles über FREMDE Heimwege lebt in der `SafetyStatusPill` (unter der Suchleiste, ALLE Flächen):
  Freunde teilen + Fokus nicht offen → **pulsiert** in der ernstesten Signalfarbe (`worstStatus`
  aus `safetyTheme.ts` — der EINZIGEN Farb-/Wortquelle für Konsole/Panel/Pille/Marker; Blau
  langsam, Orange/Rot schnell, reduced motion statisch; endet beim Hinschauen) → Tap öffnet den
  Heimweg-Fokus. Im Fall-3-Fokus wird sie zur „Heimweg-Fokus verlassen"-Pille; das Fall-2-Panel
  hat ein eigenes Minimieren-Chevron. Eigene Session minimiert ohne fremde Heimwege → Rückweg in
  die Konsole. Das Begleiter-Sheet („Heimwege deiner Freunde", erreichbar über Marker-Tap im
  Fokus) dient ausschließlich dem empfangenen Heimweg; der eigene Start bleibt am Schild. Keine
  parallelen Heimweg-Einstiege in Activity-Details oder NearbySheet hinzufügen.
- **Safety-Session-Zustand darf nie am leeren RTDB-Pfad abbrechen:** Der Owner darf
  `heimwege/{uid}` immer lesen, auch wenn dort noch keine Session liegt oder sie gerade gelöscht
  wurde. Nur Begleiter benötigen weiterhin `retainUntil` + Audience-Freigabe. Sonst wird der
  Listener beim App-Start abgewiesen, sieht einen späteren Start bzw. das abschließende `null`
  nicht und die UI driftet vom Serverzustand. Direkt nach den nötigen Berechtigungen setzt der
  Client eine optimistische lokale Session und zeigt nach dem Sheet-Dismiss sofort die reguläre
  Konsole mit „Heimweg wird gestartet". Technische Backend-Phasen werden nicht aufgezählt. Bis
  Start-Callable und Standortdienst bestätigt sind, bleiben Safety-Aktionen deaktiviert; der
  RTDB-Listener gleicht anschließend die autoritative Session ab. Während der Anfrage pulsiert das
  Schild und darf den Start-Flow nicht erneut öffnen; beim Beenden ersetzt ein Pending-State die
  Safety-Aktionen und verhindert doppelte End-Anfragen.
- **Heimweg-Fokus (Begleit-Kartenmodus):** `heimwegFocusActive` (SafetyProvider, ABGELEITET — mit
  eigener Session ist es die offene Split-Konsole, ohne eigene der manuelle Schild-Toggle):
  Aktivitäten + Journey-Avatare + alles Karten-Chrome ausgeblendet (`hideActivities` in beiden
  Canvases + Gating in MapOverlay), sichtbar nur Heimweg-Marker + Schild. **Heimweg-Marker sind
  IMMER sichtbar — auch auf der normalen Karte zwischen den Aktivitäten** (Nutzerentscheidung
  Juli 2026; ersetzt eine kurzzeitige focus-only-Regel. Safety-Vertrag: ausdrücklich anvertraute
  Positionen — der Fokus blendet nur alles ANDERE aus). Sie zeigen ausschließlich Avatar, Name
  und den statusfarbenen Ring. Einstieg und Recenter fassen alle verfügbaren Positionen ein; Marker-Tap
  öffnet exakt die gewählte Person, POI-/Long-Press-Erstellung ist gesperrt. Zeitbasierte
  Datenlücken müssen per Tick neu abgeleitet werden, nicht nur bei einem RTDB-Event. Es gibt EINE Karte —
  der Fokus ist ein Filter über der immer gemounteten Hauptkarte, nie eine zweite Instanz. Drei
  Fälle: (1) nur eigene Session → Vollbild-Konsole (Modal) wie gehabt; (2) eigene Session +
  Freunde teilen → `SafetyConsolePanel` bildet ein festes, etwa halbhohes unteres Control-Deck:
  oben bleibt die Karte mit den begleiteten Personen sichtbar, der komplette untere Bereich gehört
  Heimwegstatus, Bestätigungen, Check-in, 112 und Hold-Buttons. Keine kleine freischwebende Karte
  und keine Activity-Bedienelemente in diesem Bereich; die frühere „Auch unterwegs"-Liste ist
  ersatzlos entfallen — die Karte zeigt es besser. (3) nur
  empfangen → Vollbild-Fokus ohne Panel. Es gibt keine zweite Ebene mehr, auf die MainSurface
  drehen müsste; `MapScreen` schließt beim Aktivieren nur die Kalenderkarte. Der Wechsel
  nutzt kurze Ease-out-Fades mit nur minimaler Skalierung/Vertikalbewegung; Karten-Chrome geht in
  125–190 ms, die Fokus-Ebene folgt leicht versetzt in höchstens 220 ms. Keine großen Flugwege,
  keine federnden Layoutwechsel und keine starke Kino-Vignette. Dieser Spezialübergang gilt NUR
  zwischen normaler Karte und Heimweg-Fokus; Safety-Sheets öffnen wie alle übrigen Bottom-Sheets
  mit der normalen Slide-Animation. Das Start-Sheet ist ein bewusster **Zwei-Schritte-Flow** (Nutzerentscheidung Juli
  2026): Schritt 1 = Übersichtsseite „Sicher nach Hause" (Hero-Schild, DREI Punkte: Live-Standort
  (grün — Ankunft UND Löschversprechen stecken im Text: „…bis du sicher zu Hause bist. Danach wird
  er gelöscht.") / „Ich fühle mich unsicher" (orange) / „Ich bin in Gefahr" (rot) — die Ich-Titel
  sind die nutzerseitigen Namen der Orange-/Rot-Modi und müssen mit den Konsolen-Buttons
  übereinstimmen. **Formulierungsregel:** beschreiben, was DU tust und was Freunde SEHEN können —
  nie, was deren Gerät tun wird. „Alarmieren" als eigene Absende-Handlung ist erlaubt; verboten
  sind Zustell-/Tonversprechen („sofort", „laut", „weckt" — das gehört dem OS);
  112-Ehrlichkeitszeile, „Weiter"), Schritt 2 =
  Personenauswahl „Wer sieht deinen Heimweg?" (Zurück-Pfeil, Chips/Suche/Checkboxen, „Heimweg
  starten · N"), mit Fortschritts-Punkten. **Revision August 2026 (ersetzt „Übersicht bei JEDEM
  Öffnen"):** Die Übersicht erscheint nur beim ERSTEN Öffnen (AsyncStorage
  `together.safety.introSeen.v1`); danach landet der Schild direkt auf der Personenauswahl —
  wer nachts den Heimweg startet, braucht die wenigsten möglichen Taps. Der Zurück-Pfeil der
  Auswahl hält die Übersicht jederzeit einen Tap entfernt; ein Storage-Fehler zeigt sie
  sicherheitshalber wieder. Für Emulator-Tests kann
  `seed-heimweg.mjs` eine zeitlich begrenzte Beispielsitzung erzeugen; die App enthält keine
  permanente clientseitige Demo-Sitzung. Der Schild führt in den Beobacht-Modus, der eigene Start
  läuft über Profil-Karte und Begleiter-Sheet („Eigenen Heimweg teilen", auch per Marker-Tap im
  Fokus erreichbar).
- **Konkrete Personen, bewusst verwaltet:** Nur bestätigte direkte Freunde. Gruppen/Enge Freunde/Alle
  sind Schnellauswahlen. Zusätzlich erscheint eine beigetretene, noch laufende `now`-Aktivität
  unter ihrem Namen als erste kontextuelle Schnellauswahl; sie enthält nur direkte Freunde aus der
  bekannten Teilnehmerliste, nie fremde Teilnehmer. Vor dem Start bleibt jede ausgewählte Person
  sichtbar und einzeln änderbar. Maximal 25 Empfänger. Während der Session öffnet ein Tap auf die
  Geteilt-/Bestätigt-Zeile die Begleiter-Verwaltung: alle Personen mit aktuellem Status, bewusstes
  Hinzufügen und Entfernen mit Bestätigung. Mindestens eine Person bleibt ausgewählt; andernfalls
  muss der Heimweg beendet werden. Hinzufügen/Entfernen läuft ausschließlich über
  `updateSafetyAudience`: Der Server prüft Freundschaft, Blockierungen, Limit und aktive Session,
  passt Audience + Fan-out an und entfernt beim Widerruf auch die Bestätigung. Eine in Orange/Rot
  neu hinzugefügte Person erhält den aktuellen Alarm und muss genau diesen bestätigen. Nie
  automatisch Personen ergänzen. Entfreunden oder Blockieren entzieht laufenden Safety-Zugriff
  serverseitig in beide Richtungen; ohne verbleibende Begleitperson endet die Session. Nach
  „Heimweg starten" zuerst das native Start-Sheet schließen und erst danach die Safety-Konsole
  öffnen — keine überlappenden Modals. Ein Functions-Cold-Start läuft hinter der sofort sichtbaren,
  noch deaktivierten Konsole und darf nie wie ein eingefrorener Button wirken.
- **Erreichbarkeit ist freiwillig und temporär:** Empfänger erhalten eine
  `safety_request`-Benachrichtigung und können „Ich bin erreichbar“ bestätigen. Eine Bestätigung
  gilt 30 Minuten und wird fünf Minuten vorher nur beim Begleiter lokal erinnert. Ohne Reaktion
  läuft sie still ab; „Nicht mehr erreichbar“ zieht sie sofort zurück und informiert den Owner.
  Diese allgemeine Bestätigung darf nur als „erreichbar“ bezeichnet werden.
  Jeder bewusste Wechsel auf Orange und jeder spätere Wechsel auf Rot erzeugt dagegen eine neue,
  eindeutig versionierte Alarm-Anfrage mit der Aktion „Ich habe dich im Blick“. Nur eine frische
  Bestätigung genau dieser Alarm-Version darf in Orange/Rot als „N schauen gerade zu“ gezählt
  werden; eine alte Erreichbarkeits- oder Orange-Bestätigung zählt nicht für Rot. Der Alarm wartet
  nie auf Bestätigungen und Rot/112 werden dadurch nicht blockiert.
- **Server-owned Trust Boundary:** Start, Verlängerung, Statuswechsel und Bestätigung laufen nur
  über `startSafetySession`, `extendSafetySession`, `setSafetyStatus` und
  `updateSafetyAudience`, `confirmSafetyCompanion`, `withdrawSafetyCompanion` bzw.
  `confirmSafetyAlert`.
  Orange/Rot/Entwarnung erzeugen dort Benachrichtigungen für die aktuell bewusst festgelegte
  Audience. Safety-Pushes werden über einen dauerhaften Firestore-`pushOutbox`
  asynchron zugestellt; der Callable wartet nie auf die externe Expo-API. Der Owner darf zusätzlich
  ausschließlich die komplette eigene `heimwege/{uid}`-Session löschen (kein Patch geschützter
  Felder); `cleanupSafetyIndexOnSessionDeleted` entfernt anschließend serverseitig den Fan-out.
  Status, Audience, Identität, Laufzeit, Bestätigungen und `heimwegeIndex` bleiben server-owned.
- Zustände Blau/Orange/Rot/Grün. **Rot ist ausschließlich eine bewusste Halte-Aktion**; keine
  Automatik löst Rot oder einen Notruf aus. Bei Rot ist „112 anrufen“ die erste sichtbare Aktion.
- Pushes enthalten nie Koordinaten. Zuhause wird nie als Pin/Ziel gespeichert. Kein
  `onDisconnect().remove()`: App-Tod oder Funkloch ist ein Datenabriss, kein sicheres Ende.
- **Stillstand und Ablauf:** Standardlaufzeit zwei Stunden. Zehn Minuten vorher fragt eine lokale
  Benachrichtigung direkt „Bist du schon zuhause?“ mit den Aktionen „1 Stunde verlängern“ oder
  „Sicher angekommen“; die Function akzeptiert die manuelle Verlängerung nur in den letzten
  15 Minuten. **Ohne Reaktion greift `autoExtendSafetySessions` (Scheduled Function, alle
  5 Minuten):** verlängert serverseitig um 20 Minuten, max. zweimal, PROAKTIV vor `expiresAt` —
  damit verschieben sich die lokal geplanten Warn-/Ende-Benachrichtigungen (hängen an
  `expiresAt`) automatisch mit, statt dass die Session sichtbar endet und wieder auftaucht.
  Bewusst kein `updatedAt`-Bump (sonst wirkt eine Session ohne neuen Fix fälschlich frisch) und
  bewusst KEIN Signal an Begleiter oder Owner („Keine Antwort seit …“ wäre reine Panikmache bei
  einer Routine-Frage am Ende eines normalen Blau-Heimwegs — dieselbe Zurückhaltung wie
  `deriveCompanionSignal`). Erst nach beiden Auto-Fenstern endet die Freigabe wie gehabt ehrlich
  als „Automatisch beendet · Ankunft nicht bestätigt“. Nach 45 Minuten ohne relevante
  Bewegung fragt eine lokale Benachrichtigung nach; erst zwei aufeinanderfolgende Punkte außerhalb
  eines 60-m-Radius setzen dieses Fenster zurück. Kleine GPS-Sprünge oder Bewegung innerhalb des
  Hauses zählen nicht. Unveränderte Punkte werden nicht laufend hochgeladen.
- Nach automatischem Ende sind Writes sofort gesperrt. Der letzte Punkt bleibt bei Blau 3 Minuten,
  bei Orange/Rot 30 Minuten schreibgeschützt für den zuletzt bewusst festgelegten Empfängerkreis lesbar und wird
  anschließend durch den bestehenden Cleanup-Lauf gelöscht.
- RTDB bleibt last-point-only. Der lokale 15-Minuten-Verlauf und das lokale
  Orange/Rot-Vorfallsprotokoll sind die dokumentierte Safety-Ausnahme. Cloud-Protokoll,
  Akku-/Empfangsstatus und echte Geräte-Push-/Hintergrundtests sind Release-Gates. Native
  Firebase-Builds nutzen nach explizitem Heimweg-Start `expo-task-manager` +
  `startLocationUpdatesAsync` (Blau ca. 30 s, Orange/Rot ca. 5 s), lokal wiederherstellbar,
  Android mit Foreground-Service-Meldung und iOS mit Standortindikator. OS-Drosselung/Force-quit
  bleiben ehrliche Plattformgrenzen; niemals eine ausbleibende Position als Ankunft deuten.

---

