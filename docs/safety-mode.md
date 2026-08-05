# Together — Safety-Modus „Heimweg“

Stand: Juli 2026 · Status: **technische und visuelle Basis gebaut; nicht releasebereit**.

Der Safety-Modus ist ein eigenständiger, activity-unabhängiger Heimweg-Modus. Er ist bewusst
kein Notruf-Ersatz und darf nie mehr Sicherheit versprechen, als das Gerät und die erreichbaren
Personen tatsächlich liefern können.

## Einstieg

Bewusste Revision (Juli 2026): Ein früherer Stand sah im Ruhezustand gar kein Karten-Element vor.
Das wurde revidiert — **Auffindbarkeit und Muskelgedächtnis („der Knopf ist immer an derselben
Stelle") sind bei einem Sicherheitsfeature selbst eine Sicherheitseigenschaft.** Alarmistisch wirkt
Prominenz, nicht Präsenz: erlaubt ist ein stilles Chrome-Element, nie eine schreiende Dauer-Pille.

- **Karte:** Schild-Button in der Top-Bar, rechts neben dem Profil-Button — das Profil
  bleibt als Identitätsanker außen in der Ecke (Plattform-Konvention); die Leiste bleibt
  symmetrisch und das Suchfeld mittig. Gleiche Optik wie der Kalender-Button. Bei minimierter
  eigener Session pulsiert ein Ring in der eigenen Statusfarbe; bei reduzierter Bewegung bleibt
  er statisch. Kalender und Socialize bekommen KEINEN eigenen Button.
- **Ein Element, eine Bedeutung (Revision Juli 2026):** Der **Schild** ist AUSSCHLIESSLICH der
  eigene Heimweg — Ruhezustand → Start-Sheet, eigene Session → Konsole/Panel. Er wechselt seine
  Funktion NIE danach, was andere tun (das Muskelgedächtnis im Bedarfsmoment darf nicht brechen:
  nachts tippen muss immer „meinen Heimweg starten" heißen). Färbung nur nach eigenem Status;
  außerhalb der eigenen Konsole pulsiert er als Erinnerung an die laufende Freigabe. Er startet
  niemals selbst Standortfreigabe oder Alarm — und bleibt auch im
  Heimweg-Fokus sichtbar, damit man von dort jederzeit den eigenen Heimweg starten kann.
- Alles über FREMDE Heimwege lebt in der **Status-Pille** (`SafetyStatusPill`, unter der
  Suchleiste, auf ALLEN Flächen): Teilen Freunde und der Fokus ist nicht offen, **pulsiert** sie
  in der ernstesten Signalfarbe („es gibt etwas zu sehen und du siehst es gerade nicht" — endet
  beim Hinschauen; Blau langsam atmend, Orange/Rot schnell, reduzierte Bewegung statisch) → Tap
  öffnet den Heimweg-Fokus. Im Fall-3-Fokus wird sie zur ruhigen „Heimweg-Fokus verlassen"-Pille;
  das Fall-2-Panel verlässt man über sein Minimieren-Chevron. Eigene Session minimiert ohne
  fremde Heimwege → Rückweg in die Konsole (wichtig auf Kalender/Socialize, wo es keinen Schild
  gibt).
- Das Begleitungs-Sheet dient ausschließlich dem empfangenen Heimweg. Der eigene Start bleibt
  konsequent am Schild; so enthält das Sheet keine konkurrierende zweite Aufgabe.
- Es gibt keine zusätzlichen dauerhaften Heimweg-Zeilen in Activities oder im Offen-Sheet.
- Das Start-Sheet ist ein bewusster **Zwei-Schritte-Flow** (Nutzerentscheidung Juli 2026;
  ersetzt den früheren einklappbaren Info-Block). **Revision August 2026:** Die Übersichtsseite
  erscheint nur beim ERSTEN Öffnen; danach startet das Sheet direkt auf der Personenauswahl.
  Begründung: Muskelgedächtnis und minimale Taps im Bedarfsmoment schlagen die wiederholte
  Erklärseite — die Übersicht bleibt über den Zurück-Pfeil der Auswahl jederzeit erreichbar,
  und ein Speicherfehler zeigt sie sicherheitshalber erneut.

## Heimweg-Fokus (Begleit-Kartenmodus)

Teilen Freunde ihren Heimweg, gibt es einen eigenen Kartenzustand: **alle Aktivitäten und alle
normalen Karten-Bedienelemente ausgeblendet** — sichtbar sind nur die geteilten Heimwege als
Avatar mit Name und statusfarbener Umrandung, der Schild (eigener Heimweg-Start bleibt auch hier
erreichbar), die Zentrierung und die „Verlassen"-Pille. Beim Öffnen und beim manuellen Zentrieren
fasst die Kamera alle verfügbaren Heimweg-Positionen ein. Ein Marker-Tap öffnet genau diese Person
und ihre Begleiter-Aktionen („Ich bin erreichbar", Karte). POI-Taps und das Erstellen per langem
Kartendruck sind im Fokus gesperrt. Es gibt EINE Karte: nichts wird dupliziert, der Fokus ist nur
ein Filter über der immer gemounteten Hauptkarte (Akku-Argument). Drei Fälle:

1. **Nur eigene Session:** Vollbild-Konsole wie gehabt (Orb, Knöpfe) — eine leere Karte hätte
   keinen Wert. Kein Fokus.
2. **Eigene Session + Freunde teilen:** Die Fläche teilt sich klar in zwei Aufgaben: oben die
   Karte mit den begleiteten Personen, unten ein festes, etwa halbhohes **Safety-Control-Deck**.
   Der komplette untere Bereich enthält Heimwegstatus, Bestätigungen, Ablauf, Hold-Buttons,
   Check-in und bei Rot zuerst 112; dort liegen keine Activity- oder Kartenaktionen.
   Das Minimieren-Chevron führt zur normalen Karte zurück. Die frühere „Auch
   unterwegs"-Liste ist ersatzlos entfallen: die Karte zeigt dieselbe Information besser. Die
   Konsole wechselt selbst zwischen Fall 1 und 2.
3. **Nur empfangen:** Vollbild-Fokus ohne Panel; rein über die pulsierende Status-Pille, raus
   über deren „Heimweg-Fokus verlassen"-Zustand.

Öffnet sich Fokus/Panel aus Kalender oder Socialize, dreht die App **still zuerst auf die
Karten-Ebene** (MainSurface), damit das Richtige durchscheint; beim Verlassen bleibt man auf der
Karte. Der Mode-Switch (Karte/Socialize-Pille) ist im Fokus ausgeblendet.

## Start und Empfänger

1. Der Nutzer öffnet den Karten-Schild.
2. **Schritt 1 — Übersicht:** Hero-Schild, drei Punkte — **Live-Standort** (grün; Ankunft und
   Löschversprechen stecken im Text: „…nur so lange, bis du sicher zu Hause bist. Danach wird er
   gelöscht."), **„Ich fühle mich unsicher"** (orange) und **„Ich bin in Gefahr"** (rot; „Deine
   Freunde werden alarmiert, damit sie dich kontaktieren oder schnell Hilfe rufen können.") — plus
   Ehrlichkeitszeile „Together ersetzt keinen Notruf — 112", Button „Weiter". Die Ich-Titel sind
   die nutzerseitigen Modusnamen und müssen mit den Konsolen-Buttons übereinstimmen.
   **Formulierungsregel für alle Safety-Texte:** beschreiben, was die Person selbst tut und was
   Freunde sehen können — nie, was deren Gerät tun wird. „Alarmieren" als eigene
   Absende-Handlung ist erlaubt; Zustell- und Tonversprechen („sofort", „laut", „weckt",
   „Sirene") sind verboten: ob ein Empfänger-Gerät klingelt, entscheidet dessen OS.
3. **Schritt 2 — Auswahl („Wer sieht deinen Heimweg?"):** konkrete bestätigte Freunde. „Enge
   Freunde", eigene Gruppen und „Alle Freunde" sind nur Schnellauswahlen. Ist der Nutzer einer
   noch laufenden `now`-Aktivität beigetreten, erscheint deren Name zuerst als kontextuelle
   Schnellauswahl; sie enthält ausschließlich direkte Freunde aus der bekannten Teilnehmerliste,
   nie fremde Teilnehmer. Jede Person bleibt einzeln sichtbar und an-/abwählbar. Zurück-Pfeil führt
   zur Übersicht.
4. Erst „Heimweg starten" legt den ersten konkreten Empfängerkreis fest. Das native Start-Sheet wird
   vollständig geschlossen, bevor die Safety-Konsole erscheint; zwei Modals dürfen beim Übergang
   nicht gleichzeitig sichtbar werden. Nach den notwendigen Berechtigungen erscheint die Konsole
   sofort optimistisch mit „Heimweg wird gestartet". Bis Session und Standortdienst bestätigt sind,
   bleiben Safety-Aktionen deaktiviert. Technische Backend-Einzelschritte werden Nutzern nicht gezeigt.

Der Server akzeptiert maximal 25 eindeutige direkte Freunde. Fremde UIDs, doppelte Empfänger und
ein zweiter paralleler Heimweg werden abgewiesen. Ein laufender Empfängerkreis ändert sich niemals
automatisch, kann vom Owner aber bewusst verwaltet werden: Die antippbare Geteilt-/Bestätigt-Zeile
öffnet „Begleiter“ mit allen Personen und deren aktuellem Status. Hinzufügen nutzt die bestätigten
Freunde; Entfernen benötigt eine Bestätigung und widerruft den weiteren Standortzugriff sofort.
Mindestens eine Person muss verbleiben, sonst ist der Heimweg zu beenden. `updateSafetyAudience`
prüft Freundschaft, Blockierungen, Limit und Session serverseitig und aktualisiert Audience,
Bestätigungen sowie Fan-out. Bei Orange/Rot erhält eine neu hinzugefügte Person direkt den aktuellen
Alarm und muss genau diese Alarm-Version bestätigen.

Wird eine Freundschaft entfernt oder eine Person blockiert, entzieht der Server den Safety-Zugriff
in beide Richtungen ebenfalls sofort. War sie die letzte Begleitperson, endet die betroffene Session;
ansonsten läuft sie nur mit dem verbleibenden Empfängerkreis weiter.

## Anfrage und Bestätigung

- Jeder ausgewählte Freund erhält eine In-App-Benachrichtigung. Bei registriertem Push-Gerät kommt
  zusätzlich eine Systembenachrichtigung ohne Koordinaten.
- In-App-Mitteilung und ein dauerhafter `pushOutbox`-Auftrag werden zusammen geschrieben. Die
  externe Expo-Zustellung läuft in einem wiederholbaren Firestore-Trigger und blockiert weder den
  Sessionstart noch die Operation-UI.
- Ein bewusster Wechsel auf Orange oder Rot läuft über `setSafetyStatus` und erzeugt serverseitig
  für denselben aktuell festgelegten Empfängerkreis eine In-App- und Push-Benachrichtigung. Entwarnung
  (zurück auf Blau) wird ebenfalls als Abschluss des Alarms mitgeteilt. Der Client darf diese
  Statuswechsel nicht direkt in RTDB schreiben und dadurch die Benachrichtigung umgehen.
- Die Start-Anfrage bietet „Ich bin erreichbar“. Diese allgemeine, 30 Minuten gültige Zusage wird
  ausschließlich als **erreichbar** angezeigt; sie beweist nicht, dass gerade jemand auf die Karte
  schaut.
- Orange und Rot erzeugen jeweils eine eigene, neue Alarm-Version. Die zugehörige System- und
  In-App-Benachrichtigung bietet „Ich habe dich im Blick“. Erst diese bewusste Bestätigung wird bei
  der startenden Person als **„N von M schauen gerade zu“** angezeigt. Die Bestätigung von Orange
  darf nicht für einen späteren roten Alarm wiederverwendet werden.
- Beide Aktionen öffnen die App, damit die authentifizierte Bestätigung auf iOS und Android
  zuverlässig verarbeitet werden kann; dieselben Aktionen stehen im Begleitungs-Sheet und im
  In-App-Mitteilungszentrum bereit.
- Eine Bestätigung gilt 30 Minuten. Fünf Minuten vorher erhält nur der Begleiter eine lokale
  Erinnerung zum Verlängern oder Zurücknehmen. Ohne Reaktion läuft die Zusage still ab: Der Owner
  sieht sie als abgelaufen, erhält aber keinen Alarm. „Nicht mehr erreichbar“ nimmt die Zusage
  sofort zurück und informiert den Owner; der Standortzugriff bleibt davon unberührt. Der Alarm
  selbst wartet nie darauf und Rot bzw. der sichtbare 112-Einstieg werden dadurch nicht blockiert.
- Die startende Person sieht in Blau „N von M erreichbar“, in Orange/Rot dagegen die Anzahl der
  Personen, die exakt den aktuellen Alarm bestätigt haben.

## Zustände und Bedienung

| Zustand | Bedeutung                    | Standort-Zielwert    |
| ------- | ---------------------------- | -------------------- |
| Blau    | normal unterwegs             | etwa 30 Sekunden     |
| Orange  | Person fühlt sich unsicher   | etwa 5 Sekunden      |
| Rot     | bewusst ausgelöster Hilferuf | etwa 5 Sekunden      |
| Grün    | bewusst „Sicher angekommen“  | Session wird beendet |

- Orange: 1,5 Sekunden halten.
- Rot: separate Hilfe-Taste 2,2 Sekunden halten, danach keine Rückfrage.
- **Rot wird nie automatisch ausgelöst.**
- Together ruft niemals automatisch 112. Bei Rot ist „112 anrufen“ die erste sichtbare Aktion.
- Nach Orange fragt die App diskret nach. Eine ausbleibende Antwort und ein Datenabriss werden
  unterschiedlich dargestellt.
- „Sicher angekommen“ ist eine bewusste Aktion; es gibt keinen Zuhause-Geofence und keinen
  gespeicherten Zuhause-Pin.
- Standortdrift und kleine Bewegungen am selben Ort dürfen einen vergessenen Heimweg nicht
  endlos verlängern. Ein Stillstandsfenster wird erst nach zwei aufeinanderfolgenden Punkten
  außerhalb eines 60-m-Radius neu gestartet. Nach 45 Minuten innerhalb dieses Radius fragt eine
  lokale Benachrichtigung „Bist du angekommen?“ mit „Sicher angekommen“ und „Weiter teilen“.
  Keine Antwort gilt niemals als bestätigte Ankunft. Identische Punkte werden nicht laufend erneut
  übertragen.

## Datenmodell und Sicherheit

- Live-Daten liegen in RTDB unter `heimwege/{ownerUid}`.
- `heimwegeIndex/{companionUid}/{ownerUid}` erlaubt einen kleinen Fan-out-Listener statt eines
  Listeners pro Freund.
- Start, Verlängerung, Statuswechsel, Bestätigung und das bewusste Zurücknehmen einer Bestätigung
  laufen über die Callables
  `startSafetySession`, `updateSafetyAudience`, `extendSafetySession`, `setSafetyStatus`,
  `confirmSafetyCompanion`, `withdrawSafetyCompanion` und `confirmSafetyAlert`. Die aktuelle Alarm-Version liegt als
  `{ status, at }` in der Session;
  Begleiter können ausschließlich genau diese Version bestätigen.
- Der Owner darf per eng begrenzter RTDB-Regel ausschließlich die komplette eigene Session löschen.
  Dadurch endet der Zugriff ohne Functions-Cold-Start; `cleanupSafetyIndexOnSessionDeleted` räumt
  den server-owned Fan-out-Index anschließend auf. Andere Client-Patches bleiben auf letzten
  Standort und Antwort auf einen vorhandenen Check-in beschränkt. Status, Identität, Zeitrahmen,
  Empfängerkreis, Bestätigungen und Index sind server-owned. Der Owner verändert den Kreis nur über
  `updateSafetyAudience`; direkte Client-Patches bleiben verboten.
- Eine Session endet standardmäßig nach zwei Stunden. Zehn Minuten vorher fragt eine lokale
  Benachrichtigung direkt „Bist du schon zuhause?“ mit den Aktionen „1 Stunde verlängern“ oder
  „Sicher angekommen“. Jede manuelle Verlängerung ist eine bewusste Aktion und serverseitig nur in
  den letzten 15 Minuten möglich; der Server begrenzt die Gesamtlaufzeit zusätzlich (12 h ab Start).
- Ohne bewusste Verlängerung endet die Standortübertragung nach zwei Stunden. Begleiter sehen
  anschließend ehrlich „Automatisch beendet · Ankunft nicht bestätigt“; es gibt keine stille
  Verlängerung und keine weiteren Standortupdates.
- Nach dem Ende ist kein Standortschreiben mehr möglich. Bei Blau bleibt der letzte Punkt nur für
  ein kurzes Abschlussfenster lesbar; bei Orange/Rot bleibt er 30 Minuten schreibgeschützt für den
  zuletzt bewusst festgelegten Empfängerkreis sichtbar. Danach löscht der bestehende Cleanup-Lauf Session und
  Fan-out-Index. Es gibt bewusst kein `onDisconnect().remove()`: App-Abbruch oder Funkloch darf
  nicht wie „sicher beendet“ aussehen.
- Pushes enthalten keine Koordinaten. Standort ist nur für den aktuell bewusst festgelegten Empfängerkreis lesbar.

## Verlauf und ehrliche Grenzen

- RTDB bleibt last-point-only.
- Ein rollierender 15-Minuten-Verlauf liegt derzeit nur lokal auf dem Gerät.
- Orange/Rot erzeugen derzeit ein lokales Vorfallsprotokoll mit maximal 30 Tagen Aufbewahrung.
- In nativen Firebase-Builds läuft eine explizit gestartete Heimwegfreigabe über
  `expo-task-manager` und `Location.startLocationUpdatesAsync`: Blau zielt auf 30 Sekunden,
  Orange/Rot auf 5 Sekunden. Der Zustand wird lokal wiederherstellbar gespeichert, Android zeigt
  währenddessen seine verpflichtende Foreground-Service-Meldung, iOS seinen Standortindikator.
  Wenn kein nativer Hintergrund-Task verfügbar ist, bleibt nur der klar sichtbare Vordergrund-Watcher aktiv.
- Cloud-Export, verschlüsselter Vorfallsspeicher und Akku-/Empfangsstatus sind vor einem
  Safety-Release noch fertigzustellen.
- Standortintervalle sind Zielwerte; die UI zeigt daher immer „Letztes Update vor …“.
- Hintergrundortung ist best effort: iOS kann nach Force-quit keine weitere Ausführung garantieren;
  Android kann je nach Hersteller und Akkueinstellung drosseln oder stoppen. Ein ausbleibender
  Punkt wird deshalb als Datenlücke dargestellt und niemals als sichere Ankunft interpretiert.

## Harte Release-Gates

1. Zeitkritische Push-Zustellung und Aktionen auf echten iPhones und Android-Geräten testen.
2. Den implementierten Hintergrunddienst auf echten Geräten bei Sperrbildschirm, Funkloch,
   Akkusparmodus, Prozessende und Neustart validieren; relevante Hersteller-Ausnahmen dokumentieren.
3. Check-in- und Eskalationslogik deterministisch testen.
4. Vorfallsdaten, Zustimmung, Export und Löschung vollständig umsetzen.
5. Formulierungen und Zustände dürfen nie garantieren, dass ein Empfänger wach ist oder zusieht.
6. Rechtliche Prüfung der Safety-Texte und Datenschutzhinweise vor Release (keine zugesicherten
   Eigenschaften/Rettungsversprechen; DSGVO: Einwilligung, Transparenz, Löschfristen für
   Standortdaten belegbar).
