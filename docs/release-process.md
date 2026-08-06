# Together: Release-Prozess

Dieses Dokument beschreibt den ausführbaren Weg. Maßgeblich bleibt der Code;
die Profile stehen in `eas.json`, der Backend-Region ist `europe-west3`, und die
automatischen Gates stehen in `.github/workflows`.

## Die drei Umgebungen

| Umgebung    | App-ID                                | Daten                     | Zweck                                   |
| ----------- | ------------------------------------- | ------------------------- | --------------------------------------- |
| Development | `com.broccolistudio.together.dev`     | lokale Emulatoren         | tägliche Entwicklung, keine Cloudkosten |
| Staging     | `com.broccolistudio.together.staging` | Firebase Dev Cloud        | interne Tests auf echten Geräten        |
| Production  | `com.broccolistudio.together`         | Firebase Production Cloud | Store-Nutzer                            |

Development verwendet den EAS-Profilnamen `development`. Staging und Production
erzwingen beide App Check und aktivieren Crashlytics. Staging ist eine vollständig
eigene installierbare App, damit sie weder lokale Dev-Builds noch die öffentliche
App überschreibt.

## Einmalige Einrichtung außerhalb von Git

Diese Schritte benötigen Zugriff auf Firebase, EAS, Google Cloud und die Stores.
Sie können nicht sicher aus dem Code erledigt werden.

1. Im bestehenden Firebase-Dev-Projekt die Android- und iOS-Staging-Apps mit den
   IDs aus `firebase/native/staging/README.md` anlegen.
2. Die beiden Staging-Konfigurationsdateien lokal ablegen und in EAS Environment
   `preview` als **Secret File** `GOOGLE_SERVICES_JSON` und
   `GOOGLE_SERVICE_INFO_PLIST` hinterlegen. Die äquivalenten Produktionsdateien
   gehören ausschließlich in EAS Environment `production`.
3. In Firebase für Staging und Production Android Play Integrity sowie iOS App
   Attest mit DeviceCheck-Fallback registrieren. Zuerst Staging im Monitoring
   testen; erst bei erfolgreichen echten Geräte-Tests bleibt Enforcement aktiv.
4. In EAS die Maps-Schlüssel pro Environment hinterlegen. Android-Schlüssel auf
   Signatur plus Paketname und iOS-Schlüssel auf Bundle-ID beschränken. Für
   Places einen **eigenen Server-Schlüssel** erstellen, auf die Places API (New)
   beschränken und ihn je Firebase-Projekt als Functions-Secret
   `GOOGLE_PLACES_API_KEY` hinterlegen (nie in EAS oder der App). Die harte
   Tagesquote bleibt der globale Kosten-Notstopp.
5. In GitHub die Environments `staging` und `production` anlegen. Für
   `production` verpflichtende Reviewer einschalten. Beide benötigen `EXPO_TOKEN`.
   Production benötigt zusätzlich Workload-Identity-Federation mit den Secrets
   `GCP_WIF_PROVIDER` und `GCP_DEPLOYER_SERVICE_ACCOUNT`; kein JSON-Servicekonto
   in GitHub speichern.
6. Firebase TTL-Policies für die tatsächlich geschriebenen `expireAt`-Felder,
   Budget-Warnungen und ein Cloud-Monitoring-Dashboard aktivieren. Ein Budget
   warnt nur; es ist keine harte Ausgabenbremse.
7. Crashlytics in Staging mit einem echten Release-Build prüfen. Der Dev Client
   ist dafür ungeeignet, weil dessen Fehler-Overlay native Crashes abfängt.

## Täglicher Ablauf

1. Node 20 aktivieren (`.nvmrc` / `.node-version`), dann `npm ci`.
2. In Emulatoren entwickeln und die Änderung in einen Branch committen.
3. Pull Request öffnen. GitHub Actions führt Typecheck, Lint, alle Firebase
   Rules-Tests, Functions-Tests, die E-Mail-Verifizierungs-Gate und den
   Produktionsabhängigkeits-Audit aus.
4. Nur bei grünem `Verify` den Staging-Workflow manuell starten. Der Workflow
   erstellt einen EAS-Build mit Profil `staging`.
5. Den Staging-Build auf mindestens einem echten Android- und iOS-Gerät testen:
   Registrierung/E-Mail-Verifizierung, Login, Karte/Places, Activity, Chat,
   Push, App Check, Standort-Opt-in, Anreise und Heimweg inklusive automatischem
   Stoppen sowie Update/Reinstall.

### Functions-Deploy-Schutz

Ein vollständiger Functions-Deploy ist nur erlaubt, wenn jede live Function auch
im lokalen `functions/index.js` exportiert wird. `deploy:functions:dev`,
`deploy:functions:prod`, der Produktions-Workflow und auch ein direkter
`firebase deploy --only functions` prüfen das vor dem Deploy und blockieren bei
einem Source-Drift. Niemals die Sperre umgehen oder eine vorgeschlagene Löschung
bestätigen.

Eine bewusst eng begrenzte, unabhängige Änderung erhält ein eigenes Skript mit
den betroffenen Namen, zum Beispiel `npm run deploy:functions:poi:dev`. Dieses
Skript kann keine andere Function aktualisieren oder löschen.

## Production-Release

1. Den exakt getesteten Commit als unveränderlichen Tag markieren, der genau zu
   `app.json → expo.version` passt (zum Beispiel App-Version `1.0.0` → Tag `v1.0.0`).
2. Den GitHub-Workflow **Deploy production backend** mit diesem Tag ausführen.
   Er verlangt das Wort `DEPLOY_PRODUCTION`, ein geschütztes Environment und den
   Tag selbst. Rules/Indexes und Functions kommen aus genau diesem Commit.
3. Den GitHub-Workflow **Build production binary** mit demselben Tag ausführen.
   Erst die interne Store-Prüfung dieses Binaries machen, dann über Play Console
   bzw. App Store Connect mit gestaffeltem Rollout veröffentlichen.
4. Nach Veröffentlichung Crashlytics, Functions-Fehler, Firestore Reads/Writes,
   aktive Listener und Maps/Places-Nutzung beobachten. Bei auffälligen Kosten
   zuerst die Places-Quote in Google Cloud senken oder sperren.

`npm run deploy:prod` bleibt nur für einen kontrollierten Notfall vorhanden.
Es verlangt Node 20, sämtliche lokalen Release-Tests, einen sauberen `main`-
oder `master`-Branch, den passenden exakten Release-Tag und
`TOGETHER_RELEASE_CONFIRM=production`. Der normale Weg ist der geschützte
GitHub-Workflow.

## OTA-Updates

`npm run update:staging` und `npm run update:production` sind nur für
JavaScript-, Styling- und Asset-Änderungen derselben Runtime-Version gedacht.
Bei nativen Modulen, Firebase-Dateien, Berechtigungen, App Check, Maps oder
Hintergrund-Location ist immer ein neuer Binary-Build Pflicht.

Beide OTA-Skripte laufen erst nach den Release-Gates. Production verlangt
zusätzlich dieselbe lokale Tag-/Bestätigungs-Prüfung wie ein Notfall-Deploy.
