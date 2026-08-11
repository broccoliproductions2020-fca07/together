/*
 * Como local operations dashboard
 *
 * This process deliberately listens on loopback only. It is an operator tool,
 * not a customer surface: do not expose it with a tunnel, reverse proxy, or
 * public hosting.
 */

const { createRequire } = require('node:module');
const { readFileSync, statSync } = require('node:fs');
const { createServer } = require('node:http');
const { extname, join, normalize, resolve } = require('node:path');

const { credential, initializeApp } = require('../scripts/firebase-admin-tools.cjs');

const functionsRequire = createRequire(resolve(__dirname, '..', 'functions', 'package.json'));
const { GoogleAuth } = functionsRequire('google-auth-library');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4310;
const CACHE_TTL_MS = 30_000;
const CLOUD_SOURCE_CACHE_TTL_MS = 5 * 60_000;
const BILLING_CACHE_TTL_MS = 5 * 60_000;
const MONITORING_DAYS = 30;
const EMULATOR_HUB_PORTS = [4400, 4401];
const PUBLIC_DIRECTORY = join(__dirname, 'public');
const FIREBASE_ADMIN_APPS = new Map();
const cache = new Map();
const streamClients = new Set();

let streamTimer = null;
let streamInFlight = false;

const PROJECTS = Object.freeze({
  staging: {
    id:
      process.env.TOGETHER_DASHBOARD_STAGING_PROJECT?.trim() ||
      process.env.TOGETHER_DASHBOARD_DEV_PROJECT?.trim() ||
      'together-dev-ce394',
    label: 'Staging',
    analyticsPropertyId:
      process.env.TOGETHER_DASHBOARD_GA4_STAGING_PROPERTY?.trim() ||
      process.env.TOGETHER_DASHBOARD_GA4_DEV_PROPERTY?.trim() ||
      null,
  },
  production: {
    id:
      process.env.TOGETHER_DASHBOARD_PRODUCTION_PROJECT?.trim() ||
      process.env.TOGETHER_DASHBOARD_PROD_PROJECT?.trim() ||
      'together-fca07',
    label: 'Produktion',
    analyticsPropertyId:
      process.env.TOGETHER_DASHBOARD_GA4_PRODUCTION_PROPERTY?.trim() ||
      process.env.TOGETHER_DASHBOARD_GA4_PROD_PROPERTY?.trim() ||
      null,
  },
});

const LOCAL_ENVIRONMENT = Object.freeze({
  id: 'local',
  label: 'Lokal',
  projectId: 'demo-together',
});

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/analytics.readonly',
];

const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
});

const CLOUD_PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const BILLING_TABLE =
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]\.[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

let googleAuth = null;
let googleClientPromise = null;
let dashboardCredentials = null;
let requireDashboardCredentials = false;

function parsePort(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || (port !== 0 && port < 1024) || port > 65535) {
    throw new Error(
      'TOGETHER_DASHBOARD_PORT muss 0 oder eine Portnummer zwischen 1024 und 65535 sein.',
    );
  }
  return port;
}

function getGoogleAuth() {
  if (requireDashboardCredentials && !dashboardCredentials) {
    throw new Error('Lokale Google-Anmeldedaten fehlen.');
  }
  googleAuth ??= new GoogleAuth({
    scopes: GOOGLE_SCOPES,
    ...(dashboardCredentials ? { credentials: dashboardCredentials } : {}),
  });
  return googleAuth;
}

function configureDashboardCredentials(credentials) {
  if (FIREBASE_ADMIN_APPS.size > 0) {
    throw new Error('Dashboard-Anmeldedaten müssen vor dem Serverstart gesetzt werden.');
  }
  if (
    !credentials ||
    credentials.type !== 'authorized_user' ||
    typeof credentials.client_id !== 'string' ||
    typeof credentials.client_secret !== 'string' ||
    typeof credentials.refresh_token !== 'string'
  ) {
    throw new Error('Die gespeicherte Google-Anmeldung ist ungültig.');
  }
  dashboardCredentials = credentials;
  googleAuth = null;
  googleClientPromise = null;
}

function getGoogleClient() {
  googleClientPromise ??= getGoogleAuth()
    .getClient()
    .catch((error) => {
      googleClientPromise = null;
      throw error;
    });
  return googleClientPromise;
}

function projectFor(environment) {
  const project = PROJECTS[environment];
  if (!project) throw new Error('Unbekannte Umgebung.');
  return project;
}

function dashboardApp(environment) {
  const existing = FIREBASE_ADMIN_APPS.get(environment);
  if (existing) return existing;

  const project = projectFor(environment);
  const app = initializeApp(
    {
      projectId: project.id,
      ...(dashboardCredentials
        ? { credential: credential.refreshToken(dashboardCredentials) }
        : {}),
    },
    `together-dashboard-${environment}`,
  );
  FIREBASE_ADMIN_APPS.set(environment, app);
  return app;
}

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function currentMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (
    lower.includes('could not load the default credentials') ||
    lower.includes('application default credentials')
  ) {
    return 'Lokale Google-Anmeldedaten fehlen.';
  }
  if (
    lower.includes('permission_denied') ||
    lower.includes('permission denied') ||
    lower.includes('insufficient permissions')
  ) {
    return 'Für diese Datenquelle fehlt eine Leseberechtigung.';
  }
  if (lower.includes('not found') || lower.includes('does not exist')) {
    return 'Die konfigurierte Google-Ressource wurde nicht gefunden.';
  }
  return 'Datenquelle ist momentan nicht erreichbar.';
}

async function cached(key, ttl, loader) {
  const previous = cache.get(key);
  if (previous && Date.now() - previous.createdAt < ttl) return previous.value;

  const value = await loader();
  cache.set(key, { createdAt: Date.now(), value });
  return value;
}

async function countQuery(query) {
  const aggregate = await query.count().get();
  return number(aggregate.data().count);
}

async function countAuthUsers(auth) {
  let pageToken;
  let total = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    total += page.users.length;
    pageToken = page.pageToken;
  } while (pageToken);
  return total;
}

async function firebaseUsage(environment) {
  // Avoid initializing the Admin SDK until application-default credentials are
  // available. Otherwise its gRPC transport can surface a second background
  // credential rejection after we have already returned a friendly UI state.
  await getGoogleClient();
  const { auth, firestore } = dashboardApp(environment);
  const db = firestore();
  const now = new Date();

  const [
    authUsers,
    users,
    profiles,
    activePresence,
    activities,
    activitiesLast7Days,
    chats,
    messages,
    friendships,
  ] = await Promise.all([
    countAuthUsers(auth()),
    countQuery(db.collection('users')),
    countQuery(db.collection('publicProfiles')),
    countQuery(db.collection('presence').where('expiresAt', '>', now)),
    countQuery(db.collection('activities')),
    countQuery(db.collection('activities').where('createdAt', '>=', timestampDaysAgo(7))),
    countQuery(db.collection('chats')),
    countQuery(db.collectionGroup('messages')),
    countQuery(db.collection('friendships')),
  ]);

  return {
    state: 'ready',
    generatedAt: new Date().toISOString(),
    metrics: {
      authUsers,
      users,
      profiles,
      activePresence,
      activities,
      activitiesLast7Days,
      chats,
      messages,
      friendships,
    },
  };
}

async function googleRequest(options) {
  const client = await getGoogleClient();
  const response = await client.request(options);
  return response.data;
}

function metricPointValue(point) {
  if (!point?.value) return 0;
  return number(
    point.value.int64Value ?? point.value.doubleValue ?? point.value.distributionValue?.count,
  );
}

function sumMetricSeries(series) {
  return series.reduce((total, item) => total + metricPointValue(item.points?.[0]), 0);
}

function monitoringWindow() {
  return {
    endTime: new Date(),
    startTime: timestampDaysAgo(MONITORING_DAYS),
  };
}

async function monitoringSeries(environment, metricType, resourceType, groupByFields = []) {
  const project = projectFor(environment);
  const { startTime, endTime } = monitoringWindow();
  const parameters = new URLSearchParams({
    filter: `metric.type = "${metricType}" AND resource.type = "${resourceType}"`,
    'interval.startTime': startTime.toISOString(),
    'interval.endTime': endTime.toISOString(),
    'aggregation.alignmentPeriod': `${MONITORING_DAYS * 24 * 60 * 60}s`,
    'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  });
  for (const field of groupByFields) parameters.append('aggregation.groupByFields', field);

  const response = await googleRequest({
    url: `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(project.id)}/timeSeries?${parameters}`,
  });
  return response.timeSeries ?? [];
}

async function firestoreOperationsUsage(environment) {
  const metricDefinitions = {
    reads: 'firestore.googleapis.com/document/read_count',
    writes: 'firestore.googleapis.com/document/write_count',
    deletes: 'firestore.googleapis.com/document/delete_count',
  };
  const entries = await Promise.all(
    Object.entries(metricDefinitions).map(async ([name, metricType]) => [
      name,
      sumMetricSeries(await monitoringSeries(environment, metricType, 'firestore_instance')),
    ]),
  );
  return {
    state: 'ready',
    days: MONITORING_DAYS,
    operations: Object.fromEntries(entries),
  };
}

function mapsMethodLabel(service, method) {
  const normalized = `${service} ${method}`.toLowerCase();
  if (/autocomplete/.test(normalized)) return 'Places Autocomplete';
  if (/searchnearby|nearbysearch/.test(normalized)) return 'Places POI Nearby Search';
  if (/searchtext|textsearch/.test(normalized)) return 'Places POI Text Search';
  if (/placedetails|fetchplace|\/places\//.test(normalized)) return 'Places Details';
  if (/places/.test(normalized)) return method || 'Andere Places-Anfragen';
  return method || 'Google Maps';
}

async function mapsUsage(environment) {
  const series = await monitoringSeries(
    environment,
    'serviceruntime.googleapis.com/api/request_count',
    'consumed_api',
    ['resource.labels.service', 'resource.labels.method'],
  );
  const methods = series
    .map((item) => ({
      service: item.resource?.labels?.service ?? '',
      method: item.resource?.labels?.method ?? '',
      requests: metricPointValue(item.points?.[0]),
    }))
    .filter(({ service }) =>
      /(^|\.)maps\.googleapis\.com$|(^|\.)places\.googleapis\.com$/i.test(service),
    )
    .map((item) => ({ ...item, label: mapsMethodLabel(item.service, item.method) }))
    .sort((a, b) => b.requests - a.requests || a.label.localeCompare(b.label));

  return {
    state: 'ready',
    days: MONITORING_DAYS,
    requests: methods.reduce((total, item) => total + item.requests, 0),
    methods,
  };
}

async function analyticsUsage(environment) {
  const project = projectFor(environment);
  if (!project.analyticsPropertyId) {
    return { state: 'not-configured' };
  }

  const response = await googleRequest({
    method: 'POST',
    url: `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(project.analyticsPropertyId)}:runReport`,
    data: {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' }],
    },
  });
  const values = response.rows?.[0]?.metricValues ?? [];
  return {
    state: 'ready',
    days: 30,
    activeUsers: number(values[0]?.value),
    newUsers: number(values[1]?.value),
    sessions: number(values[2]?.value),
  };
}

async function localEmulatorEnvironment() {
  const attempts = EMULATOR_HUB_PORTS.map(async (port) => {
    const response = await fetch(`http://${HOST}:${port}/emulators`, {
      signal: AbortSignal.timeout(750),
    });
    if (!response.ok) throw new Error(`Emulator Hub on port ${port} is unavailable.`);
    return { port, data: await response.json() };
  });

  try {
    const { port, data } = await Promise.any(attempts);
    const emulators = Object.entries(data)
      .filter(([name]) => name !== 'hub')
      .map(([name, emulator]) => ({ name, port: emulator.port }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      ...LOCAL_ENVIRONMENT,
      emulatorHubPort: port,
      sources: {
        local: { state: 'ready', emulators },
      },
    };
  } catch {
    return {
      ...LOCAL_ENVIRONMENT,
      sources: {
        local: {
          state: 'unavailable',
          message:
            'Emulator Suite ist nicht gestartet. Lokale Tests verursachen keine Cloud-Kosten.',
        },
      },
    };
  }
}

async function collectEnvironment(environment) {
  const project = projectFor(environment);
  const results = await Promise.allSettled([
    cached(`firebase:${environment}`, CLOUD_SOURCE_CACHE_TTL_MS, () => firebaseUsage(environment)),
    cached(`firestore-operations:${environment}`, CLOUD_SOURCE_CACHE_TTL_MS, () =>
      firestoreOperationsUsage(environment),
    ),
    cached(`maps:${environment}`, CLOUD_SOURCE_CACHE_TTL_MS, () => mapsUsage(environment)),
    cached(`analytics:${environment}`, CLOUD_SOURCE_CACHE_TTL_MS, () =>
      analyticsUsage(environment),
    ),
  ]);
  const [firebaseResult, firestoreOperationsResult, mapsResult, analyticsResult] = results;

  return {
    id: environment,
    label: project.label,
    projectId: project.id,
    sources: {
      firebase:
        firebaseResult.status === 'fulfilled'
          ? firebaseResult.value
          : { state: 'unavailable', message: safeError(firebaseResult.reason) },
      firestoreOperations:
        firestoreOperationsResult.status === 'fulfilled'
          ? firestoreOperationsResult.value
          : { state: 'unavailable', message: safeError(firestoreOperationsResult.reason) },
      maps:
        mapsResult.status === 'fulfilled'
          ? mapsResult.value
          : { state: 'unavailable', message: safeError(mapsResult.reason) },
      analytics:
        analyticsResult.status === 'fulfilled'
          ? analyticsResult.value
          : { state: 'unavailable', message: safeError(analyticsResult.reason) },
    },
  };
}

function billingConfiguration() {
  const billingProject = process.env.TOGETHER_DASHBOARD_BILLING_PROJECT?.trim();
  const billingTable = process.env.TOGETHER_DASHBOARD_BILLING_TABLE?.trim();
  if (!billingProject || !billingTable) return null;
  if (!CLOUD_PROJECT_ID.test(billingProject) || !BILLING_TABLE.test(billingTable)) {
    throw new Error('Die lokale Billing-Konfiguration enthält keine gültige BigQuery-Referenz.');
  }
  return { billingProject, billingTable };
}

async function allBigQueryRows(configuration, initialResponse) {
  if (!initialResponse.jobComplete || !initialResponse.jobReference?.jobId) {
    throw new Error('Die Billing-Abfrage wurde nicht rechtzeitig abgeschlossen.');
  }

  const rows = [...(initialResponse.rows ?? [])];
  let pageToken = initialResponse.pageToken;
  while (pageToken) {
    const parameters = new URLSearchParams({ maxResults: '1000', pageToken });
    if (initialResponse.jobReference.location) {
      parameters.set('location', initialResponse.jobReference.location);
    }
    const page = await googleRequest({
      url: `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(configuration.billingProject)}/queries/${encodeURIComponent(initialResponse.jobReference.jobId)}?${parameters}`,
    });
    rows.push(...(page.rows ?? []));
    pageToken = page.pageToken;
  }
  return rows;
}

async function billingCosts() {
  const configuration = billingConfiguration();
  if (!configuration) return { state: 'not-configured' };

  const projects = Object.values(PROJECTS).map((project) => project.id);
  const projectList = projects.map((project) => `'${project.replaceAll("'", "\\'")}'`).join(', ');
  const response = await googleRequest({
    method: 'POST',
    url: `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(configuration.billingProject)}/queries`,
    data: {
      useLegacySql: false,
      maxResults: 1000,
      query: `SELECT\n  project.id AS project_id,\n  service.description AS service,\n  sku.description AS sku,\n  currency,\n  ROUND(SUM(cost + IFNULL((SELECT SUM(credit.amount) FROM UNNEST(credits) AS credit), 0)), 2) AS cost\nFROM \`${configuration.billingTable}\`\nWHERE usage_start_time >= TIMESTAMP('${currentMonthStart().toISOString()}')\n  AND project.id IN (${projectList})\nGROUP BY project_id, service, sku, currency\nHAVING ABS(SUM(cost + IFNULL((SELECT SUM(credit.amount) FROM UNNEST(credits) AS credit), 0))) > 0\nORDER BY cost DESC`,
    },
  });

  const rows = await allBigQueryRows(configuration, response);
  const lines = rows.map((row) => ({
    projectId: row.f?.[0]?.v ?? '',
    service: row.f?.[1]?.v ?? 'Unbekannter Dienst',
    sku: row.f?.[2]?.v ?? 'Unbekannte SKU',
    currency: row.f?.[3]?.v ?? '',
    cost: number(row.f?.[4]?.v),
  }));
  return {
    state: 'ready',
    currency: lines[0]?.currency || 'billing-account-currency',
    monthStart: currentMonthStart().toISOString(),
    costs: Object.fromEntries(
      Object.entries(PROJECTS).map(([environment, project]) => [
        environment,
        lines
          .filter((line) => line.projectId === project.id)
          .reduce((total, line) => total + line.cost, 0),
      ]),
    ),
    lines,
  };
}

async function overview() {
  const [local, staging, production, billing] = await Promise.all([
    cached('local-emulator', CACHE_TTL_MS, localEmulatorEnvironment),
    collectEnvironment('staging'),
    collectEnvironment('production'),
    cached('billing', BILLING_CACHE_TTL_MS, billingCosts),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    environments: [local, staging, production],
    billing,
  };
}

function writeStreamEvent(response, event, body) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`);
}

async function broadcastOverview() {
  if (streamInFlight || streamClients.size === 0) return;
  streamInFlight = true;
  try {
    const data = await overview();
    for (const response of streamClients) writeStreamEvent(response, 'overview', data);
  } catch (error) {
    console.error('[dashboard] stream refresh failed', error);
    for (const response of streamClients) {
      writeStreamEvent(response, 'error', {
        message: 'Live-Daten konnten nicht aktualisiert werden.',
      });
    }
  } finally {
    streamInFlight = false;
  }
}

function ensureStreamTimer() {
  if (streamTimer) return;
  streamTimer = setInterval(() => void broadcastOverview(), CACHE_TTL_MS);
}

function stopStreamTimerIfUnused() {
  if (streamClients.size > 0 || !streamTimer) return;
  clearInterval(streamTimer);
  streamTimer = null;
}

function openStream(_request, response) {
  response.socket?.setKeepAlive(true);
  response.socket?.setTimeout(0);
  response.writeHead(200, {
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  });
  response.flushHeaders();
  response.write('retry: 5000\n\n');
  streamClients.add(response);
  ensureStreamTimer();
  void (async () => {
    try {
      writeStreamEvent(response, 'overview', await overview());
    } catch (error) {
      console.error('[dashboard] initial stream load failed', error);
      writeStreamEvent(response, 'error', { message: 'Live-Daten konnten nicht geladen werden.' });
    }
  })();

  response.on('close', () => {
    streamClients.delete(response);
    stopStreamTimerIfUnused();
  });
}

function json(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function staticFile(response, requestedPath) {
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '');
  const filePath = normalize(join(PUBLIC_DIRECTORY, relativePath));
  if (
    !filePath.startsWith(`${PUBLIC_DIRECTORY}${require('node:path').sep}`) &&
    filePath !== join(PUBLIC_DIRECTORY, 'index.html')
  ) {
    json(response, 404, { error: 'Nicht gefunden.' });
    return;
  }

  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
      'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    response.end(readFileSync(filePath));
  } catch {
    json(response, 404, { error: 'Nicht gefunden.' });
  }
}

function isLocalRequest(request) {
  const address = request.socket.remoteAddress;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

async function requestHandler(request, response) {
  if (!isLocalRequest(request)) {
    json(response, 403, { error: 'Dieses Dashboard ist nur lokal erreichbar.' });
    return;
  }

  const url = new URL(request.url ?? '/', `http://${HOST}`);
  if (request.method === 'GET' && url.pathname === '/api/health') {
    json(response, 200, { status: 'ok', host: HOST });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/overview') {
    try {
      json(response, 200, await overview());
    } catch (error) {
      console.error('[dashboard] overview failed', error);
      json(response, 500, { error: 'Dashboard-Daten konnten nicht geladen werden.' });
    }
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/stream') {
    openStream(request, response);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/refresh') {
    cache.clear();
    json(response, 200, { status: 'cleared' });
    return;
  }
  if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
    staticFile(response, url.pathname);
    return;
  }

  json(response, 404, { error: 'Nicht gefunden.' });
}

function startDashboard(options = {}) {
  requireDashboardCredentials = options.requireCredentials === true;
  if (options.credentials) configureDashboardCredentials(options.credentials);
  const port = parsePort(options.port ?? process.env.TOGETHER_DASHBOARD_PORT);
  const server = createServer((request, response) => {
    void requestHandler(request, response);
  });
  server.listen(port, HOST, () => {
    const address = server.address();
    const activePort = typeof address === 'object' && address ? address.port : port;
    console.log(`Como Betrieb läuft nur lokal auf http://${HOST}:${activePort}`);
    console.log('Zum Beenden: Strg+C');
  });
  return server;
}

if (require.main === module) startDashboard();

module.exports = { startDashboard };
