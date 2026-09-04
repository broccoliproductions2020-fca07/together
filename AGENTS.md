# Together — App Spec & Development Rules

## What the App Is

**Together** is a spontaneous-meetup app for friend groups. It shows who from your Circles is currently open, available soon, or doing something right now — without a social feed, without posting, without broadcasting to strangers.

The core loop: set a mode (Open / Soon / Now) → friends nearby see it → someone reaches out → you meet up.

---

## Detailregeln — wo was steht

Diese Datei ist der Kern und wird in jeder Sitzung geladen. Die Detailregeln jedes Bereichs
liegen in `docs/areas/` und werden **nur gelesen, wenn dort gearbeitet wird**. Sie sind
verbindlich wie diese Datei — nicht optional, nur nicht immer im Kontext.

| Arbeitest du an … | dann lies zuerst |
| --- | --- |
| Karte, Kartenstile, Marker, Ringe, Kamera-Fokus | [docs/areas/map.md](docs/areas/map.md) |
| Activity-Detail, Beitreten, Verlassen, Gäste, Host-Wechsel | [docs/areas/activities.md](docs/areas/activities.md) |
| Activity Composer, Zeitband, Werkbänke, Kategorien | [docs/areas/composer.md](docs/areas/composer.md) |
| Nearby-Zahl, Radius, NearbySheet, „Offen"-Status | [docs/areas/nearby-presence.md](docs/areas/nearby-presence.md) |
| Anreise, Journey-Fokus, Hintergrundortung für Aktivitäten | [docs/areas/journey.md](docs/areas/journey.md) |
| Chat, Nachrichten, Gruppen, Postfach, Vorschläge | [docs/areas/chat-postfach.md](docs/areas/chat-postfach.md) |
| Kalenderkarte, Plan-Karten | [docs/areas/calendar.md](docs/areas/calendar.md) |
| Heimweg / Safety | [docs/areas/safety.md](docs/areas/safety.md) + [docs/safety-mode.md](docs/safety-mode.md) |
| Terminfindung, Zeitvorschläge, Antwortflächen | [docs/areas/time-planning.md](docs/areas/time-planning.md) |
| Anmeldung, Profil, Einstellungen, Freunde | [docs/areas/auth-profile.md](docs/areas/auth-profile.md) |

**Regel:** Bevor du eine Datei in einem dieser Bereiche änderst, lies das zugehörige Dokument.
Die Begründungen dort sind teuer erkauft — mehrere sind ausdrücklich als Umkehrung einer
früheren Entscheidung notiert, damit sie nicht ein drittes Mal getroffen wird.

**Wenn du eine dieser Regeln änderst, ändere sie in ihrer Bereichsdatei** — nicht hier, und
niemals als zweite Kopie.

## Code Comments

- Keep comments short and only for non-obvious rationale, security/privacy/cost constraints, or hard invariants.
- Do not comment code that already explains itself; remove redundant comments during related edits.
- Update or remove a comment as soon as its statement is no longer true.
- Put longer product or architectural context in the relevant focused documentation, not inline in implementation files.

## Project-local skills

- The project-local `frontend-design` and `ui-ux-pro-max` skills are reserved **exclusively** for an explicitly requested landing-page build or landing-page implementation.
- Do not use, apply, or silently draw guidance from either skill for the native Together app: this includes app UI, UX reviews, mockups, time planning, pickers, activity screens, and all other product work.
- This restriction applies to every agent working in this repository, including Codex and Claude, and remains in force in future chats unless the user explicitly changes it.

---

## Backend Strategy & Hard Constraints

**Target backend: Firebase** (Auth + Firestore + Storage + minimal Cloud Functions). The full architecture, data model, security concept, and build order live in **[docs/backend-plan.md](docs/backend-plan.md)** — read it before any backend work.

Rules that govern all backend work:

- **There is exactly ONE backend: Firebase (Produktentscheidung Juli 2026).** The mock implementation was deleted — all 12 `mock*Service` files, `src/data/mock`, and the `EXPO_PUBLIC_BACKEND` switch. Dev and production run **identical code** and differ only in WHICH Firebase they talk to. Do NOT reintroduce a second implementation of any service; a feature is done when the Firebase implementation works.
- **Three native environments.** The apps install side by side and never share production data:

  | Tier       | EAS profile    | Firebase                             | App                |
  | ---------- | -------------- | ------------------------------------ | ------------------ |
  | Local      | `development`  | Emulator Suite (`npm run emulators`) | Together Dev       |
  | Staging    | `staging`      | `together-dev-ce394`                 | Together Staging   |
  | Production | `production`   | `together-fca07`                     | Together           |

  `development`, `staging` and `production` have separate package/bundle identities.

- **Native identity comes ONLY from the config files**, never from a JS env var. `app.config.js` maps `APP_VARIANT` to `firebase/native/dev/`, `firebase/native/staging/` or `firebase/native/prod/`. A local config defaults safely to development; an EAS worker must set the variant explicitly. EAS secret files (`GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST`) override the local path.
- **Deploying:** `npm run deploy:dev` / `deploy:prod` (rules + indexes + functions), or the narrower `deploy:rules:*` / `deploy:functions:*`. `.firebaserc` deliberately aliases **`default` to dev**, so a bare `firebase deploy` cannot hit production by mistake — production always needs `--project prod`.
- **Functions run in `europe-west3`**, next to Firestore and Storage (`setGlobalOptions` in `functions/index.js`, mirrored by `FUNCTIONS_REGION` in `shared/services/firebase.ts` — the callable URL contains the region, so the two must match). RTDB sits in `europe-west1`; Frankfurt is not offered for it. Changing a function's region after the first deploy means deleting and recreating it, so this was fixed before any deploy happened.
- **The Emulator Suite is now a hard dependency of development.** There is no offline fallback any more: without `npm run emulators` the dev app cannot sign in or read anything. Java must be installed.
- **Web is no longer a target.** The production configuration explicitly targets only Android and iOS; the former web fallback was removed.
- **Service-seam pattern still applies** — every domain goes through an interface (like `AuthService` → `authService`) exported from ONE file. UI and providers never import a concrete implementation directly, so the seam stays available for a future swap even though only one implementation exists today.
- **Demo/test data comes from the emulator, never from the client.** `npm run emulators:seed` populates the running emulators with fake auth users, friendships, presence, activities, chats and one static Heimweg companion session — idempotent, befriends every existing dev account, writes exactly the doc shapes the cloud functions produce (update BOTH when a shape changes). `scripts/seed-emulators.mjs` owns the core data; `scripts/seed-heimweg.mjs --once` adds the standard Safety case, while `npm run emulators:seed:heimweg` keeps moving it for live testing. Never reintroduce client-side seed arrays mixed into real data (the old `PRESENCE_SEED` client merge was removed for exactly this reason). Note: `npm run emulators` starts with an EMPTY database — re-run the seed after a restart, or use `npm run emulators:persist`.
- **Keep active listeners minimal and every query `limit()`-ed** — this is the main cost-control rule. Currently active per session: Circles (`circles` query + a single-doc listener on `users/{uid}` for `closeFriendUids` — the cheapest possible listener type), Chat (messages of the open room; room summaries are cached and listened to only while the activity list is visible), Activities (feed), Journey (one per actively-watched activity, RTDB). Chat receives generic Push nudges for closed room lists and performs one bounded Firestore reconciliation on foreground/list-open; Push is never the source of truth. Friend Presence is deliberately active **only while the map surface is visible**; it must be stopped on every other surface while the own open-status write-through remains active. Don't add a new always-on listener without a reason — prefer a one-off read or deriving from an existing subscription first.
- **No API keys in the repo.** Keys via `.env` (git-ignored); web-API keys (e.g. Places) never in the client — proxy through a function.
- **No paid assets.** No external calendar APIs (`expo-calendar`, Google Calendar).
- **Push notifications** are a delivery nudge, never a data source. Their registration and token writes stay behind the notifications service.
- **Location stays coarse and expiring** (`pin|none` model). Two deliberate RTDB exceptions exist:
  **Anreise** (explicit opt-in per activity, participants only) and **Safety/Heimweg** (explicit
  opt-in per session, explicitly selected friends; later changes are owner-only and deliberate).
  Both are hard-limited and last-point-only in RTDB;
  their documented local trails are Safety-only. Native background work may start only after the
  corresponding explicit user action, must remain OS-visible, and must stop automatically. Never
  silent or continuous background tracking outside an active Anreise/Heimweg session.
- **Chats are ephemeral:** activity chats expire 12 h after the activity ends, open groups after 30 days of inactivity (`expireAt` + Firestore TTL). Never build features that assume permanent chat history.

---

## Tech Stack

| Layer      | Library                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Framework  | Expo SDK 54 / React 19.1 / React Native 0.81.5                                                              |
| Routing    | Expo Router (file-based, Stack + Stack.Protected)                                                           |
| UI         | gluestack-ui v5 + NativeWind v5 + Tailwind v4                                                               |
| Animations | react-native-reanimated v4 (`useSharedValue`, `withSpring`, `withTiming`, `Easing`, `FadeIn`, `FadeInDown`) |
| Gestures   | react-native-gesture-handler (`Gesture.Pan()`, `GestureDetector`, `.runOnJS(true)`)                         |
| Storage    | AsyncStorage (theme preference, nearby radius)                                                              |
| Maps       | react-native-maps (native only)                                                                             |
| TypeScript | 5.9 strict                                                                                                  |

**Tailwind note:** No `tailwind.config.js` — theme tokens are defined in `src/global.css`. Class-order conflicts (e.g. `bg-primary` always beats `bg-open`) are resolved by using `style={{ backgroundColor: accent }}` directly.

### Shipping an OTA

**The whole procedure, in order. Do not reconstruct it — copy it.**

1. **If the diff touches `functions/index.js`, `firestore.rules`, `firestore.indexes.json` or `database.rules.json`: deploy the backend FIRST** (`npm run deploy:dev`, or the narrower `deploy:rules:dev` / `deploy:functions:dev`). Order, not preference — see the rule below.
2. Bump `extra.internalVersion` in `app.json` (see format rule below). Skip only if someone already bumped it since the last publish — check the value against the last published one first.
3. `npm run typecheck` and `npx eslint src --quiet` (both must be clean).
4. Run exactly this — one line, staging, iOS only:

```bash
APP_VARIANT=staging EXPO_PUBLIC_FIREBASE_EMULATORS=false EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED=true EXPO_PUBLIC_CRASH_REPORTING_ENABLED=true EXPO_PUBLIC_STAGING_DIAGNOSTICS=true npx --yes eas-cli@22.2.0 update --channel staging --environment preview --platform ios --non-interactive --message "<internalVersion> <was sich geändert hat>"
```

Why each part, so nobody "simplifies" it back into a break:

- **The inline env vars are mandatory.** `eas update` sets `EXPO_NO_DOTENV`, so `.env` is not read and `app.config.js`'s local-dev guard throws before the project id resolves — the real error is swallowed (`expo config --json exited with non-zero code: 1`; use `EXPO_DEBUG=1` to see it). The values mirror the `staging` profile in `eas.json`.
- **`--platform ios`, never `all`.** Android is not shipped this way.
- **`--message` is mandatory** in non-interactive mode. Start it with the internalVersion so the dashboard list is readable. Avoid umlauts — the shell mangles them.
- **Do not use `npm run update:staging` for a real push** — not because it is wrong (it carries the same env vars, the same channel/environment and `--platform ios`), but because `--message` cannot reach it: it runs `--non-interactive`, where the message is mandatory, and `npm run <script> -- --message "…"` does not forward args through PowerShell on Windows. The inline command above stays the canonical one. The script's own extra step, `verify:release`, is worth running by hand when the diff is large.
- **`npx eas` does not work on this machine — it must be `npx --yes eas-cli@22.2.0`.** The npm package is `eas-cli`; there is no package called `eas`, so the bare form dies with the useless "could not determine executable to run". `eas-cli` is installed neither globally nor in `node_modules`, and `eas.json` pins an EXACT version (`cli.version`), so an unpinned `npx eas-cli` pulls latest and is rejected by the CLI itself. Keep the pin in this command in sync with `eas.json`. The Expo session in `~/.expo/state.json` is valid — no login step.
- **The backend NEVER ships with an OTA, and it must be deployed BEFORE it.** An OTA carries only the JS bundle and its assets; `functions/index.js` and the rules/indexes files run on Google's servers and get there solely via `firebase deploy`. This separation is deliberate, not a gap to close: an update reaches each device on its next app start, so old and new clients always run against ONE shared backend for a while. Two rules fall out of it and neither is optional:
  - **Backend first, then the OTA.** The other order publishes a client that calls a callable which does not exist yet — an error that never reproduces locally, because the emulator already has the new code.
  - **Backend changes stay additive.** Add a callable, add an optional field; never rename or remove what a client still in the field calls. Devices that have not taken the update yet are the ones that break, so nobody testing will see it.
  Deployed-vs-committed is not the same question: `git status` showing `functions/index.js` as modified does NOT mean it is undeployed. Check with `npx --no-install firebase functions:list --project dev` before warning about it. That listing proves a function EXISTS, not that its deployed body matches the working copy.

- **Format is `x.y.zz` — the patch part is TWO digits, zero-padded** (`0.3.07`, then `0.3.08` … `0.3.99`). Fixed width so the number a human reads off a device sorts and compares at a glance; `0.3.6` was the last single-digit one and equals `0.3.06`.
- **Bump `extra.internalVersion` in `app.json` by hand on EVERY OTA push — before publishing, not after.** It is the number a human reads off a test device to answer "am I running the update I just pushed?" (`buildInfo.ts` → `BuildInfo.line`). The EAS update id is the machine truth and is always unique, but two bundles published from the same `internalVersion` are indistinguishable to the person holding the phone, which defeats the field's only purpose. Patch-bump per push.
- **The `update:*` scripts must set `APP_VARIANT` and `EXPO_PUBLIC_FIREBASE_EMULATORS` inline.** `eas update` sets `EXPO_NO_DOTENV`, so `.env` is NOT loaded, and `app.config.js`'s local-dev guard then throws before the project id can even be resolved (`expo config --json exited with non-zero code: 1`, with the real error swallowed — pass `EXPO_DEBUG=1` to see it). Values must mirror that channel's build profile in `eas.json`. All three scripts now do this, and all three go through `npx --yes eas-cli@22.2.0` and `--platform ios` (September 2026 — they used to call a bare `eas` that is not installed here, and `update:development` / `update:production` hardcoded `--platform all`). Keep the pin in step with `eas.json`.

---

## Design System (`src/shared/theme/`)

One import for every shared value: `import { SPACING, RADIUS, TOUCH, TYPE, FONT, TEXT_CAPPED } from '@/shared/theme';`

The scales were **derived from the codebase, not invented**: a frequency count found 13 font sizes, 24 spacing values and 19 corner radii in use. Nineteen radii means no two cards were rounded alike — individually invisible, collectively the thing that makes an interface read as unfinished.

| Scale         | Steps                                                                | Notes                                          |
| ------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| `TYPE`        | display 36 (compact 32) · body 16 · label 14 · caption 12 · micro 11 | UI text only                                   |
| `MARKER_TYPE` | badge 10 · micro 9                                                   | Map markers only — see below                   |
| `SPACING`     | xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32       | 4px rhythm                                     |
| `RADIUS`      | sm 12 · md 16 · lg 20 · xl 28 · full 999                             | `full` is a shape, not a size                  |
| `TOUCH`       | min 44 · control 52 · primary 56                                     | 44 is the platform floor — never build smaller |

**Rules:**

- **Pick the step whose ROLE fits, never the size that happens to look right.** Needing a value between two steps means the layout is wrong, not that the scale needs another entry.
- **Two controls of the same class get the same step.** A provider button and the e-mail button are peers → both `TYPE.body`.
- **Static font files: set `fontFamily` ONLY** — never combine it with `fontWeight`, Android synthesizes a second fake bold on top.
- **Tailwind and StyleSheet must agree.** Tailwind's default spacing is already the same 4px rhythm (`gap-1` = 4 … `gap-8` = 32), so it needs no mirror; the radius scale IS mirrored in `global.css` (`--radius-*`). The app currently uses no `rounded-*` class — every radius comes from StyleSheet.
- **`MARKER_TYPE` is deliberately outside the UI scale.** Markers are not laid out live: `markerCapture` snapshots them to a PNG at fixed pixel size, so their text is measured against the marker's geometry, not the screen's. Marker geometry is excluded from scale normalisation for the same reason.

### Responsiveness & accessibility

- **Screen size:** always `useWindowDimensions()`, never `Dimensions.get()` — the latter does not react to rotation or split-screen. (Currently zero `Dimensions.get` calls; keep it that way.)
- **Safe area:** `SafeAreaProvider` comes from `expo-router`'s `ExpoRoot`, so `useSafeAreaInsets()` works anywhere without mounting one. Every full-bleed surface must respect insets — notch, Dynamic Island, home indicator and the Android gesture bar all live there. Never hard-code a status-bar height.
- **Keyboard handling goes through `react-native-keyboard-controller`, never React Native's `KeyboardAvoidingView`.** `KeyboardProvider` (with `statusBarTranslucent` + `navigationBarTranslucent`) wraps the app in `_layout.tsx`; without it nothing keyboard-aware works. Pick per surface:
  - **`KeyboardAvoidingView` + `ScrollView`** for the scrollable authentication surface (`AuthScreen`).
  - **`KeyboardAvoidingView`** (the controller's) for sheets and modals with their own layout (`ActivityComposerSheet`, `ProfileEditSheet`, `MatchChatSheet`).
  - **`useKeyboardPadding(extra, enabled)`** (`features/chat/utils/useKeyboardHeight.ts`) for bottom-anchored overlays where auto-resize is unreliable on Android — the detail sheet and the chat modal. It returns an animated style driven by the live keyboard frame on the UI thread. The old `Keyboard.addListener` version only reported the FINAL height, so the composer snapped instead of travelling with the keyboard. Note the library reports height as a negative offset while rising — take the magnitude.
  - Hooks must run unconditionally: derive whatever `useKeyboardPadding` depends on **above** any early return (see `MarkerDetailSheet`).
  - It is a **native module** — adding or removing it requires a dev-client rebuild.
- **System font size** (iOS Dynamic Type / Android Schriftgröße) is handled per container via `src/shared/theme/textScaling.ts`:
  - `TEXT_FLEXIBLE` — the default. Text in anything that can grow.
  - `TEXT_CAPPED` — fixed-height controls (buttons, pills, segmented switches). Still scales, capped at 1.3 so a 52px control stays intact.
  - `TEXT_FIXED` — **only** for marker chrome that gets captured to a bitmap. Switching scaling off anywhere else is an accessibility failure, not a layout fix.

---

### Local Android Emulator Setup

- Android tooling for this Windows machine lives under `D:\Dokumente\AndroidDev`, not directly under `D:\` and not in `C:\Users`.
- `ANDROID_HOME` / `ANDROID_SDK_ROOT` = `D:\Dokumente\AndroidDev\Android\Sdk`.
- `ANDROID_AVD_HOME` = `D:\Dokumente\AndroidDev\Android\avd`.
- Use `npm run emulator` to start/check the local `Together_Pixel_7` emulator.
- **Normal local launch: use `npm run android:launch`** (needs `npm run emulator` first). `android:local` remains a compatibility alias. `scripts/launch-android-devclient.ps1` installs the prebuilt APK when necessary, opens it through targeted `adb -s emulator-5554` calls and starts Metro without Expo's fragile device enumeration. For a native dependency/configuration change, run `npm run android:build` first; `android:devclient` performs both steps.
- **The AVD needs ≥ 6 GB RAM — and `config.ini` must use a bare number, not an `M` suffix.** `hw.ramSize=4096M` is silently NOT parsed by the emulator, which falls back to ~2.5 GB. On that much memory Android's `lowmemorykiller` reaps the dev client while it loads the ~18 MB dev bundle (the app alone is ~690 MB RSS), producing a confusing mix of ANRs, `DevLauncherErrorActivity` and processes that just vanish — none of which look like memory errors. Correct values in `D:\Dokumente\AndroidDev\Android\avd\Together_Pixel_7.avd\config.ini`: `hw.ramSize=6144`, `vm.heapSize=512`. Verify after boot with `adb shell cat /proc/meminfo` (`MemTotal` must be ~6 GB, not ~2.4 GB).
- **Connecting the dev client to Metro is a two-step sequence, in this order:** launch `com.broccolistudio.together.dev` first, THEN send the `together-dev://expo-development-client` deep link. The link alone does nothing when the app is not already running. `launch-android-devclient.ps1` automates both steps; its short Metro wait can still be outlasted by a cold bundle crawl.
- Do not move SDK, JDK, downloads, or AVD data back to `C:` unless the user explicitly asks.

---

## Activity Modes

| Mode   | Color       | Hex       | Meaning                   |
| ------ | ----------- | --------- | ------------------------- |
| `open` | Electric Blue | `#3B82F6` | Available, no plan yet    |
| `soon` | Amber       | `#E0A23E` | Available in a few hours  |
| `now`  | Green       | `#41C08D` | Doing something right now |

**`open` is NOT a creatable activity — it's a presence status.** Only `now` and `soon` are real events created via the composer (name, place, time, chat, map pin). `open` = "I'm free" and lives as a one-tap toggle in the NearbySheet (see Open Presence below), never in the activity composer. The `ActivityMode` type still includes `'open'` because friend/marker data can carry it; `ActivityModeSwitch` only offers `now`/`soon`, and `createActivityFromDraft` maps any stray `open` → `soon`.

Buttons and accents always use `style={{ backgroundColor: accent }}` — never `className="bg-open"` etc. due to Tailwind class-order conflict.

**`soon` → `now` auto-transition:** once an activity's `startsAt` has passed, it displays as `now` everywhere — map pin color, `MarkerDetailSheet`, calendar `PlanCard` — without anyone editing it. Single source of truth: `resolveActivityMode(mode, startsAt, now)` in `src/features/activities/utils/activityMode.ts`, applied once where `ActivityEntityProvider` builds `mapMarkers`/`markerClusters`/`plans` from docs and seeds. A `now` tick (30s interval) in that provider forces the recompute live, on screen. Never read/display a stored `mode` field directly for a time-bound activity without passing it through this resolver first. `open` and already-`now` activities are unaffected.

---

## Location Visibility Tiers

Every open activity has a `LocationVisibility` (`'pin' | 'none'`):

| Tier   | Counts as nearby?  | Map pin? | Distance shown?             | Navigable? |
| ------ | ------------------ | -------- | --------------------------- | ---------- |
| `pin`  | Yes (if in radius) | Yes      | Yes                         | Yes        |
| `none` | **No**             | No       | No (no `distanceKm` at all) | No         |

**Key rules:**

- Only `pin` friends within `radiusKm` count toward the "N offen in deiner Nähe" number.
- `none` means genuinely no location basis — these friends MUST NOT have a `distanceKm`. They never count as nearby and appear only in the "Ohne Standort" section of NearbySheet.
- There is no hidden-location middle tier. Never show "Standort verborgen". The user either shares a visible/navigable pin or chooses no location.

---

## App Routes / Main Surfaces

- The authenticated app has one primary route (`/`) that renders `MainSurface`.
- `MainSurface` owns the map alone. **The calendar is a card over it**, opened from the Core's "Pläne" target or the top-bar calendar button and closed by its own header button — no mode, no segment, and no return control at the bottom edge. Do not add stale placeholder routes for Open/Plans just to mirror older tab ideas.
- Profile lives at `/profile`. Joined activities, chats and notifications are reached from the map overlay via `PostfachSheet`, not via a separate tab/route.
- If a route is not implemented as a real surface, remove it instead of leaving placeholder copy in production UI.

## Test Data

There is no client-side mock data any more (`src/data/mock` was deleted together
with the mock backend). Everything the dev app shows comes from the **Emulator
Suite**:

| Source                       | Contents                                                        |
| ---------------------------- | --------------------------------------------------------------- |
| `npm run emulators:seed`     | fake auth users, friendships, presence, activities, chats       |
| `scripts/seed-emulators.mjs` | the core data set — owns the doc shapes                         |
| `scripts/seed-heimweg.mjs`   | the standard Safety/Heimweg case (`--once` static, else moving) |

Rules:

- Seeds must write **exactly the doc shapes the cloud functions produce**. When a
  shape changes, update the function AND the seed.
- `npm run emulators` starts with an EMPTY database — re-seed after every restart,
  or use `npm run emulators:persist`.
- Never add client-side seed arrays that get merged into real data. That was the
  `PRESENCE_SEED` mistake and it is what the mock removal finally ended.
- `CURRENT_LOCATION_PLACE` (`src/features/activities/utils/currentPlace.ts`) is
  NOT test data — it is the composer's real "Aktueller Standort" default.
