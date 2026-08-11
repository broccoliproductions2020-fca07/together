/*
 * Como Betrieb Desktop
 *
 * A private Electron shell for the loopback dashboard. Google OAuth is always
 * completed in the system browser; Google prohibits sign-in through an
 * application-controlled embedded user agent.
 */

const { spawn } = require('node:child_process');
const {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { once } = require('node:events');
const { join } = require('node:path');

const { app, BrowserWindow, dialog, Menu, safeStorage, shell } = require('electron');

const { startDashboard } = require('../local-dashboard.cjs');

const GOOGLE_CLOUD_INSTALL_URL = 'https://cloud.google.com/sdk/docs/install-sdk';
const GOOGLE_SCOPES =
  'https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/analytics.readonly';

let dashboardServer = null;
let dashboardWindow = null;

app.setName('Como Betrieb');

function vaultPath() {
  return join(app.getPath('userData'), 'google-dashboard-credentials.bin');
}

function temporaryGcloudConfigPath() {
  return mkdtempSync(join(app.getPath('temp'), 'together-betrieb-oauth-'));
}

function temporaryAdcPath(gcloudConfigPath) {
  return join(gcloudConfigPath, 'application_default_credentials.json');
}

function validateCredentials(credentials) {
  if (
    !credentials ||
    credentials.type !== 'authorized_user' ||
    typeof credentials.client_id !== 'string' ||
    typeof credentials.client_secret !== 'string' ||
    typeof credentials.refresh_token !== 'string'
  ) {
    throw new Error('Die Google-Anmeldung ist ungültig. Bitte erneut verbinden.');
  }
  return credentials;
}

function loadCredentials() {
  const file = vaultPath();
  if (!existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Die Windows-Verschlüsselung ist nicht verfügbar. Die Anmeldung wird nicht unsicher gespeichert.',
    );
  }
  return validateCredentials(JSON.parse(safeStorage.decryptString(readFileSync(file))));
}

function saveCredentials(credentials) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Die Windows-Verschlüsselung ist nicht verfügbar. Die Anmeldung wird nicht unsicher gespeichert.',
    );
  }
  const target = vaultPath();
  mkdirSync(join(target, '..'), { recursive: true });
  const temporary = `${target}.new`;
  writeFileSync(
    temporary,
    safeStorage.encryptString(JSON.stringify(validateCredentials(credentials))),
    {
      mode: 0o600,
    },
  );
  renameSync(temporary, target);
}

function clearCredentials() {
  rmSync(vaultPath(), { force: true });
}

function restartDesktop() {
  app.relaunch();
  app.exit(0);
}

function dashboardUrl() {
  const address = dashboardServer?.address();
  if (!address || typeof address === 'string')
    throw new Error('Der lokale Dashboard-Server ist nicht bereit.');
  return `http://127.0.0.1:${address.port}`;
}

function onlyDashboardNavigation(event, url) {
  if (new URL(url).origin !== new URL(dashboardUrl()).origin) event.preventDefault();
}

function createWindow() {
  dashboardWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 940,
    minHeight: 680,
    backgroundColor: '#10131c',
    show: false,
    title: 'Como Betrieb',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      webviewTag: false,
    },
  });
  dashboardWindow.setContentProtection(true);
  dashboardWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  dashboardWindow.webContents.on('will-navigate', onlyDashboardNavigation);
  dashboardWindow.once('ready-to-show', () => dashboardWindow.show());
  void dashboardWindow.loadURL(dashboardUrl());
}

function showError(title, error) {
  dialog.showMessageBoxSync({
    type: 'error',
    title,
    message: error instanceof Error ? error.message : String(error),
  });
}

function createMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Dashboard',
        submenu: [
          {
            label: 'Jetzt aktualisieren',
            accelerator: 'Ctrl+R',
            click: () => dashboardWindow?.reload(),
          },
          { type: 'separator' },
          { role: 'quit', label: 'Beenden' },
        ],
      },
      {
        label: 'Google',
        submenu: [
          {
            label: 'Google-Konto verbinden oder erneuern',
            click: () => void connectGoogleAccount(),
          },
          { label: 'Gespeicherte Anmeldung entfernen', click: disconnectGoogleAccount },
          { type: 'separator' },
          {
            label: 'Google Cloud CLI installieren',
            click: () => void shell.openExternal(GOOGLE_CLOUD_INSTALL_URL),
          },
        ],
      },
    ]),
  );
}

function importGoogleCredentials(gcloudConfigPath) {
  const source = temporaryAdcPath(gcloudConfigPath);
  if (!existsSync(source)) {
    throw new Error(
      'Google Cloud CLI hat keine lokale Anmeldung erstellt. Bitte den Login erneut versuchen.',
    );
  }
  const credentials = validateCredentials(JSON.parse(readFileSync(source, 'utf8')));
  saveCredentials(credentials);
  // The app has copied the refresh credential into Windows DPAPI-encrypted
  // storage. Remove the plaintext temporary ADC file created for this flow.
  rmSync(source, { force: true });
}

function showGoogleCliMissing() {
  const choice = dialog.showMessageBoxSync(dashboardWindow, {
    type: 'warning',
    title: 'Google Cloud CLI fehlt',
    message: 'Installiere zuerst die Google Cloud CLI und versuche den Login dann erneut.',
    buttons: ['Verstanden', 'Installationsseite öffnen'],
    defaultId: 0,
    cancelId: 0,
  });
  if (choice === 1) void shell.openExternal(GOOGLE_CLOUD_INSTALL_URL);
}

function connectGoogleAccount() {
  const started = dialog.showMessageBoxSync(dashboardWindow, {
    type: 'info',
    title: 'Google-Konto verbinden',
    message: 'Der sichere Google-Login wird jetzt im Standardbrowser geöffnet.',
    detail:
      'Nach erfolgreicher Anmeldung speichert Como nur die verschlüsselte OAuth-Anmeldung für diesen Windows-Account. Kein Google-Passwort wird gespeichert.',
    buttons: ['Login starten', 'Abbrechen'],
    defaultId: 0,
    cancelId: 1,
  });
  if (started !== 0) return;

  let output = '';
  let loginFinished = false;
  const command = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
  const gcloudConfigPath = temporaryGcloudConfigPath();
  const login = spawn(
    command,
    ['auth', 'application-default', 'login', `--scopes=${GOOGLE_SCOPES}`],
    {
      shell: process.platform === 'win32',
      windowsHide: true,
      env: { ...process.env, CLOUDSDK_CONFIG: gcloudConfigPath },
    },
  );
  login.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  login.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  login.once('error', () => {
    if (loginFinished) return;
    loginFinished = true;
    rmSync(gcloudConfigPath, { recursive: true, force: true });
    showGoogleCliMissing();
  });
  login.once('close', (code) => {
    if (loginFinished) return;
    loginFinished = true;
    if (code !== 0) {
      rmSync(gcloudConfigPath, { recursive: true, force: true });
      if (/not recognized|enoent|not found/i.test(output)) showGoogleCliMissing();
      else
        showError('Google-Anmeldung nicht abgeschlossen', output || 'Der Login wurde abgebrochen.');
      return;
    }
    try {
      importGoogleCredentials(gcloudConfigPath);
      rmSync(gcloudConfigPath, { recursive: true, force: true });
      dialog.showMessageBoxSync(dashboardWindow, {
        type: 'info',
        title: 'Google-Konto verbunden',
        message:
          'Die Anmeldung wurde für diesen Windows-Account verschlüsselt gespeichert. Como startet jetzt neu.',
      });
      restartDesktop();
    } catch (error) {
      rmSync(gcloudConfigPath, { recursive: true, force: true });
      showError('Google-Anmeldung konnte nicht gespeichert werden', error);
    }
  });
}

function disconnectGoogleAccount() {
  if (!existsSync(vaultPath())) {
    dialog.showMessageBoxSync(dashboardWindow, {
      type: 'info',
      title: 'Keine gespeicherte Anmeldung',
      message: 'Für Como Betrieb ist aktuell keine Google-Anmeldung gespeichert.',
    });
    return;
  }
  const approved = dialog.showMessageBoxSync(dashboardWindow, {
    type: 'warning',
    title: 'Google-Anmeldung entfernen?',
    message:
      'Die verschlüsselt gespeicherte Google-Anmeldung wird von diesem Windows-Account entfernt.',
    buttons: ['Entfernen', 'Abbrechen'],
    defaultId: 1,
    cancelId: 1,
  });
  if (approved !== 0) return;
  clearCredentials();
  restartDesktop();
}

app.enableSandbox();
app.whenReady().then(async () => {
  try {
    dashboardServer = startDashboard({
      port: 0,
      credentials: loadCredentials(),
      requireCredentials: true,
    });
    await Promise.race([
      once(dashboardServer, 'listening'),
      once(dashboardServer, 'error').then(([error]) => Promise.reject(error)),
    ]);
    createMenu();
    createWindow();
  } catch (error) {
    showError('Como Betrieb konnte nicht starten', error);
    app.quit();
  }
});

app.on('before-quit', () => {
  dashboardServer?.close();
});

app.on('window-all-closed', () => {
  app.quit();
});
