# Firebase architecture and operating rules

This document describes the current executable architecture. It is intentionally
short: source code, Firebase Rules and Cloud Functions take precedence when a
detail changes.

## Environments

| Environment | EAS profile | Firebase target | Native configuration |
| --- | --- | --- | --- |
| Development | `development` | Local Emulator Suite | `firebase/native/dev/` |
| Staging | `staging` | Firebase development project | `firebase/native/staging/` or EAS secret files |
| Production | `production` | Firebase production project | `firebase/native/prod/` or EAS secret files |

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

## Data authority

Firestore Rules are default-deny. Cloud Functions own operations that require
server authority, including activity creation and membership, audience
resolution, chat room summaries, notifications, moderation and rate limiting.
Clients use narrowly scoped direct writes only where Rules can prove ownership.

Cloud Functions run in `europe-west3`. Realtime Database serves only explicitly
active Anreise and Heimweg sessions; it stores a last point, not a trail.

## Cost controls

- Every live Firestore query has a limit.
- Activity feed, circle data and chat room summaries are bounded subscriptions;
  a room's message listener exists only while that room is open.
- Friend presence listens only while the map surface is active.
- Push is a nudge, not a source of truth. Closed chat lists reconcile through a
  bounded read on foreground/list open.
- Places lookup runs through a Cloud Function with client debounce and session
  tokens; maps keys are injected only at native build time.
- Activity chats, group chats, presence and notifications carry expiry fields
  and need matching Firebase TTL policies in each cloud project.

## Location rules

Presence has only two visibility modes: `pin` and `none`. `none` means no
distance and no map/navigation target. A visible activity place keeps its real
latitude and longitude; screen-canvas projection is browser-preview-only and is
never reused as geographic data.

Anreise and Heimweg are explicit opt-ins. Background location is allowed only
inside an active, visible session and stops automatically according to the
feature's lifecycle rules.

## Local verification

Start the Emulator Suite, seed it, then run the focused gates:

```powershell
npm run emulators
npm run emulators:seed
npm run test:firestore-rules
npm run test:storage-rules
npm run test:journey-rtdb
npm run test:functions
```

The complete release gate is `npm run verify:release`. CI installs the root and
`functions/` dependency trees separately, runs these tests, and audits runtime
dependencies for both.

## Release

Use [release-process.md](./release-process.md) for the staging and production
flow. Production uses immutable `v<app-version>` tags, protected GitHub
environments and workload identity federation; it does not rely on a developer
machine's Firebase login.
