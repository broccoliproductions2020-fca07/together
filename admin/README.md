# Mica Betrieb (localhost)

This is a private operations dashboard for the Mica project. It is a
separate Node process, is bound exclusively to `127.0.0.1`, and must never be
served through a tunnel, proxy, or public host.

## Start

Recommended on this Windows computer:

```powershell
npm run dashboard:desktop
```

The desktop app starts the dashboard on its own private loopback port and uses
the Windows-encrypted Google login you connect from its **Google** menu.

For the browser-only version:

```powershell
npm run dashboard
```

Then open `http://127.0.0.1:4310` in a browser on this computer. The dashboard
does not listen on the LAN; other devices cannot open it.

## Firebase and Google credentials

The server uses [Application Default Credentials](https://cloud.google.com/docs/authentication/provide-credentials-adc)
from the local machine. A practical setup is to install the Google Cloud CLI,
then run:

```powershell
gcloud auth application-default login
```

Use an account that has read-only access to both Firebase/Google Cloud projects:

- Staging: `together-dev-ce394`
- Production: `together-fca07`

The dashboard has three clearly separated environments:

- **Local** — checks whether the Emulator Suite is running. It does not create
  Firebase Cloud costs. Native Google Maps calls made by a local dev client are
  billed to the Cloud project that owns its Maps API key and therefore appear
  under Staging or Production.
- **Staging** — `together-dev-ce394`
- **Production** — `together-fca07`

The Firebase state counters use Firebase Admin with read-only operations. Cloud
sources are cached for five minutes (Firestore and Maps monitoring data is not
real-time anyway); the page itself receives a local live update every 30
seconds while open. This creates no Firestore listeners. The dashboard never
reads user names, chat text, media, search terms, precise locations, or journey
points.

For Staging and Production it also reads Cloud Monitoring's aggregate Firestore
document reads, writes and deletes over the previous 30 days. These are useful
operational indicators but are not a final invoice: Cloud Billing is the source
of truth for charged usage.

## Optional Google Analytics

Enable the Google Analytics Data API and set the GA4 property IDs before
starting the dashboard:

```powershell
$env:TOGETHER_DASHBOARD_GA4_STAGING_PROPERTY = '123456789'
$env:TOGETHER_DASHBOARD_GA4_PRODUCTION_PROPERTY = '987654321'
npm run dashboard
```

The signed-in Google account also needs read access to the respective Analytics
properties. Analytics data remains separated between staging and production.

## Optional exact costs

Exact month-to-date costs need a Cloud Billing standard export to BigQuery. This
is optional: without it, the dashboard remains usable and shows a clear setup
state instead of estimating costs. When configured, it lists **every billed
service and SKU** in the Staging and Production projects, including Firebase,
Firestore, Cloud Functions, Storage, Realtime Database, Maps and future Google
Cloud services. BigQuery storage and queries can have costs, so use a monthly
partitioned export and keep the dashboard's read-only query limits in place.

After enabling the export, set the billing-query project and full table name:

```powershell
$env:TOGETHER_DASHBOARD_BILLING_PROJECT = 'your-billing-query-project'
$env:TOGETHER_DASHBOARD_BILLING_TABLE = 'your-billing-project.billing_dataset.gcp_billing_export_v1_ABCDEF_123456_ABCDEF'
npm run dashboard
```

The billing query includes only the two Mica project IDs and only the
current calendar month. Results are cached for five minutes, because Google
Billing data is not a real-time source. Costs outside the Google Cloud Billing
account (for example Expo/EAS subscriptions and the Apple Developer Program)
cannot be retrieved from Firebase or Google and stay visible as external
providers in the dashboard.

## Optional project overrides

The default project IDs are read from the repository's documented Firebase
targets. Only override them for a deliberate migration or a dedicated test
project:

```powershell
$env:TOGETHER_DASHBOARD_STAGING_PROJECT = 'another-staging-project'
$env:TOGETHER_DASHBOARD_PRODUCTION_PROJECT = 'another-production-project'
```

No credentials, API keys, billing account IDs, or Firebase configuration files
belong in this repository.
