# Como — Launch-Monitoring & Kosten-Airbags

Dieses Dokument ist der produktive Kontrollplan. Es verändert keine Cloud-
Einstellungen selbst: Budgets, TTL-Policies und Alarmregeln müssen bewusst im
echten Firebase-/Google-Cloud-Projekt eingerichtet werden, nie gegen den lokalen
Emulator.

## Bereits im Code begrenzt

- Aktivitäten-Feed: eine limitierte Query; Chat-Raumliste: `limit(30)`.
- Nachrichten: nur der aktuell geöffnete Raum streamt Nachrichten; lokale
  Nachrichten-Caches vermeiden erneute Voll-Downloads.
- Freundes-Presence streamt nur, solange die Karte sichtbar ist.
- Gruppen: maximal 25 Mitglieder; Activities: maximal 50 Teilnehmer.
- Chat: maximal 30 Nachrichten pro Nutzer und Minute und 60 pro Raum und Minute.
  Die Raumgrenze schützt das gemeinsame Summary-Dokument und seinen Fan-out.
- Callables: App-Check-Release-Gate, serverseitige Eingabe-/Mitgliedschaftsprüfungen
  und `maxInstances: 20`.

## Vor dem Cloud-Release

1. Firestore-TTL für `expireAt` auf Activities, Chats, Chat-Nachrichten,
   Presence und `rateLimits` konfigurieren.
2. App Check erst im Monitoring prüfen, danach für Functions erzwingen.
3. Einen Cloud-Billing-Budget-Alarm mit mehreren Schwellen einrichten. Ein Budget
   ist nur ein Alarm, kein automatischer Kostenstopp.
4. In Cloud Monitoring ein Dashboard für Firestore **Document Reads**, **Document
   Writes**, **Active Connections**, **Snapshot Listeners** und
   **TTL deletion count** anlegen. Bei einer deutlichen, anhaltenden Abweichung
   zwischen Reads und DAU zuerst Chat-Raum-Summaries und Presence prüfen.
5. Vor jedem Functions-Deploy `npm run test:functions`, `npm run
   test:firestore-rules`, `npm run typecheck` und `npm run lint` ausführen.

## Entscheidungsregel für einen späteren Chat-Umbau

Erst messen, dann ändern. Ein RTDB-Hybrid kommt nur infrage, wenn reale Daten
zeigen, dass Chat-Raum-Summaries trotz der Grenzen dauerhaft den überwiegenden
Teil der Firestore-Reads verursachen. Dabei sind ausgehende RTDB-Bytes,
gleichzeitige Verbindungen, Berechtigungen, Ablauf und Migration gemeinsam zu
bewerten — nicht nur Firestore-Reads.
