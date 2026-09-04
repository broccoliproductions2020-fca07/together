# Firebase architecture and operating rules

This document describes the current executable architecture. It is intentionally
short: source code, Firebase Rules and Cloud Functions take precedence when a
detail changes.

## Environments

| Environment | EAS profile   | Firebase target              | Native configuration                           |
| ----------- | ------------- | ---------------------------- | ---------------------------------------------- |
| Development | `development` | Local Emulator Suite         | `firebase/native/dev/`                         |
| Staging     | `staging`     | Firebase development project | `firebase/native/staging/` or EAS secret files |
| Production  | `production`  | Firebase production project  | `firebase/native/prod/` or EAS secret files    |

`APP_VARIANT` is mandatory in an EAS worker. Local configuration defaults to
`development` and requires `EXPO_PUBLIC_FIREBASE_EMULATORS=true`; it must never
silently select production. The native Firebase identity comes only from the
Google service files, not JavaScript environment variables.

`.firebaserc` aliases the default project to development. Every production
deploy explicitly uses `--project prod`.

## Client boundary

Every backend domain has a service interface and a single exported service
instance. UI and providers import that seam, never a Firebase SDK implementation
directly. There is currently one implementation per domain: Firebase. There is
no client mock backend and no client seed data.

The application is native-only because it relies on React Native Firebase. The
browser preview canvas exists only as a component fallback; it is not a
supported product runtime.

## Offline and local sync

Firestore's native persistent cache remains the read cache. In addition, a
small AsyncStorage outbox is partitioned by Firebase account and wakes on a
network reconnect or app foreground; it does not poll while offline. Its first
two idempotent operations are creating an activity and sending a text message.
Both show their local optimistic result immediately and survive an app restart.

The client-generated activity id and text-message id are server idempotency
keys. A retry may therefore confirm an already-committed request but can never
create a second activity/message. Server-authorized decisions (joining/leaving,
friendship responses, invitations, Safety and Heimweg) are deliberately not
queued: their conditions can have changed while the device was offline.

The queue is capped at 100 operations per account. It contains no Places
content and does not replace server confirmation for Safety/Heimweg.

## Data authority

Firestore Rules are default-deny. Cloud Functions own operations that require
server authority, including activity creation and membership, audience
resolution, chat room summaries, notifications, moderation and rate limiting.
Clients use narrowly scoped direct writes only where Rules can prove ownership.

Cloud Functions run in `europe-west3`. Realtime Database serves only explicitly
active Anreise and Heimweg sessions; it stores a last point, not a trail.

### Time planning

Time planning is a **pre-Activity**, never an Activity with missing timestamps:
`timePlans/{planId}` holds host-owned source windows, while
`timePlanMembers/{uid}` holds one member's submitted interval array. A host
choice may contain several windows; a member keeps either no interval (rejected)
or one continuous interval inside each source window. The backend validates the
5-minute grid, 15-minute minimum, ordering and containment, so a client cannot
write availability outside an offer or silently reintroduce split ranges.

The full plan document is readable only after `joinTimePlan`. Each addressed
person receives one private `timePlanAudience/{planId}_{uid}` projection with
the safe plan fields and counts, but no audience or member identity array. That
projection powers one bounded inbox/map listener and flips to `joined` in the
same transaction as the submitted answer; the client then switches to the full
member plan. Server-only `timePlanInvites` remain the authorization source for
joining. This prevents an invitee from learning who else was invited before
sharing their own answer.

Legacy collecting rounds must be projected before the stricter Rules ship:
`npm run migrate:time-plan-audience -- --project <project> --apply` (production
also requires `--allow-prod`). The command is dry-run by default and idempotent.

The planning sheet owns one viewer-projection/full-plan subscription and one
bounded (50) member subscription only after joining. Dragging changes local
draft state; one `respondToTimePlan` callable publishes the whole response. `expireAt` is set
on the plan, member, invitation and audience-projection documents so abandoned planning data is
removed by Firestore TTL. A time plan has no map marker or chat until a future,
host-authorized lock operation creates a normal fixed-time Activity.

## Cost controls

- Every live Firestore query has a limit.
- Activity feed, circle data and chat room summaries are bounded subscriptions;
  a room's message listener exists only while that room is open.
- Friend presence listens only while the map surface is active.
- Push is a nudge, not a source of truth. Closed chat lists reconcile through a
  bounded read on foreground/list open.
- Places lookup runs through protected Cloud Functions with client debounce and
  one session token per active search; **Place content is never cached** (only
  the chosen Place ID may be retained). The server-side Places key lives in
  Firebase Secret Manager, while native Maps keys are injected only at build
  time.
- People lookup is callable-only, starts after a 350 ms client debounce and is
  held only in the open screen's short-lived memory cache. The private
  `friendSearch` index is not client-readable; `searchPeople` returns at most
  five discoverable, non-blocked identity cards and is capped at 10 searches
  per minute and 50 per Europe/Berlin calendar day.
- Existing cloud profiles are indexed once with
  `node scripts/backfill-friend-search.mjs --project dev|prod --apply`; without
  `--apply` the script is a read-only dry run. Do this only after the rules,
  composite index and `searchPeople` callable have been deployed together.
- Activity chats, group chats, presence and notifications carry expiry fields
  and need matching Firebase TTL policies in each cloud project.

## Timed server work

Concrete user-facing deadlines use Cloud Tasks in `europe-west3`; polling is a
bounded reconciliation path, never the primary delivery path.

- Creating or materially changing a planned Activity writes a server-owned
  `journeyReminderGeneration`. `scheduleJourneyReminder` enqueues exactly one
  `dispatchJourneyReminder` task for `startsAt - 1 h`. The task re-reads the
  Activity, requires the same generation and creates deterministic notification
  and push-outbox documents. A changed, cancelled or already-delivered Activity
  is therefore a harmless no-op, including duplicate task delivery.
- Writing `heimwege/{uid}/expiresAt` enqueues `dispatchSafetyAutoExtend` for the
  final six-minute window. The task checks the exact expected expiry with an
  RTDB ETag compare-and-set before extending. Manual extension and automatic
  extension both write a new expiry, which schedules the next task; older tasks
  cannot change the session.
- `maintainRuntime` is the one Cloud Scheduler job and runs every five minutes.
  It reconciles Safety extensions every run. Every quarter hour it performs the
  existing bounded cleanup and a late-only Anreise recovery pass for a missed
  task or an Activity created before this design existed. Recovery obtains a
  legacy generation when needed, then uses the same idempotent claim and
  deterministic outbox path as `dispatchJourneyReminder`. It must stay bounded
  and must not become a second delivery path for normal tasks.
- Task handlers are at-least-once. Their state checks and deterministic IDs are
  required invariants; do not replace them with best-effort fire-and-forget
  writes. The Functions runtime service account needs `cloudtasks.tasks.create`
  and its existing RTDB admin access on both cloud projects. The Firebase CLI
  creates the queues on their first targeted Functions deploy.

### Timer migration

Deploy `maintainRuntime`, `scheduleJourneyReminder`, `dispatchJourneyReminder`,
`scheduleSafetyAutoExtend` and `dispatchSafetyAutoExtend` first. Verify queue
creation and one Task enqueue in staging, then explicitly delete the retired
`cleanupJourneys`, `autoExtendSafetySessions` and `sendJourneyReminders`
functions in that project. The Functions deploy guard deliberately blocks a
broad deploy while those old remote exports still exist.

## Location rules

Presence has only two visibility modes: `pin` and `none`. `none` means no
distance and no map/navigation target. A visible activity place keeps its real
latitude and longitude; screen-canvas projection is browser-preview-only and is
never reused as geographic data.

Anreise and Heimweg are explicit opt-ins. Background location is allowed only
inside an active, visible session and stops automatically according to the
feature's lifecycle rules.

Anreise is available for every upcoming or running `now`/`soon` Activity with
a real map pin. Scheduled reminders go only to non-host participants one hour
before start; someone joining a near-term or already-running Activity gets the
single in-app offer instead. The server re-reads the current destination when a
device arms and again when movement begins, so push payloads are never location
authority. Each device uses a server-authorized session id and publishes one
last point with a two-minute freshness TTL. Participants may read only the
server-owned list of active session ids and then each still-fresh point directly;
the location collection and expired points cannot be read wholesale. The client
also removes expired points locally on a timer. Sharing ends at the earliest of
manual stop, confirmed arrival, two hours after departure, or 30 minutes after
Activity end; leaving, cancellation, blocking, account deletion and account
changes revoke the session too.

## Local verification

Start the Emulator Suite, seed it, then run the focused gates:

```powershell
npm run emulators
npm run emulators:seed
npm run test:firestore-rules
npm run test:storage-rules
npm run test:journey-rtdb
npm run test:functions
npm run test:safety-task
```

The complete release gate is `npm run verify:release`. CI installs the root and
`functions/` dependency trees separately, runs these tests, and audits runtime
dependencies for both.

## Release

Use [release-process.md](./release-process.md) for the staging and production
flow. Production uses immutable `v<app-version>` tags, protected GitHub
environments and workload identity federation; it does not rely on a developer
machine's Firebase login.
