# Together — App Spec & Development Rules

## What the App Is

**Together** is a spontaneous-meetup app for friend groups. It shows who from your Circles is currently open, available soon, or doing something right now — without a social feed, without posting, without broadcasting to strangers.

The core loop: set a mode (Open / Soon / Now) → friends nearby see it → someone reaches out → you meet up.

---

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

1. Bump `extra.internalVersion` in `app.json` (see format rule below). Skip only if someone already bumped it since the last publish — check the value against the last published one first.
2. `npm run typecheck` and `npx eslint src --quiet` (both must be clean).
3. Run exactly this — one line, staging, iOS only:

```bash
APP_VARIANT=staging EXPO_PUBLIC_FIREBASE_EMULATORS=false EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED=true EXPO_PUBLIC_CRASH_REPORTING_ENABLED=true EXPO_PUBLIC_STAGING_DIAGNOSTICS=true npx eas update --channel staging --environment preview --platform ios --non-interactive --message "<internalVersion> <was sich geändert hat>"
```

Why each part, so nobody "simplifies" it back into a break:

- **The inline env vars are mandatory.** `eas update` sets `EXPO_NO_DOTENV`, so `.env` is not read and `app.config.js`'s local-dev guard throws before the project id resolves — the real error is swallowed (`expo config --json exited with non-zero code: 1`; use `EXPO_DEBUG=1` to see it). The values mirror the `staging` profile in `eas.json`.
- **`--platform ios`, never `all`.** Android is not shipped this way.
- **`--message` is mandatory** in non-interactive mode. Start it with the internalVersion so the dashboard list is readable. Avoid umlauts — the shell mangles them.
- **Do not use `npm run update:staging`.** It still carries the missing-env bug AND hardcodes `--platform all`.
- No EAS build, no Firebase deploy: `functions/index.js` and `firestore.rules` changes ship via `firebase deploy`, never via an OTA. If the diff touches them, say so explicitly rather than letting the client run against an older backend.

- **Format is `x.y.zz` — the patch part is TWO digits, zero-padded** (`0.3.07`, then `0.3.08` … `0.3.99`). Fixed width so the number a human reads off a device sorts and compares at a glance; `0.3.6` was the last single-digit one and equals `0.3.06`.
- **Bump `extra.internalVersion` in `app.json` by hand on EVERY OTA push — before publishing, not after.** It is the number a human reads off a test device to answer "am I running the update I just pushed?" (`buildInfo.ts` → `BuildInfo.line`). The EAS update id is the machine truth and is always unique, but two bundles published from the same `internalVersion` are indistinguishable to the person holding the phone, which defeats the field's only purpose. Patch-bump per push.
- **The `update:*` scripts must set `APP_VARIANT` and `EXPO_PUBLIC_FIREBASE_EMULATORS` inline.** `eas update` sets `EXPO_NO_DOTENV`, so `.env` is NOT loaded, and `app.config.js`'s local-dev guard then throws before the project id can even be resolved (`expo config --json exited with non-zero code: 1`, with the real error swallowed — pass `EXPO_DEBUG=1` to see it). Values must mirror that channel's build profile in `eas.json`. Fixed for `update:development`; **`update:staging` and `update:production` still carry this bug.**
- `npm run <script> -- --message "…"` does not forward the args through PowerShell on Windows. Invoke `npx cross-env … eas update … --message "…"` directly instead — `--message` is mandatory in non-interactive mode.

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

## Nearby Radius Feature

- **Default:** 3 km
- **Range:** 1 km – 20 km (1 km minimum is a stalking-protection floor — never lower)
- **Scale:** Logarithmic slider — lower end (1–5 km) has finer resolution per pixel
- **Snapping:** < 5 km → 0.5 km steps; < 10 km → 1 km steps; ≥ 10 km → 2 km steps
- **Persistence:** AsyncStorage key `together.nearby.radius.v1`
- **Slider appears:** ONLY in the NearbySheet (compact variant, no edge labels) — deliberately removed from the Profile/Settings screen: the radius belongs where its effect is visible (the open-friends list), not in global settings. The `RadiusSlider` full variant currently has no mount point.

---

## "N offen in deiner Nähe" — Single Source of Truth

**Core principle:** the pill number is a SOCIAL-RELEVANCE signal, not a map-search result. It is based on WHO is open and near ME (a radius around my location). It is **viewport-independent** — it must NOT change when the user zooms or pans the map. Radius (around me) and map region (what I'm looking at) are different filters and must never be mixed into one number.

ALL counting lives in ONE place: `src/features/map/utils/nearbySelectors.ts`. Never re-implement the filtering inline in a component.

**Ranking: the app may SORT, it may never INTERPRET.** `selectNearbyFriends` orders the list by `rankNearbyScore` — proximity (the only hard fact) plus two volunteered signals: whether the person wrote a vibe at all, and whether you have actually done things together (`useFrequentPeople`, the on-device co-participation log) or marked them close. Ties break on distance, then name, so the order is stable under the user's thumb. **The vibe TEXT is never parsed** — only its presence counts — and no server-side friend-graph or "mutual friends" query is ever made for this. What is explicitly forbidden: telling users that particular people "fit together", proposing who should meet whom, or turning a vibe into a category the app matches on. The app cannot know whether someone wants coffee, a run, or to be left alone. The headline therefore stays the neutral count ("N Freunde sind gerade offen"), never names.

```
nearbyCount = selectNearbyFriends(radiusKm).length   // radius only, NO viewport
```

- **`selectNearbyFriends(friends, radiusKm)`** — the presence-derived list (`presenceToNearby`) filtered to visibility `pin` AND `distanceKm <= radiusKm`, sorted by distance ascending. Excludes `none`.
- **`selectFriendsWithoutLocation(friends)`** — the same list filtered to visibility `none`. Never counted, shown separately.
- **`selectNearbyCount(friends, radiusKm)`** — convenience wrapper = `selectNearbyFriends(friends, radiusKm).length`.

`MapScreen` computes these once, uses `nearbyFriends.length` for the pill AND passes `friends` + `friendsWithoutLocation` into `NearbySheet`. The sheet does NOT filter — it renders what it's given, so pill count === sheet "in deiner Nähe" count by construction.

**Map pins are a SEPARATE concern.** `pin`-visibility friends render as map markers (activity docs with a matching `friendId`). These pins are NOT added to the pill number. The map shows locations; the pill counts social relevance.

Tapping the pill opens `NearbySheet`.

---

## NearbySheet

Receives `friends: NearbyFriend[]` (pin in radius, pre-sorted) and `friendsWithoutLocation: NearbyFriend[]` (`none`) as props. Two labelled sections:

1. **"In deiner Nähe"** — `friends`. Each row shows a visibility label:
   - `pin` → distance only, e.g. "700 m entfernt"; no dot and no "auf Karte sichtbar" label. Rows remain navigable (`navigate-outline` icon, tap → focus map)
   - Empty → the hint depends on WHY (`emptyReason`, computed in `MapScreen` — the sheet never
     re-derives it): `no-friends` → "Freunde hinzufügen" CTA (→ `/friends`); `none-open` →
     "Gerade ist niemand offen" (radius advice would be wrong); `out-of-range` → widen-the-radius
     hint; `quiet` (open friends exist but none has a distance basis) → no text, the
     "Ohne Näheangabe" section below explains itself. Never show radius advice to someone whose
     real problem is an empty friend list.
   - A denied foreground location permission renders an amber hint row under the RadiusSlider
     ("Standort ist aus …", tap → `openLocationSettings()`). The first request happens only from
     the explicit boot introduction; later explicit location actions may request again. A denial
     must never be swallowed silently anywhere (same rule for the composer's "Aktuellen Standort
     verwenden" alert and the `shareLocationBlocked` hint in `OpenStatusCard`).
2. **"Ohne Standort"** — `friendsWithoutLocation`, no distance, not navigable. Only rendered if non-empty.

- **Header:** "N Freunde offen in deiner Nähe" (N = `friends.length`), plus a secondary "+ M offen ohne Standort" line when there are `none` friends. The no-location friends are surfaced but never inflate the headline nearby number.
- **Open Presence (`OpenStatusCard`, top of the sheet):** the current user's own "I'm open" toggle. **Going open costs exactly two taps: the map pill opens this sheet, and the single "Offen stellen" button — which is the entire closed card — announces you** on the defaults (`goOpen()`: no vibe, +`OPEN_DURATION_MS` = 3 h, no location; hard maximum 12 h). `goOpen` has exactly ONE call site: that card. **The pill must never call it** — it only sets `nearbySheetVisible`, in BOTH states, so tapping it while open is also the way back in to refine or end the status. **There is no pre-open form and no second confirm.** The card resets `expanded` to false via the sheet's `visible` prop; refinement happens only on an already-open status, in the panel below.

  This is the current model after two reversals, so the history matters: (1) the original one-tap model let the **map pill** go open, which announced you on a mis-tap over the map — that failure is what the rule exists to prevent, and the pill's handler must stay a pure `setNearbySheetVisible(true)`. (2) A pre-open draft form with a confirm button then moved the whole refinement *before* going open; it was rejected as friction standing in front of the one thing the app exists for. The surviving principle is narrower than "confirm before you announce": **the surface you can hit by accident (the map) never announces you; the surface you had to deliberately open (this sheet) may.** Refinement follows the announcement, it does not gate it — every field is optional anyway. The defaults carry the old rule's intent: no vibe, +`OPEN_DURATION_MS` = 3 h, no location, hard maximum 12 h.

  Open → a **collapsed-by-default** card in two stacked rows. Row 1 is the summary "Du bist offen · <vibe> · bis HH:MM" + an animated disclosure chevron, and the **whole row** is the expand target. Row 2 is a full-width **"Offen beenden"** button. **The destructive control must never share a row with the disclosure.** It did: the chevron sat 8 px from a "Beenden" chip, so reaching for one hit the other and ended your status outright. Separating them on the *vertical* axis is what fixes it — a thumb crosses 8 px of horizontal gap by accident, never a row boundary. (The button also spells out what it does; it was once a two-letter "aus" chip that read as a label, and people did not know it ended their status.) Tap the summary to expand `RefineControls`, which sits *between* the two rows so "Offen beenden" stays the last thing in the card in both states:
  - **Duration** ("Bis wann?"): the **shared `DurationPicker`** from the activity composer (`src/features/activities/components/DurationPicker.tsx`, exported from that feature's barrel), in the open colour via its `accent` prop. Deliberately the same control, not a lookalike: an open window and an activity answer the identical question ("how long is this good for?"), and the picker's own 15 min – 12 h range already equals `OPEN_MAX_DURATION_MS`. It replaced a native time wheel — two different widgets for one question on two screens is exactly the inconsistency that reads as unfinished. The picker speaks minutes-from-now while the status stores an absolute `expiresAt`; `expiryToMinutes`/`minutesToExpiry` convert, and the summary row keeps showing the resulting clock time as "bis HH:MM" so the absolute answer stays visible. → `setExpiresAt`, capped at 12 h. Default on going open is +3 h (`OPEN_DURATION_MS`).
  - **Vibe**: the FIRST control in the expanded card (above "Bis wann?" — the "what" is the social headline, time is just the frame): a **free-text field only** (placeholder "Egal"). **No vibe set displays as "Egal"** in the collapsed summary ("Du bist offen · Egal · bis HH:MM"): a pure display convention — the data stays `null`, never write a magic "Egal" label into the presence doc. Free text carries a `label` only (no emoji).
  - **Location** ("Standort"): a toggle "Standort teilen" → `shareLocation`. (Wording rule: never call this "Für Freunde sichtbar" — you are ALWAYS visible to friends while open; the toggle only controls whether your coarse position/distance is shared.) On = friends see you on the map (`pin`); off = you appear in the list only, no location (`none`) — same two-tier model as `LocationVisibility`. **Privacy-first: resets to off each time you go open** (explicit opt-in per session). A small navigate icon shows in the collapsed summary when sharing.
  - **Corner radii are assigned by role, not picked per screen.** `src/global.css` defines the scale (`--radius-sm: 12`, `--radius-md: 16`, `--radius-lg: 20`, `--radius-xl: 28`) but a scale alone does not stop drift: the same kind of input field was 16 in the composer and 12 in this card, which is the sort of thing that reads as unconsidered without anyone being able to name why. The rule: **an input/tap field is 16, the card containing it is 20.** Nesting still decreases inward — that part was never the problem; the disagreement across screens was.
  - **The rule:** every field stays OPTIONAL and pre-filled — nothing may become required. What is forbidden is a field you have to fill in, or even look at, before you can go open. This is why the closed card carries no form at all.
  - **The pill mirrors the window, not just the state.** While open, the map pill reads "Offen bis HH:MM" and carries a countdown ring that shortens as the window runs out — the same visual language as a `now` activity marker's ring (`ActivityMarkerChrome` → `CountdownRing`), because an open status expires exactly like an activity does. The fraction comes from `openedAt`→`expiresAt`; `openedAt` is local-only (`PersistedStatus`) and never written to the presence doc — friends have no use for when your window started. Ticks once a minute. The ring's `<Svg>` MUST stay wrapped in a `View pointerEvents="none"`: it covers the pill exactly, `pointerEvents` is not a prop the native Svg host honours, and unwrapped it swallowed every tap on the pill in the one state it renders — locking you out of the sheet precisely when you needed it to end your status.
    State lives in `useOpenStatus()` (`src/features/presence/`), persisted + auto-expiring, and **backed by the `presenceService` seam** (Firestore `presence/{uid}` — see docs/backend-plan.md → Presence). The provider writes your own presence through the seam (going private removes `coarseLocation`; going off deletes the doc) and subscribes to friends' open presence (`openFriends`). The nearby pill/list are driven by real presence (`presenceToNearby`, Haversine distance to your own location), filtered through `nearbySelectors`. The user's own open status is shown in the card only; it does NOT inflate the friends' nearby count. The pill that opens this sheet stays permanently visible (chosen model: always-visible count for liquidity, with the "become open" nudge reciprocity-style but not gated).
- Compact `RadiusSlider` sits directly under the open-presence card; changing it re-filters `friends` live (via shared `radiusKm` context → MapScreen re-render → new props).

---

## Map Screen Architecture

- `MapCanvas` is the single rendering swap point. Native uses `react-native-maps`; the platform-specific browser file uses `PreviewMapCanvas` only to keep native-only imports out of a browser bundle.
- **Map provider = Google on BOTH platforms ("Option A", see docs/backend-plan.md → Karten/Orte).** Reason: `onPoiClick` (tap a POI label → create an activity there) only exists in the Google provider. Android is always Google; iOS uses Google in dev/release builds with a configured key (`GOOGLE_MAPS_API_KEY_IOS` via `app.config.js`) and falls back to Apple Maps in Expo Go (no Google SDK there — POI labels not tappable, long-press/search instead). Do not move place search to a non-Google provider: Places data may only be displayed on Google maps.
- `MapOverlay` floats absolutely over the map with all controls (SpeedDial, search bar, recenter, nearby pill). All copy is German ("Orte suchen", "Profil öffnen" — never English placeholders). It renders a soft SVG top scrim (dark → transparent, `insets.top + 64`) so the status bar stays readable over the bright map.
- **Mode switching animates.** `MainSurface` wraps each mode in a `ModeLayer` that cross-fades (240 ms ease-out + scale 0.985→1) instead of hard opacity 0/1 swaps; inactive layers stay mounted and non-interactive (same semantics as before). `MarkerDetailSheet` renders a subtle mode-tinted top wash as an SVG **gradient fading to transparent** (accent 0.1 → 0 over 110px) — never a hard-edged color block that cuts across content.
- **`WelcomeIntro`** (features/main): one-time welcome hero shown after the first sign-in (AsyncStorage `together:welcomeSeen:v2`), mounted in `MainSurface`. It uses the Mica figure (`TogetherMark`, `tone="brand"` — one of only two in-app places that show the mark in colour) and three value rows (Freunde/Karte/Kalender). The PRIMARY CTA is "Freunde hinzufügen" (→ `/friends`) — a friendless account gets zero value from map or calendar, so the first action a new user is offered must be building the graph; "Erst mal umsehen" dismisses as the quiet secondary. Modal is `statusBarTranslucent` + `navigationBarTranslucent` so it truly covers the whole screen. Never blocks returning users; storage errors → skip the intro.
- **The map rotates (two fingers), flat AND pitched.** `rotateEnabled` + `showsCompass` on the `MapView`. The compass is not decoration: Google draws it only while heading ≠ 0 and hides it on reset, and it is the ONLY way back to north — without it a turned map is somewhere users get stuck. `pitchEnabled` stays **false**: tilt is a deliberate view choice owned by the perspective button (`props.pitched` → `PERSPECTIVE_PITCH`), not something to fall into mid-pan.
  - **A rotation must survive every programmatic camera move.** `animateToRegion` and `fitToCoordinates` describe a flat, north-up viewport, so the renderer levels the tilt *and* turns back to north. `restoreCameraAfter(delay)` re-applies both after recenter/focus/fit; it runs whenever there is a pitch OR a heading to restore (it used to bail unless pitched, which is exactly why a rotated flat map snapped north the moment anything focused a marker). The perspective toggle likewise passes the current heading instead of `0` — that was free when the map could not turn and silently destroys the rotation now that it can.
  - **Only gesture-driven region changes record the heading** (`userHeadingRef`, guarded by `details.isGesture`). Reading it back after a programmatic move would capture the north-up side effect and erase the very rotation the restore exists to re-apply.
- `MapLocationPickerOverlay` takes over when picking a location for an activity.
- `focusCoordinate` prop: during picker → `mapPickerFocusCoordinate`; otherwise → `mapFocusCoordinate` (set when navigating from NearbySheet). `selectionFocus` is a separate one-shot camera request: opening a place/activity detail keeps its coordinate centered in the visible upper map above the sheet while preserving the user's zoom.
- **A requested delta on `selectionFocus` is a FLOOR ("come at least this close"), never a target.** Only POI taps request one (`POI_RESULT_FOCUS`), so the tapped label is legible; everything else passes none and keeps the zoom. Taken literally it pulled the camera back OUT from under someone already closer than 0.0025 — so `MapCanvas` clamps with `Math.min(requested, region.delta)`. Never zoom a user out to satisfy a legibility floor they already exceed.
- **`onHeightChange` is not reported in chat mode** (`MarkerDetailSheet`). The chat sheet animates `height` — a LAYOUT property — so every frame of a drag or spring fires `onLayout`; since `props.bottomSheetHeight` sits in the deps of the `selectionFocus` camera effect, each frame answered with its own 300 ms `focusCamera`, turning a handle drag into a stream of camera moves (plus a `markCameraBusy` re-render each time). Chat mode also covers 60–92%, past the 80% cap where no map strip is left to centre in, so the number carries no information there. If you ever add another animated-height sheet, it must be excluded the same way.
- **`focusKeepZoom` decides whether a focus may change the zoom, and the test is whose zoom it is.** A focus that jumps somewhere the user was NOT looking (own location on the first fix, leaving the Berlin-wide `DEFAULT_MAP_REGION`; "auf Karte zeigen" from a list; a journey participant, who can be anywhere) lands on the prescribed `PLACE_FOCUS_*_DELTA`, because the zoom they were at says nothing about the new place. A focus that recentres on something already in the user's own view keeps `regionRef.current`'s deltas exactly: **publishing an activity** (they chose that zoom while placing the pin), **the "Zentrieren" button** (it answers WHERE, not HOW CLOSE — you are already looking at this area, and panning away and tapping back says nothing about how far in you want to be), and restoring a marker after a failed cancel. Animating out to a fixed level in those cases reads as the map jumping away from the user.
- **`PLACE_FOCUS_*_DELTA` is the ONLY prescribed jump zoom.** The single-coordinate branch of a fit request used to carry its own 0.012/0.01, so a Safety focus on one friend arrived at a different zoom than "auf Karte zeigen" on the same person; it now goes through `focusCamera` like everything else (which also gives it the heading/pitch preservation and the covered-height offset the multi-coordinate branch gets from its `edgePadding`). Two numbers for one job is how a map starts feeling arbitrary — do not add a third. Both halves of the request are set through **one** `focusMapOn(coordinate, { keepZoom })` in `MapScreen`, never as two separate `setState` calls — a stale `keepZoom` left over from an earlier focus silently changes how the next one behaves. **Every camera request must go through `focusMapOn`;** `setMapFocusCoordinate` has no other call site, and reintroducing one means the next focus inherits the previous request's zoom rule. (The old comment on `PLACE_FOCUS_*` justified the value with place *search*; search has long gone through `selectionFocus` + `POI_RESULT_FOCUS` instead.)
- **"Centred" means centred in the VISIBLE map.** Both focus paths shift the camera south by `focusCenterOffset(coveredHeight, viewportHeight)` = half the covered share of the screen, where `coveredHeight` is the live height of whatever hides the map's bottom (`bottomSheetHeight` — the detail sheet reports its own measured height via `onHeightChange` — or the Safety split deck's `bottomOverlayHeight`). This replaced a hard-coded `DETAIL_SHEET_CENTER_OFFSET = 0.28`, which was calibrated for one sheet and put the pin too high for every other sheet size and too low for none at all. The formula is self-calibrating: no obstruction → dead centre, a sheet covering 56% → exactly the old 0.28. Capped at 80% covered, past which no meaningful map strip remains to centre in.
- `onRegionChange` fires on every `onRegionChangeComplete` (native) or `focusCoordinate` change (`PreviewMapCanvas`). It passes a full `MapRegion` (center + both deltas). Its ONLY consumer is `updateMapPickerCenter` for the location picker — it does NOT feed the nearby count (which is viewport-independent by design).
- `pin`-visibility friends have a matching map marker with a `friendId` field linking marker ↔ friend. Keep positions and the friend's `coordinate` in sync (the emulator seed owns both).
- **Markers are image-based, NOT custom-View children (`markerCapture.tsx`).** On Android + the New Architecture (Fabric), `react-native-maps` snapshots a custom marker `View` to a bitmap before layout settles and clips it to the top-left corner (the "avatar only half visible" bug — reproduced even in a real dev client, so it is NOT an Expo Go quirk). Fix: `MapCanvas` builds a descriptor per marker (`id`, `captureKey` encoding full visual state, `coordinate`, `node`, `onPress`), renders each `node` (`AvatarMarker`/`ClusterMarker`/`JourneyAvatarMarker`) off-screen inside a hidden `View`, captures it to a PNG via `react-native-view-shot`, and hands THAT to `<Marker image>`. Captures are cached by `captureKey` (so pan/zoom never re-captures; an appearance change produces a fresh image). Do NOT go back to passing marker Views as `<Marker>` children. `react-native-view-shot` is a native module — adding/removing it requires a dev-client rebuild.
- **Publishing and cancelling an activity are OPTIMISTIC — the map never waits for the callable→Firestore→listener round-trip** (same rule as chat sending, see the ChatProvider section). Activity writes are callables, so the feed listener echoes a change seconds later; without local state the map has nothing to animate and the pin appears/disappears whenever the server answers, which reads as a broken tap. `ActivityEntityProvider` therefore keeps two local layers merged into `activityDocs`: `pendingDocs` (a twin of a just-created activity under the id the server will use — the callable mirrors the client's fields back unchanged, so twin and real doc agree; dropped when the feed knows the id, on write failure, or after a 10 s expiry) and `cancellingIds` (a just-cancelled activity hidden everywhere at once; restored if the write throws, held until the feed reports the doc as no longer `active`). Both animations are driven from these, never from the server: **"Wurf & Pop"** on publish (`MarkerLaunchOverlay` — seed morphs into the marker, flies an arc, squashes and rebounds on impact) and its mirror on cancel (`MarkerDismissOverlay` — the pin inhales and bursts, leaving the same impact ring). The dismiss id is armed one frame BEFORE the entity is dropped, because that frame is the only one in which the node and its projected position still exist. A failed write must always say so AND say what was undone (`writeFailureMessage`): connection-class callable codes get an honest "prüfe deine Internetverbindung", every other `HttpsError` message is already German and user-facing and is passed through.
- **Map style selector (`mapStyle/` + `MapStyleMenu`).** A layers button (bottom-right, above recenter) opens a menu: Tageszeit · Automatisch · Tag · Nacht · Satellit. Backed by `MapStyleProvider`/`useMapStyle` (mirrors `ThemePreferenceProvider`, persisted at `together.map.style.v1`, mounted at root inside `ThemePreferenceProvider`). `preference: 'sonne'|'system'|'day'|'night'|'satellite'`, **default `sonne`**; `effectiveStyle: 'day'|'golden'|'dusk'|'night'|'satellite'` resolves `sonne` against the real solar phase and `system` against the app's `resolvedScheme` (dark→night). `MapCanvas` maps it to `mapType` (`satellite`→`hybrid`, else `standard`) + `customMapStyle` from `SUN_MAP_STYLES` (`utils/sunMapStyles.ts`). Caveat: `onPoiClick` may not fire on satellite/hybrid — long-press to drop a place still works.
- **Solar phase (`utils/sunPhase.ts` + `mapStyle/useSunPhase.ts`).** `day → golden → dusk → night`, derived from `suncalc` — pure astronomy math, **no network call and no cost, ever**; nothing about the user's rhythm leaves the device. Driven by `getTimes()` (Date objects), NOT `getPosition().altitude`: measured against `suncalc@2.0.1` that field returns **degrees** (54.65 at Berlin solar noon) although the library is documented as radians — dates carry no unit ambiguity. `resolveSunPhase` never throws: polar day/night (Invalid Date), NaN, and out-of-range coordinates all fall back to a stable phase. `useSunPhase` schedules exactly one timer to the next phase boundary (capped at 30 min so DST/clock/timezone changes are picked up) instead of polling, and re-resolves on `AppState` → `active` because background timers are throttled. Defaults to `DEFAULT_MAP_REGION` rather than requesting location — a permission prompt for a colour palette is a bad trade, and the sunset spread across Germany is under half an hour. **Palette system — TWO INDEPENDENT LAYERS (`utils/sunMapStyles.ts`; the header comment there is the authority, this is the summary).** The map models the real world, not a set of themes. **Layer 1 · Sky** = the four palettes, carrying only what the sun does to the ground: `day` neutral stock Google light (`#F1F1F1`); `golden` the reddish-orange sundown/sunrise wash with water pushed deliberately COOL against it (warm surfaces + cool shadows is what makes low sun read as low rather than merely warm); `dusk` a properly blue blue-hour, which occurs at BOTH ends of the day; `night` Google's own dark map kept stock, roads included (`#212121` ground, `#3C3C3C` road greys). **Layer 2 · Street lights** (`streetLightLevel` + `withStreetLights`) = a real fixture on a real switch, laid over the blended sky: lamps off all day, flicking on over the last ~45% of golden hour (which ENDS at sunset), 0.85 through the blue hour, 1.0 at full dark, and back off across the morning blue hour as the sun clears the horizon. Timing comes from the true solar boundaries for the actual date and place via `resolveSunPhase`, so the lamps follow the seasons with no schedule to maintain. `streetLightLevel` keys off the phase PAIR, not the phase: the palettes are shared by both halves of the day, and only the pair distinguishes `golden→dusk` (a sunset) from `dusk→golden` (a sunrise).

**The rule that falls out of this, and it is the load-bearing one: A LIT ROADWAY MEANS LAMPS ARE ON.** Never paint lamp light into a daylight palette — it costs the lamps their meaning and with it the whole point of the map changing with the day. The one warm road colour allowed in daylight is motorway yellow, which is road *classification* (present in every atlas at noon and midnight alike), not light. **The lamp colour is deliberately PALE (`#E8D6AE`), not saturated orange:** real sodium lighting is low-saturation and very bright, so a lit street reads as lit because it is bright (11.24:1 against the night ground), not because it is colourful — a saturated orange road looks like a highlighter drawn over the map and fights the saturated orange avatar markers. The layers compose instead of being special-cased: "Google's dark map with our lit streets" is not a palette, it is night + lamps at full — which is simply what the map does every night. Note that the base night road greys are therefore *unobservable* at night (blending to a lamp at level 1.0 lands exactly on the lamp colour); read `readableSunMapStyle('night')`, never `SUN_MAP_STYLES.night`, when judging what ships.

**Surfaces that mean different things must LOOK different — audited with CIEDE2000, not contrast ratio.** Contrast ratio only measures lightness, so it scores a dark-green park on dark-grey ground as identical while missing nothing, and misses the real trap (same hue *and* lightness) entirely. Semantically distinct neighbours must clear ΔE00 ≈ 2 (below that they are indistinguishable in practice) and should clear ≈ 4; the ceiling is taste, not a number — these are meant to read as one family, so most sit in the 4–8 band. The audit caught 18 such collisions after the buildings fix: all four POI category rules rendering within ΔE00 1.1 of each other and of plain built-up (five rules producing one mush), minor vs main roads at ΔE00 1.0 in daylight, and forest vs park at 1.04 at night — the last directly contradicting the comment claiming they differ "at a glance". POI categories now carry a faint HUE identity (medical→red, school→amber, attraction→violet, business→warm neutral), stronger in the dark phases where luminance cannot carry it. **Road hierarchy legitimately lives in the CASING on light palettes** — main and minor roads are both white and Google separates them by width, which the style spec cannot set — so that pair passes on fill *or* casing. **`landscape.natural` is deliberately identical to the base ground in `dusk` and `night`**: unbuilt, unlit ground is one surface, the dark palettes have no luminance headroom to spend on a distinction carrying no information, and Google's dark map merges them too. That is asserted as an equality, so drifting to "nearly identical" fails.

**Every palette owes the city a silhouette.** Buildings once sat within 1.03–1.06:1 of the ground in day, golden and night, so the map read as streets floating in a void. `landscape.man_made` must clear ~1.15:1 on the fill (massing) and ~1.5:1 on the stroke (the outline is what actually draws the block) — darker than the ground on light palettes, lighter on dark ones — while staying ≥3:1 below the lit roadway so the city never competes with the street network. Measured: lit road vs ground 11.24:1 at night, 7.72:1 at dusk; lit road vs building 9.48:1 / 6.41:1; every label ≥4:1 across all four static palettes and all 12 blends at 21 steps each. The sky blends on ONE shared curve — the old per-feature lead/lag that ran roads ahead of the ground was faking street lighting and is gone now that lighting is modelled for real. **Structural contract:** `blendSunMapStyles` pairs entries BY ARRAY INDEX, so all four palettes must keep the identical 30 entries in identical order — adding a rule to one means adding it to all four, in place, or a transition will blend roads into water.
- **The live pulse (`MapLiveAuraOverlay`) is the marker's OWN squircle, not a circle behind it.** Height, corner radius and the width maths live in `activityMarkerLayout.ts` and are imported by both `ActivityMarkerChrome` and the aura, so the two cannot drift into "circle behind a squircle" — do not re-declare those numbers anywhere. Waves scale from the shell's centre but start at **scale 1.0**, i.e. exactly on the outline: the overlay draws ABOVE the native map (and therefore above the markers), so anything starting below 1.0 would crawl across the avatars' faces. The steady halo is sized `shell + 2×HALO_WIDTH` with radius `+ HALO_WIDTH` because RN draws borders inside the box — that is what puts the stroke fully outside the marker. **`ACTIVITY_MARKER_AURA_OFFSET_Y` is DERIVED from the anchor and the canvas height, never typed in** — it was hard-coded to `-40`, which is the centre of the whole marker block (bubble *plus* the name pill below it) rather than the centre of the bubble, so the pulse sat ~10.6 px too low. The soft oversized circle hid that for as long as it existed; a squircle hugging the outline shows it instantly. Waves get the settled shell width from `activityMarkerShellWidth(...)`; sampling the settled morph progress is correct because the aura only renders while the map is still. All wave arithmetic stays **inlined in the worklets**: a helper declared in the component body is a plain JS function and calling it on the UI thread throws.
- **Cluster marker (`ClusterMarker`)** shows the first 4 avatars as a 2×2 quad (cells ≈half the inner circle so two fit per row; `slice(0,4)`). Count badge shows `N/MAX` when the cluster's `maxParticipants` is set (mirrors `AvatarMarker`), else the raw count. `MarkerCluster.maxParticipants` flows from the backing activity and is part of the cluster `captureKey`.
- **`MarkerDetailSheet` participant navigation.** The activity detail shows only a compact avatar stack with the participant count (more than 4 → 3 avatars + a "+N" chip). Tapping it keeps the same sheet container mounted and drills into a **content-sized** participant view (rows in a card, capped at ~60% screen height with inner scroll — never a fixed tall sheet with dead space below a handful of names) with back + close controls; it must not stack a second modal or push the chat down. Returning preserves the detail/chat state. Chat mode keeps its own fixed-height layout + inner scroll.

### App Routes / Main Surfaces

- The authenticated app has one primary route (`/`) that renders `MainSurface`.
- `MainSurface` currently owns Map and Calendar. **Calendar is NOT a map pill segment**: it opens via the calendar button in the map top bar and shows one compact "Karte" return control. Socialize is deliberately not mounted or reachable until its later release. Do not add stale placeholder routes for Open/Plans just to mirror older tab ideas.
- Profile lives at `/profile`. Joined activities, chats and notifications are reached from the map overlay via `PostfachSheet`, not via a separate tab/route.
- If a route is not implemented as a real surface, remove it instead of leaving placeholder copy in production UI.

### Activity Groups And Clusters

- A real activity group is never mixed across modes. It is exactly one `mode`: `soon`, `now`, or, if explicitly supported later, `open`.
- `soon` groups represent people planning the same activity later. `now` groups represent people currently doing the same activity.
- Do not display mixed labels like "8 open, 17 soon, 3 now" on a colored group marker. A colored group marker must have one matching mode and one matching meaning.
- `MarkerCluster` currently represents a mode-specific activity group, not a mixed visual map aggregate. It therefore has one required `mode`, a `label`, and a participant `count`.
- Avatars shown inside a mode-specific group marker must belong to the same mode as the group.
- If we later add purely visual map clustering, it must either cluster per mode or use a neutral visual style that does not look like a concrete activity group.

### Activity Detail / Join / Chat

**Single source of truth:** concrete activities are resolved through `ActivityEntityProvider`
(`src/features/activities/ActivityEntityProvider.tsx`). Map, Calendar, joined-activity list, and
chat must all use the same stable activity id.

- `ChatRoom id === Activity id`.
- `Plan.activityId` references the same activity/chat id. If omitted, `Plan.id` is treated as the activity id.
- `MapMarker.id` / `MarkerCluster.id` are activity ids, not just visual ids.
- Do not create route-specific ids such as "calendar chat id" vs "map chat id". Different UI entries may exist; the target entity must be identical.
- `ActivityEntityProvider` projects the Firestore activity feed into markers and calendar plans. Components read through `useActivityEntities()` and never import raw data directly.
- Activity edits must go through `useActivityEntities().updateActivity(activityId, patch)` so calendar rows, map markers/clusters, joined activity rows, and detail sheets stay in sync.
- `MarkerDetailSheet` is the shared activity detail surface for map and calendar entries. Do not reintroduce a separate calendar detail sheet that renders different join/chat behavior.

**Gäste-Einladungen ("Freunde dürfen Freunde mitbringen", August 2026):** Activities are visible
only to the host's audience — a participant's own friend (friend-of-a-friend) can't see them.
The bridge is a **participant-vouched guest invite**, host opt-in per activity:

- **Host toggle `guestInvitesEnabled`** (composer `CapacityBench`, the "Wie viele" workbench —
  capacity and guests are the same question, "who can end up in this?", so they share one
  surface). Default **OFF** — widening the audience exposes the host's plans and pin, so it
  stays a deliberate host decision. Unlike the audience it IS editable in edit mode: toggling
  changes only the future invite mechanism, never the current audience; turning it off never
  removes already-invited guests. **The copy must stay honest about the interaction with a
  hand-picked audience:** with guests ON, a participant can invite someone the host deselected,
  so the switch says so in as many words. Never write "nur diese N" while guests are enabled.
- **Callable `inviteFriendToActivity(activityId, targetUid)`** — caller must be a participant,
  target must be the CALLER's confirmed direct friend (same trust boundary as
  `addChatMembers`: the inviter vouches, never strangers), blocks are checked target↔host and
  target↔caller, audience cap 201, idempotent (`already_invited`). It only widens
  `audienceUids` (arrayUnion) + sends one `activity_invite` notification/push — joining still
  runs through `joinActivity` with all its checks.
- **UI:** joined participants see a collapsed "Freund:in einladen" section at the bottom of the
  participant drill-in view (`ActivityParticipantsContent`) listing their own friends not yet
  participating; one tap per invite, per-row "Eingeladen"-state. Never shown to non-joined
  viewers or when the host has not opted in.
- Synergy: the guest and host can befriend each other afterwards via the existing
  `shared_activity` friend-request path.

**Editing an existing activity (host-only, fix-a-mistake flow):** `MarkerDetailSheet` shows a small "Bearbeiten" pencil next to the mode line when `canEdit` is true (the current user is the activity's host — `selection.hostId === currentUid`). It reopens `ActivityComposerSheet` with `editing` + `initialDraft` (built by `useActivityEntities().getEditableDraft(id)`), and submits via `updateActivityFromDraft(id, draft)` instead of creating a new activity. The Sichtbarkeit/audience picker is hidden in edit mode and must stay hidden: `ActivityDocUpdate` has no `audienceUids` field on purpose, so a title/time typo fix must never silently change who can see the activity. `getEditableDraft` returns `null` for expired activities and other people's activities — no edit affordance shows for those. **The draft is seeded with the STORED `doc.mode`, never the resolved one** — `updateActivityFromDraft` writes `mode` back whenever it differs from the document, so seeding it with the display mode turned every typo fix on a started `soon` activity into a permanent conversion to `now`. Since `now` activities have no Anreise (see Journey section), that silently stripped a running Anreise off a plan. The resolved mode still drives how the form reads the time fields (`expiresInMinutes`); it must never drive what gets written.

**Leaving vs. cancelling — hosting is a ROLE, cancelling is a decision about the Activity.** The host has BOTH actions, and they must never be collapsed into one:

- **Verlassen (host):** the host steps out and the Activity lives on. **Succession is automatic and server-side** (`leaveActivity`): the longest-standing remaining participant inherits — `participantUids[0]` after the removal, the same rule `leaveChatRoom` uses for chat admins, for the same reason: an Activity must never be host-less. The `firestore.rules` invariants `participantUids[0] == hostId` and `participants[0].uid == hostId` mean the heir must sit at the front of BOTH arrays; removing the host from index 0 satisfies that by itself, and the callable only repairs arrays that already disagreed. Ownership carries the power to edit and cancel, so the confirm dialog **names the heir before the tap** ("Lena übernimmt als Host") and everyone still in gets an `activity_host_changed` notification — the heir's copy says "Du bist jetzt Host", the rest learn who holds it now. Never a successor picker: the host choosing a person who did not agree is not more consent, only more taps.
- **A host who is ALONE in their Activity cannot leave** (`participantUids >= 1` is a rules invariant and there is nobody to inherit). The callable rejects it and the UI does not offer "Verlassen" at all in that state — the only exit is Absagen. Do not "fix" this by silently turning a solo leave into a cancellation.
- **Absagen (host only):** ends it for everyone — `status: 'cancelled'`, `visibleUntil` now, journeys cleared, participants notified via `activity_cancelled`. Deliberately NOT a hard delete: the document and its chat are retained for `ACTIVITY_CHAT_RETENTION_MS` so people can still see what happened and talk about it.
- **Verlassen (participant):** unchanged, and now notifies the host (`activity_left`, grouped per Activity in the Postfach exactly like `activity_joined`) — a host who is told about every join must also be told about every drop-out.
- A departing host produces `activity_host_changed`, **never** a second `activity_left` for the same person: one event, one notice.

**`MarkerDetailSheet`** — opens when an avatar marker or activity group is tapped. Fixed info order (top → bottom):

1. **Activity name** (`selection.title`) — bold, top.
2. **Mode line** — colored dot + concise context label (`Offen`/`Startet in 38 Min.`/`Jetzt`) + "· N dabei". **No "Du bist dabei" suffix:** the joined sheet already says so with its whole layout (chat preview, Anreise row, "Activity verlassen"), so the label was restating what the surface around it makes obvious.
3. **Time** (`selection.timeLabel`) — clock icon row, e.g. "Heute 18:00–21:00".
4. **Place** (`selection.placeLabel`) — location icon row, e.g. "Prater Garten". **The place row IS the navigation control** when the activity has a `targetCoordinate`: the whole row is a 44 px button with a trailing `navigate-outline` chip → `openNativeMapsAt(coordinate, placeLabel, 'route')`, the same OS hand-off `PlaceContent` uses. Deliberately not a separate button next to the join CTA — "wo ist das?" and "wie komme ich hin?" are one question, and the row already names the place. An activity without a pin keeps the plain, non-tappable row; no placeholder row is invented just to host the button.
5. **Participant list** — vertical rows, each avatar + name (`ParticipantListRow`).
6. **Join button** — "Beitreten"/"Mitplanen"/"Dazustoßen" (per mode), white text on `accent`.

Time/place rows only render when the field is present. No placeholder copy, no fake chat mockup, no redundant intent sentence. **Button labels on an accent fill use a contrast-safe foreground** — `onColorTextColor(accent)` from `src/shared/utils/contrastColor.ts`, NOT hard-coded white: white on the mid-tone mode accents (`now` #41C08D, `soon` #E0A23E, `open` #3B82F6) measures ~2.2–3.7:1 and fails WCAG AA, so the helper drops to dark ink on those. (Superseded the old "white text on accent, never dark text" rule for accessibility.) Chat bubbles and iOS-style notification badges deliberately keep white-on-colour as a convention. Place selections are separate: they keep map/route/create-at-place actions and never show join/chat. **`PlaceContent` is a COMPACT action-first bar (August 2026), not a full sheet:** icon + place name + one prominent "Aktivität hier starten", with Route and "In Karten öffnen" as 52px icon buttons beside it. Rationale: a POI tap is an ambiguous, easily-mistapped gesture, so the response must stay cheap to dismiss — never auto-open the full composer on a POI tap. Dismissal is a tap on the empty map (`onCanvasPress` → `setSelection(null)`); the sheet deliberately renders with `pointerEvents="box-none"` and has **no blocking backdrop**, so tapping another marker switches selection directly instead of forcing a close first. Do not add a full-screen backdrop.

### Journey / Anreise Focus

**Anreise gibt es NUR für geplante Aktivitäten (August 2026).** Eine als `now` erstellte
Activity hat überhaupt keinen Anreise-Modus — keine Zeile im Sheet, kein Prompt nach dem
Erstellen oder Beitreten, keine Erinnerungs-Push, kein RTDB-Journey-Listener und damit auch
kein Hintergrund-Task. Begründung: `now` heißt „ich bin gerade hier"; es gibt keine Vorlaufzeit,
in der man anreisen könnte, und Hintergrundortung ist der teuerste und sensibelste Pfad der App
— den für den Fall mit dem geringsten Nutzen zu öffnen, ist ein schlechter Tausch.

Die Entscheidung fällt auf dem **gespeicherten** Modus (`plannedMode`, roh aus dem Dokument),
NIE auf dem aufgelösten: `resolveActivityMode` zeigt jede gestartete `soon`-Activity als `now`,
kann also „spontan hier erstellt" nicht von „geplant, läuft jetzt" unterscheiden — und die
zweite braucht ihre Anreise weiterhin, denn zu spät dran zu sein ist genau der Moment, in dem
Leute sehen wollen, dass du kommst. Eine Regel, eine Funktion: `activitySupportsJourney(plannedMode)`
in `src/features/activities/utils/activityMode.ts`, benutzt vom Sheet UND von beiden Prompts;
serverseitig spiegelt `sendJourneyReminders` sie mit `activity.mode === 'now' → continue`.
Unbekannter `plannedMode` heißt „keine Anreise" — der teure Pfad fällt zu, nicht auf.

**Die sofortige Nachfrage („Anreise teilen?") kommt nur beim BEITRETEN, nie beim Erstellen.**
Wer eine Activity anlegt, hat den Ort gerade selbst ausgesucht — die Frage, ob man dorthin
unterwegs ist, hat er mit dem Erstellen schon beantwortet; sie direkt nach dem Tap zu stellen
ist eine Unterbrechung ohne Informationsgewinn. `offerJourneyShareNow` hat deshalb genau EINE
Aufrufstelle: `joinSelectedActivity`. Dem Host geht nichts verloren — die `JourneyShareRow` im
Sheet und die Erinnerungs-Push bleiben. Damit entfiel auch die ganze
`journeyPromptAfterLaunchRef`-Mechanik, die den Prompt bis zum Ende der Wurf-Animation
aufhob, samt `createdDraftJourneyContext`.

**Aktualisierte Produktentscheidung (Juli 2026; ersetzt die folgenden älteren
Foreground-only-Hinweise):** Die explizite Aktion „Anreise teilen“ ist reine
Zustimmung/Registrierung — genau wie beim Antippen der Reminder-Push. Der native
Hintergrunddienst (Akku-/Foreground-Notification-Fußabdruck) startet NICHT sofort,
sondern erst bei T−30, egal ob der Tap 6 h oder 1 h vorher passiert. Ausnahme: Beitritt
zu einer bereits **gestarteten `soon`-Aktivität** — dort ist T−30 schon verstrichen, also wird
sofort scharfgeschaltet (`armBackgroundJourney`, `journeyBackground.ts`). (Früher stand hier
„laufende `now`-Aktivität"; als `now` erstellte Activities haben seit August 2026 gar keine
Anreise mehr, gemeint war immer der gestartete Plan.) Der T−30-Start
läuft zweigleisig: ein data-only lokaler Notification-Trigger (`scheduleArmTrigger`,
best-effort — vom OS im Hintergrund drosselbar) plus ein zuverlässiger Vordergrund-Poll
(`ensureBackgroundWatcherArmed`, alle 15 s + bei App-Aktivierung) als Backstop. Bis T−30
wird ohnehin kein Standort gespeichert oder versendet; erst zwei brauchbare Punkte mit
echter Bewegung erzeugen den ersten RTDB-Live-Punkt, Bewegungsrichtung ist irrelevant.
Android verarbeitet die Aktionsbenachrichtigung im Hintergrund und zeigt dabei seine
Pflichtmeldung. iOS kann diese Aktion nach einem Force-quit nicht garantieren, zeigt bei
Hintergrund-Ortung seinen Standortindikator und behält die In-App-Aktivierung als
Fallback. Der Arm-Trigger-Kanal (`JOURNEY_ARM_CHANNEL`) ist auf minimale Android-Priorität
gesetzt, aber ohne echtes Gerät nicht verifiziert, ob er auf iOS/allen OEMs wirklich
unsichtbar bleibt — vor Release prüfen (siehe Safety-Release-Gates unten). Dafür sind
`expo-task-manager`, die nativen Berechtigungsstrings und ein Development/Release-Build
zwingend. Nie ohne diese explizite Aktion starten.

Journey has a service seam in `src/features/journey/`, backed by RTDB. Do NOT add real background location or real push notifications under
the current constraints; the RTDB service stores last-point-only coordinates.

- A user can be actively **unterwegs** to exactly one activity at a time. Starting another journey must
  show a conflict/switch flow instead of silently sharing to two activities.
- "Bin unterwegs" is only available after joining an activity. The trust copy must clearly state:
  participants only, automatic stop at arrival, and latest stop after the event.
- Auto-stop rules mirror the product contract: arrival radius `100 m`, event end + `30 min`
  buffer, and a hard max of `2 h`. Manual "Teilen stoppen" remains an override.
- Default map stays calm: do NOT render all journey avatars globally. Activity markers may show a small
  `N unterwegs` badge. Actual moving/arrival avatars render only in Activity Focus Mode.
- `MarkerDetailSheet` is the control center, but the Anreise entry is a **compact `JourneyShareRow`**
  (not the old full `JourneyPanel` card). The idle "Anreise teilen" row is a single plain, tappable
  action — deliberately no accept/decline framing: it's just there while relevant, gone when not.
  **The row is not rendered at all for an activity created as `now`** (see the rule at the top of
  this section) — and that activity gets no `watchActivityJourney` listener either, because a
  feature that is absent has to be absent in the running cost too.
  For everything else it is visible from **T-6 h until the Anreise could no longer run at all** —
  `endsAt + 30 min`, or `startsAt + 2 h` without an `endsAt`, mirroring `journeyExpiry` in
  `journeyBackground.ts` so the offer and the auto-stop share one boundary. It used to close at
  `startsAt` ("Anreise stops making sense once you're there"), which was wrong twice: you are
  demonstrably still on your way to a `soon` activity that has already started, and after the focus
  X ends a journey (see below) this row is the ONLY way back in — an action you can end must stay
  one you can restart. The Heimweg has NO activity-sheet entry anymore — its home
  is the profile card + global status pill (see Safety section). An armed/underway/arrived Anreise
  status remains visible with stop/arrival controls regardless of that window. Joining a `soon`
  activity that has already started shows the same row once, only when `journeyRemindersEnabled` is on;
  it self-clears on a successful start or when the sheet closes/switches activity — no separate dismiss
  control needed. The small map icon focuses journey participants.
- Activity Focus Mode shows only the selected activity and its journey avatars. The overlay shows a
  focus pill with the activity/person state and an explicit close control. **That X ends the
  Anreise** (`stopJourney` → `stopBackgroundJourney`, then clear the focus) — it used to clear only
  the map focus, so the sharing ran on invisibly while the gesture plainly meant "Schluss damit".
  Restarting happens in the activity sheet's `JourneyShareRow`, which is why its window now stays
  open while the activity runs.
- Entering/leaving Heimweg Focus is one coordinated spatial transition, not a set of independent
  fades: the shield stays at exactly the same position as a fixed anchor, top controls retract,
  bottom controls clear toward their nearest edge, and Safety controls follow with restrained timing.
  Reduced-motion users get the same final layout without motion. Keep the map mounted throughout.
- RTDB paths are `journeys/{activityId}/members/{uid}` and
  `journeys/{activityId}/locations/{uid}`. Rules: members read, users write only their own live point,
  status is `onTheWay | arrived`, and no historical path is stored.
- **Anreise-Erinnerung (Profil-Toggle „Anreise-Erinnerungen", `users/{uid}.journeyRemindersEnabled`,
  Default an):** Bei „ein" schickt `sendJourneyReminders` ~1 h vor beigetretenen Aktivitäten EINE
  Erinnerung „… beginnt um HH:MM · Anreise teilen? Zum Aktivieren tippen." Die Erinnerung **bietet nur
  an** — das Scharfschalten passiert pro Activity durch „Aktivieren", die eigentliche Freigabe erst bei
  echter Bewegung. **Bewusst zweistufig, kein „Immer aktiviert":** eine dauerhafte Auto-Freigabe würde
  das Einwilligungsmodell brechen (jede Activity hat ein eigenes Publikum; „beigetreten, aber doch nicht
  hingegangen" würde fremde Bewegung teilen) und widerspricht der Plattform-Leitlinie, Hintergrundortung
  nur bei erkennbarer Nutzeraktion zu starten. Die Aktion öffnet die App (`opensAppToForeground: true`),
  damit die Hintergrundfreigabe bei Erst-Nutzung angefragt werden kann — headless kann nicht prompten.
  Die Einstellung reitet auf dem geteilten `users/{uid}`-Listener (`friendService.subscribeSettings`),
  kein zweiter Listener.

**After joining, chat is integrated inline with an expand step** — not a separate screen:

- Collapsed (default after join): compact info header + `InlineChatPreview` — a small card showing the last 2 messages prefixed with the sender ("Du:" / "Max:") and a "Alle N Nachrichten ansehen" hint.
- Tapping the preview opens a focused conversation panel with a flat messenger header (back chevron, title + count — no extra chrome; the sheet's floating close X is hidden in chat mode: back leads to the details, a backdrop tap still closes everything). The panel is a **drag-resizable sheet with snap points at 60% and 92%** (`CHAT_SNAP_LOW`/`CHAT_SNAP_HIGH` in `MarkerDetailSheet`): drag the handle to resize with spring physics, flick projection picks the snap, and a decisive drag below the low snap collapses back to the Activity details. There is deliberately NO size button — the handle is the affordance, and screen-reader users resize it via accessibility-adjustable increment/decrement actions on the handle. The thread is **bottom-anchored** (`flexGrow` + `justifyContent: 'flex-end'` in `ChatThread`), so a few messages sit just above the composer instead of floating over empty space. Heights are **percent-based on purpose** (they keep shrinking with the keyboard via the `KeyboardAvoidingView`); expanding animates from the measured detail height. Reduced-motion gets instant snaps without springs.
- `chatExpanded` is local sheet state, reset when the shown activity changes or the sheet closes.
- Rationale: a chat buried in a transient map sheet is hard to return to, so it stays compact by default and only takes over the sheet on demand. Joined rooms are reachable from `PostfachSheet`.

**Membership + chat state** live in `ChatProvider` (`src/features/chat/`), wired near the root in `_layout.tsx` (inside `AuthProvider`). Single source of truth — do NOT keep a separate `joinedActivityIds` in `MapScreen`.

- `isJoined(id)` / `joinActivity(id)` — membership. Persisted to AsyncStorage (`together.joined.activities.v1`) so joined rooms survive restarts.
- `getMessages(id)` / `sendMessage(id, text)` — messages live in Firestore, keyed by the activity/selection id, and are cached per room (see `messageCache.ts` below). **Sending is optimistic:** `ChatProvider.sendMessage` appends a local `pending` echo immediately (rendered translucent with "Senden …"); the message listener's server copy replaces it (matched by author + text with clock-skew tolerance), a failed write removes it. Never make the UI wait for the callable→Firestore→listener round-trip.
- **Incremental message sync (`messageCache.ts`).** Messages are cached per room in AsyncStorage (`together.chat.messages.v1:{roomId}`, capped 200, pruned after 31 days — mirrors the chat TTL). Opening a chat paints the cache instantly; the listener anchors at the newest cached message (`createdAt >`), so **each message is downloaded exactly once per device** — never re-fetch the whole room on open. Known tradeoffs (documented in `subscribeMessages`): > 50 new messages since last open only surface on the next open. Edits to already-cached PROPOSAL docs (votes/locks by others below the anchor) are refreshed by one bounded one-off read of the newest proposal messages on room open (`kind == 'proposal'` + `createdAt desc`, composite index, only for rooms whose cache contains proposals). Do not reintroduce a time-based (`Date.now()`) filter into the message query — it makes every open a brand-new query and defeats all caching.
- `getUnreadCount(id)` / `markRead(id)` — unread = `messageCount - readCount[uid]` from the room summary. `readCount` is a server-persisted per-user cursor on the room doc (rules: self-key-only, monotonic, capped at messageCount), so unread counts survive restarts; a push hint adds a temporary "at least 1" until the next reconciliation. `markRead` is called when a chat opens (`ActivityChatView` and `InlineActivityChat` on mount).
- `createGroup(memberIds, vibe?)` / `getGroup(id)` — open groups (see flow below). A "room" is keyed by either a marker id (activity) or a group id; the same messages/unread/read plumbing serves both. `createGroup` also adds the group id to the joined set, so it appears in the joined list and reuses all chat infra.
- `sendProposal(roomId, {what,when,where})` / `toggleProposalConfirm` / `markProposalPlanned` — proposals are just messages with `kind: 'proposal'` and a `proposal` payload; they are NOT a separate screen or app state. (The composer entry point was removed from the chat UI — see the core-flow section.) Rules: `confirmedBy` is strictly self-toggle-only; `planned` may be set by ANY room member — the "Aktivität" escalation button is deliberately offered to the whole group, so an author-only lock would silently fail for everyone else and allow duplicate activities from one proposal (fixed August 2026).

**Chatraum-Verwaltung (Mitglieder & Admins):**

- Rooms carry `adminUids` (creator = first admin; legacy rooms without the field: `memberIds[0]` counts as admin — this fallback lives in the functions, both services AND `ChatProvider.isRoomAdmin`, keep them in sync).
- **Group rooms only.** Activity-chat membership follows activity participation (join/leave the activity) — never chat-side member edits; the info sheet shows activity members read-only.
- Management is **callable-only** (`addChatMembers`, `removeChatMember`, `promoteChatAdmin` in functions/index.js): caller must be admin; added members must be **confirmed direct friends of the adder** (same trust boundary as group creation, never strangers); groups cap at 25 members; **admins cannot be removed** (they leave via `leaveChatRoom`); promote only, no demote.
- Seam methods on `ChatService`: `getRoomMembers` (one-off `publicProfiles` reads when the info sheet opens — deliberately NO listener), `addMembers`, `removeMember`, `promoteAdmin`. `ChatProvider` exposes them plus `isRoomAdmin`.
- **UI = `ChatRoomInfoSheet`** (`src/features/chat/components/`), opened by tapping the chat header title in `ActivityChatView` (standard messenger "group info" affordance). Three inner views: member list (admin chips, "(Du)" marker), member profile (tap a row → avatar/name/@username + admin actions "Zum Admin machen" / "Aus Gruppe entfernen" with confirm dialog), and an add-friends picker (search + checklist of own friends not yet in the room, footer "Hinzufügen (N)"). Errors surface as `Alert`, never silently.
- **Rename (`renameChatRoom`):** group creation stays 1-tap with an auto-name (vibe or "Mit A, B, C" — NEVER an upfront name form, same defaults-first lesson as the Open status); admins rename afterwards via the pencil in the info sheet's room card (inline edit, ≤80 chars). Activity chats are NOT renamable — they mirror the activity title.
- **"Offen für Dazustoßer" (joinable groups):** the answer to "wie stößt man dazu, ohne eingeladen zu werden" — as an **explicit group decision, never auto-visibility** (showing formed groups uninvited = FOMO/exclusion display, rejected). Admin toggle in the Gruppen-Info (default OFF). Opting in writes a public **teaser doc `groupOpenings/{roomId}`** (title, vibe, memberCount, memberPreview initials — NEVER messages; the private room doc stays members-only) with `audienceUids` = the toggling admin's confirmed friends minus members (snapshot, presence mechanics). NearbySheet shows openings in an "Am Planen — komm dazu" section (listener attaches ONLY while the sheet is open — `setOpeningsActive`); "Dazustoßen" → `joinOpenGroup` callable (re-checks audience + 25-cap server-side) → lands in the group chat. The nearby pill count NEVER includes groups.
- **Leaving (`leaveChatRoom`) + admin succession:** every member can leave a group ("Gruppe verlassen", destructive-red with confirm, closes sheet + chat via `onLeave`). When the last admin leaves, the longest-standing remaining member (`memberIds[0]` after removal) inherits admin — a room must never be admin-less. An emptied room becomes unreadable and dies via TTL. This succession contract lives in the `leaveChatRoom` callable.
- **Targeted invitations (`inviteToGroupChat` / `respondToGroupChatInvite`):** the answer to "kann Lisa noch dazu?", which "Offen für Dazustoßer" deliberately does not answer — that one makes a round *findable*, this one asks *one person*. Admins open "Leute einladen" in the info sheet and pick from their own confirmed friends who are not already members. **An invitation never adds anyone.** The server writes `groupChatInvites/{roomId}_{inviteeUid}` (server-only in `firestore.rules`, 7-day TTL) plus a `group_chat_invite` notification under the deterministic id `groupinvite_{roomId}_{inviteeUid}`, so answering can retract its own card; the Postfach renders it with two real actions (Ablehnen / Beitreten), never a single tap that joins. `inviteToGroupChat` checks group-room + admin + live room + `GROUP_CHAT_MAX_MEMBERS` (25, counting pending invites) + **the inviting admin's own** direct friendship + blocks in both directions. `respondToGroupChatInvite` re-checks every one of them at answer time, because days can pass in between. A **full** round rejects the join but KEEPS the invitation — a seat may free up, and deleting it would turn "gerade voll" into "nie eingeladen gewesen".
- **Do not revive `circle_invite`.** It was legacy with no writer; the kind, the dead `respondToCircleInvite` tombstone and the `circleInvites` rules block are removed. Old documents expire via TTL.

**Full-screen chat is a Modal, NOT an Expo Router route.** There is no `activity/[id]/chat` route (it caused "unmatched route" issues with nested dynamic segments + `Stack.Protected`). Instead:

- `ActivityChatView` (`src/features/chat/components/`) is a presentational, props-based chat screen (`activityId`, `title`, `count`, `onBack`). Gated by `isJoined` (locked state otherwise).
- `MapScreen` hosts it in a `<Modal>` driven by `chatActivity` state. Opening from the joined list sets `chatActivity`; `onBack` clears it.
- `InlineActivityChat` (in the detail sheet) and `ActivityChatView` (full-screen Modal) share the same components/provider. Inline = quick access on the map; Modal = from the joined list.
- Text messages and proposal cards must keep visible sender context. `MessageBubble` / `ProposalCard` show the sender at author changes (`Du` for the current user, `authorName` for others), so group chats stay readable like WhatsApp-style group threads.
- Never reintroduce a router route for chat unless the nested-route registration is verified.

**One colour model for chats (`features/chat/chatAccent.ts`).** A room's colour says what KIND of room it is and must be identical on every surface it appears on: an **activity chat inherits its activity's mode colour** (`activityChatAccent(mode)` — open blue / soon amber / now green), a **planning round is `GROUP_CHAT_ACCENT`** (`SEMANTIC_COLOR.action`, violet) and is NEVER Open-blue. `accent` is therefore a **required prop** on `ActivityChatView`, `InlineActivityChat`, `InlineChatPreview`, `ChatThread`, `ChatInputBar`, `MessageBubble`, `ProposalCard`, `ProposalComposer` and `ChatRoomInfoSheet` — no component may carry a literal default. The old `const ACCENT = '#6E8BF7'` fallbacks are exactly how one room rendered blue full-screen and green inline, and `#3B82F6` is the `open` mode colour that `semanticColors.ts` forbids reusing for unrelated state. Hosts resolve the accent once (`MapScreen`, `CalendarScreen`, `PostfachSheet`, `ActivityContent`) and thread it down. **Never fake a group as an activity with `mode: 'open'`** — `PostfachRoom` is a discriminated union (`kind: 'activity' | 'group'`) precisely so a Planung cannot look like an Open activity in the list.

**Typography in chat and Postfach.** Both features use `FONT`/`TYPE`/`TEXT_FLEXIBLE`/`TEXT_CAPPED` from `@/shared/theme` and nothing else. Tailwind weight classes (`font-bold`, `font-semibold`, `font-extrabold`) are banned on `Text`/`TextInput` there: the app ships STATIC Schibsted files, so a `fontWeight` next to a `fontFamily` makes Android synthesize a second fake bold, and a weight class WITHOUT a `fontFamily` silently renders the system font — which is what the whole chat and Postfach used to do. `TextInput` needs `fontFamily: FONT.medium` too. No new ad-hoc sizes (`text-[15px]`, `text-[10px]`, `text-xl`): map the role onto the scale (body → `TYPE.body` + `FONT.medium`, label → `TYPE.label` + `FONT.semibold`, meta → `TYPE.caption`/`TYPE.micro`), and add `TEXT_CAPPED` inside fixed-height controls and pills.

**Sending is honest about failure.** `ChatInputBar` caps input at `MESSAGE_MAX_LENGTH` (2000 — the server's own limit in `createChatMessage`) and shows a counter from 1800 characters. A multiline composer has **no keyboard "send"**: Android inserts a newline regardless of `returnKeyType`, so the arrow button is the only send affordance on both platforms. Failed optimistic echoes carry a typed `failureReason` classified from the callable's error CODE (`classifySendFailure`), and only `network` is retryable — `isRetryableFailure` gates both the bubble's tap target and `retryMessage`, so a rejected 2001-character message can never offer a retry that must fail again.

**Thread scrolling and history.** `ChatThread` jumps to the newest message only when the user was already at the bottom, sent something themselves, or opened the keyboard; otherwise a new arrival raises a "Neue Nachrichten ↓" button instead of yanking the viewport. History is **explicitly user-driven**: an "Ältere Nachrichten laden" header button loads exactly one page of 50 via `chatService.loadOlderMessages`, never `onEndReached`. The cursor is `(createdAt, documentId)` — a bare timestamp drops or repeats messages written in the same millisecond. Local retention stays at `MAX_CACHED_MESSAGES` (200). Never let the thread pretend it starts where the cache does: the button is what makes an unloaded gap visible.

**Safety actions belong in the chat.** Every OTHER person in a member profile (`ChatRoomInfoSheet`) gets "Melden oder blockieren" → the existing `SafetyActionsSheet` → the existing `blockUser` callable. Do not build a second block path in the client. Blocking already severs shared Activities and chats server-side (`severBlockedContactSpaces`), so `onBlocked` closes the info sheet AND the chat behind it. Own profile shows no such action.

### Postfach (joined rooms and notifications)

- The map top-bar chat icon opens `PostfachSheet`; it is a button, never a tab.
- `PostfachSheet` owns joined rooms, notifications, friendship requests, Journey and Safety notices. Its room list derives from `ChatProvider.joinedIds`, resolves activity ids through `findActivityById` or groups through `getGroup`, and sorts by `lastMessage.at ?? createdAt`.
- Opening a room passes a `PostfachChatTarget` (id, title, **accent**, kind, memberCount) to `MapScreen`, which opens the existing chat Modal.
- **"Mitteilungen" is ALWAYS reachable.** The row renders at all times — with a badge and preview when something is new, and as "Alles gelesen" with no badge otherwise. It used to render only while something was unread, so reading everything deleted the only entry point and made notification history unreachable until the next push. The empty Mitteilungen view says "Keine Mitteilungen".
- **The seen cursor moves on the way OUT, never on open.** `openNotifications()` snapshots the currently-unread ids into local state and does NOT call `markAllSeen()`; the cursor advances in `showHome()` / `closeSheet()`. A group counts as new while it is still unread OR was in that snapshot, so entries stay visibly new for the whole visit and notifications arriving mid-visit light up too. Marking on open turned every card grey in the same frame the list animated in.
- **Two badge numbers, two meanings** (`usePostfachBadge`): `count` is the map button — unread chats + friend requests + actionable Safety + unread notification groups + push-only hints. `mitteilungenCount` is the Mitteilungen row — the same minus chats, because chats already carry their own badges one screen below and counting them twice showed one event as two. The Mitteilungen header carries a stable description ("Aktuelles und Mitteilungen"), never a count: the old "N wichtig oder neu" used a third formula and disagreed with the badge that led to it.

### Open → Group → Proposal → Plan (the core flow)

The product turns a loose "I'm open" into a concrete plan through a lightweight escalation. It is deliberately NOT a Tinder/swipe model and NOT a global stranger chat — curation over public, circles over strangers.

1. **Free vibe, not fixed categories.** The activity "what" is free text (`draft.title`). Never reintroduce a rigid category picker.
2. **Group creation lives in the open-pill sheet (`NearbySheet`), NOT a separate button/sheet.** Everything is in one place: tapping the centered "N offen in deiner Nähe" pill opens `NearbySheet`, where you see who's open, multi-select friends (tap a row to toggle; pin friends keep a separate navigate icon), and tap the footer **"Gruppe starten (N)"**. That calls `onStartGroup(members)` → `MapScreen.handleStartGroup` → `createGroup` → opens the group chat Modal. Do NOT add a "Gruppe" option to the create speed-dial (that was tried and removed).
   - `createGroup(members: GroupMember[], vibe?)` takes `{ id, displayName }[]` (nearby friends carry no map-user id, so names are passed directly). It prepends the current user and adds the group id to the joined set.
3. **Proposal = chat card, created via the "+" in the input bar — planning groups ONLY.** `ChatInputBar` shows a "+" button (when the host passes `onProposal`) that opens `ProposalComposer` (Was required, Wann/Wo optional free text) → `sendProposal` posts the card. Both chat surfaces wire it, but **only for `room.type === 'group'`** — inside an activity chat the plan already exists, so the entry stays hidden there (a proposal would be noise). `ProposalCard` renders with "Bin dabei" + "Aktivität"; the direct "Aktivität" header button (step 5) remains the heavier escalation path. Rationale: the proposal is the low-threshold middle step of this core flow — a required-fields activity composer must never be the ONLY way a loose group can converge on a plan.
4. **Proposal → activity.** "Aktivität" on the card calls `onCreateActivity(roomId, messageId, proposal)`, threaded up through `ActivityChatView` / `InlineActivityChat` (→ `MarkerDetailSheet`) to `MapScreen.createActivityFromProposal`. That marks the proposal `planned` (card shows "Aktivität erstellt") and opens the `ActivityComposerSheet` prefilled: mode `soon`, `initialTitle` = proposal.what, `initialPlace` = proposal.where (name only). The composer's submit stays the actual creation — precise time isn't prefilled because proposal.when is free text and the composer uses date pickers.
5. **Direct create.** `ActivityChatView` also has an **"Aktivität"** button in its header (`onCreateActivityDirect`) → `MapScreen.createActivityFromChat` opens the composer directly (prefilled with the group's `vibe` if any), no proposal card needed.
6. **The chat room persists** across all of this. Creating an activity does NOT discard the group room or its messages — it's the same room (keyed by group id). The created activity is not attached to the room today — the room simply stays in "Deine Aktivitäten".

**Rejected on purpose:** blue open-group pins on the map (looks like a place/event when it isn't); a global "everyone nearby" chat (breaks the circles/no-feed identity + safety/stalking risk — the 2 km min radius exists for the same reason); Tinder-style matching (feed/gamification, off-identity, and incompatible with free-text vibes).

- **Activity time/place** come from `MapMarker.timeLabel` / `MapMarker.placeLabel` / `MapMarker.title` or the linked `Plan.activityId`, resolved in `ActivityEntityProvider`. Keep these on the activity docs so the shared detail sheet has full info.

### Avatar marker states

`AvatarMarker` conveys three things visually, so joined/unread status is readable without tapping:

- **Joined:** a green checkmark badge at the bottom-right (replaces the mode status dot). Driven by `joined={isJoined(marker.id)}` from both canvases.
- **Unread:** a messenger-style red badge (top-right) with `unreadCount`, shown only when joined and there are unread messages (`isJoined(id) ? getUnreadCount(id) : 0`).
- **Mode:** ring color + the bottom-right status dot (dot hidden once the joined checkmark takes its place).

`PostfachSheet` rows show the same unread count as an accent pill and bold the row. Opening the chat (inline or Modal) marks it read, clearing the badge.

### Navigation to a friend (NearbySheet → Map)

Flow: `FriendRow.onPress` → `handleNavigate(coord)` → `onClose()` + `onNavigateTo(coord)` → `MapScreen.focusMapOn(coord)` → `MapCanvas` receives new `focusCoordinate` prop.

- **Native (`react-native-maps`):** `useEffect` on `focusCoordinate` calls `mapRef.current?.animateToRegion(...)` at `PLACE_FOCUS_LATITUDE_DELTA` (0.006) — unless the request set `focusKeepZoom`, see the Map Screen section.
- **Browser preview (`PreviewMapCanvas`):** no `MapView` renders. It reacts to `focusCoordinate` changes by rendering a pulsing ring at the projected real coordinate. Coordinates outside its fixed decorative viewport stay outside rather than being clamped to a misleading location.
- **Rule:** Never attempt to call `mapRef.current?.animateToRegion` from outside `MapCanvas`. Navigation always goes through the `focusCoordinate` prop.

---

## Calendar

- Two view modes: **Week** (single 7-day strip) and **Month** (grid).
- Single toggle button switches between them — button label shows the opposite mode.
- **The agenda ALWAYS shows every plan.** Chronological, grouped by day (`groupPlansByDate`), one continuous vertical scroll — tapping a day does **not** filter to that day. (The old `selectedKey`-filter that showed only one day's plans was removed.)
- **Initial position = TODAY.** On mount the agenda scrolls (non-animated) to the first section on/after today (`didInitialScroll` ref in `handleSectionLayout`) — it must never open on yesterday's expired plans. Past sections stay reachable by scrolling up.
- **Week strip = spinnable wheel that ALSO follows the agenda.** `WeekStrip` is a horizontal, week-snapping `FlatList` (`cellWidth = width/7`, `snapToInterval = width`, `disableIntervalMomentum`) — you can freely swipe through weeks. It takes an `activeKey` (= the day the agenda is currently scrolled to, `highlightKey = scrollActiveKey ?? sections[0].key`): it highlights that day and **auto-scrolls the wheel to its week**, so as the agenda crosses into a new week the strip jumps along. Manual swiping is **pure browsing** — it does NOT move the agenda (only `onMomentumScrollEnd` updates the internal week ref so the follow-scroll guard stays correct); **tapping a day** scrolls the agenda there (`focusDay` → `scrollAgendaTo`, first section on/after that day). Do not remove the horizontal spinning again.
- **Scroll-sync mechanics:** `AgendaList` reports each section's y via `onSectionLayout`; `CalendarScreen.handleScroll` picks the section nearest the top → `scrollActiveKey`. This drives both the week strip and the month grid highlight.
- **Month = 3-panel carousel.** Month view still uses the reanimated `[prev, current, next]` carousel (row of `3×screen`, translated `-width + drag`, centered middle). On release past threshold `navigate(dir)` slides the neighbour month in with `withTiming` (ease-out, no spring → **no wobble**), then `commit` shifts `gridMonth` one month and resets `translateX` to 0 (neighbour == new current, so seamless). Month arrows call the same `navigate`. Wrapped in `overflow-hidden`. Tapping a month day scrolls the agenda to it (`selectDay`), it does not filter.
- `failOffsetY: [-15, 15]` on the month gesture prevents conflict with vertical scroll. Never revert the month carousel to the single-panel "slide out → blank → spring in" approach (page-wide gap + wobble); keep `withTiming`.

### Plan cards

- **No status labels.** Do NOT show "Fix"/"Vielleicht"/"Einladung" badges or "aus Open/Soon/Now" source lines. `PlanStatusBadge` was removed.
- **Mode label (top-right):** a single tinted pill in the title row — "Jetzt" (green accent) when `sourceMode === 'now'`, otherwise "Soon" (orange accent). Plain `border-border`, no colored card border.
- **Expand in place, NOT a bottom sheet.** Tapping a card toggles an inline accordion (`expandedPlanId` lifted to `CalendarScreen`, single card open at a time). Expanded shows description, address, people names, and a **Beitreten / Zum Chat** action. Tapping the card background again (outside the inner buttons) collapses it. There is NO `MarkerDetailSheet` in the calendar anymore.
- **Agenda motion:** expand/collapse animates via reanimated `LinearTransition(220ms)` on PlanCard + AgendaSection + AgendaList wrappers (surrounding cards slide smoothly); expanded content uses `FadeInDown(200)`/`FadeOut(120)`; cards get a subtle press-scale (0.985). The TODAY section header shows a small `bg-primary` dot + `text-primary` label. All animations are `useReducedMotion`-guarded.
- **Chat** opens as a full-screen `ActivityChatView` Modal hosted by `CalendarScreen` (only via the "Zum Chat" button, shown when joined). Room id = `plan.activityId ?? plan.id`.

---

## Safety-Modus „Heimweg“

Der verbindliche Vertrag lebt in [docs/safety-mode.md](docs/safety-mode.md). Die Basis ist gebaut,
aber bis zu den dortigen Release-Gates nicht produktionsreif.

- **Einstiege (bewusste Revision Juli 2026 — „Präsenz ≠ Prominenz"):** Auf der KARTE gibt es einen
  stillen Schild-`RoundButton` in der Top-Bar (zweites Element links, RECHTS neben dem
  Profil-Button — das Profil bleibt als Identitätsanker außen in der Ecke, Plattform-Konvention;
  die Leiste bleibt symmetrisch: 2 Buttons · Suchfeld · 2 Buttons; gleiche Optik wie der
  Kalender-Button) — Begründung: Auffindbarkeit und Muskelgedächtnis sind bei einem
  Sicherheitsfeature selbst eine Sicherheitseigenschaft. **Ein Element, eine Bedeutung (Revision
  Juli 2026):** Der Schild ist AUSSCHLIESSLICH der eigene Heimweg — Ruhezustand → Start-Sheet,
  eigene Session → Konsole/Panel; er wechselt seine Funktion NIE danach, was andere tun (nachts
  tippen muss immer „meinen Heimweg starten" heißen), Färbung nur eigener Status. Während jeder
  eigenen Session pulsiert ein Ring in der eigenen Statusfarbe und das Schildsymbol atmet sehr
  dezent in der Größe (Blau ruhig, Orange schneller, Rot deutlich; Reduced Motion statisch), damit
  die laufende Freigabe nach dem Schließen der Konsole
  nicht vergessen wird; er bleibt
  auch im Heimweg-Fokus sichtbar. Er startet nie selbst Tracking oder Alarm. Kalender und
  Socialize bekommen KEINEN eigenen Button. Zweiter stabiler Einstieg ist die
  Profil-Funktionskarte **„Sicher nach Hause"** (weit oben, gleiche Verzweigung).
  Alles über FREMDE Heimwege lebt in der `SafetyStatusPill` (unter der Suchleiste, ALLE Flächen):
  Freunde teilen + Fokus nicht offen → **pulsiert** in der ernstesten Signalfarbe (`worstStatus`
  aus `safetyTheme.ts` — der EINZIGEN Farb-/Wortquelle für Konsole/Panel/Pille/Marker; Blau
  langsam, Orange/Rot schnell, reduced motion statisch; endet beim Hinschauen) → Tap öffnet den
  Heimweg-Fokus. Im Fall-3-Fokus wird sie zur „Heimweg-Fokus verlassen"-Pille; das Fall-2-Panel
  hat ein eigenes Minimieren-Chevron. Eigene Session minimiert ohne fremde Heimwege → Rückweg in
  die Konsole. Das Begleiter-Sheet („Heimwege deiner Freunde", erreichbar über Marker-Tap im
  Fokus) dient ausschließlich dem empfangenen Heimweg; der eigene Start bleibt am Schild. Keine
  parallelen Heimweg-Einstiege in Activity-Details oder NearbySheet hinzufügen.
- **Safety-Session-Zustand darf nie am leeren RTDB-Pfad abbrechen:** Der Owner darf
  `heimwege/{uid}` immer lesen, auch wenn dort noch keine Session liegt oder sie gerade gelöscht
  wurde. Nur Begleiter benötigen weiterhin `retainUntil` + Audience-Freigabe. Sonst wird der
  Listener beim App-Start abgewiesen, sieht einen späteren Start bzw. das abschließende `null`
  nicht und die UI driftet vom Serverzustand. Direkt nach den nötigen Berechtigungen setzt der
  Client eine optimistische lokale Session und zeigt nach dem Sheet-Dismiss sofort die reguläre
  Konsole mit „Heimweg wird gestartet". Technische Backend-Phasen werden nicht aufgezählt. Bis
  Start-Callable und Standortdienst bestätigt sind, bleiben Safety-Aktionen deaktiviert; der
  RTDB-Listener gleicht anschließend die autoritative Session ab. Während der Anfrage pulsiert das
  Schild und darf den Start-Flow nicht erneut öffnen; beim Beenden ersetzt ein Pending-State die
  Safety-Aktionen und verhindert doppelte End-Anfragen.
- **Heimweg-Fokus (Begleit-Kartenmodus):** `heimwegFocusActive` (SafetyProvider, ABGELEITET — mit
  eigener Session ist es die offene Split-Konsole, ohne eigene der manuelle Schild-Toggle):
  Aktivitäten + Journey-Avatare + alles Karten-Chrome ausgeblendet (`hideActivities` in beiden
  Canvases + Gating in MapOverlay), sichtbar nur Heimweg-Marker + Schild. **Heimweg-Marker sind
  IMMER sichtbar — auch auf der normalen Karte zwischen den Aktivitäten** (Nutzerentscheidung
  Juli 2026; ersetzt eine kurzzeitige focus-only-Regel. Safety-Vertrag: ausdrücklich anvertraute
  Positionen — der Fokus blendet nur alles ANDERE aus). Sie zeigen ausschließlich Avatar, Name
  und den statusfarbenen Ring. Einstieg und Recenter fassen alle verfügbaren Positionen ein; Marker-Tap
  öffnet exakt die gewählte Person, POI-/Long-Press-Erstellung ist gesperrt. Zeitbasierte
  Datenlücken müssen per Tick neu abgeleitet werden, nicht nur bei einem RTDB-Event. Es gibt EINE Karte —
  der Fokus ist ein Filter über der immer gemounteten Hauptkarte, nie eine zweite Instanz. Drei
  Fälle: (1) nur eigene Session → Vollbild-Konsole (Modal) wie gehabt; (2) eigene Session +
  Freunde teilen → `SafetyConsolePanel` bildet ein festes, etwa halbhohes unteres Control-Deck:
  oben bleibt die Karte mit den begleiteten Personen sichtbar, der komplette untere Bereich gehört
  Heimwegstatus, Bestätigungen, Check-in, 112 und Hold-Buttons. Keine kleine freischwebende Karte
  und keine Activity-Bedienelemente in diesem Bereich; die frühere „Auch unterwegs"-Liste ist
  ersatzlos entfallen — die Karte zeigt es besser. (3) nur
  empfangen → Vollbild-Fokus ohne Panel. MainSurface dreht beim Aktivieren STILL auf die
  Karten-Ebene (sonst schiene Kalender/Socialize durch) und versteckt den Mode-Switch. Der Wechsel
  nutzt kurze Ease-out-Fades mit nur minimaler Skalierung/Vertikalbewegung; Karten-Chrome geht in
  125–190 ms, die Fokus-Ebene folgt leicht versetzt in höchstens 220 ms. Keine großen Flugwege,
  keine federnden Layoutwechsel und keine starke Kino-Vignette. Dieser Spezialübergang gilt NUR
  zwischen normaler Karte und Heimweg-Fokus; Safety-Sheets öffnen wie alle übrigen Bottom-Sheets
  mit der normalen Slide-Animation. Das Start-Sheet ist ein bewusster **Zwei-Schritte-Flow** (Nutzerentscheidung Juli
  2026): Schritt 1 = Übersichtsseite „Sicher nach Hause" (Hero-Schild, DREI Punkte: Live-Standort
  (grün — Ankunft UND Löschversprechen stecken im Text: „…bis du sicher zu Hause bist. Danach wird
  er gelöscht.") / „Ich fühle mich unsicher" (orange) / „Ich bin in Gefahr" (rot) — die Ich-Titel
  sind die nutzerseitigen Namen der Orange-/Rot-Modi und müssen mit den Konsolen-Buttons
  übereinstimmen. **Formulierungsregel:** beschreiben, was DU tust und was Freunde SEHEN können —
  nie, was deren Gerät tun wird. „Alarmieren" als eigene Absende-Handlung ist erlaubt; verboten
  sind Zustell-/Tonversprechen („sofort", „laut", „weckt" — das gehört dem OS);
  112-Ehrlichkeitszeile, „Weiter"), Schritt 2 =
  Personenauswahl „Wer sieht deinen Heimweg?" (Zurück-Pfeil, Chips/Suche/Checkboxen, „Heimweg
  starten · N"), mit Fortschritts-Punkten. **Revision August 2026 (ersetzt „Übersicht bei JEDEM
  Öffnen"):** Die Übersicht erscheint nur beim ERSTEN Öffnen (AsyncStorage
  `together.safety.introSeen.v1`); danach landet der Schild direkt auf der Personenauswahl —
  wer nachts den Heimweg startet, braucht die wenigsten möglichen Taps. Der Zurück-Pfeil der
  Auswahl hält die Übersicht jederzeit einen Tap entfernt; ein Storage-Fehler zeigt sie
  sicherheitshalber wieder. Für Emulator-Tests kann
  `seed-heimweg.mjs` eine zeitlich begrenzte Beispielsitzung erzeugen; die App enthält keine
  permanente clientseitige Demo-Sitzung. Der Schild führt in den Beobacht-Modus, der eigene Start
  läuft über Profil-Karte und Begleiter-Sheet („Eigenen Heimweg teilen", auch per Marker-Tap im
  Fokus erreichbar).
- **Konkrete Personen, bewusst verwaltet:** Nur bestätigte direkte Freunde. Gruppen/Enge Freunde/Alle
  sind Schnellauswahlen. Zusätzlich erscheint eine beigetretene, noch laufende `now`-Aktivität
  unter ihrem Namen als erste kontextuelle Schnellauswahl; sie enthält nur direkte Freunde aus der
  bekannten Teilnehmerliste, nie fremde Teilnehmer. Vor dem Start bleibt jede ausgewählte Person
  sichtbar und einzeln änderbar. Maximal 25 Empfänger. Während der Session öffnet ein Tap auf die
  Geteilt-/Bestätigt-Zeile die Begleiter-Verwaltung: alle Personen mit aktuellem Status, bewusstes
  Hinzufügen und Entfernen mit Bestätigung. Mindestens eine Person bleibt ausgewählt; andernfalls
  muss der Heimweg beendet werden. Hinzufügen/Entfernen läuft ausschließlich über
  `updateSafetyAudience`: Der Server prüft Freundschaft, Blockierungen, Limit und aktive Session,
  passt Audience + Fan-out an und entfernt beim Widerruf auch die Bestätigung. Eine in Orange/Rot
  neu hinzugefügte Person erhält den aktuellen Alarm und muss genau diesen bestätigen. Nie
  automatisch Personen ergänzen. Entfreunden oder Blockieren entzieht laufenden Safety-Zugriff
  serverseitig in beide Richtungen; ohne verbleibende Begleitperson endet die Session. Nach
  „Heimweg starten" zuerst das native Start-Sheet schließen und erst danach die Safety-Konsole
  öffnen — keine überlappenden Modals. Ein Functions-Cold-Start läuft hinter der sofort sichtbaren,
  noch deaktivierten Konsole und darf nie wie ein eingefrorener Button wirken.
- **Erreichbarkeit ist freiwillig und temporär:** Empfänger erhalten eine
  `safety_request`-Benachrichtigung und können „Ich bin erreichbar“ bestätigen. Eine Bestätigung
  gilt 30 Minuten und wird fünf Minuten vorher nur beim Begleiter lokal erinnert. Ohne Reaktion
  läuft sie still ab; „Nicht mehr erreichbar“ zieht sie sofort zurück und informiert den Owner.
  Diese allgemeine Bestätigung darf nur als „erreichbar“ bezeichnet werden.
  Jeder bewusste Wechsel auf Orange und jeder spätere Wechsel auf Rot erzeugt dagegen eine neue,
  eindeutig versionierte Alarm-Anfrage mit der Aktion „Ich habe dich im Blick“. Nur eine frische
  Bestätigung genau dieser Alarm-Version darf in Orange/Rot als „N schauen gerade zu“ gezählt
  werden; eine alte Erreichbarkeits- oder Orange-Bestätigung zählt nicht für Rot. Der Alarm wartet
  nie auf Bestätigungen und Rot/112 werden dadurch nicht blockiert.
- **Server-owned Trust Boundary:** Start, Verlängerung, Statuswechsel und Bestätigung laufen nur
  über `startSafetySession`, `extendSafetySession`, `setSafetyStatus` und
  `updateSafetyAudience`, `confirmSafetyCompanion`, `withdrawSafetyCompanion` bzw.
  `confirmSafetyAlert`.
  Orange/Rot/Entwarnung erzeugen dort Benachrichtigungen für die aktuell bewusst festgelegte
  Audience. Safety-Pushes werden über einen dauerhaften Firestore-`pushOutbox`
  asynchron zugestellt; der Callable wartet nie auf die externe Expo-API. Der Owner darf zusätzlich
  ausschließlich die komplette eigene `heimwege/{uid}`-Session löschen (kein Patch geschützter
  Felder); `cleanupSafetyIndexOnSessionDeleted` entfernt anschließend serverseitig den Fan-out.
  Status, Audience, Identität, Laufzeit, Bestätigungen und `heimwegeIndex` bleiben server-owned.
- Zustände Blau/Orange/Rot/Grün. **Rot ist ausschließlich eine bewusste Halte-Aktion**; keine
  Automatik löst Rot oder einen Notruf aus. Bei Rot ist „112 anrufen“ die erste sichtbare Aktion.
- Pushes enthalten nie Koordinaten. Zuhause wird nie als Pin/Ziel gespeichert. Kein
  `onDisconnect().remove()`: App-Tod oder Funkloch ist ein Datenabriss, kein sicheres Ende.
- **Stillstand und Ablauf:** Standardlaufzeit zwei Stunden. Zehn Minuten vorher fragt eine lokale
  Benachrichtigung direkt „Bist du schon zuhause?“ mit den Aktionen „1 Stunde verlängern“ oder
  „Sicher angekommen“; die Function akzeptiert die manuelle Verlängerung nur in den letzten
  15 Minuten. **Ohne Reaktion greift `autoExtendSafetySessions` (Scheduled Function, alle
  5 Minuten):** verlängert serverseitig um 20 Minuten, max. zweimal, PROAKTIV vor `expiresAt` —
  damit verschieben sich die lokal geplanten Warn-/Ende-Benachrichtigungen (hängen an
  `expiresAt`) automatisch mit, statt dass die Session sichtbar endet und wieder auftaucht.
  Bewusst kein `updatedAt`-Bump (sonst wirkt eine Session ohne neuen Fix fälschlich frisch) und
  bewusst KEIN Signal an Begleiter oder Owner („Keine Antwort seit …“ wäre reine Panikmache bei
  einer Routine-Frage am Ende eines normalen Blau-Heimwegs — dieselbe Zurückhaltung wie
  `deriveCompanionSignal`). Erst nach beiden Auto-Fenstern endet die Freigabe wie gehabt ehrlich
  als „Automatisch beendet · Ankunft nicht bestätigt“. Nach 45 Minuten ohne relevante
  Bewegung fragt eine lokale Benachrichtigung nach; erst zwei aufeinanderfolgende Punkte außerhalb
  eines 60-m-Radius setzen dieses Fenster zurück. Kleine GPS-Sprünge oder Bewegung innerhalb des
  Hauses zählen nicht. Unveränderte Punkte werden nicht laufend hochgeladen.
- Nach automatischem Ende sind Writes sofort gesperrt. Der letzte Punkt bleibt bei Blau 3 Minuten,
  bei Orange/Rot 30 Minuten schreibgeschützt für den zuletzt bewusst festgelegten Empfängerkreis lesbar und wird
  anschließend durch den bestehenden Cleanup-Lauf gelöscht.
- RTDB bleibt last-point-only. Der lokale 15-Minuten-Verlauf und das lokale
  Orange/Rot-Vorfallsprotokoll sind die dokumentierte Safety-Ausnahme. Cloud-Protokoll,
  Akku-/Empfangsstatus und echte Geräte-Push-/Hintergrundtests sind Release-Gates. Native
  Firebase-Builds nutzen nach explizitem Heimweg-Start `expo-task-manager` +
  `startLocationUpdatesAsync` (Blau ca. 30 s, Orange/Rot ca. 5 s), lokal wiederherstellbar,
  Android mit Foreground-Service-Meldung und iOS mit Standortindikator. OS-Drosselung/Force-quit
  bleiben ehrliche Plattformgrenzen; niemals eine ausbleibende Position als Ankunft deuten.

---

## Socialize (deaktiviert)

Socialize ist nicht in die aktive Navigation eingebunden und kein Release-Feature. Der Code bleibt
bis zu einer bewussten Produkt-, Safety- und Aufbewahrungsentscheidung isoliert; er darf nicht
nebenbei wieder in `MainSurface` oder eine Release-Konfiguration eingehängt werden.

---

## Auth Screen

- Headline: `"Freie Zeit wird gemeinsame Zeit."`
- Subtitle: `"Sieh, wer offen ist. Teile einen Plan. Kommt spontan zusammen."`
- `"Als Gast ansehen"` calls `signInDemo()` and works only against the local Emulator Suite. **Produktentscheidung Juli 2026 (aktualisiert):** Es gibt keinen Gastmodus im Produktivsystem — `firebaseAuthService.signInDemo` lehnt den Aufruf ab, sobald die App gegen ein echtes Cloud-Projekt läuft (`USE_EMULATORS` in `src/shared/services/firebase.ts`), mit einer Fehlermeldung, die zur E-Mail-Anmeldung verweist. Ein passendes zweites Release-Gate (`FUNCTIONS_ENFORCE_EMAIL_VERIFICATION`, siehe docs/backend-plan.md → Schritt 8) verlangt serverseitig ein bestätigtes `email_verified` für alle schreibenden Callables außer Safety/Heimweg, `claimUsername`, `blockUser`/`unblockUser`/`reportUser` und `deleteMyAccount`.
- **Brand typeface = Schibsted Grotesk** (bundled via `@expo-google-fonts/schibsted-grotesk`, loaded in `_layout.tsx` behind `SplashScreen.preventAutoHideAsync()` so the wordmark never flashes in a system-font fallback). Wordmark and display copy use 700; controls use 700/600/500. With static font files set `fontFamily` only — never combine with `fontWeight` (Android synthesizes).
- **The circle/ring, woven-ribbon and initial-`t` concepts are all retired.** The mark is the **Mica figure** (`micaLogo.tsx`): raised left arm, head, torso-plus-right-arm, which together also form the `i` of the wordmark. Paths come verbatim from the delivered SVG; the view boxes are the **measured tight bounds** of those paths, not the 1024² source canvas, and both were verified pixel-tight by rendering and trimming. Never re-derive them by eye. Three colours, sampled from the delivered icons: arm `#35BA84` · head `#E9A02B` · body `#4772F8` (`MICA_FIGURE_COLORS`).
- **Colour on the figure is deliberate and rationed.** `tone="brand"` is used ONLY where the figure sits on a plain surface with nothing behind it: the app icons and `WelcomeIntro`. The auth wordmark stays monochrome white because it sits over the aurora and would lose its edge; the loader and the Core rest state stay monochrome because they must inherit whatever surface they land on. On a light ground the green and amber measure ~2.4:1 and ~2.2:1 — fine for a logo mass carried by the blue body, not fine as the only thing separating a small glyph from its background.
- **Backdrop = aurora field (`BrandBackdrop`), never a literal fake map.** A deep ink ground with three very slow radial fields in the mark's own green, amber and blue, plus a bottom scrim that keeps the white action stack readable. Softness is built from **radial gradients, never a blur** — `react-native-svg` has no dependable blur, so a field that should look diffuse has to be drawn diffuse. Each orb is its own component animating its own *View* transform, which keeps the motion off the SVG-prop interop path; the three cycle durations (23 s / 31 s / 19 s) are mutually prime so the arrangement never visibly repeats. No location pins, map blocks or decorative dots. Reduced motion keeps the field static.
- **The auth surface is deliberately dark in BOTH colour schemes.** It is a brand stage, and every control mounted on it (`EmailAuthForm`, the provider buttons, `GlassField`) is built as dark glass — a light variant would mean rebuilding those, not flipping a token. Light/dark adaptivity lives where it is real: the `color` prop on the figure, loader and Core mark.
- **Landing choreography:** custom `t` draws immediately; `ogether` follows at ~470 ms, copy rises at ~680 ms, actions at ~1.04 s. Motion uses a restrained ease-out and never blocks interaction.
- **The form sheet auto-focuses the e-mail field** (`autoFocusEmail` on `EmailAuthForm`) so the keyboard comes up as the sheet slides in.
- **Two-step structure (landing + sheet), NOT a form on the first screen.** The centered integrated wordmark leads to a bottom action stack: white `Mit E-Mail fortfahren`, glass `Als Gast ansehen`, then one compact privacy statement. The segmented Einloggen/Registrieren form opens in the standard dark bottom sheet with the small custom `t` and remains scrollable with the keyboard open.
- **Login and Registrieren are two different operations, never one combined call.** `SignInWithEmailInput.mode` carries the user's intent and BOTH services must honour it: `login` only ever calls `signInWithEmailAndPassword`, `signup` only ever calls `createUserWithEmailAndPassword`. Never reintroduce the "unknown e-mail → register" fallthrough — a typo during login silently created a second, empty account and the person believed they were logged in. The `AuthModeSwitch` segmented control therefore lives INSIDE `EmailAuthForm` (it decides what submit does); it is not decoration. Never ship default/demo credentials in the submit path.
- **Sign-up provisioning is atomic.** Display name, `claimUsername`, profile docs and the verification mail all belong to the sign-up; if any step fails the freshly created auth user is deleted again (`signUpWithEmail`), so the address is never burned by a half-created account. `provisionFederatedSession` has the same contract via sign-out.
- **Name ≠ handle.** The sign-up field asks for a display name; the claimable handle is derived with `slugifyUsername` (`utils/username.ts`) because `claimUsername` enforces `^[a-z0-9][a-z0-9._-]{1,29}$` — passing the raw name broke every sign-up containing a space or umlaut. Collisions step aside via `withUsernameSuffix` (`name2`, then a random 4-digit tail). A login that finds a profile without a handle heals it once.
- **Harte Verifizierungs-Schranke (`EmailVerificationGate`, Produktentscheidung August 2026):** Ein authentifiziertes Konto mit `emailVerified === false` erreicht die App NICHT — `RootNavigator` rendert statt des Stacks die Schranke, sodass für ein solches Konto kein Provider mountet und kein Listener startet. Grund: der Server lehnt dessen Writes ohnehin ab (`ENFORCE_EMAIL_VERIFICATION`), sodass ein Durchlassen nur unerklärte Fehler erzeugte. Die Schranke nennt die Adresse, an die geschickt wurde — genau das macht einen Tippfehler (`gmail.con`) sichtbar statt tödlich still. Sie prüft bei App-Rückkehr automatisch (`AppState` → `refreshSession`), bietet erneut senden, „Andere E-Mail-Adresse verwenden" (löscht das Konto) und Abmelden. `refreshSession` erzwingt ein **frisches ID-Token**, weil `email_verified` aus dem Token gelesen wird — ein `reload()` allein lässt gated Callables weiter ablehnen. Einmalig pro Konto: `emailVerified` hängt am Firebase-User, nicht am Gerät.
- **Sign-up sends the verification mail immediately** (`sendEmailVerification`, best-effort). The `FUNCTIONS_ENFORCE_EMAIL_VERIFICATION` release gate rejects writes without `email_verified`, so an account that never received a mail would look broken from the first tap. The pending state is surfaced on `/profile`.
- **No provider error text reaches the user.** Everything goes through `services/authErrors.ts` (`toAuthError`/`authErrorMessage`) — Firebase's bracketed English strings are never displayed. Failed logins use ONE message for unknown-account and wrong-password alike, and `resetPassword` resolves successfully on an unknown address: neither may become an account-existence oracle.
- **Focus states:** `GlassField` accepts a per-surface accent; brand v2 uses `#7C83FF`, while legacy defaults remain unchanged. Errors render as a soft red chip, never bare text. Submit remains a clear white action with an arrow.
- **Validation is per field and lives in the field.** `FloatingLabelField` takes `error`/`hint`/`valid` and renders the message directly under the input with `accessibilityLiveRegion`; validation runs on blur and on submit, and typing clears the complaint immediately. Sign-up passwords need ≥ 8 characters and are scored live by `PasswordStrengthMeter` (length-first, no composition rules — NIST SP 800-63B); login never re-judges an existing password. Return-key chaining (`submitBehavior="submit"` + refs) walks E-Mail → Name → Passwort → submit, and every field sets `textContentType`/`autoComplete` so password managers actually fire.
- **A rejected submit is felt, not just read:** the form shakes once and fires `haptics.warning()` (local validation AND backend errors); a successful sign-in fires `haptics.success()` from `AuthScreen.handleEmail`, where the round-trip result is actually known. All of it is `useReducedMotion`-guarded.
- **RootNavigator MUST use `Stack.Protected` guards** (single `<Stack>`, both screens guarded). Returning two separate `<Stack>` trees crashes on sign-out: the router can still show "(app)" for one frame after the providers unmounted → "useX must be used within XProvider". Chat write actions in `ChatProvider` go through `fireAndForget` (catches + warns) — never `void promise`.

---

## Activity Composer

- **Modes offered: `now` and `soon` only.** `open` is not creatable here (it's the presence toggle in the NearbySheet). `ActivityModeSwitch` shows two segments; the create FAB opens the composer in `now` by default. The FAB opens the composer **directly** — there is no create speed-dial menu anymore.
- **The composer is a `FloatingSheet`, like the open-friends sheet — NOT a `Modal`.** `FloatingSheet` (`features/overlay/components/`) is the form that replaces the app's modal sheets: an even `FLOATING_SHEET.inset` (8 dp) border to all four screen edges so the map stays visible around it, corners derived from the device radius via `concentricRadius`, no backdrop, the map stays tappable — which is precisely why it cannot be a native Modal, since a Modal is its own window and swallows every touch not aimed at the sheet. It is content-sized and bottom-oriented, with a grabber that is the only drag target (across the whole surface it would fight every inner ScrollView). Inside it the composer supplies a FIXED header of icon tile (44 px, `rounded-[17px]`, accent at 15%) + title + subtitle + a 40 px close button — the same header `NearbySheet` uses. The subtitle is EMPTY while something is still missing and reads "Bereit zum Teilen" once it is not — naming the gap up here read as nagging on a sheet just opened, and said a second time what the strip already marks on the tab that can fix it. Its line height is reserved, so the header does not move when the draft completes mid-typing.
  - **`avoidKeyboard` is opt-in and the composer is its only user.** Most floating sheets have no text input, and a sheet that reacts to a keyboard it never raised can be shoved off screen by someone else's. The lift is folded into the SAME animated `top` the morph writes and scaled by the morph, so opening with the keyboard already up still grows from the origin; a second wrapper with its own transform would double-count. **The lift is CLAMPED to `targetTop - (insets.top + inset)`** — the raw keyboard height is fine for a short sheet and wrong for a tall one: a sheet covering 80 % of the screen plus a 40 % keyboard put its own header, title and close button above the top edge. Clamping keeps the way out reachable and lets the inner ScrollView absorb the rest.
  - **A host that tints the sheet paints it through `surfaceLayer`, never inside `children`.** The grabber strip sits above the children and the safe-area padding below them, so a wash confined to the content leaves both showing the raw surface colour — measured on device that was rgb(11,16,22) against a rgb(19,21,24) body, i.e. a black band along the top and bottom edge of every composer sheet. `surfaceLayer` is rendered absolutely behind everything, edge to edge.
  - **Layout rules that fall out of it:** no `flex: 1` anywhere in the column (it would claim the ceiling on every open and the sheet would stop hugging a short workbench), the ScrollView carries `flexShrink: 1` so it is the part that gives way, and the CTA footer is a real sibling in flow — an absolutely-positioned footer has no fixed parent height to anchor to and lands on top of the last workbench row.
- **Sheet structure = four zones, ONE open workbench.** Header (icon + title + subtitle) → the name field carrying its category → the HORIZONTAL TAB STRIP of the four settings → CTA.
  - **The four settings are a horizontal tab strip (`ComposerTabs`, `ComposerBench` = `time | place | audience | capacity`).** This REVERSES the vertical accordion of August 2026, and the reason is height, measured: four 52 px rows are 208 px, the strip is 56 — a 152 px difference, roughly a third of the sheet height left over once the keyboard is up. That height was the root cause of three separate fixes already in this file (the sheet riding off the top edge, the `FloatingSheet` lift clamp, the bench folding away on name focus); the strip removes the cause instead of managing it. The accordion's own argument still stands and is the price paid: four values are no longer legible at once, because each tab gets a quarter of the width. That is what the per-tab `weight` (1.05 Wann · 1.25 Wo · 0.90 Wer · 0.80 Anzahl, summing to 4) buys back — weights are FIXED per tab and sized against the WIDEST value each can hold, never derived from the value currently in it, or a long place name would shove the other three around. Exactly one tab is open at a time, and `active: null` is a real state: the strip stays, the panel has no height.
  - **The active tab and the panel are ONE shape.** The active tab carries the panel's exact fill and only its top corners are rounded; the selection slides between tabs rather than cutting. The fill is therefore OPAQUE (`#232325`) and the strip behind the tabs TRANSPARENT — both load-bearing. The composer sheet is a stack of four layers (base, mode wash, top wash, inner surface), so a translucent fill inherits whatever sits under it, and tab and panel do not sit over the same thing: measured on device, one shared `rgba(255,255,255,0.055)` rendered rgb(35,35,37) in the tab and rgb(31,32,36) in the panel — a visible seam from a single constant. Any future "subtle" strip background reintroduces it.
  - **Every tab starts CLOSED, and the open one folds away whenever the NAME FIELD takes focus** (`openBench: ComposerBench | null`). The sheet opens with the keyboard on the name field, and a workbench behind that keyboard is a decision nobody is making yet; committing the name (blur or return key) reopens the bench that was open before, or Wann. Folding is also what keeps the sheet short enough to sit above the keyboard at all — with a workbench open it was taller than the space left and got lifted off the top edge (the clamp above is the second half of that fix). This is NOT the old "hide the tabs on focus" bug — the strip itself stays mounted, only the open panel folds, so nothing visibly disappears. A prefilled or edited draft opens on Wann immediately.
  - **Completeness is reported ONCE, in the header subtitle.** It is EMPTY while something is still missing and reads "Bereit zum Teilen" once `draft.title` is non-empty AND a place with COORDINATES is set — the same two conditions, nothing else; time has a valid default and Wer/Anzahl are optional, so neither may move it. It reports only: `validateActivityDraft` stays the sole authority on publishing, and the line's height is reserved so the header does not move when the draft completes mid-typing. **The tab card's teal border and its decorative check are removed** (product decision, August 2026): with greyed tabs and a guiding CTA, a third signal for the same fact was one too many, and a teal edge around the strip read as an unrelated state. `SEMANTIC_COLOR.success` survives unused — the colour reasoning is worth more than the line it saves.
  - **Tabs are GREYED until the guide has passed them, and nothing else marks them.** `set` no longer means "the value differs from its default" — it means the walk is past this step (`GUIDE_STEPS.indexOf(id) < maxStep`, or the walk is finished). `maxStep` is a HIGH-WATER MARK and only ever grows, so tapping back to an earlier tab cannot re-grey what was already passed. The required amber label and its dot are gone from Wann and Wo (product decision, August 2026, reversing "a required tab that is unsatisfied turns amber with a dot"): with a guide, two different things were claiming to say what to do next, and the button is the one that can actually take you there. **Label and value share one rule**: both grey (`rgba(244,245,247,0.34)`) until the walk has passed the step, then the label takes the mode accent and the value goes full white and bold. An accent label on an untouched tab had the whole strip claiming to be decided from the first frame, which also made the greyed value read as a rendering fault rather than as "not your turn yet". The ACTIVE tab always renders decided regardless — that is what keeps the last step of the walk reading as current rather than as skipped, since it never gets a "Weiter" of its own.
  - **The CTA walks EVERY step, and it is never disabled** (`GUIDE_STEPS` = title → time → place → audience → capacity; `title` is in the list although it is not a tab, because the guide has to reach the field above the strip too). It used to name the gap ("Noch Name und Ort ergänzen") and be `disabled` in the same breath — stating the next task while refusing to help with it, which is the worst of both.
  - **The walk's PROGRESS and your POSITION are two separate things, and one variable must never carry both.** `maxStep` is how far the walk has got (it greys the tabs, only grows); the OPEN tab is where you are. A first version used a single cursor that tab taps did not move, so navigating back by hand left the button naming a step that was no longer on screen. The button therefore reads, in this order: (1) the step you are STANDING on is required and unanswered → REPAIR it ("Name eingeben"/"Ort wählen"), which puts you there and does NOT move the walk on — standing there already, it spells the gap out, because a tap that moves nothing and says nothing reads as a broken button; (2) the walk is unfinished → ADVANCE to whatever follows the open tab ("Weiter: Wann" … "Weiter: Anzahl"), Wann/Wer/Anzahl carrying valid defaults so they can only advance; (3) otherwise the real CTA — unless something required is still missing anywhere, the safety net for jumping ahead by hand. **The last step has no "Weiter"** — the button there is already the real CTA, because a confirming tap at the end of every creation is friction this app cannot afford. It only ADVANCES; it never publishes early, so the guide cannot become a second, softer gate that disagrees with `validateActivityDraft`. A prefilled or edited draft starts PAST the end of the walk: those values are facts, and stepping someone through five stops to fix a typo is the wizard this is not. **This costs the fast path four taps** and was chosen deliberately (product decision, August 2026, reversing "guidance, never gating").
  - **The Wer tab shows a HEADCOUNT, always — never a group name.** The audience is a set of people and groups are only windows onto it, so a selection combines freely and no name survives that: "Mädels und Uni, ohne zwei" fits in no quarter-width tab. Two naming attempts already failed — "Nur du" for an account without friends read as a verdict on the person's social life, and "Alle Freunde" claimed a group that a multi-group selection is not. `${selected.size} gewählt` is true in every state and fits in every one. The bench states WHO (`describeAudience` still names it there, where there is room); the tab answers HOW MANY. Editing shows "fest", because the audience is not editable then.
  - **A place counts as answered only with a COORDINATE.** The draft default `CURRENT_LOCATION_PLACE` is a label with no position until the map supplies one, and an activity published in that state gets `visibility: 'none'` — no pin, no distance, invisible. It looked created and reached nobody. `validateActivityDraft` therefore tests the coordinate in BOTH modes, never the presence of a place object. **A workbench never gets a second chip layer** — it switches through its own control (the map for Ort, checkbox rows for Wer, the slider for Wie viele). The benches live in `components/benches/`. Workbenches must stay roughly 180–240 px tall, or the sheet moves a long way on every switch and the height animation has too much ground to cover.
- **Time is the headline, not a segment.** It carries the mode and its colour, and it is the only other value of unbounded length — two flexible values in one row would mean both truncating. In the row, only Ort flexes (`flex: 1 1 0` + `min-width: 0` + ellipsis); Publikum and Kapazität carry naturally short values ("18", "∞", "8") and stay at their intrinsic width. That is what makes the single line a structural guarantee rather than something that holds until someone picks a long restaurant name.
- **"Jetzt" is a deliberate choice and carries NO start time until publish.** `ActivityModeSwitch` still offers Jetzt/Soon; any concrete clock time is a `soon` plan, even two minutes out. While the composer is open a Jetzt draft holds a PROVISIONAL start, frozen when the sheet opened, purely so the rail has something to draw — `resolveDraftForPublish` (`utils/modeDefaults.ts`, called in `createActivityFromDraft`) stamps the real moment. Never write a Jetzt draft's `startsAt` straight through: a two-minute composing session would publish an activity that already started. For the same reason the headline shows Jetzt as a **duration** ("läuft 1 Std"), never a clock time — a printed end would drift while the person is still typing. Editing is exempt (an existing start is a fact) and the mode switch is therefore hidden in edit mode.
- **Zeit = ONE row (`TimeBand`, inside `ScheduleBench`).** Start, end and duration are a single decision ("which slice of the evening is this"), so they are a single control: a horizontal hour rail carrying one draggable span, 56 px tall. It replaced two `DateTimeField`s plus a `DurationPicker` — three controls and ~180 px — and `DateTimeField` was deleted with it (no consumers left). `ScheduleBench` merged the old `NowFields`/`SoonFields`/`ScheduleFields` trio. Rules that must survive any redesign:
  - **The rail is longer than the viewport and travels under your finger.** Drag the span against either edge and the rail auto-scrolls (`EDGE_ZONE`, ramped speed), crediting the travelled distance to the drag so the span keeps growing. This is the whole reason it fits in one row — without it the rail would have to be wide enough for the longest activity anyone could pick. A vertical version was prototyped first and rejected at 268 px.
  - **TWO scales, and the split is what keeps the 5-minute grid.** While a grip is HELD the band works at the full scale (`TIME_BAND_DEFAULT_PX_PER_HOUR` 80 dp/h, one snap step = 6.7 dp) and the rail travels under the finger; as soon as it is released the band settles to whatever scale shows the WHOLE span (`fitPixelsPerHour`, floor 16 dp/h), animated over 220 ms. **The settle only fires when something is actually wrong** — a span that is already whole and in view at the fitted scale is left alone: re-centring it is a jump the user cannot attribute to anything they did, and the settle exists to rescue the view, not to tidy it. **Only RESIZING zooms back in — moving the span never does.** A zoom is a scale change, so on a move it is a visible resize of a bar whose duration is not changing, which is exactly what a move must not look like; it also widens the bar past the viewport and pushes both ends out of sight, and the ends are what you aim with while sliding it. A move therefore converts finger travel at the scale ON SCREEN (anything else makes the bar travel at a different speed than the finger), and accepts the coarser aim that a fitted scale gives — proportionate, since the thing being placed is that long. Resizing zooms back in ANCHORED ON THAT GRIP over 140 ms, scale and offset eased by the SAME factor so the anchor is mathematically still for the whole animation and not merely at its two ends. (It was instant at first, on the reasoning that an animation would move the rail while the finger aims — wrong, because the anchored grip is the one thing that does not move; what moves is the rest of the picture, which is exactly what may be animated.) The drag's finger-to-minutes RATE jumps to the target immediately even so, fixed for the whole gesture, or an opening flick would mean more time than the same flick a second later. Any settle still in flight is stopped when a drag begins, whatever its kind — otherwise it keeps changing the scale under the drag, which is a resize nobody asked for. Precision where it is used, overview where it is read; the grid never has to be hit at a scale that cannot express it. This replaced a rule that pinned the rail to the span's start whenever the span did not fit — i.e. exactly when the other end was needed. Measured on device before the fix: a 7 h 20 activity put its end grip ~660 dp outside the band, dragging the span body did nothing (the start was clamped at the now-wall) and three 170 px rail pans moved the hour marks by zero, because the pin re-ran on every render. **The five-minute grid applies to the VALUE, never to the drawing** (`snapSpan`): the bar follows the finger continuously while every reported and committed time stays on the grid. Drawing the snapped span made it advance in 6.7 dp hops at the working scale, which reads as stutter — the control looked like it was struggling to follow a finger it was tracking perfectly. The two can disagree by at most half a step (2.5 min, 3.3 dp), and the bar lands on the grid at release. Reporting only when the SNAPPED value moves also takes the composer out of the per-frame render path. **Hour labels read "23:00", not "23", at 50 % white** (they were bare digits at 28 %: legible as decoration, not as a scale you read a time off) and sit BESIDE their tick — centred, a 34 dp label overhangs 17 dp each way and the first and last were always half cut off. Their width must stay explicit: absolutely positioned inside the 1 dp tick container, an unsized label is measured against that container and wraps itself out of existence. **Hour labels also thin out with the scale** (`timeBandLabelInterval`, hysteresis so a drifting scale cannot flicker them). **The edge zone has no visual marker, on purpose** — two 12 dp scrims used to sit over the band's ends to hint that the rail continues. They were removed (August 2026): a hard-edged 50 % block is not the fade its name claimed, it darkened the hour labels exactly where they are hardest to read, it was 12 dp wide against a 52 dp trigger zone so it never marked the thing it appeared to mark — and since the band now fits the whole span at rest, it promised "there is more" precisely when there is not. Pushing a grip toward the edge is discovered by doing it. **A held grip is never carried out of view**: the band is narrower than the screen, so a finger taken past its edge used to leave the grip drawn where the band clips it — dragging something invisible — and the overshoot kept counting, so coming back the grip had to make up that distance before moving at all, giving the control slack like a steering wheel. Past `GRIP_KEEP_IN_VIEW_PX` the finger stops moving the grip and only feeds the pedal, which deliberately still reads the RAW position so pushing further out keeps meaning "faster". **The edge is a PEDAL, not a switch** (`travelStrength`): depth in the 52 dp zone is SQUARED and scaled by 9 dp/tick, giving ~4 min/s just inside the zone, ~1.8 h/s half way, ~7 h/s hard against the edge (the full 12 h range in 1.7 s). Raising the ceiling only ever affects the far end — that is what the squared ramp buys; the crawl at the entrance is held by the floor, which moved down by the same factor the ceiling moved up. The previous values (10 dp/tick, a 0.18 floor, a LINEAR ramp) meant 1.4 h/s the moment the zone was entered and 7.8 h/s at the edge — a ramp in the code and none in the hand, which is how a 2 h span became 6 h 10 in one 900 ms drag. Squaring is what gives the slow half its share of the distance; a linear ramp spends half its speed in the first half of the travel. These figures are only stable because a held grip always works at 80 dp/h. **The edge travel stops when it stops meaning something**: the rail is 36 h long and the duration caps at 12 h, so it used to keep scrolling the hours past a bar that could no longer grow — the one state in which the control moved and said nothing. It now halts after ~100 ms of travel that changed no span (several ticks, not one: the 5-minute snap legitimately produces short stretches with no change). `pixelsPerHour` is also exposed as a CONTROLLED prop: a stack of bands stays comparable only if one scale is derived from the longest span and handed to every row, and that decision belongs to the parent, never to the band — a band must not know it has siblings. (`linkedSync` is the one exception and is a performance path: 60 Hz drag mirroring cannot go through React state.)
  - **The rail owns its offset; it is NOT a ScrollView.** A horizontal ScrollView and a horizontal drag fight over the same touch, and the visible failure is the span jumping while the rail scrolls under it. The offset lives in a Reanimated shared value (transform only, no re-render) mirrored by a ref for arithmetic.
  - **Handles are siblings of the span, never children.** Nested `GestureDetector`s can both activate, which moves and resizes at once. They also straddle the span's edges (centred on them) so both stay grabbable at the 15-minute minimum, where the span is only 16 px wide.
  - **The BAND decides the mode (August 2026; reverses the old fixed-start cap).** Both modes now have a draggable start handle: pull it onto the now-edge and a plan becomes a Jetzt, pull it away and a Jetzt becomes a plan. `spanStartsNow` is the one rule — the start must sit within one snap step (5 min) of now, i.e. pushed against the left wall — so a time you place deliberately stays a plan even ten minutes out, preserving "any concrete clock time is a `soon`". The past stays unreachable: `TimeBand` clamps every drag to `earliestMs`. An EDIT never re-decides the mode; an existing start is a fact other people acted on.
  - **Rail geometry must stay MODE-INDEPENDENT.** Origin (`floorToHour(min(start, now))` today, that day's midnight otherwise) and length (one 36 h minimum, grown by `railMinutesFor`) are derived from the span alone. If either depended on the mode, the rail would re-lay-out under the finger at the exact frame the mode flips and the span would appear to jump — the one thing a direct-manipulation control must never do.
  - **The colour travels with the finger.** `TimeBand` takes `accentSequence` + `accentProgress` and interpolates its span and grips on the UI thread off the composer's `modeProgress`, so the green→amber change is a fade during the drag rather than a snap after the state lands. The ramps are precomputed as rgba strings in JS — eight-digit hex is parsed inconsistently by `interpolateColor` and a silently-opaque span would cover the hour ticks.
  - **The workbench's LAYOUT is mode-independent (August 2026; reverses "Soon gets a `DayStrip`, Now does not").** Same summary line, same day strip, same band, same fixed-height slot below it in both modes. Reason: the mode is decided by dragging the start handle, so it flips *while the band is under a finger* — and mounting the strip out (54 dp) plus swapping the offer row for the hint (62 dp vs 42 dp) tore ~74 dp out of a bottom-anchored sheet at exactly that frame, so the rail jumped down away from the thumb dragging it. A direct-manipulation control may never move while it is being manipulated. Only colour, wording and the slot's occupant change, and those cross-fade (`accentSequence`/`accentProgress` already interpolate the span and grips on the UI thread). The strip earns its keep in Jetzt too: picking a day is the second way to turn a Jetzt back into a plan, and "Heute" is simply the truth there. The `footerSlot` holds the offer row and the Jetzt hint as ABSOLUTE children of one fixed 52 px box, so the outgoing and incoming one cross-fade instead of stacking; an edit reserves nothing, because an edit never re-decides the mode.
  - **Die Wann-Bench rendert den neuen `TimeRangePicker`** (`src/shared/components/time-range-picker/`) hinter dem Adapter `ActivityTimeBand`, der ihm die Prop-Form des Schedulers gibt. Der frühere `components/lab/`-Sandkasten mit Chip-Umschaltung ist erledigt und gelöscht — das Experiment wurde zurückportiert, wie es der Vertrag verlangte. `TimeBand.tsx` bleibt bestehen, weil `PlanningOfferFields` weiterhin `<TimeBand keepSpanVisible>` rendert und beide Planer-Dateien ihre Typen von dort beziehen; die Weiche leitet auf `PlanningTimeBand` um. Zwei Bänder für eine Aufgabe gibt es damit nicht mehr — es sind zwei verschiedene Kontrollen: eine Spanne (Picker) und ein Stapel verketteter Vorschlagsreihen (Planer).
  - **`DayStrip`:** 14 day-chips plus a calendar button; the button is not decoration — it preserves the arbitrary-date capability the old datetime field had, and without it "plan anything" quietly becomes "plan within a fortnight". Changing the day shifts the whole span, never just its start.
  - **The DURATION is drawn inside the bar** (`spanLabel`) whenever the span is wide enough for it, and the line above therefore never repeats it — in Jetzt that had the same two words twice, 40 px apart. The line answers WHICH slice, the bar HOW LONG. A very short span has no room and shows its duration nowhere; the range (or the tab's "bis HH:MM") still says it, and widening the bar brings the label straight back. **The edge travel ASKS BEFORE IT MOVES.** Pushed against a limit — the now-wall, the 12 h maximum, the rail's end — a rail that keeps scrolling slides the whole span sideways without changing a minute, which carried the far grip out of view on a wide bar. Each tick therefore probes `resolve` with the minutes the travel WOULD buy, and then moves the rail by what the span ACTUALLY took — not by the step that was offered. On the tick that meets a limit those differ, and the difference became pure sideways travel: the bar jumped by up to a whole step at the moment of contact, which is the bounce. Crediting only what was taken also keeps an overshoot from piling up in `autoMinutes`, so reversing out of a limit moves the span on the first pixel instead of first paying off a debt. Two wrong shapes were tried first and both are worse than the original: moving and then undoing writes the offset twice per tick, and ending the travel from inside the loop is worse still — `updateAutoTravel` restarts it on the very next finger sample, so the rail shuttled back and forth sixty times a second. **Never stop the travel from inside its own tick**; a limit is an idle tick, and only leaving the edge zone or lifting the finger ends it. Verified mid-gesture on device (touch held at the wall, two samples two seconds apart: hour marks and far grip identical to the pixel). **The span is stated in words above the band, on ONE line:** `Heute · 07:45 – 09:45 · 2 Std`, or `Startet sofort · 1 Std` for Jetzt — which names no clock time, because its start is provisional until publish and a printed range would drift while the sheet is open. Without that line the end time was invisible everywhere (the collapsed Wann tab showed the start alone), so an activity's most basic fact — how long it runs — could only be read off the pixels of the band. The collapsed tab now shows the range too when the day carries no information (`07:45–09:45` today), and the day instead when it does (`Morgen 07:45`) — a quarter of the strip does not fit both.
  - A fresh plan starts `SOON_LEAD_MINUTES` (60) ahead, rounded up to the next quarter — the old "next quarter hour" sat so close to now that a plan was a Jetzt with extra steps, and a proposal needs lead time to be answerable at all. A DEFAULT, not a floor: a start the person placed themselves is kept, and dragging closer stays their decision. Snap 5 min, range 15 min – 12 h (mirrors `DurationPicker`). **Rail length is a minimum, not a fixed size** — Now 14 h from the current hour, Soon 36 h from midnight (a 23:45 start plus the 12 h maximum lands at 11:45 the next day), and `railMinutesFor` then grows it to contain whatever span it is handed, plus a 2 h tail. It must, because `endsAt` does not only come from this control: an edit, a prefill, or a mode switch that keeps a "Soon, tomorrow" end time produces "starts now, ends the next day". With a fixed rail that span sat past the maximum scroll offset — the band rendered as an empty grid with no segment anywhere and no way to reach it.
  - The section label, the resulting clock time and the duration share ONE line above the band. Standalone "WANN"/"WO" captions were removed on purpose: a row already reading `Start · Jetzt` does not need a heading announcing that it concerns time.
- **Name (required):** The first field in the scroll content is the activity `title`, labelled "Aktivitätsname" — no asterisk (there is no required-field legend); placeholder NAMES THE FIELD ("Name der Aktivität"), never a concrete example activity and never a conversational prompt — "Worum geht's?" asked a question the field label had already answered, and a placeholder that is not the field's name stops being readable as soon as the first character is typed. It is mandatory — `validateActivityDraft` rejects an empty/whitespace title first ("Gib deiner Activity einen Namen."). This name is what shows at the top when the activity is opened (`MarkerDetailSheet` title / marker `label`).
- **`title` vs `description`:** `title` = the short activity name (top of the sheet, preview-card headline). `description` = the optional note field. Never use `description` as the title. The composer's "Details (optional)" section (Kategorie chips + Hinweis/`description` input) was deliberately removed for now — `description` stays in the data model but is currently not editable in the composer.
- **Three entry points, one destination.** An activity can be started from (1) the create FAB, (2) a POI tap on the map, (3) the map search bar. **(2) and (3) must land in exactly the same state** — camera on the place, `PlaceContent` open, "Aktivität hier starten" one tap away — because they are the same intent reached two ways. `openPlaceSearch` therefore passes `autoConfirm`, so tapping a result finishes the pick instead of asking you to confirm a place you just tapped. From there `openComposerFromSelection` seeds `draft.place` via `placeSelectionToComposerPlace`, so the composer's Ort is prefilled with the POI.
- **`autoConfirm` (`useMapLocationPicker`)** — set where *picking is the decision* (map search bar, composer "Ort suchen", composer "Aktueller Standort"); the resolved place is handed back on the tap that chose it. Deliberately OFF for "Auf Karte auswählen", where moving the map IS the act of choosing and the confirm button is the only thing that can end it. All exits run through the single `finishWith`, so a place can never be delivered while the picker stays half-open.
- **Every place returned from the picker moves the camera.** `openMapPicker` wraps the caller's `onPick` with `setMapFocusCoordinate`, from whichever entry point. The composer reopening with "Café Central" over a map still showing somewhere else is the one thing you would want to check and could not. Centring goes through `focusCenterOffset(coveredHeight, viewportHeight)` (`MapCanvas`) so the place lands centred in the *visible* map, not behind the sheet.
- **The place ALWAYS shows an address.** A picked place brings its own; the device position does not, so `useCoordinateAddress` resolves one through `expo-location`'s reverse geocoder (`describeCoordinate`) — a platform call, no Places billing — cached per ~11 m and remembering failures so a jittering fix cannot re-resolve every second. "Aktueller Standort" alone never answered the only question worth asking, which is *which* current location. **Known issue (August 2026, unsolved):** the preview map ignores `customMapStyle` and renders Google's stock light map even at night. Verified it is NOT lite mode (removing it changed nothing) and not the style value (the main map gets the identical array); the remaining suspect is the Android Modal window it sits in.
- **Composer location options: "Ort suchen" / "Aktuellen Standort verwenden" / "Auf Karte auswählen" / "Noch offen".** Search is listed FIRST and is its own entry — it used to be reachable only by going through "Auf Karte auswählen", and a search field hidden behind a map picker is a search field nobody finds. "Aktuellen Standort verwenden" resolves a real coordinate through the picker rather than storing the `CURRENT_LOCATION_PLACE` placeholder, so the activity carries an actual position and the camera can move to it.
- **Location default:** Always `CURRENT_LOCATION_PLACE` (Aktueller Standort, `utils/currentPlace.ts`) — never "Ort noch offen". This is the DRAFT default (`utils/modeDefaults.ts`); it is not what the "Aktueller Standort" button writes.
- **"Auf Karte auswählen"** uses the same plain glass style as "Aktuellen Standort verwenden" (no colored wash)
- **Zeitvorschläge live IM Wann-Bench, nicht in einem zweiten Sheet (August 2026).** `TimePlanOfferSheet` is deleted: a full-screen surface stacked over the composer meant leaving the activity you were creating to answer a question about that same activity. `PlanningOfferFields` takes the whole workbench (the single-time band is replaced, not stacked under). **The day chooser stays on screen the whole time (August 2026; reverses the earlier STAGED version where picking a day folded the chooser away and a "+ Weiterer Tag" button was the only way back).** Proposing days is not a step you finish — it is what you keep doing while looking at the rails you already have — and hiding the chooser made every additional day cost a tap on a button whose only job was to undo the hiding. The cost is height, which was the staging's whole reason: chooser plus a stack of rails exceeds one screenful. That is carried by the composer's ScrollView (the sheet caps at its ceiling and scrolls), never by hiding half the control. **The planner never sends.** While it is open the footer switches to an OUTLINED "N Vorschläge übernehmen", which only closes the planner and returns to the sheet — it used to be the same filled accent CTA in the same place as the one that creates the activity, and two different outcomes wearing one button is how someone taps "senden" believing they still have capacity and audience to set. The filled CTA keeps its single meaning (this creates the activity) and reads "N Vorschläge senden" once windows exist. With windows proposed the Wann bench stops showing the single band and states the count instead: one concrete time beside a CTA offering to send several is two answers to the same question. **The way back to ONE fixed time must clear the windows, and must be offered where it left you.** "Fester Termin" used to only close the planner: the offers stayed in the draft, so the bench kept showing the count and the single band never returned — the control promised the opposite of what it did, and the only route back was deleting every window by hand. It now discards them (asking first, since that is what the label means) and the same action sits on the proposals row itself as "Doch eine feste Zeit": an action has to be undoable where it left you, not only from inside the mode you must re-enter to find the exit. **The rails shrink with the STACK, not to a fixed "planner size" (`TimeBandDensity`: `regular` 56 · `snug` 46 · `compact` 36, table in `PlanningTimeBand`).** One proposed window gets exactly the scheduler's band — a planner that renders a thinner control than the one it replaced looks like a downgrade for the case where there is no crowding to pay for — and each further window buys its own row by giving up chrome, never reach: the grips keep their 44 px hit size and span the full row at every step. **The span is CENTRED in the space above the hour labels** (`trackTop` derived, never typed in), because the labels own a fixed bottom strip and hanging the bar off the top edge made every row read as top-heavy. `labelZone` is a floor: the hour labels are drawn inside it, so a smaller strip lets the span cover the very hours it is being read against.
- **Teilnehmerlimit (`benches/CapacityBench`):** one slider, no on/off switch. The seats always fill the track — more places mean smaller dots, so the control shows a filling table rather than a number that happens to change — and **"unbegrenzt" is the right-hand end position of that same slider**, which is also the default (`draft.maxPeople` undefined). Setting a limit is therefore one drag; the previous switch-then-step-up-from-the-default cost two separate actions. Range **2–50** (participants incl. host), the host's own seat carries a ring so "8" reads as "you plus seven". **The no-limit end reads "Bis 50", never "Unbegrenzt"** — `firestore.rules` caps `participantUids` at 50, so unlimited was a promise the backend refuses to keep. The DATA still stays absent by default: writing 50 would turn a system limit into a host decision and freeze today's activities at 50 if the cap were ever raised. Only the label tells the truth (tab shows `≤50` for the default, a bare `50` for a chosen limit). The limit IS editable in edit mode (unlike the audience). Persisted as `maxParticipants` on the activity doc; `null` in an update removes the field. Rules validate 2–50 and enforce on join that `participants.size() <= maxParticipants` (absent = 50 cap). `MarkerDetailSheet` shows "N von MAX Teilnehmer" and replaces the join CTA with a disabled "Voll · max. N Teilnehmer" state when full. With a limit AND guests enabled the bench states plainly that guests count against the places — otherwise the two settings quietly contradict each other.
- **Avatar label scheme (map pins).** `AvatarMarker` shows one dark badge **bottom-centered ON the circle** (the same slot as `ClusterMarker`'s count badge — explicitly NOT a pill floating below the marker): the person's **name** for a solo activity (participant count ≤ 1), the **participant count** for a group (`"N dabei"`, or `"N/MAX"` when a limit is set) — for a lone friend the "who" is the useful bit; a group can't name everyone. `ClusterMarker` always shows its count badge (`N` or `N/MAX`). The avatar `captureKey` includes `displayName` so two friends who share an initial don't collide on a cached image.
- **Activity category (`ActivityCategory`, `utils/activityCategories.ts`, `utils/activityUnderstanding.ts`, `data/activityCategoryKnowledge.json`).** Optional; set either by the user (the `CategoryPicker` chips, see Kategorie below) or by title auto-detection. The title field may auto-apply a category via local activity understanding (large curated German/English example list + keyword boosts + ambiguity thresholds) as long as the user has not manually touched the category; manual chip selection always wins and is never overwritten while the sheet is open. Valid values: Essen/Drinks/Kaffee/Sport/Outdoor/Feiern/Kultur/Spiele/Lernen/Chillen/Shopping/Sonstiges. Keep new examples and keyword patterns in `activityCategoryKnowledge.json`, not inline in components. The knowledge base must handle full phrases AND single-word inputs (`Bier`, `Kino`, `Gym`, `Bib`, `Zocken`, `Chillen`, `coffee`, `hike`, `thrifting`, etc.). `npm run test:activity-understanding` evaluates the same knowledge base with `Xenova/multilingual-e5-small` and includes regression cases plus separate holdout cases. Treat exact/keyword/regression scores as coverage, not proof of generalization; the fair quality signal is the holdout/free score printed by the script. Once a holdout miss is promoted into `activityCategoryKnowledge.json`, that case becomes regression/coverage, so create fresh holdout cases for the next honest blind measurement. Direct on-device model loading is a separate packaging decision and must not be slipped into the runtime path casually. **Not derived from the Google Places venue type**, for a product reason first: the venue is not the activity (studying in a café is `Lernen`, not `Kaffee`; a birthday dinner is `Feiern`, not `Essen`). The classifier reads what the person is DOING. Cost is a secondary argument and only applies to some paths — `types` is in the free Place Details **Essentials** SKU, so on the SEARCH path (where `resolvePlaceLocation` already runs) it would cost nothing, while a POI tap makes no Details call at all today and long-press/current-location have no venue. Venue type is therefore acceptable ONLY as a silent fallback when the title classifier abstains, never as the primary source, and never on the POI path. On markers the category renders as a 24px dark coin at the marker's **TOP-LEFT**; the unread badge sits at the **TOP-RIGHT** and the name/count pill spans the bottom — all three coexist, no slot is shared (verified in `ActivityMarkerChrome`, August 2026; an earlier note here wrongly claimed category and unread collide). Validated as an enum in firestore.rules.
- **Activity understanding maintenance:** when expanding category knowledge, curate from real user language: German/English synonyms, slang, common phrases, venue/activity names, and ambiguous edge cases. Prefer adding multiple representative examples plus targeted keyword boosts over relying on embedding similarity alone. Add or refresh `web_stress_*` / holdout cases in `scripts/evaluate-activity-embeddings.mjs` whenever new vocabulary is introduced, and report exact/keyword/free counts honestly.
- **Classifier architecture — two-tier, embedding deferred.** The shipping runtime is `classifyActivityTitleHybrid`: **Tier-1** = lexical token-overlap + keyword boosts (instant, offline, no model) — this is what ships and what `PROTO_STRATEGY=lexical node scripts/evaluate-activity-embeddings.mjs …` measures. **Tier-2** = an on-device e5-small embedding fallback (`top3`), consulted only when Tier-1 is ambiguous and wired via `registerEmbeddingFallback(...)`; **currently unregistered → the app runs pure Tier-1**. The eval's _default_ (`top3`, e5-small embeddings) is the target/validator for Tier-2, NOT the shipping path — the runtime is lexical (`PROTO_STRATEGY` also supports `compare` for centroid/max/top3). Honest generalization on a fresh unseen-slang holdout: Tier-1 ~27%, Tier-2 ~45%; both ~100% on normal inputs; both **abstain rather than guess wrong** on hard slang (the user can always override the chip). Tier-2 is **deferred** because e5's tokenizer is SentencePiece Unigram + a binary Precompiled charsmap (17 MB vocab) with no clean/low-risk JS path, and the model is ~120 MB. When revisiting: keep the model out of git (fetch at build → embed in the APK); tokenizer options in preference order — (a) `onnxruntime-extensions` native SentencePiece, (b) transformers.js tokenizer in-app, (c) switch to a WordPiece model and re-validate the eval. `EXPORT_VECTORS=1` regenerates the per-example vectors the Tier-2 provider will need. On-device _generative_ LLMs were measured and rejected (Llama-3.2-1B 32%, Qwen2.5-1.5B 47% on the honest holdout — worse than Tier-1, +0.7–1 GB, ~2–6 s/inference).
- **Countdown ring (`utils/countdown.ts`).** `now` activities with a usable `startsAt`→`endsAt` window render their mode ring as a depleting clock: remaining share as a vivid SVG arc (starts 12 o'clock, clockwise), elapsed share as the faded border track (`colorWithAlpha(mode, 0.25)`). The fraction is **quantized to 8 steps** (`countdownBucket`) and included in the `captureKey`, so cached marker images only re-capture on a step change (driven by the provider's 30s mode tick). `soon`/ring-less markers keep the plain full border.
- **Kategorie (`CategoryPicker`):** horizontal icon-chip row (Essen/Drinks/Kaffee/Sport/Outdoor/Feiern/Kultur/Spiele/Lernen/Chillen/Shopping/Sonstiges from `ACTIVITY_CATEGORIES`); single-select, tap-again deselects; selected chip = mode accent via `style` (never a Tailwind color class). **Mounted in the composer under "Kategorie"** (re-added August 2026). It is the manual half of the suggestion contract: the classifier only auto-applies when `shouldAutoApplyCategory` passes (confidence ≥ 0.58 AND a clear margin AND not `sonstiges`), so unseen slang deliberately leaves the row **empty** — the person picks a chip or leaves it blank. Never lower the threshold to force a guess; abstaining is the designed behavior.
- **Gelernte Kategorien (`utils/categoryMemory.ts`, Tier 0):** a chip the user picks BY HAND is recorded as `normalisierter Titel → Kategorie` and consulted BEFORE the lexical classifier on the next title change, so slang the knowledge base will never contain ("Zocken", "Bib", "Feierabendbier") resolves instantly from the second use on. Exact wording wins; otherwise a shared whole word picks the most-often-confirmed entry. Capped at 200 entries (LRU), cleared per wording when the user clears the chip. **On-device only (AsyncStorage) — never sync this to Firestore or a server:** activity titles are user content, so keeping it local means no consent, no processor entry in the Datenschutzerklärung, offline operation and zero cost. Only an explicit manual pick trains it — an auto-applied suggestion must never train the memory on itself, or one wrong guess would harden permanently. To grow the SHARED knowledge base, curate `activityCategoryKnowledge.json` deliberately from observed user language; do not harvest it silently.
- **"Aktivität übernehmen" button:** Uses `style={{ backgroundColor: accent }}` — never `AppButton` or Tailwind color classes (class-order conflict)
- **Sichtbarkeit (`benches/AudienceBench`, "Wer kann es sehen"):** the audience is ONE set of people, and the checkbox list is the truth. Groups sit above the friend list as **bulk selectors with a tri-state checkbox and a drill-in chevron** — the checkbox switches the whole group, tapping the row opens its members for individual edits.
  - **"Alle Freunde" and "Enge Freunde" ALWAYS exist as groups** (`ALL_FRIENDS_GROUP_ID` / `CLOSE_FRIENDS_GROUP_ID`, built unconditionally in `buildAudienceIndex`), even for an account with no friendships and nobody starred — they belong to the app's model, not to this data, so letting them blink in and out would make the same screen structurally different from one account to the next. An empty CIRCLE is still dropped: a user-made selector that selects nothing is only confusing. An empty standard group renders without checkbox or chevron and explains its own zero ("Noch niemand als eng markiert"), because "0 von 0" reads as a broken counter.
  - **"Alle Freunde" is the default selection AND the master switch.** There is deliberately no separate master checkbox on the header row: it would carry identical semantics to that group row, and two identical controls on one screen is what makes an interface read as unfinished. It also removed a hazard — the collapsed header is a pure disclosure, so a stray tap can no longer wipe the audience.
  - **The collapsed row NAMES the audience** (`describeAudience`): "Alle Freunde", "Enge Freunde", a circle, a single person's name, and only "N von M Freunden" + who is missing when the selection matches nothing nameable. A bare count is a number the reader has to decode. Expanded, the same row drops to the heading "Wer kann es sehen" — repeating "Alle Freunde" directly above the group row saying the same thing is noise, and the list below states it precisely.
  - **A person has exactly ONE checkbox.** Groups are windows onto the same set, never separate lists. Someone in two groups who is removed via one is removed in the other too, which is why the other group then reads "partial" and every group row shows "4 von 5" rather than just its size. Anything else would have to explain how a person is "in Mädels but still out". "Alle Freunde" is left out of a friend row's group sub-line for the same reason it is not a master switch — it holds everyone, so printing it on every row says nothing.
  - **While a search is active there is NO master and NO group checkbox.** "Alle" over a filtered list is ambiguous between the three matches and all eighteen friends, and the wrong reading is undetectable afterwards. Group hits stay tappable and simply end the search. The summary always shows the GLOBAL count, never a match count.
  - **Tapping a partial checkbox resolves to ON, never off** (`nextCheckValue`). The other direction would silently discard the individual picks just made; clearing from the full state is one visible tap and one tap back.
  - Counting is incremental (`utils/audienceSelection.ts`): an inverse `uid → groupIds` index means one toggle patches only that person's groups instead of recomputing every intersection. `npm run test:audience-selection` checks the shortcut against a full rebuild, including a random walk.
  - **The client never sends a bare uid list it is simply trusted on.** `ActivityVisibility` gained `{ kind: 'selection', uids }`, and `audienceForContext` in `functions/index.js` intersects it with the caller's confirmed friendships — so a tampered client can at most address a subset of what `all_friends` would already have reached. A full selection is emitted as `all_friends` instead, so the server resolves it from the live graph. Empty selections are rejected on both sides.

---

## Terminfindung (mehrere Zeitvorschläge)

Der Host schlägt in der Wann-Bench mehrere Tage/Fenster vor (`PlanningOfferFields`);
daraus wird ein `timePlans/{planId}` mit `sourceWindows`. Das Feature lebt in
`src/features/time-planning/`. Es ist **keine Activity** — kein Chat, keine Anreise,
kein fixes Datum, bis der Host einen Slot festzurrt.

- **Beitreten IST Antworten — ein Callable, beides oder nichts.** `joinTimePlan`
  verlangt `responsesByWindow` und `parseTimePlanResponses` besteht auf einem Eintrag
  für JEDES Fenster. **Es gibt kein Mitglied ohne Antwort**: Wer das Sheet ohne
  Antwort schließt, ist einfach nicht dabei, es wird nichts halb gespeichert. Das war
  vorher zweistufig (erst beitreten, dann fragen) und erzeugte genau den Zustand, auf
  den der Host ewig wartet — ein Name in der Liste ohne Verfügbarkeit. Nebeneffekt:
  „kann nicht" und „hat noch nicht geantwortet" können sich in der Auswertung nicht
  mehr vermischen. **Nicht** über Entfernen-nach-Frist oder eine öffentliche
  „hat nicht geantwortet"-Markierung lösen: Das ist ein Pranger, und die App
  verzichtet aus demselben Grund schon beim Heimweg auf so eine Meldung.
- **Zwei Lese-Stufen in `firestore.rules`.** Die Antwortfläche muss aufgehen, BEVOR
  jemand Mitglied ist, also darf ein Eingeladener `timePlans/{planId}` lesen (Titel,
  Ort, Fenster — genau das, was man zum Antworten braucht), die
  `timePlanMembers`-Subcollection aber NICHT. Wer die eigenen Zeiten nicht geteilt
  hat, liest auch die fremden nicht. Die Invite-ID ist deterministisch
  (`{planId}_{uid}`), das Invite-Dokument selbst bleibt clientseitig unlesbar.
  Folge: Vor dem Beitreten zeigt die Antwortkarte **keine** fremde Verdichtung —
  dafür bräuchte es eine serverseitig gepflegte Zusammenfassung auf dem Plan-Dokument.
- **`lockTimePlan` ist der Abschluss, und ohne ihn ist alles andere Deko.** Host-only,
  Slot muss im gewählten Fenster liegen, client-generierte `activityId` als
  Idempotenzschlüssel (wie `createActivity`). Erzeugt eine echte Activity + Chat,
  setzt `status: 'locked'` + `activityId` auf dem Plan und benachrichtigt alle
  anderen (`time_plan_locked`). **Wer geantwortet hat, dass er zu genau diesem Slot
  kann, wird als Teilnehmer übernommen** — nochmal fragen hieße eine schon
  beantwortete Frage stellen. `participantUids[0] == hostId` bleibt gewahrt. Die
  Audience ist die Runde, nicht die ganze Freundesliste.
- **Auswertung: `utils/availability.ts`, eine Quelle.** `aggregateWindow` teilt das
  Fenster an jeder Grenze und zählt Deckung → **harte Kanten**, nie ein Verlauf: Die
  Zahl der Verfügbaren springt an der Minute, ein Gradient würde eine Stetigkeit
  behaupten, die die Daten nicht haben. `bestSlot` nimmt den höchsten Zählstand,
  bei Gleichstand den längeren, dann den früheren; ein Peak unter 15 Minuten verliert
  gegen einen längeren, niedrigeren Lauf. `availabilityLevel` bildet auf **maximal 5
  Stufen** ab, unabhängig von der Gruppengröße — mehr unterscheidet das Auge nicht,
  und eine Runde darf 50 Leute haben. Die genaue Zahl steht immer daneben.
- **Eine gemeinsame Tageszeit-Achse (`utils/dayAxis.ts`).** Alle Vorschlagstage werden
  auf DIESELBE Achse gezeichnet (Minuten ab der jeweiligen Mitternacht, Werte > 1440
  für Fenster über Mitternacht). Würde jeder Tag die volle Zeilenbreite füllen, wäre
  eine Stunde in jeder Zeile anders breit und der Vergleich, den der Stapel geradezu
  einlädt, wäre falsch. Der leere Platz ist Information (man SIEHT, dass Samstag ein
  Nachmittag ist), keine Verschwendung.
- **Die Übersicht ist eine Availability-MATRIX, kein deaktivierter Picker**
  (`TimeMatchingCard`). Sie teilt mit `TimeRangePicker` nur die Zeit-zu-Pixel-Rechnung.
  Eine Read-only-Fläche, die den Körper eines Bedienelements ausleiht (Schiene, Pille,
  Griffe), liest sich als „Eingabefeld, das du nicht anfassen darfst" — das hier liest
  sich als Diagramm, weil es eines ist. **Nur Amber `#E0A23E`**, kein Grün, kein
  Violett: Höhe ist `verfügbar / geantwortet`, die Deckkraft trägt dieselbe Zahl ein
  zweites Mal, damit Farbe nie der einzige Kanal ist. Kanten hart, keine Verläufe.
  Alles außerhalb des Peaks behält seine echte Höhe und bleibt amber, nur 18 % durch-
  sichtiger — **ausgrauen wäre eine andere und falsche Aussage** („nicht verfügbar"
  oder „außerhalb des Vorschlags"). Zeilenhöhe sinkt mit der Zahl der Vorschlagstage
  (48 → 32 dp, `dayRowHeight`) und hört bei 32 auf, weil darunter der Höhenunterschied
  verschwindet; die Tastfläche wird per `hitSlop` auf 44 dp gehalten.
- **Kein Rahmen um den Vorschlag.** `createTimePlan` beantwortet für den Host das
  GANZE Fenster, die Kurve fällt innerhalb eines Vorschlags also nie auf null und
  deckt seine Breite bereits exakt ab. Ein gezeichneter Rahmen würde nur wiederholen,
  was die Form zeigt.
- **Jede Zeile nennt ihr EIGENES Maximum — Zahl und Rahmen, genau einmal.** Nicht zu
  verwechseln mit der Regel darüber: die verbietet einen Rahmen um den ganzen
  *Vorschlag*, weil er nichts sagt, was die Form nicht schon zeigt. Der Peak ist ein
  Ausschnitt daraus und wird bisher nur durch eine um 22 % kräftigere Füllung
  markiert. Der Grund ist gemessen: die gesamte Treppenhöhe ist 12–20 px
  (`stepArea`), bei 18 Antworten ist eine Person also **1,1 px** — die Höhe kann
  „15 von 18" und „16 von 18" nicht mehr trennen, und die Deckkraft trägt dieselbe
  Zahl. Vorher stand die Zahl NUR in der Gewinnerzeile, alle anderen Tage waren
  unbeziffert; genau der Vergleich, zu dem die gemeinsame Achse einlädt, war damit
  nicht zu machen. Also: `availability.best` pro Zeile → ein `x/y` in der höchsten
  Stufe plus ein Hairline-Rechteck in exakt deren Höhe, Breite und `STEP_RADIUS`.
  Beides wird aus DENSELBEN Ausdrücken abgeleitet wie die Stufen (ein zweites
  Runden setzt den Umriss um Halbpixel neben die Form, die er nachzeichnen soll).
  Die stärkere Füllung bleibt auf dem globalen Sieger — Füllung = „die Empfehlung",
  Rahmen = „das Beste dieser Zeile", zwei Kanäle für zwei Fakten. Bei Gleichstand
  innerhalb einer Zeile gewinnt der dokumentierte `bestSlot`-Rang, damit es bei
  genau einer Zahl pro Zeile bleibt. **Der Rahmen ist Tinte bzw. Papier
  (`peakOutline`), nie Amber** — Amber ist schon Bedienelement UND Daten, eine
  dritte Amber-Linie läge als weitere Messung obendrauf statt als Markierung
  darüber. Aus demselben Grund ist die Zahl (`peakLabel`) themenabhängig: sie steht
  auf der Füllung, und die kippt zwischen den Modi von hellem Sand zu dunklem Oliv.
- **Farben: drei, je eine Aufgabe** (`planningTheme.ts`). Violett = Identität („das ist
  eine Planungsrunde", dasselbe Violett wie `GROUP_CHAT_ACCENT`). **Amber = das
  BEDIENELEMENT** — die Schiene des Hosts und dein eigener Balken darin, in der
  Übersicht auch deine eigene Zeile. **Grün = die DATEN** — was die anderen
  geantwortet haben, als Aggregat und als Einzelzeilen. Ein früherer Entwurf machte
  auch den eigenen Balken grün („eine Bedeutung pro Farbe"); das legte die Sache, die
  man EINSTELLT, in dieselbe Farbe wie die, gegen die man sie liest, getrennt nur
  durch einen Umriss — und zwang die Zeile „Du" beim Auffächern auf Fast-Schwarz, nur
  um überhaupt unterscheidbar zu sein. Amber passt außerdem zum Composer, wo derselbe
  Picker amber ist. „Alle können" wird über die **Form** markiert (kräftiger Rahmen +
  Wort), nie über eine zweite Farbstufe.
- **Lesen ist chronologisch, Entscheiden ist sortiert.** Die Übersicht bleibt in
  Tagesreihenfolge — den besten Tag nach oben zu schieben, bevor jemand geantwortet
  hat, drückt ihn in eine Richtung. Gerankt wird nur dort, wo das Ranking die Frage
  IST: am „festlegen"-Knopf des Hosts.
- **Antippen fächert einen Tag an Ort und Stelle auf** (nur einer offen, wie beim
  Kalender-Akkordeon). Das Aggregat bleibt als Summenzeile darüber stehen, weil die
  Verdichtung buchstäblich diese Zeilen gestapelt IST. Ab ~10 Personen wird gruppiert
  statt aufgelistet — 30 Balken liest niemand, und die Stapel-Metapher trägt dort auch
  nicht mehr.
- **Antworten: pro Tag ein Tap.** `[ ✓ | ✕ ]` sitzt in der **Kopfzeile des Tages**,
  nicht auf oder neben der Schiene: im Balken kollidiert es mit den Griffen und passt
  bei der 15-Minuten-Mindestdauer (~16 dp) gar nicht hinein, neben der Schiene kostet
  es ein Viertel Breite und vermischt die Tages- mit der Stundenentscheidung. „Passt"
  wählt den GANZEN Zeitraum vor; Einschränken ist optional. **Keine Vorbelegung auf
  „Passt"** — eine Vorbelegung darf eine EINSTELLUNG raten, nie eine AUSSAGE ÜBER DIE
  WIRKLICHKEIT; ein unüberlegtes „ich kann immer" macht die Runde kaputt.
- **Der Picker zeichnet die Verdichtung selbst** (`layers`-Prop auf
  `TimeRangePicker`). Die Achse ist privat und ändert sich beim Ziehen gegen den Rand;
  ein vom Elternteil danebengemalter Streifen hätte eine zweite Zeit-zu-Pixel-Rechnung
  und würde genau während einer Geste verrutschen. Der Aufrufer liefert WAS, der
  Picker entscheidet WO. `core/` bleibt davon unberührt.
- **Die Detailfläche einer Runde ist eine kompakte LISTE, die Übersicht liegt einen Tap
  tiefer.** Zwei Zeilen in EINEM Kasten mit einer Haarlinie dazwischen — „N dabei" und
  „Terminfindung" — statt einer sofort ausgerollten Zeitmatching-Karte. Zwei getrennte
  Mini-Karten wären zwei Widgets, die zufällig übereinanderliegen; es sind zwei Aussagen
  über dieselbe Sache. Geometrie, Typografie und Chevron sind vom Teilnehmer-Row in
  `ActivityContent` übernommen, damit die Flächen als eine Familie lesbar bleiben. Die
  Terminfindungszeile bekommt **bewusst keinen zweiten Avatar-Stapel**: zwei gestapelte
  Zeilen, die beide mit Gesichtern anfangen, sind auf einen Blick nicht zu trennen — der
  linke Rand ist die billigste Stelle, sie zu unterscheiden, also steht dort das ambere
  Kalender-Icon. Aufklappen läuft über `planningView` im Sheet (`summary` | `full` |
  `members`) mit demselben Zurück-Kopf wie die Teilnehmerliste; ein offener Drill-in wird
  zurückgesetzt, sobald eine andere Runde angetippt wird.
- **Die Statuszeile zählt PERSONEN, die Zeitleiste zählt VERFÜGBARKEIT — nie vermischen.**
  „18 von 20 Antworten" sind beantwortende von eingeladenen Personen (`memberUids` gegen
  `audienceUids`; „Beitreten IST Antworten", also ist jedes Mitglied genau eine Antwort).
  Das `x/y` in der Matrix ist etwas anderes: Verfügbarkeit INNERHALB der bereits
  Antwortenden. Würden beide dieselbe Formulierung teilen, sähe eine Runde beantwortet
  aus, weil die wenigen Antwortenden sich zufällig einig sind. Die Wortwahl lebt allein in
  `describePlanStatus` (`utils/planSummary.ts`) und sagt **nie** eine Zeit als
  festgelegt an: vor dem Vollzähligwerden „Aktueller Favorit", danach „Favorit", und eine
  festgelegte Runde zeigt die Zeile gar nicht mehr. Mehrere gleichwertige Fenster werden
  zu „Mehrere Favoriten" — zwei lange Zeiträume passen nicht in die Zeile, und einen davon
  zu wählen erfände eine Entscheidung, die der Host nicht getroffen hat.
- **Für Eingeladene fehlt der Favorit, und das ist die Regel, nicht ein Bug.**
  `timePlanMembers` ist ihnen verschlossen, also gibt es keine fremde Verdichtung zu
  zeigen; die Zeile nennt dann nur den Fortschritt (`canSeeFavourite: false`), der aus dem
  Plan-Dokument selbst kommt. Die Teilnehmerliste sagt es aus demselben Grund offen:
  „Wer schon dabei ist, siehst du, sobald du selbst geantwortet hast."
- **Kein eigenes Sheet — alles im `MarkerDetailSheet`.** Eine Runde mit Ort liegt als
  ringloser Marker auf der Karte; Antippen öffnet dieselbe Detailfläche wie jede
  Aktivität (Titel, Host, Ort), nur steht an der Stelle der Uhrzeit die Übersicht
  bzw. die Antwortzeilen (`PlanningContent` neben `ActivityContent`). Ein zweites
  Detail-Sheet ist genau das, was diese Fläche verhindern soll. Sichtbar wird die
  Runde über `audienceUids` auf dem Plan-Dokument — eine Regel, die ein zweites
  Dokument liest, kann keine Query tragen, und ohne Query kann der Client nicht
  fragen, in welchen Runden er ist.
- **Die Antwort ist eine ZEILE pro Tag, keine Karte.** Label + Picker + `[ ✓ | ✕ ]`
  nebeneinander, rund 62 statt 142 dp. Die Kartenhülle (Rand, Füllung, Polster)
  trug keine Information und schob den Knopf, der die Sache abschließt, aus dem
  Bild. **Die Stundenskala bleibt** — sie sagt als Einziges, wohin man einen Griff
  zieht, und kostet nichts, weil der Picker sie in seinem eigenen Kasten zeichnet.
  Der Schalter ist sichtbar 30 dp und per `hitSlop` 44 dp groß, dieselbe Trennung
  wie bei den 6-dp-Griffen des Pickers. **Nicht in den Balken legen:** bei der
  15-Minuten-Mindestdauer ist der ~16 dp breit, und an seinen Enden sitzen die
  Griffe.
- **Planungsflächen nehmen die App-Farben** (`usePlanningColors`). Sie waren zuerst
  für ein dunkles Sheet gezeichnet und hart auf Weiß gesetzt — im hellen
  Detail-Sheet war davon nichts mehr zu sehen.
- **Tests:** `npm run test:time-planning` (Aggregation, bester Slot, geteilte Achse),
  `npm run test:time-plan-functions` (Callables im Emulator: kein Mitglied ohne
  Antwort, Lock-Regeln, Idempotenz), `npm run test:marker-countdown` (Ringe).

### Marker-Ringe: der Ring ist eine Uhr

`src/features/map/utils/countdown.ts` ist die einzige Quelle. **Kein Ring heißt genau
eine Sache: keine feste Zeit.**

- **Grün = anteilig** (unverändert): „wie weit ist das schon?". Fast leer heißt „lohnt
  nicht mehr", fast voll „gerade erst los" — und das liest sich bei 1 h wie bei 6 h
  gleich. Ein absoluter Maßstab könnte das nicht: Ein sechsstündiges Fest stünde fünf
  Stunden auf „voll" und sagte nichts.
- **Amber = absolut**, über `SOON_RING_SCALE_MS` (60 min, passend zu
  `SOON_LEAD_MINUTES`, damit ein frisch geplanter Termin bei vollem Ring startet und
  genau zum Beginn leer läuft). Dadurch sind zwei Marker vergleichbar: halber Ring ist
  auf jedem eine halbe Stunde. Anteilig wäre hier gar nicht definierbar — es gibt
  keinen natürlichen Startpunkt fürs Warten. Alles jenseits des Maßstabs ist schlicht
  „voll" = „noch nicht bald".
- Beide leeren sich, weniger Ring heißt also immer weniger Zeit. Beim Start ist Amber
  leer und Grün springt auf voll — dieses sichtbare Wiederauffüllen ist gewollt.
- Quantisiert in 8 Stufen und Teil des `captureKey`, damit gecachte Marker-Bilder nur
  bei sichtbarer Änderung neu aufgenommen werden. Ein Plan weit in der Zukunft steht
  dauerhaft auf 1 und erzeugt keine einzige Neuaufnahme.

---

## Friends Screen

- **Route `/friends`** (reached from Profile via "Freunde verwalten"): the one place to see all friends, mark close friends, and manage Circles — Circles management (`CirclesSection`) lives here now, not in Profile.
- **Enge Freunde (close friends):** a star toggle per friend row, independent of circle membership — a property of the current user about a friend, not of any circle. Backed by `closeFriendUids` on the user's own `users/{uid}` doc (via the `circleService` seam, same singleton as circles), not a new provider. Feeds the "Enge Freunde" quick-select in the activity composer's Sichtbarkeit picker.
- **Search** is a pure client-side filter over the already-loaded friends list — no backend write, so no debounce concern.

---

## Profile / Settings Screen

- **Profile hero shows `@username` + a QR button** (opens `FriendCodeSheet`, only when `friendRequestPolicy === 'anyone'`) — the "zeig mal deinen Code" moment is one tap from the avatar button; the FULL add-friends flow (username input, requests) stays on `/friends`, never duplicated here.
- **Wording rule: never gendered singular "Freund"** in user-facing copy — use "Freunde hinzufügen", "Freund:in", "Bestätigte Freundschaft", "Ihr seid bereits befreundet" etc.
- **Theme switcher:** System / Hell / Dunkel — persisted via AsyncStorage
- **NO radius slider here** — the Umgebungsradius lives only in the NearbySheet (see Nearby Radius Feature section)
- **"Freunde verwalten" row:** links to the Friends screen (`/friends`) — Circles/close-friends management is not inline here anymore
- **Privatsphäre section contains ONLY real, changeable settings:** (1) "Blockierte Personen" → `BlockedUsersSheet` (`features/moderation`, live `blockedUids`; display names resolve via the `getBlockedContacts` callable — publicProfiles are NOT client-readable; unblock with confirm; blocking itself happens in context via `SafetyActionsSheet`, never here), (2) friend-request policy radio ("Wer kann dir Freundschaftsanfragen senden?"), (3) one link row "So schützt dich Together" → `PrivacyInfoSheet` (`features/settings`). **All fixed guarantees live in that info sheet** (Profil nur für Freunde, coarse/opt-in/expiring location, ephemeral chats, no feed) — never render an unchangeable guarantee inside the settings list (no banner, no "Immer aktiv" chip, no pseudo-toggle: anything that looks like state invites the expectation it can be changed). **Copy rule for the info sheet:** written for FIRST-TIME users — plain principles in everyday language, no internal feature names or UI vocabulary ("offen", "Kontaktkarte", "Unterwegs"). Concrete facts that build trust ARE allowed and must match the implementation exactly (e.g. "löschen sich 12 Stunden nach dem Ende" — the real chat TTL; never state a retention the backend doesn't enforce). Section order: Profil → Aktivitäten → Standort → Nachrichten. Deliberately NO global location toggle — opt-in stays per-session.
- These settings live in the same `AppScreen scroll` view
- **Legal pages (`src/features/legal/`):** Datenschutzerklärung, Nutzungsbedingungen and Impressum are single-sourced JSON documents (`*.de.json`) rendered by `LegalDocScreen` — the SAME files also generate the hostable HTML pages (`npm run legal:html` → `docs/legal/*.html`) for the store listings, so app and website can never drift. Routes `/datenschutz`, `/nutzungsbedingungen`, `/impressum` are registered OUTSIDE both `Stack.Protected` guards (readable before sign-up; the auth screen's consent line links Nutzungsbedingungen + Datenschutzerklärung). The Profile Privatsphäre section links all three. Retention claims in these documents must match the enforced backend values exactly — when a TTL changes, update the JSON in the same commit.
- **Push opt-in nudge (`usePushNudge`, features/notifications):** ONE contextual ask per device (AsyncStorage `together.push.nudge.v1`), fired after the first successful activity join in `MapScreen` — never a cold prompt at first launch. The Profile toggle remains the durable on/off switch.

---

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
