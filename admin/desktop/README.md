# Como Betrieb Desktop

`npm run dashboard:desktop` opens a Windows-only desktop shell around the local
Como operations dashboard. The shell starts its own loopback server on a
random `127.0.0.1` port; it is not reachable from the LAN.

## Credential handling

1. Start the desktop app.
2. Choose **Google → Google-Konto verbinden oder erneuern**.
3. Sign in in the browser that Google Cloud CLI opens.
4. The app runs the CLI in an isolated temporary configuration folder, imports
   the resulting OAuth refresh credential, encrypts it with Windows DPAPI
   (`Electron.safeStorage`), then removes that temporary folder. It does not
   change your normal Google Cloud CLI credentials.

Only the current Windows account can decrypt the stored credential. The app
never collects or stores a Google password, never loads the Google login page
in its internal browser, and provides **Google → Gespeicherte Anmeldung
entfernen** to clear the encrypted credential and restart without access.

The dashboard's renderer is sandboxed, has no Node.js integration, cannot open
new windows, and can navigate only to the app's own loopback origin.

## Required account access

The Google account must have read access to both Como Cloud projects. The
first sign-in requires the Google Cloud CLI. The application opens the official
installer page if it is unavailable.

Exact billing and GA4 remain optional data sources as described in
`../README.md`.
