const environmentGrid = document.querySelector('#environment-grid');
const integrationGrid = document.querySelector('#integration-grid');
const billingBreakdown = document.querySelector('#billing-breakdown');
const notice = document.querySelector('#notice');
const updatedAt = document.querySelector('#updated-at');
const refreshButton = document.querySelector('#refresh-button');
const metricTemplate = document.querySelector('#metric-template');

const numberFormatter = new Intl.NumberFormat('de-DE');
const decimalFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

function formatNumber(value) {
  return numberFormatter.format(Number(value ?? 0));
}

function formatCost(value, currency = 'Abrechnungswährung') {
  return `${decimalFormatter.format(Number(value ?? 0))} ${currency}`;
}

function emptyState(title, message) {
  const article = document.createElement('article');
  article.className = 'empty-card';
  const heading = document.createElement('p');
  heading.className = 'metric-label';
  heading.textContent = title;
  const detail = document.createElement('p');
  detail.textContent = message;
  article.append(heading, detail);
  return article;
}

function metric(label, value, detail = '') {
  const node = metricTemplate.content.cloneNode(true);
  node.querySelector('.metric-label').textContent = label;
  node.querySelector('.metric-value').textContent = value;
  node.querySelector('.metric-detail').textContent = detail;
  return node;
}

function sourceState(source, configuredMessage) {
  if (source?.state === 'ready') return null;
  if (source?.state === 'not-configured') return configuredMessage;
  return source?.message ?? 'Datenquelle ist momentan nicht erreichbar.';
}

function panelHeader(panel, kicker, title, tag) {
  const header = document.createElement('header');
  const heading = document.createElement('div');
  const kickerNode = document.createElement('p');
  kickerNode.className = 'panel-kicker';
  kickerNode.textContent = kicker;
  const titleNode = document.createElement('h3');
  titleNode.textContent = title;
  heading.append(kickerNode, titleNode);
  header.append(heading);
  if (tag) {
    const tagNode = document.createElement('span');
    tagNode.className = 'environment-tag';
    tagNode.textContent = tag;
    header.append(tagNode);
  }
  panel.append(header);
}

function localEnvironmentPanel(environment) {
  const panel = document.createElement('section');
  panel.className = 'environment-panel local';
  panelHeader(panel, environment.projectId, environment.label, 'LOCAL');

  const source = environment.sources.local;
  const message = sourceState(source, 'Die Emulator Suite ist nicht gestartet.');
  if (message) {
    panel.append(emptyState('Lokale Tests', message));
    return panel;
  }

  const metrics = document.createElement('div');
  metrics.className = 'metric-grid';
  const emulatorNames = source.emulators.map(({ name, port }) => `${name}:${port}`).join(' · ');
  metrics.append(
    metric(
      'Emulatoren',
      formatNumber(source.emulators.length),
      emulatorNames || 'Keine Dienste gemeldet',
    ),
    metric('Cloud-Kosten', '0', 'Firebase Emulator Suite rechnet keine Cloud-Operationen ab'),
    metric(
      'Maps im Dev-Build',
      'API-Key-Projekt',
      'Native Google-Maps-Aufrufe werden dem Cloud-Projekt des verwendeten API-Keys zugerechnet.',
    ),
  );
  panel.append(metrics);
  return panel;
}

function environmentPanel(environment) {
  if (environment.id === 'local') return localEnvironmentPanel(environment);

  const panel = document.createElement('section');
  panel.className = `environment-panel ${environment.id}`;
  panelHeader(
    panel,
    environment.projectId,
    environment.label,
    environment.id === 'staging' ? 'STAGING' : 'PROD',
  );

  const metrics = document.createElement('div');
  metrics.className = 'metric-grid';
  const firebase = environment.sources.firebase;
  const firebaseMessage = sourceState(firebase, 'Firebase ist nicht eingerichtet.');
  if (firebaseMessage) {
    metrics.append(emptyState('Firebase-Datenbestand', firebaseMessage));
  } else {
    const data = firebase.metrics;
    [
      ['Auth-Konten', formatNumber(data.authUsers), 'Firebase Authentication'],
      [
        'Profile',
        formatNumber(data.profiles),
        `${formatNumber(data.users)} private Nutzerdokumente`,
      ],
      ['Gerade offen', formatNumber(data.activePresence), 'Nicht abgelaufene Präsenz'],
      [
        'Aktivitäten',
        formatNumber(data.activities),
        `${formatNumber(data.activitiesLast7Days)} in den letzten 7 Tagen`,
      ],
      ['Chats', formatNumber(data.chats), `${formatNumber(data.messages)} Nachrichten gesamt`],
      ['Freundschaften', formatNumber(data.friendships), 'Bestätigte Beziehungen'],
    ].forEach(([label, value, detail]) => metrics.append(metric(label, value, detail)));
  }

  const operations = environment.sources.firestoreOperations;
  const operationsMessage = sourceState(
    operations,
    'Cloud Monitoring muss für das Projekt lesbar sein.',
  );
  if (operationsMessage) {
    metrics.append(emptyState('Firestore-Operationen', operationsMessage));
  } else {
    const data = operations.operations;
    [
      [
        'Firestore Reads',
        formatNumber(data.reads),
        `Erfolgreiche Dokument-Reads · ${operations.days} Tage`,
      ],
      [
        'Firestore Writes',
        formatNumber(data.writes),
        `Erfolgreiche Dokument-Writes · ${operations.days} Tage`,
      ],
      [
        'Firestore Deletes',
        formatNumber(data.deletes),
        `Erfolgreiche Dokument-Deletes · ${operations.days} Tage`,
      ],
    ].forEach(([label, value, detail]) => metrics.append(metric(label, value, detail)));
  }

  panel.append(metrics);
  return panel;
}

function integrationPanel(title, subtitle, entries) {
  const section = document.createElement('section');
  section.className = 'integration-panel';
  panelHeader(section, subtitle, title);
  const content = document.createElement('div');
  content.className = 'integration-content';
  entries.forEach((entry) => {
    if (entry.empty) content.append(emptyState(entry.label, entry.empty));
    else content.append(metric(entry.label, entry.value, entry.detail));
  });
  section.append(content);
  return section;
}

function cloudEnvironments(data) {
  return data.environments.filter((environment) => environment.id !== 'local');
}

function integrations(data) {
  integrationGrid.replaceChildren();
  const environments = cloudEnvironments(data);
  const analyticsEntries = environments.map((environment) => {
    const source = environment.sources.analytics;
    const unavailable = sourceState(
      source,
      'GA4-Property-ID lokal konfigurieren und die Google Analytics Data API freigeben.',
    );
    if (unavailable) return { label: environment.label, empty: unavailable };
    return {
      label: environment.label,
      value: `${formatNumber(source.activeUsers)} aktiv`,
      detail: `${formatNumber(source.newUsers)} neu · ${formatNumber(source.sessions)} Sitzungen · ${source.days} Tage`,
    };
  });
  integrationGrid.append(integrationPanel('Firebase Analytics', 'GA4', analyticsEntries));

  const mapsEntries = environments.flatMap((environment) => {
    const source = environment.sources.maps;
    const unavailable = sourceState(source, 'Noch keine Karten- oder Places-Anfragen im Zeitraum.');
    if (unavailable) return [{ label: environment.label, empty: unavailable }];
    const total = {
      label: `${environment.label} gesamt`,
      value: formatNumber(source.requests),
      detail: `Maps- und Places-Anfragen · ${source.days} Tage`,
    };
    const byMethod = source.methods.map((method) => ({
      label: `${environment.label} · ${method.label}`,
      value: formatNumber(method.requests),
      detail: method.method || method.service,
    }));
    return [total, ...byMethod];
  });
  integrationGrid.append(
    integrationPanel('Google Maps & Places', 'Cloud Monitoring · Methoden', mapsEntries),
  );

  integrationGrid.append(
    integrationPanel('Kostenabdeckung', 'Was automatisch erfasst wird', [
      {
        label: 'Google / Firebase / Maps',
        value: 'Vollständig',
        detail:
          'Jede abgerechnete SKU der beiden Cloud-Projekte erscheint im Billing-Export unten.',
      },
      {
        label: 'Lokale Emulatoren',
        value: '0',
        detail:
          'Keine Firebase-Cloud-Kosten. Maps-Aufrufe eines Dev-Clients gehören zum API-Key-Projekt.',
      },
      {
        label: 'Expo/EAS & Apple',
        value: 'Extern',
        detail:
          'Diese Anbieter schreiben keine Kosten in Google Cloud Billing und bleiben in ihren eigenen Portalen.',
      },
    ]),
  );
}

function billingPanel(environment, billing) {
  const panel = document.createElement('section');
  panel.className = 'billing-panel';
  panelHeader(
    panel,
    environment.projectId,
    environment.label,
    environment.id === 'staging' ? 'STAGING' : 'PROD',
  );
  const lines = billing.lines.filter((line) => line.projectId === environment.projectId);
  const total = billing.costs[environment.id] ?? 0;
  panel.append(
    metric(
      'Kosten bisher',
      formatCost(total, billing.currency),
      `Seit ${dateFormatter.format(new Date(billing.monthStart))}, inklusive Credits`,
    ),
  );

  if (lines.length === 0) {
    panel.append(
      emptyState(
        'Keine Kostenzeilen',
        'Für diesen Monat enthält der Export bisher keine abgerechnete SKU.',
      ),
    );
    return panel;
  }

  const tableWrap = document.createElement('div');
  tableWrap.className = 'cost-table-wrap';
  const table = document.createElement('table');
  table.className = 'cost-table';
  const head = document.createElement('thead');
  head.innerHTML = '<tr><th>Dienst</th><th>SKU</th><th>Kosten</th></tr>';
  const body = document.createElement('tbody');
  lines.forEach((line) => {
    const row = document.createElement('tr');
    [line.service, line.sku, formatCost(line.cost, line.currency || billing.currency)].forEach(
      (value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      },
    );
    body.append(row);
  });
  table.append(head, body);
  tableWrap.append(table);
  panel.append(tableWrap);
  return panel;
}

function renderBilling(data) {
  billingBreakdown.replaceChildren();
  const billing = data.billing;
  if (billing.state !== 'ready') {
    billingBreakdown.append(
      emptyState(
        'Cloud Billing noch nicht verbunden',
        'Für exakte Kosten den Standardexport der Cloud-Billing-Konto nach BigQuery konfigurieren und die beiden lokalen Variablen in admin/README.md setzen.',
      ),
    );
    return;
  }
  billingBreakdown.append(
    ...cloudEnvironments(data).map((environment) => billingPanel(environment, billing)),
  );
}

function render(data) {
  environmentGrid.replaceChildren(...data.environments.map(environmentPanel));
  integrations(data);
  renderBilling(data);
  updatedAt.textContent = `Live · aktualisiert ${dateFormatter.format(new Date(data.generatedAt))}`;
}

function connectLiveStream() {
  const stream = new EventSource('/api/stream');
  stream.addEventListener('overview', (event) => {
    try {
      render(JSON.parse(event.data));
      notice.classList.add('hidden');
    } catch {
      notice.textContent = 'Live-Daten konnten nicht dargestellt werden.';
      notice.classList.remove('hidden');
    }
  });
  stream.addEventListener('error', () => {
    notice.textContent = 'Die Live-Verbindung wird erneut hergestellt …';
    notice.classList.remove('hidden');
  });
}

async function load({ force = false } = {}) {
  refreshButton.disabled = true;
  refreshButton.textContent = force ? 'Aktualisiert …' : 'Lädt …';
  try {
    if (force) await fetch('/api/refresh', { method: 'POST' });
    const response = await fetch('/api/overview', { cache: 'no-store' });
    if (!response.ok) throw new Error('Dashboard-Daten konnten nicht geladen werden.');
    render(await response.json());
    notice.classList.add('hidden');
  } catch (error) {
    notice.textContent =
      error instanceof Error ? error.message : 'Dashboard-Daten konnten nicht geladen werden.';
    notice.classList.remove('hidden');
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Aktualisieren';
  }
}

refreshButton.addEventListener('click', () => void load({ force: true }));
connectLiveStream();
