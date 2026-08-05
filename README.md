# Together

Together is a native app for spontaneous meetups between confirmed friends. The
client is built with Expo/React Native and uses Firebase Auth, Firestore,
Realtime Database, Storage and Cloud Functions.

## Development model

The app has one backend implementation: Firebase. Development and releases run
the same client code against different Firebase targets.

| Environment | App identity | Firebase target | Purpose |
| --- | --- | --- | --- |
| Development | `com.broccolistudio.together.dev` | Local Emulator Suite | Daily development, no cloud cost |
| Staging | `com.broccolistudio.together.staging` | Firebase development project | Internal device tests |
| Production | `com.broccolistudio.together` | Firebase production project | Store release |

Expo Go and the browser are not supported application targets: Together uses
native Firebase modules. Use the custom development client.

## Local start

Use Node 20 (`.nvmrc`) and install both dependency sets once:

```powershell
npm ci
npm ci --prefix functions
npm run emulator
npm run emulators
npm run emulators:seed
npm run android:launch
```

`android:launch` starts the installed Android development client and Metro with
the local Firebase emulators. When native dependencies or configuration change,
run `npm run android:build` before launching again.

## Validation

```powershell
npm run check:node
npm run typecheck
npm run lint:src
npm run test:firestore-rules
npm run test:storage-rules
npm run test:journey-rtdb
npm run test:activity-backfill
npm run test:functions
npm run test:email-verification-gate
```

`npm run verify:release` executes the same functional release gates. The GitHub
workflow additionally audits production dependencies for both the app and Cloud
Functions.

## Repository layout

```text
src/
  app/          Thin Expo Router entry routes
  domain/       Cross-feature concepts such as activities, people and coordinates
  features/     Feature-specific screens, providers, services and UI
  providers/    Authenticated provider composition
  shared/       Reusable UI, services and utilities
functions/      Firebase Cloud Functions
scripts/        Emulator, validation and release helpers
docs/           Current architecture and release documentation
```

The backend architecture is documented in [docs/backend-plan.md](./docs/backend-plan.md).
For staging and production operation, follow [docs/release-process.md](./docs/release-process.md).
