# Hosting — Einladungslinks (`link.micamap.de`)

Kleine statische Hilfsseite, die drei Aufgaben erfüllt. Sie ist bewusst **nicht** die
Landingpage (die lebt in einem eigenen Next.js-Projekt) — hier steht nur, was technisch
an dieser Domain hängen muss.

| Pfad                                     | Aufgabe                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `.well-known/apple-app-site-association` | iOS Universal Links. Ohne Dateiendung, `Content-Type: application/json` wird in `firebase.json` erzwungen. |
| `.well-known/assetlinks.json`            | Android App Links.                                                                                         |
| `f/index.html`                           | Auffangseite für alle `/f/<username>`-Links (per Rewrite in `firebase.json`).                              |
| `email/mica-logo.png`                    | Logo für die Bestätigungsmail — E-Mail-Clients brauchen eine öffentliche Bild-URL.                         |

## Warum `ignore` in firebase.json keinen `**/.*`-Eintrag hat

Firebase legt beim `init` standardmäßig `"ignore": ["firebase.json", "**/.*", "**/node_modules/**"]`
an. Dieser Glob matcht jeden Pfad, dessen Segment mit einem Punkt beginnt — also auch
`.well-known/`. Die AASA-Datei würde dann stillschweigend nicht mit deployed, und Universal
Links schlügen fehl, ohne dass es irgendwo eine Fehlermeldung gäbe: Apple holt die Datei ab,
bekommt 404, und der Link öffnet einfach den Browser statt die App. Der Eintrag fehlt hier
deshalb absichtlich. Dieses Verzeichnis enthält ohnehin nur gewollte Dateien.

## Warum Staging in der AASA steht

Ein Produktions-Build ist nur über TestFlight installierbar. Stünde in der AASA nur
`com.broccolistudio.together`, ließe sich die Einladungsstrecke also auf keinem echten
Gerät prüfen, bevor sie bei Apple eingereicht ist. Deshalb trägt
`com.broccolistudio.together.staging` denselben Pfad, und `app.config.js` gibt
`associatedDomains` an beide Varianten (`supportsInviteLinks`). Dev bleibt außen vor:
Es redet mit dem Emulator und wird ohnehin lokal gebaut.

Nebenwirkung: Sind **beide** Apps auf einem Gerät installiert, entscheidet iOS, welche
einen angetippten Link bekommt. Zum Testen also nur eine von beiden installiert lassen.

Für Android steht dieselbe Begründung in `assetlinks.json`: beide Pakete sind eingetragen,
weil `app.config.js` beiden Varianten den `autoVerify`-Intent-Filter gibt. Stünde dort nur
die Produktion, würde ein Staging-Build eine Verknüpfung ankündigen, die die Datei nicht
bestätigt.

## Android: noch keine Fingerprints — und noch keine haben zu können

`assetlinks.json` trägt Platzhalter, und das lässt sich derzeit nicht auflösen:
**für dieses Projekt existiert noch kein einziger Android-Build** (`eas build:list
--platform android` ist leer). EAS erzeugt den Keystore erst beim ersten Build, und das
Play-App-Signing-Zertifikat entsteht erst beim ersten Upload in die Play Console. Es gibt
also schlicht noch keinen Wert einzutragen.

Bis dahin öffnet ein Einladungslink auf Android den Browser und landet auf `f/index.html`
mit den Store-Buttons — der vorgesehene Rückfall, kein Fehler. iOS ist davon nicht
betroffen und vollständig eingerichtet.

Wenn der erste Android-Build da ist, in dieser Reihenfolge:

1. `eas credentials -p android` → Profil wählen → Keystore → **SHA256 Fingerprint**
   (einmal für `production`, einmal für `staging`).
2. Werte in `assetlinks.json` eintragen, `npm run deploy:hosting:prod`.
3. Nach dem ersten Play-Upload zusätzlich den Fingerprint aus der Play Console
   (Setup → App-Integrität → App-Signaturschlüssel) beim Produktionspaket ergänzen.
   Play signiert die ausgelieferte App neu — ohne diesen Eintrag verifiziert der Link
   auf keinem Gerät aus dem Store, obwohl er im internen Test funktioniert hat.
4. Prüfen: `adb shell pm verify-app-links --re-verify com.broccolistudio.together`,
   danach `adb shell pm get-app-links com.broccolistudio.together` → `verified`.

## Bereits erledigt

- Apple Team ID (`MY6UVLY69P`) eingetragen, aus `eas device:list`.
- `email/mica-logo.png` liegt live (6,7 kB PNG) und wird vom Mail-Template in
  `functions/email/verificationTemplate.js` verlinkt.

## Deployen

```
npm run deploy:hosting:prod
```

Danach prüfen — beide müssen JSON liefern, die erste mit `application/json`:

```
curl -i https://link.micamap.de/.well-known/apple-app-site-association
curl -i https://link.micamap.de/.well-known/assetlinks.json
```

Apple und Google holen diese Dateien beim **Installieren** der App ab. Sie müssen also
live sein, bevor ein Build mit `associatedDomains` installiert wird — sonst bleibt die
Verknüpfung auf dem Gerät aus, bis die App neu installiert wird.
