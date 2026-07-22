# Together

A social app that helps friends come together spontaneously. Together is being
built as a production-ready Firebase app: Expo/React Native client, Firebase
Auth, Firestore, Storage, Realtime Database and Cloud Functions. The Firebase
Emulator Suite is the local development environment; mock mode remains a
deliberate offline fallback for UI work and automated tests.

> Product overview: [docs/product.md](./docs/product.md) ·
> Roadmap: [docs/roadmap.md](./docs/roadmap.md) ·
> Data model: [docs/data-model.md](./docs/data-model.md)

## Tech stack

- **Expo** (SDK 54) + **React Native** 0.81, **iOS-first** but Android-compatible
- **TypeScript** (strict)
- **Expo Router** (file-based routing, typed routes)
- **gluestack-ui** (v5 alpha) + **NativeWind / Tailwind** for the design system
- **ESLint** + **Prettier**

## Requirements

- Node.js 20+ (developed on Node 22)
- The **Expo Go** app on your iPhone (for on-device testing)

## Getting started

```bash
npm install
npx expo start
```

Then scan the QR code in the terminal with the Camera app / Expo Go on your
iPhone. You can also press `i` (iOS simulator), `a` (Android) or `w` (web).

## npm scripts

| script                 | what it does                      |
| ---------------------- | --------------------------------- |
| `npm start`            | start the Expo dev server         |
| `npm run ios`          | start and open the iOS simulator  |
| `npm run android`      | start and open Android            |
| `npm run web`          | start the web build               |
| `npm run typecheck`    | TypeScript check (`tsc --noEmit`) |
| `npm run lint`         | ESLint (`expo lint`)              |
| `npm run lint:fix`     | ESLint with autofix               |
| `npm run format`       | format the codebase with Prettier |
| `npm run format:check` | check formatting without writing  |

## Project structure

```
src/
  app/                 Expo Router routes (file-based)
    _layout.tsx        root layout: providers, auth gate, theme
    auth.tsx           mock auth screen
    (tabs)/
      _layout.tsx      route stack without visible tab bar
      index.tsx        Map-first app surface (Map / Calendar switch)
      profile.tsx      profile and settings
  components/
    ui/                gluestack-ui components (generated/vendored)
  features/            feature-based modules
    auth/              mock auth service + auth screen
    activities/        activity composer and location picker
    calendar/          calendar surface and plan detail sheet
    chat/              local activity chat provider + chat UI
    map/               native map canvas + web mock canvas
    overlay/           map overlays, sheets, speed dial
    settings/ theme/   persisted local preferences
  shared/              cross-feature building blocks
    components/        app design-system components (AppScreen, AppText)
    hooks/             shared hooks (e.g. color scheme)
    types/             core domain types
  data/
    mock/              users, circles, activities, map markers, places, chats
docs/                  product, roadmap and data-model docs
```

- **Path alias:** `@/*` maps to `src/*` (configured in `tsconfig.json`).
- **gluestack components** live under `src/components/ui` (gluestack's
  convention). Our own design-system components live in `src/shared/components`.

## Design system

The app is wrapped in the gluestack `GluestackUIProvider` and styled with
NativeWind utility classes. Dark mode is prepared via the system color scheme.
Reusable primitives live in [`src/shared/components`](./src/shared/components),
with map-specific floating controls under [`src/features/overlay`](./src/features/overlay).

## Map-first setup

The authenticated app now opens into a fullscreen map-first surface. On iOS and
Android, `MapCanvas` uses `react-native-maps` for a real pannable/zoomable map.
On web it falls back to `MockMapCanvas`.

- `src/features/map/components/MapCanvas.tsx` is the map rendering swap point.
- Native platforms render a real map with avatar markers, clusters and available
  markers.
- `MockMapCanvas` remains as a web/dev fallback.
- `Open`, `Soon` and `Now` use consistent marker ring, badge and CTA colors.
- `src/features/overlay` owns the floating map controls, activity detail sheet,
  nearby sheet and joined-activities sheet.
- Activity membership and chat state are local/mock-only in `ChatProvider`.

The current seed data still uses mock `{ x, y }` positions that are mapped to
Berlin test coordinates. Later these should become stored `latitude` /
`longitude` coordinates from the eventual backend or a Places result. No Places
API key is required for the current setup.

## Environment variables

The mock build works without environment variables. Firebase development uses
the local Emulator Suite; staging and production configuration belongs in
ignored `.env` files and must never be committed.

## Status

Together is a Firebase-backed production foundation with an offline mock
fallback. The current product surface includes real account/profile flows,
activity and chat lifecycles, Circle invitations, moderation, in-app
notifications, optional push registration, Socialize Functions and Journey
sharing. Before release, configure the Firebase project, App Check, TTL
policies, push credentials and production monitoring.
