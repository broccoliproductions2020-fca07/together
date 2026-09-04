# Einladungslinks und Mica-Mail scharfschalten

Der Code ist fertig. Was fehlt, ist Infrastruktur, die außerhalb des Repos liegt:
eine Domain, ein Mailversender, zwei Deploys, ein Build. Diese Liste ist die
Reihenfolge, in der das gehen muss — jeder Block ist für sich abgeschlossen und
kann an einem anderen Tag erledigt werden.

**Schätzung:** Block 1–4 sind zusammen etwa zwei Stunden Arbeit, verteilt über
ein bis zwei Tage, weil zweimal auf DNS gewartet wird.

---

## Was du NICHT brauchst

- **Kein Gerät registrieren.** Getestet wird mit dem Staging-Build, und dein
  iPhone steht dort längst in der Geräteliste. `app.config.js` gibt die
  Einladungslinks deshalb an Staging **und** Produktion (`supportsInviteLinks`).
- **Kein TestFlight, keine App-Store-Einreichung** für den Test. Beides kommt
  erst, wenn die App wirklich veröffentlicht wird.
- **Kein Android-Fingerprint** — solange du auf dem iPhone testest, bleibt der
  Platzhalter in `assetlinks.json` einfach stehen (Block 6).

Wichtig dabei: Habe zum Testen **nur eine** der beiden Apps installiert. Sind
Staging und Produktion gleichzeitig drauf, entscheidet iOS selbst, welche einen
angetippten Link bekommt, und das ist von außen nicht steuerbar.

---

## Block 1 · Domain `link.micamap.de` ans Hosting hängen — ERLEDIGT (01.09.2026)

Ergebnis: Zwei Dateien sind öffentlich erreichbar. Ohne sie öffnet ein Link
später den Browser statt die App — ohne jede Fehlermeldung.

> **Zwei Fallen, in die wir gelaufen sind.** Beide sehen wie ein Fehler in der
> Einrichtung aus und sind keiner; wer das hier nochmal macht, spart sich eine
> Stunde Suchen.
>
> 1. **Firebase sagt „Einträge noch nicht gefunden", obwohl der CNAME live ist.**
>    Die Domain wurde in Firebase eingetragen, BEVOR der CNAME existierte.
>    Firebase hat sofort geprüft, nichts gefunden und sich dieses „nichts"
>    gemerkt. Wie lange, steht im SOA der Domain (`default TTL`, bei IONOS 600 =
>    10 Minuten) — nicht im TTL des CNAME. Also: 10–15 Minuten warten, dann
>    nochmal „Bestätigen". Keine weiteren DNS-Einträge anlegen.
> 2. **Nach dem Verbinden lieferte GENAU EINE Adresse „Site Not Found"**, während
>    alle anderen Pfade derselben Domain korrekt ausgeliefert wurden. Grund: Das
>    war die eine URL, die während der Einrichtung mehrfach abgefragt worden war
>    — die Fehlerantwort lag im CDN-Cache. Ein erneutes
>    `npm run deploy:hosting:prod` räumt ihn aus, das behebt es sofort.
>
> Diagnose-Regel daraus: Wenn EIN Pfad hängt und andere nicht, ist es Cache.
> Wenn ALLE hängen, ist es die Verbindung.

### 1.1 Hosting im Firebase-Projekt aktivieren

1. [console.firebase.google.com](https://console.firebase.google.com) öffnen,
   Projekt **`together-fca07`** wählen (das ist `prod`).
2. Links im Menü **Build → Hosting**.
3. **„Jetzt starten"** klicken und den Assistenten durchklicken. Die Schritte mit
   `npm install -g firebase-tools` und `firebase init` kannst du **überspringen** —
   beides existiert hier schon.

Die Domain gehört bewusst zum Produktionsprojekt, auch wenn du gleich mit Staging
testest. Die zwei Dateien sagen nur „diese App darf diese Links öffnen"; sie haben
nichts damit zu tun, welche Datenbank die App benutzt.

### 1.2 Erster Deploy

Im Projektordner:

```powershell
npm run deploy:hosting:prod
```

Danach muss das hier JSON liefern:
`https://together-fca07.web.app/.well-known/apple-app-site-association`

### 1.3 Eigene Domain hinzufügen

1. In der Firebase Console unter **Hosting** auf **„Benutzerdefinierte Domain
   hinzufügen"**.
2. `link.micamap.de` eintragen, **weiter**.
3. Firebase zeigt jetzt DNS-Einträge an — meist erst einen `TXT`-Eintrag zum
   Nachweis, danach zwei `A`-Einträge.

> **Die genauen Werte stehen nur in deiner Console.** Schreib sie ab, nimm sie
> nicht aus irgendeiner Anleitung — sie unterscheiden sich pro Projekt.

### 1.4 Einträge bei IONOS setzen

1. Bei [ionos.de](https://ionos.de) anmelden.
2. **Domains & SSL** → `micamap.de` → Reiter **DNS**.
3. **„Record hinzufügen"**, pro Eintrag aus Schritt 1.3 einmal:
   - Typ: `TXT` bzw. `A` (wie Firebase es sagt)
   - Hostname: `link` — **nur das Wort, nicht** `link.micamap.de`. IONOS hängt
     die Domain selbst an. Das ist der häufigste Fehler an dieser Stelle.
   - Wert: exakt der Wert aus Firebase
4. Speichern.

Jetzt warten. Meist 15–60 Minuten, IONOS darf sich bis 24 Stunden Zeit lassen.
Firebase prüft von selbst weiter; in der Console steht dann „Verbunden".

### 1.5 Prüfen

```powershell
curl.exe -i https://link.micamap.de/.well-known/apple-app-site-association
curl.exe -i https://link.micamap.de/.well-known/assetlinks.json
```

Die erste Antwort muss `Content-Type: application/json` enthalten. Steht dort
`text/plain`, greifen Apples Universal Links nicht.

---

## Block 2 · Resend einrichten

Ergebnis: Ein API-Schlüssel liegt im Secret Manager, und `micamap.de` darf Mail
verschicken.

### 2.1 Konto und Domain

1. [resend.com](https://resend.com) → Konto anlegen (kostenlos, 3.000 Mails/Monat).
2. **Domains → Add Domain** → `micamap.de`.
3. Bei der Region **EU (Ireland)** wählen. Die App ist deutsch und die Functions
   laufen in Frankfurt; Mailversand über die USA wäre ein zusätzlicher
   Datentransfer, den die Datenschutzerklärung mit abdecken müsste.

### 2.2 Wieder DNS bei IONOS

Resend zeigt drei Einträge: ein `MX`, ein `TXT` mit `v=spf1 …`, ein `TXT` mit
`resend._domainkey`. Dieselbe Stelle wie in 1.4, gleiche Regel für den Hostnamen:
nur den Teil vor `micamap.de` eintragen.

Warten, bis in Resend alle drei auf **Verified** stehen.

### 2.3 Absenderadresse prüfen

Die App verschickt als **`hallo@micamap.de`** (steht in `functions/index.js`,
Konstante `EMAIL_SENDER`). Sobald `micamap.de` verifiziert ist, ist das gedeckt —
ein Postfach dafür brauchst du nicht. Willst du eine andere Adresse, ändere sie
dort, nicht in Resend.

### 2.4 Schlüssel erzeugen und hinterlegen

1. In Resend: **API Keys → Create API Key**, Rechte **Sending access**. Der Wert
   ist nur einmal sichtbar.
2. Im Projektordner:

```powershell
firebase functions:secrets:set RESEND_API_KEY --project dev
```

Den Schlüssel einfügen, Enter. Das `--project dev` ist richtig: Der
Staging-Build redet mit `together-dev-ce394`, und das ist hier der Alias `dev`.
Für die echte Veröffentlichung dasselbe nochmal mit `--project prod` (Block 6).

---

## Block 3 · Functions deployen

```powershell
npm run deploy:functions:email:dev
```

Das schaltet `sendVerificationEmail` und `deliverEmailOutbox` live. **Muss vor
dem Build passieren** — die App ruft ab sofort das Callable auf, und ein noch
nicht existierendes Callable heißt: keine Bestätigungsmail, also kein Login.

---

## Block 4 · Logo für die Mail

Mailprogramme laden keine eingebetteten Bilder aus dem Code, sie brauchen eine
öffentliche Adresse. Das Template erwartet:

`hosting/public/email/mica-logo.png`

Anforderungen: PNG, etwa 400 px breit, transparenter Hintergrund. Die Datei
danach mit `npm run deploy:hosting:prod` hochladen.

Fehlt sie, kommt die Mail trotzdem an — nur mit einem leeren Bildplatz oben.

---

## Block 5 · Staging-Build und Test

### 5.1 Bauen

```powershell
npx eas-cli@22.2.0 build --profile staging --platform ios
```

`associatedDomains` ist eine native Berechtigung, deshalb geht das **nicht** per
OTA-Update. EAS baut das Provisioning-Profil neu und fragt dabei, welche Geräte
hineinsollen: **die vorhandene Auswahl einfach bestätigen**, kein neues Gerät
hinzufügen.

Danach den QR-Code aus der EAS-Ausgabe mit dem iPhone scannen und installieren.

### 5.2 Zwei Konten anlegen

Der Einladungslink schickt eine Anfrage an jemand anderen — an dich selbst geht
das nicht. Registriere im Staging-Build also **zwei** Konten mit verschiedenen
E-Mail-Adressen.

Damit ist die Mail gleich mitgetestet: Die Bestätigungsmail muss von **Mica**
kommen und das Logo zeigen, nicht die graue Firebase-Standardmail.

### 5.3 Freundschaftsanfrage per Link

1. Mit Konto A: **Profil → Freunde verwalten**.
2. Dort **„Mein QR-Code"**. Erscheint der Knopf nicht, steht deine
   Anfrage-Einstellung nicht auf **„Alle"** — das änderst du unter
   **Profil → Privatsphäre → Wer kann dir Freundschaftsanfragen senden?**
3. **„Link teilen"**, den Link an dich selbst schicken.
4. Auf Konto B wechseln, den Link **aus der Notizen-App** antippen.

Notizen-App deshalb, weil iMessage und WhatsApp den Link vorher selbst abrufen,
um eine Vorschau zu bauen — das verfälscht den Test.

**Erwartung:** Die App öffnet sich direkt (kein Safari dazwischen), und Konto A
hat eine Anfrage.

### 5.4 Die drei Fälle, die schiefgehen können

| Beobachtung                      | Ursache                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Safari öffnet die Fallback-Seite | Block 1 war beim Installieren noch nicht live. App löschen, neu installieren — iOS holt die Datei nur bei der Installation.     |
| Gar nichts passiert              | Falscher Hostname bei IONOS (`link.micamap.de` statt `link` eingetragen).                                                       |
| App öffnet, keine Anfrage        | Konto B war nicht angemeldet oder die Mail nicht bestätigt. Die Anfrage wird gemerkt und geht raus, sobald beides erledigt ist. |

### 5.5 Scanner und Fallback

- **Scanner:** Konto B → Freunde verwalten → **„Code scannen"** → auf den
  QR-Code von Konto A halten. Beim ersten Mal fragt iOS nach der Kamera.
- **Fallback-Seite:** App löschen, Link nochmal antippen. Es muss die dunkle
  Mica-Seite kommen mit „@name" und dem Hinweis, dass die Stores folgen.

Auf dieser Seite gibt es einen Knopf **„In der App öffnen"**. Der zielt auf
`mica://` und funktioniert deshalb nur mit der Produktions-App — Staging heißt
`mica-staging://`. Mit dem Staging-Build ist der Knopf also wirkungslos, und das
ist erwartet, kein Fehler. Der eigentliche Weg ist ohnehin der Link selbst; der
Knopf ist nur für Leute da, die die App haben und trotzdem im Browser landen.

---

## Block 6 · Erst zur Veröffentlichung

Nichts davon ist für den Test nötig.

1. Android-Fingerprint holen und in `assetlinks.json` eintragen:
   ```powershell
   $env:APP_VARIANT="production"; $env:EXPO_PUBLIC_FIREBASE_EMULATORS="false"; npx eas-cli@22.2.0 credentials -p android
   ```
   → Profil `production` → Keystore → **SHA256 Fingerprint**. Danach
   `npm run deploy:hosting:prod`.
2. `firebase functions:secrets:set RESEND_API_KEY --project prod`
3. `npm run deploy:functions:email:prod`
4. `npm run build:production`, dann `eas submit`.
5. In `hosting/public/f/index.html` die beiden leeren Konstanten
   `APP_STORE_URL` und `PLAY_STORE_URL` füllen, nochmal Hosting deployen. Dann
   verschwindet das „kommt in Kürze" und es stehen echte Store-Knöpfe da.
6. Optional: In der Firebase Console unter **Authentication → Templates** die
   Action-Link-Domain auf `micamap.de` umstellen. Dann steht im Link der Mail
   nicht mehr `together-fca07.firebaseapp.com`. Einzeln prüfen, nicht blind
   mitrollen.
