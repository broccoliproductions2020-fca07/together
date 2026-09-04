# Bereitgestellte Demo-Portraits für die lokalen Emulatoren

Diese zwölf Bilder sind die einzigen Profilbilder, die in Marketing-Screenshots
sichtbar werden. Sie werden ausschließlich in den **lokalen Storage-Emulator**
geladen (`scripts/lib/demo-avatars.mjs`) — niemals nach Staging oder Produktion,
und niemals als externe URL referenziert.

**Der Aufnahme-Roster ist genau diese zwölf Personen.** Kein Initialen-Kreis
darf irgendwo auftauchen: nicht auf einem Marker, nicht in der Offen-Liste,
nicht im Publikums-Tab des Composers. `npm run screens:verify` prüft das
namentlich und meldet jede Person, der ein Bild fehlt.

## Erwartete Dateien

Reihenfolge = Lieferreihenfolge (`pb1`…`pb12`). Das `w`/`m` im gelieferten
Dateinamen bestimmt das Geschlecht des zugeordneten Namens — **und sonst
nichts**; kein Name wird nach dem Aussehen einer Person vergeben.

| Quelle | Datei             | Person        | Rolle in der Aufnahme-Welt                              |
| ------ | ----------------- | ------------- | ------------------------------------------------------- |
| pb1 w  | `seed-mia.png`    | Mia Sommer    | **der Aufnahme-Account** · Brunch-Gastgeberin · Heimweg |
| pb2 w  | `seed-lisa.png`   | Lisa Becker   | offen ~670 m · Lauf · Anreise                           |
| pb3 w  | `seed-amelie.png` | Amelie Wagner | offen ~200 m · Brunch · Heimweg-Begleitung              |
| pb4 m  | `seed-hannes.png` | Hannes Macha  | „Split the G" im Pub (läuft), deshalb nicht offen       |
| pb5 m  | `seed-david.png`  | David Klein   | offen ~1,25 km · Lauf-Gastgeber · Anreise · Heimweg     |
| pb6 m  | `seed-sebbo.png`  | Sebbo Regs    | „Split the G" im Pub (läuft), deshalb nicht offen       |
| pb7 w  | `seed-nora.png`   | Nora Weiß     | Bouldern (läuft)                                        |
| pb8 m  | `seed-jonas.png`  | Jonas Pohl    | Bouldern (läuft)                                        |
| pb9 w  | `seed-hannah.png` | Hannah Vogel  | Bouldern (läuft)                                        |
| pb10 m | `seed-tom.png`    | Tom Richter   | Bouldern (läuft)                                        |
| pb11 w | `seed-sofia.png`  | Sofia Neumann | offen ~760 m · Gastgeberin der Solo-Aktivität           |
| pb12 m | `seed-noah.png`   | Noah Fischer  | offen **ohne Standort** (zweite Sichtbarkeitsstufe)     |

**Vierzehn Dateien für zwölf Gesichter.** `seed-hannes.png` und `seed-sebbo.png`
sind byteweise Kopien von `seed-max.png` und `seed-elias.png`: Max und Elias
leben nur im Dev-Seed, Hannes und Sebbo nur in der Aufnahme-Welt. Keine der
beiden Welten zeigt also ein Gesicht zweimal, und der Dateiname bleibt gleich
der uid — ohne diese Regel muss man die Zuordnung raten. `applyDemoAvatars`
überspringt jede uid, die im gerade laufenden Szenario nicht vorkommt.

Dass der Aufnahme-Account eine dieser Personen IST, ist Absicht: Ein
dreizehntes Portrait gibt es nicht, und ein eigener Account ohne Bild stünde in
der Top-Bar, in jeder Teilnehmerzeile und in der Heimweg-Konsole als
Initialen-Kreis — direkt neben lauter echten Gesichtern. Anmeldung:
`mia@seed.together.dev` / `seed-only`.

## Anforderungen

- Die zwölf bereitgestellten PNGs sind die Quelle. Sie werden weder generiert
  noch ersetzt.
- Quadratisch, ohne Text und Marken. Keine Logos, Schrift oder erkennbaren
  Marken im Bild.

## Wie sie in die App kommen

Über den **echten Profilbild-Mechanismus der App**, nicht über einen eigenen
Upload: Der Seed meldet sich pro Person am Auth-Emulator an und ruft dieselbe
Callable `updateOwnProfile` auf, die auch `ProfileEditSheet` aufruft. Das Bild
wird vorher genauso aufbereitet wie im Client (mittig quadratisch beschnitten,
512 px, JPEG Qualität 82) — der Server nimmt nur JPEG unter 1 MB an.

Damit gehören Objektpfad (`avatars/{uid}/{avatarId}.jpg`), Download-Token, URL,
Rate-Limit und die Verteilung von `avatarUrl` auf `users`, `publicProfiles` und
`friendSearch` der Function, nicht dem Seed.

Einzige lokale Anpassung: Der Functions-Emulator baut die URL mit seinem eigenen
`127.0.0.1`. Das ist der Loopback des Android-Emulators selbst, nicht der des
Rechners — deshalb wird ausschließlich der Host auf `10.0.2.2` umgeschrieben
(`EMULATOR_LOOPBACK_HOST` überschreibt das für ein echtes Gerät).

Der Lauf ist idempotent: Wer schon eine `avatarUrl` hat, wird übersprungen, damit
wiederholtes Seeden das Server-Limit von fünf Bildwechseln pro Tag nicht
aufbraucht. Gesucht wird dabei erst in Firestore, dann in der `photoURL` des
Auth-Kontos — die überlebt den harten Reset der Aufnahme-Welt, der Firestore
komplett leert. Ohne diesen zweiten Weg würde jeder Reset zwölf Bilder neu
hochladen und das Tageslimit nach dem vierten Lauf sprengen. `--force-avatars`
erzwingt trotzdem einen neuen Durchlauf.

## Einbinden

Dateien ablegen, dann:

```bash
npm run emulators            # falls nicht schon laufend
npm run screens:world        # Aufnahme-Welt (= emulators:seed:landing)
npm run screens:verify       # meldet jedes fehlende Portrait namentlich
```

Der ganze Aufnahme-Ablauf steht in [docs/landing-screenshots.md](../../docs/landing-screenshots.md).

Die Function schreibt `users`, `publicProfiles` und `friendSearch`; der Seed
kopiert die zurückgelieferte `avatarUrl` anschließend in die übrigen
Identitäts-Snapshots, die die App wirklich liest: `presence`,
Activity-Teilnehmende und Freundschafts-Snapshots. Anreise und Heimweg lesen
diese Profile über die echten Activity- beziehungsweise Freundschaftsdaten.

**Fehlt eine Datei, bricht nichts ab.** Der Seed nennt den exakten Pfad und die
App zeigt für diese Person weiterhin ihren Initialen-Kreis.

Die zwölf bereitgestellten Portraits liegen in diesem Ordner und werden
ausschließlich lokal verwendet.
