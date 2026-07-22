# Together — App Spec & Development Rules

## What the App Is

**Together** is a spontaneous-meetup app for friend groups. It shows who from your Circles is currently open, available soon, or doing something right now — without a social feed, without posting, without broadcasting to strangers.

The core loop: set a mode (Open / Soon / Now) → friends nearby see it → someone reaches out → you meet up.

---

## Backend Strategy & Hard Constraints

**Target backend: Firebase** (Auth + Firestore + Storage + minimal Cloud Functions). The full architecture, data model, security concept, and build order live in **[docs/backend-plan.md](docs/backend-plan.md)** — read it before any backend work.

Rules that govern all backend work:

- **Service-seam pattern is mandatory.** Every domain goes through an interface (like `AuthService` → `authService`): mock implementation + firebase implementation, swapped in ONE file. UI and providers never import a concrete backend.
- **Mock mode stays the default.** `EXPO_PUBLIC_BACKEND=mock|firebase` selects the backend; unset/`mock` = fully offline with seeded data (no network, no cost). Web ALWAYS runs mock.
- **Every feature must land in BOTH service implementations** (mock + firebase), or the mock mode drifts and dies.
- **Firebase development runs against the local Emulator Suite** (`demo-together` project — offline, free, no login). Real cloud only for staging/release.
- **Fake/demo data in firebase mode comes from the emulator, not the client.** `npm run emulators:seed` populates the running emulators with fake auth users, friendships, presence, activities, chats and one static Heimweg companion session — idempotent, befriends every existing dev account, writes exactly the doc shapes the cloud functions produce (update BOTH when a shape changes). `scripts/seed-emulators.mjs` owns the core data; `scripts/seed-heimweg.mjs --once` adds the standard Safety case, while `npm run emulators:seed:heimweg` keeps moving it for live testing. Client-side mock seeds (`src/data/mock`) are **mock-mode-only** and must never be merged into firebase mode (the old `PRESENCE_SEED` client merge was removed for exactly this reason). Note: `npm run emulators` starts with an EMPTY database — re-run the seed after a restart, or use `npm run emulators:persist`.
- **Keep active listeners minimal and every query `limit()`-ed** — this is the main cost-control rule. Currently active per session: Circles (`circles` query + a single-doc listener on `users/{uid}` for `closeFriendUids` — the cheapest possible listener type), Chat (messages of the open room; room summaries are cached and listened to only while the activity list is visible), Activities (feed), Journey (one per actively-watched activity, RTDB). Chat receives generic Push nudges for closed room lists and performs one bounded Firestore reconciliation on foreground/list-open; Push is never the source of truth. Friend Presence is deliberately active **only while the map surface is visible**; it must be stopped on every other surface while the own open-status write-through remains active. Don't add a new always-on listener without a reason — prefer a one-off read or deriving from an existing subscription first.
- **No API keys in the repo.** Keys via `.env` (git-ignored); web-API keys (e.g. Places) never in the client — proxy through a function.
- **No paid assets.** No external calendar APIs (`expo-calendar`, Google Calendar).
- **Push notifications** come later via Expo Push + dev builds (see plan step 6) — do not add them before that step.
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
| Maps       | react-native-maps (native); `MockMapCanvas` (web/dev)                                                       |
| TypeScript | 5.9 strict                                                                                                  |

**Tailwind note:** No `tailwind.config.js` — theme tokens are defined in `src/global.css`. Class-order conflicts (e.g. `bg-primary` always beats `bg-open`) are resolved by using `style={{ backgroundColor: accent }}` directly.

---

### Local Android Emulator Setup

- Android tooling for this Windows machine lives under `D:\Dokumente\AndroidDev`, not directly under `D:\` and not in `C:\Users`.
- `ANDROID_HOME` / `ANDROID_SDK_ROOT` = `D:\Dokumente\AndroidDev\Android\Sdk`.
- `ANDROID_AVD_HOME` = `D:\Dokumente\AndroidDev\Android\avd`.
- Use `npm run emulator` to start/check the local `Together_Pixel_7` emulator.
- Use `npm run android:local` to start Expo with the Android environment variables set.
- **Launching the already-built dev client: use `npm run android:launch`** (needs `npm run emulator` first). `npm run android:devclient` / `npx expo run:android` are unreliable on this machine: Nahimic's `NTKDaemon` listens on port 5563, so adb registers a phantom `emulator-5562` and Expo's device enumeration aborts (`could not connect to TCP port 5562`) before it builds or launches. `scripts/launch-android-devclient.ps1` sidesteps that entirely — it installs the prebuilt APK (if missing) and opens the app via targeted `adb -s emulator-5554` calls + a dev-client deep link, then runs Metro with `expo start` (which does not enumerate on boot). A true native rebuild (new native deps) still needs Gradle; prefer building via Gradle directly + `adb install` over `expo run:android` for the same reason.
- Do not move SDK, JDK, downloads, or AVD data back to `C:` unless the user explicitly asks.

---

## Activity Modes

| Mode   | Color       | Hex       | Meaning                   |
| ------ | ----------- | --------- | ------------------------- |
| `open` | Blue/Indigo | `#6E8BF7` | Available, no plan yet    |
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

```
nearbyCount = selectNearbyFriends(radiusKm).length   // radius only, NO viewport
```

- **`selectNearbyFriends(radiusKm)`** — `mockNearbyFriends` with visibility `pin` AND `distanceKm <= radiusKm`, sorted by distance ascending. Excludes `none`.
- **`selectFriendsWithoutLocation()`** — `mockNearbyFriends` with visibility `none`. Never counted, shown separately.
- **`selectNearbyCount(radiusKm)`** — convenience wrapper = `selectNearbyFriends(radiusKm).length`.

`MapScreen` computes these once, uses `nearbyFriends.length` for the pill AND passes `friends` + `friendsWithoutLocation` into `NearbySheet`. The sheet does NOT filter — it renders what it's given, so pill count === sheet "in deiner Nähe" count by construction.

**Map pins are a SEPARATE concern.** `pin`-visibility friends render as map markers (via `mockMapMarkers` entries with a matching `friendId`). These pins are NOT added to the pill number. The map shows locations; the pill counts social relevance.

Tapping the pill opens `NearbySheet`.

---

## NearbySheet

Receives `friends: NearbyFriend[]` (pin in radius, pre-sorted) and `friendsWithoutLocation: NearbyFriend[]` (`none`) as props. Two labelled sections:

1. **"In deiner Nähe"** — `friends`. Each row shows a visibility label:
   - `pin` → distance only, e.g. "700 m entfernt"; no dot and no "auf Karte sichtbar" label. Rows remain navigable (`navigate-outline` icon, tap → focus map)
   - Empty → hint to widen the radius
2. **"Ohne Standort"** — `friendsWithoutLocation`, no distance, not navigable. Only rendered if non-empty.

- **Header:** "N Freunde offen in deiner Nähe" (N = `friends.length`), plus a secondary "+ M offen ohne Standort" line when there are `none` friends. The no-location friends are surfaced but never inflate the headline nearby number.
- **Open Presence (`OpenStatusCard`, top of the sheet):** the current user's own "I'm open" toggle. Not open → one tap ("Offen stellen") flips you open with defaults (all friends, auto-expires after `OPEN_DURATION_MS` = 3 h; hard maximum 12 h) — **no form, no required name**. Open → a **collapsed-by-default** card: just the summary "Du bist offen · <vibe> · bis HH:MM" + chevron + "aus". Tap the summary to expand the controls (keeps the sheet compact). Everything below is **optional refinement AFTER you're already open**:
  - **Duration** ("Bis wann?"): an **exact native time picker** (`@react-native-community/datetimepicker`, `mode="time"`; iOS inline compact, Android dialog showing "bis HH:MM"). A chosen time rolls to tomorrow if already past today, but is capped at 12 h from now. → `setExpiresAt`. Default on going open is +3 h (`OPEN_DURATION_MS`); no hour presets.
  - **Vibe**: the FIRST control in the expanded card (above "Bis wann?" — the "what" is the social headline, time is just the frame): a **free-text field only** (placeholder "Egal") — the quick chips (and their emojis) were removed. **No vibe set displays as "Egal"** in the collapsed summary ("Du bist offen · Egal · bis HH:MM"): a pure display convention — the data stays `null`, never write a magic "Egal" label into the presence doc. Free text carries a `label` only (no emoji). `OPEN_VIBES` still exists in the provider but is currently not rendered by this card.
  - **Location** ("Standort"): a toggle "Standort teilen" → `shareLocation`. (Wording rule: never call this "Für Freunde sichtbar" — you are ALWAYS visible to friends while open; the toggle only controls whether your coarse position/distance is shared.) On = friends see you on the map (`pin`); off = you appear in the list only, no location (`none`) — same two-tier model as `LocationVisibility`. **Privacy-first: resets to off each time you go open** (explicit opt-in per session). A small navigate icon shows in the collapsed summary when sharing.
  - An "aus" button to close.
  - **The rule (refined):** free text is fine as an _optional, post-open_ refinement — what's forbidden is a _required, up-front_ text field (that turns the 1-tap toggle back into a form). Going open must always stay one tap with defaults.
    State lives in `useOpenStatus()` (`src/features/presence/`), persisted + auto-expiring, and **backed by the `presenceService` seam** (mock offline by default, Firestore `presence/{uid}` when `EXPO_PUBLIC_BACKEND=firebase` — see docs/backend-plan.md → Presence). The provider writes your own presence through the seam (going private removes `coarseLocation`; going off deletes the doc) and subscribes to friends' open presence (`openFriends`). In firebase mode the nearby pill/list are driven by real presence (`presenceToNearby`, Haversine distance to your own location); mock mode keeps `mockNearbyFriends`. The user's own open status is shown in the card only; it does NOT inflate the friends' nearby count. The pill that opens this sheet stays permanently visible (chosen model: always-visible count for liquidity, with the "become open" nudge reciprocity-style but not gated).
- Compact `RadiusSlider` sits directly under the open-presence card; changing it re-filters `friends` live (via shared `radiusKm` context → MapScreen re-render → new props).

---

## Map Screen Architecture

- `MapCanvas` is the single rendering swap point. Web → `MockMapCanvas` (via the `MapCanvas.web.tsx` platform file — `react-native-maps` is native-only and must never enter the web bundle); native → `react-native-maps`.
- **Map provider = Google on BOTH platforms ("Option A", see docs/backend-plan.md → Karten/Orte).** Reason: `onPoiClick` (tap a POI label → create an activity there) only exists in the Google provider. Android is always Google; iOS uses Google in dev/release builds with a configured key (`GOOGLE_MAPS_API_KEY_IOS` via `app.config.js`) and falls back to Apple Maps in Expo Go (no Google SDK there — POI labels not tappable, long-press/search instead). Do not move place search to a non-Google provider: Places data may only be displayed on Google maps.
- `MapOverlay` floats absolutely over the map with all controls (SpeedDial, search bar, recenter, nearby pill). All copy is German ("Orte suchen", "Profil öffnen" — never English placeholders). It renders a soft SVG top scrim (dark → transparent, `insets.top + 64`) so the status bar stays readable over the bright map.
- **Mode switching animates.** `MainSurface` wraps each mode in a `ModeLayer` that cross-fades (240 ms ease-out + scale 0.985→1) instead of hard opacity 0/1 swaps; inactive layers stay mounted and non-interactive (same semantics as before). `MarkerDetailSheet` renders a subtle mode-tinted top wash as an SVG **gradient fading to transparent** (accent 0.1 → 0 over 110px) — never a hard-edged color block that cuts across content.
- **`WelcomeIntro`** (features/main): one-time welcome hero shown after the first sign-in (AsyncStorage `together:welcomeSeen:v2`), mounted in `MainSurface`. It uses the custom initial-`t` `TogetherMark` (never the retired circle/ring motif), two value rows (Karte/Kalender), CTA "Los geht's". Modal is `statusBarTranslucent` + `navigationBarTranslucent` so it truly covers the whole screen. Never blocks returning users; storage errors → skip the intro.
- `MapLocationPickerOverlay` takes over when picking a location for an activity.
- `focusCoordinate` prop: during picker → `mapPickerFocusCoordinate`; otherwise → `mapFocusCoordinate` (set when navigating from NearbySheet). `selectionFocus` is a separate one-shot camera request: opening a place/activity detail keeps its coordinate centered in the visible upper map above the sheet while preserving the user's zoom.
- `onRegionChange` fires on every `onRegionChangeComplete` (native) or `focusCoordinate` change (MockMapCanvas). It passes a full `MapRegion` (center + both deltas). Its ONLY consumer is `updateMapPickerCenter` for the location picker — it does NOT feed the nearby count (which is viewport-independent by design).
- `pin`-visibility friends have a matching `mockMapMarker` with a `friendId` field linking marker ↔ friend. Keep positions and the friend's `coordinate` in sync (see Mock Data rules).
- **Markers are image-based, NOT custom-View children (`markerCapture.tsx`).** On Android + the New Architecture (Fabric), `react-native-maps` snapshots a custom marker `View` to a bitmap before layout settles and clips it to the top-left corner (the "avatar only half visible" bug — reproduced even in a real dev client, so it is NOT an Expo Go quirk). Fix: `MapCanvas` builds a descriptor per marker (`id`, `captureKey` encoding full visual state, `coordinate`, `node`, `onPress`), renders each `node` (`AvatarMarker`/`ClusterMarker`/`JourneyAvatarMarker`) off-screen inside a hidden `View`, captures it to a PNG via `react-native-view-shot`, and hands THAT to `<Marker image>`. Captures are cached by `captureKey` (so pan/zoom never re-captures; an appearance change produces a fresh image). Do NOT go back to passing marker Views as `<Marker>` children. `react-native-view-shot` is a native module — adding/removing it requires a dev-client rebuild.
- **Map style selector (`mapStyle/` + `MapStyleMenu`).** A layers button (bottom-right, above recenter) opens a menu: Automatisch · Tag · Nacht · Satellit — the real Google-Maps layers pattern. Backed by `MapStyleProvider`/`useMapStyle` (mirrors `ThemePreferenceProvider`, persisted at `together.map.style.v1`, mounted at root inside `ThemePreferenceProvider`). `preference: 'system'|'day'|'night'|'satellite'`; `effectiveStyle` resolves `system` against the app's `resolvedScheme` (dark→night). `MapCanvas` maps it to `mapType` (`satellite`→`hybrid`, else `standard`) + `customMapStyle` (`night`→`darkMapStyle` from `utils/mapStyle.ts`). Caveat: `onPoiClick` may not fire on satellite/hybrid — long-press to drop a place still works.
- **Cluster marker (`ClusterMarker`)** shows the first 4 avatars as a 2×2 quad (cells ≈half the inner circle so two fit per row; `slice(0,4)`). Count badge shows `N/MAX` when the cluster's `maxParticipants` is set (mirrors `AvatarMarker`), else the raw count. `MarkerCluster.maxParticipants` flows from the backing activity (or mock seed) and is part of the cluster `captureKey`.
- **`MarkerDetailSheet` participant navigation.** The activity detail shows only a compact avatar stack with the participant count (more than 4 → 3 avatars + a "+N" chip). Tapping it keeps the same sheet container mounted and drills into a **content-sized** participant view (rows in a card, capped at ~60% screen height with inner scroll — never a fixed tall sheet with dead space below a handful of names) with back + close controls; it must not stack a second modal or push the chat down. Returning preserves the detail/chat state. Chat mode keeps its own fixed-height layout + inner scroll.

### App Routes / Main Surfaces

- The authenticated app has one primary route (`/`) that renders `MainSurface`.
- `MainSurface` currently owns Map and Calendar. **Calendar is NOT a map pill segment**: it opens via the calendar button in the map top bar and shows one compact "Karte" return control. Socialize is deliberately not mounted or reachable until its later release. Do not add stale placeholder routes for Open/Plans just to mirror older tab ideas.
- Profile lives at `/profile`. Joined activities/chats are reached from the map overlay via `ActivitiesSheet`, not via a separate tab/route.
- If a route is not implemented as a real surface, remove it instead of leaving placeholder copy in production UI.

### Activity Groups And Clusters

- A real activity group is never mixed across modes. It is exactly one `mode`: `soon`, `now`, or, if explicitly supported later, `open`.
- `soon` groups represent people planning the same activity later. `now` groups represent people currently doing the same activity.
- Do not display mixed labels like "8 open, 17 soon, 3 now" on a colored group marker. A colored group marker must have one matching mode and one matching meaning.
- `MarkerCluster` in the mock map currently represents a mode-specific activity group, not a mixed visual map aggregate. It therefore has one required `mode`, a `label`, and a participant `count`.
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
- `ActivityEntityProvider` owns the local mock state for map markers, clusters, and Together plans. Components should read through `useActivityEntities()` instead of importing `mockMapMarkers`, `mockMarkerClusters`, or `mockPlans` directly.
- Activity edits must go through `useActivityEntities().updateActivity(activityId, patch)` so calendar rows, map markers/clusters, joined activity rows, and detail sheets stay in sync.
- `MarkerDetailSheet` is the shared activity detail surface for map and calendar entries. Do not reintroduce a separate calendar detail sheet that renders different join/chat behavior.

**Editing an existing activity (host-only, fix-a-mistake flow):** `MarkerDetailSheet` shows a small "Bearbeiten" pencil next to the mode line when `canEdit` is true (the current user is the activity's host — `selection.hostId === currentUid`; demo seeds have no `hostId` and are never editable). It reopens `ActivityComposerSheet` with `editing` + `initialDraft` (built by `useActivityEntities().getEditableDraft(id)`), and submits via `updateActivityFromDraft(id, draft)` instead of creating a new activity. The Sichtbarkeit/audience picker is hidden in edit mode and must stay hidden: `ActivityDocUpdate` has no `audienceUids` field on purpose, so a title/time typo fix must never silently change who can see the activity. `getEditableDraft` returns `null` for expired activities, other people's activities, and demo seeds — no edit affordance shows for those.

**`MarkerDetailSheet`** — opens when an avatar marker or activity group is tapped. Fixed info order (top → bottom):

1. **Activity name** (`selection.title`) — bold, top.
2. **Mode line** — colored dot + concise context label (`Offen`/`Startet in 38 Min.`/`Jetzt`) + "· N dabei" (+ "· Du bist dabei" once joined).
3. **Time** (`selection.timeLabel`) — clock icon row, e.g. "Heute 18:00–21:00".
4. **Place** (`selection.placeLabel`) — location icon row, e.g. "Prater Garten".
5. **Participant list** — vertical rows, each avatar + name (`ParticipantListRow`).
6. **Join button** — "Beitreten"/"Mitplanen"/"Dazustoßen" (per mode), white text on `accent`.

Time/place rows only render when the field is present. No placeholder copy, no fake chat mockup, no redundant intent sentence. White text on accent buttons (never dark text). Place selections are separate: they keep map/route/create-at-place actions and never show join/chat.

### Journey / Anreise Focus

**Aktualisierte Produktentscheidung (Juli 2026; ersetzt die folgenden älteren
Foreground-only-Hinweise):** Die explizite Aktion „Anreise teilen“ ist reine
Zustimmung/Registrierung — genau wie beim Antippen der Reminder-Push. Der native
Hintergrunddienst (Akku-/Foreground-Notification-Fußabdruck) startet NICHT sofort,
sondern erst bei T−30, egal ob der Tap 6 h oder 1 h vorher passiert. Ausnahme: Beitritt
zu einer bereits laufenden `now`-Aktivität — dort ist T−30 schon verstrichen, also wird
sofort scharfgeschaltet (`armBackgroundJourney`, `journeyBackground.ts`). Der T−30-Start
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

Journey has a service seam in `src/features/journey/`: mock offline by default, RTDB when
`EXPO_PUBLIC_BACKEND=firebase`. Do NOT add real background location or real push notifications under
the current constraints; the RTDB service stores mock/current UI coordinates only.

- A user can be actively **unterwegs** to exactly one activity at a time. Starting another journey must
  show a conflict/switch flow instead of silently sharing to two activities.
- "Bin unterwegs" is only available after joining an activity. The trust copy must clearly state:
  participants only, automatic stop at arrival, and latest stop after the event.
- Auto-stop rules in mock mirror the product contract: arrival radius `100 m`, event end + `30 min`
  buffer, and a hard max of `2 h`. Manual "Teilen stoppen" remains an override.
- Default map stays calm: do NOT render all journey avatars globally. Activity markers may show a small
  `N unterwegs` badge. Actual moving/arrival avatars render only in Activity Focus Mode.
- `MarkerDetailSheet` is the control center, but the Anreise entry is a **compact `JourneyShareRow`**
  (not the old full `JourneyPanel` card). The idle "Anreise teilen" row is a single plain, tappable
  action — deliberately no accept/decline framing: it's just there while relevant, gone when not.
  Visible only from **T-6 h until `startsAt`**, disappearing once the activity has begun (Anreise
  stops making sense once you're there). The Heimweg has NO activity-sheet entry anymore — its home
  is the profile card + global status pill (see Safety section). An armed/underway/arrived Anreise
  status remains visible with stop/arrival controls regardless of that window. Joining an
  already-running (`now`) activity shows the same row once, only when `journeyRemindersEnabled` is on;
  it self-clears on a successful start or when the sheet closes/switches activity — no separate dismiss
  control needed. The small map icon focuses journey participants.
- Activity Focus Mode shows only the selected activity and its journey avatars. The overlay shows a
  focus pill with the activity/person state and an explicit close control.
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
- Rationale: a chat buried in a transient map sheet is hard to return to, so it stays compact by default and only takes over the sheet on demand. Joined rooms are reachable from `ActivitiesSheet`.

**Membership + chat state** live in `ChatProvider` (`src/features/chat/`), wired near the root in `_layout.tsx` (inside `AuthProvider`). Single source of truth — do NOT keep a separate `joinedActivityIds` in `MapScreen`.

- `isJoined(id)` / `joinActivity(id)` — membership. Persisted to AsyncStorage (`together.joined.activities.v1`) so joined rooms survive restarts.
- `getMessages(id)` / `sendMessage(id, text)` — messages are in-memory, seeded from `mockActivityChats` (`src/data/mock/mockChats.ts`), keyed by the activity/selection id. No backend, no realtime, no persistence for messages (mock only). **Sending is optimistic:** `ChatProvider.sendMessage` appends a local `pending` echo immediately (rendered translucent with "Senden …"); the message listener's server copy replaces it (matched by author + text with clock-skew tolerance), a failed write removes it. Never make the UI wait for the callable→Firestore→listener round-trip.
- **Firebase mode: incremental message sync (`messageCache.ts`).** Messages are cached per room in AsyncStorage (`together.chat.messages.v1:{roomId}`, capped 200, pruned after 31 days — mirrors the chat TTL). Opening a chat paints the cache instantly; the listener anchors at the newest cached message (`createdAt >`), so **each message is downloaded exactly once per device** — never re-fetch the whole room on open. Known tradeoffs (documented in `subscribeMessages`): edits to already-cached docs (e.g. proposal toggles by others) don't re-stream, and > 50 new messages since last open only surface on the next open. Do not reintroduce a time-based (`Date.now()`) filter into the message query — it makes every open a brand-new query and defeats all caching.
- `getUnreadCount(id)` / `markRead(id)` — unread = non-own messages with `createdAt` after the room's last-read time (`readAt`, in-memory; missing = never opened, so seeded messages start unread). `markRead` is called when a chat opens (`ActivityChatView` and `InlineActivityChat` on mount).
- `createGroup(memberIds, vibe?)` / `getGroup(id)` — open groups (see flow below). A "room" is keyed by either a marker id (activity) or a group id; the same messages/unread/read plumbing serves both. `createGroup` also adds the group id to the joined set, so it appears in the joined list and reuses all chat infra.
- `sendProposal(roomId, {what,when,where})` / `toggleProposalConfirm` / `markProposalPlanned` — proposals are just messages with `kind: 'proposal'` and a `proposal` payload; they are NOT a separate screen or app state. (The composer entry point was removed from the chat UI — see the core-flow section.)

**Chatraum-Verwaltung (Mitglieder & Admins):**

- Rooms carry `adminUids` (creator = first admin; legacy rooms without the field: `memberIds[0]` counts as admin — this fallback lives in the functions, both services AND `ChatProvider.isRoomAdmin`, keep them in sync).
- **Group rooms only.** Activity-chat membership follows activity participation (join/leave the activity) — never chat-side member edits; the info sheet shows activity members read-only.
- Management is **callable-only** (`addChatMembers`, `removeChatMember`, `promoteChatAdmin` in functions/index.js): caller must be admin; added members must be **confirmed direct friends of the adder** (same trust boundary as group creation, never strangers); groups cap at 25 members; **admins cannot be removed** (they leave via `leaveChatRoom`); promote only, no demote.
- Seam methods on `ChatService` (mock + firebase): `getRoomMembers` (one-off `publicProfiles` reads when the info sheet opens — deliberately NO listener), `addMembers`, `removeMember`, `promoteAdmin`. `ChatProvider` exposes them plus `isRoomAdmin`.
- **UI = `ChatRoomInfoSheet`** (`src/features/chat/components/`), opened by tapping the chat header title in `ActivityChatView` (standard messenger "group info" affordance). Three inner views: member list (admin chips, "(Du)" marker), member profile (tap a row → avatar/name/@username + admin actions "Zum Admin machen" / "Aus Gruppe entfernen" with confirm dialog), and an add-friends picker (search + checklist of own friends not yet in the room, footer "Hinzufügen (N)"). Errors surface as `Alert`, never silently.
- **Rename (`renameChatRoom`):** group creation stays 1-tap with an auto-name (vibe or "Mit A, B, C" — NEVER an upfront name form, same defaults-first lesson as the Open status); admins rename afterwards via the pencil in the info sheet's room card (inline edit, ≤80 chars). Activity chats are NOT renamable — they mirror the activity title.
- **"Offen für Dazustoßer" (joinable groups):** the answer to "wie stößt man dazu, ohne eingeladen zu werden" — as an **explicit group decision, never auto-visibility** (showing formed groups uninvited = FOMO/exclusion display, rejected). Admin toggle in the Gruppen-Info (default OFF). Opting in writes a public **teaser doc `groupOpenings/{roomId}`** (title, vibe, memberCount, memberPreview initials — NEVER messages; the private room doc stays members-only) with `audienceUids` = the toggling admin's confirmed friends minus members (snapshot, presence mechanics). NearbySheet shows openings in an "Am Planen — komm dazu" section (listener attaches ONLY while the sheet is open — `setOpeningsActive`); "Dazustoßen" → `joinOpenGroup` callable (re-checks audience + 25-cap server-side) → lands in the group chat. The nearby pill count NEVER includes groups. Mock mode ships one demo opening (`group-open-demo`).
- **Leaving (`leaveChatRoom`) + admin succession:** every member can leave a group ("Gruppe verlassen", destructive-red with confirm, closes sheet + chat via `onLeave`). When the last admin leaves, the longest-standing remaining member (`memberIds[0]` after removal) inherits admin — a room must never be admin-less. An emptied room becomes unreadable and dies via TTL (mock deletes it immediately). This succession contract lives in the callable AND mockChatService — keep in sync.

**Full-screen chat is a Modal, NOT an Expo Router route.** There is no `activity/[id]/chat` route (it caused "unmatched route" issues with nested dynamic segments + `Stack.Protected`). Instead:

- `ActivityChatView` (`src/features/chat/components/`) is a presentational, props-based chat screen (`activityId`, `title`, `count`, `onBack`). Gated by `isJoined` (locked state otherwise).
- `MapScreen` hosts it in a `<Modal>` driven by `chatActivity` state. Opening from the joined list sets `chatActivity`; `onBack` clears it.
- `InlineActivityChat` (in the detail sheet) and `ActivityChatView` (full-screen Modal) share the same components/provider. Inline = quick access on the map; Modal = from the joined list.
- Text messages and proposal cards must keep visible sender context. `MessageBubble` / `ProposalCard` show the sender at author changes (`Du` for the current user, `authorName` for others), so group chats stay readable like WhatsApp-style group threads.
- Never reintroduce a router route for chat unless the nested-route registration is verified.

### Deine Aktivitäten (joined list)

- Joined activities are reached via a **button, not a tab**.
- Entry point: the chat-bubbles icon in the `MapOverlay` top bar (top-right) → opens `ActivitiesSheet`. Next to it sits the calendar button (opens the Calendar surface). The notifications bell was removed from the top bar — `NotificationsSheet` currently has NO entry point (the feature code stays for later).
- `ActivitiesSheet` lists joined activities from `ChatProvider.joinedIds`, **sorted by last message (`lastMessage.at ?? createdAt`, newest first — messenger convention, NOT room-creation order)**, resolving each id through `useActivityEntities().findActivityById(id)`. Each row shows title + last message + timestamp + an unread badge; tapping calls `onOpenChat(activity)` → `MapScreen` opens the chat Modal.
- `ChatProvider` exposes `joinedIds: string[]` for this list. Ids resolve to either a group (`getGroup`) or a map activity (`findActivityById`); groups show `memberIds.length` dabei, joined activities show base + 1 (you).

### Open → Group → Proposal → Plan (the core flow)

The product turns a loose "I'm open" into a concrete plan through a lightweight escalation. It is deliberately NOT a Tinder/swipe model and NOT a global stranger chat — curation over public, circles over strangers.

1. **Free vibe, not fixed categories.** The activity "what" is free text (`draft.title`), with tappable `SuggestionChips` (`@/shared/components`) that only PREFILL and stay editable (`Bar`, `Essen`, `Kaffee`, `Sport`, `Spazieren`, `Egal`). Never reintroduce a rigid category picker.
2. **Group creation lives in the open-pill sheet (`NearbySheet`), NOT a separate button/sheet.** Everything is in one place: tapping the centered "N offen in deiner Nähe" pill opens `NearbySheet`, where you see who's open, multi-select friends (tap a row to toggle; pin friends keep a separate navigate icon), and tap the footer **"Gruppe starten (N)"**. That calls `onStartGroup(members)` → `MapScreen.handleStartGroup` → `createGroup` → opens the group chat Modal. Do NOT add a "Gruppe" option to the create speed-dial (that was tried and removed).
   - `createGroup(members: GroupMember[], vibe?)` takes `{ id, displayName }[]` (nearby friends carry no `mockMapUsers` userId, so names are passed directly). It prepends the current user and adds the group id to the joined set.
3. **Proposal = chat card, created via the "+" in the input bar — planning groups ONLY.** `ChatInputBar` shows a "+" button (when the host passes `onProposal`) that opens `ProposalComposer` (Was required, Wann/Wo optional free text) → `sendProposal` posts the card. Both chat surfaces wire it, but **only for `room.type === 'group'`** — inside an activity chat the plan already exists, so the entry stays hidden there (a proposal would be noise). `ProposalCard` renders with "Bin dabei" + "Aktivität"; the direct "Aktivität" header button (step 5) remains the heavier escalation path. Rationale: the proposal is the low-threshold middle step of this core flow — a required-fields activity composer must never be the ONLY way a loose group can converge on a plan.
4. **Proposal → activity.** "Aktivität" on the card calls `onCreateActivity(roomId, messageId, proposal)`, threaded up through `ActivityChatView` / `InlineActivityChat` (→ `MarkerDetailSheet`) to `MapScreen.createActivityFromProposal`. That marks the proposal `planned` (card shows "Aktivität erstellt") and opens the `ActivityComposerSheet` prefilled: mode `soon`, `initialTitle` = proposal.what, `initialPlace` = proposal.where (name only). The composer's (mock) submit stays the actual creation — precise time isn't prefilled because proposal.when is free text and the composer uses date pickers.
5. **Direct create.** `ActivityChatView` also has an **"Aktivität"** button in its header (`onCreateActivityDirect`) → `MapScreen.createActivityFromChat` opens the composer directly (prefilled with the group's `vibe` if any), no proposal card needed.
6. **The chat room persists** across all of this. Creating an activity does NOT discard the group room or its messages — it's the same room (keyed by group id). A real backend would attach the created activity to this same room; today the composer submit is mock, so the room simply stays in "Deine Aktivitäten".

**Rejected on purpose:** blue open-group pins on the map (looks like a place/event when it isn't); a global "everyone nearby" chat (breaks the circles/no-feed identity + safety/stalking risk — the 2 km min radius exists for the same reason); Tinder-style matching (feed/gamification, off-identity, and incompatible with free-text vibes).

- **Activity time/place** come from `MapMarker.timeLabel` / `MapMarker.placeLabel` / `MapMarker.title` or the linked `Plan.activityId`, resolved in `ActivityEntityProvider`. Keep these on mock markers/plans so the shared detail sheet has full info.

### Avatar marker states

`AvatarMarker` conveys three things visually, so joined/unread status is readable without tapping:

- **Joined:** a green checkmark badge at the bottom-right (replaces the mode status dot). Driven by `joined={isJoined(marker.id)}` from both canvases.
- **Unread:** a messenger-style red badge (top-right) with `unreadCount`, shown only when joined and there are unread messages (`isJoined(id) ? getUnreadCount(id) : 0`).
- **Mode:** ring color + the bottom-right status dot (dot hidden once the joined checkmark takes its place).

`ActivitiesSheet` rows show the same unread count as an accent pill and bold the row. Opening the chat (inline or Modal) marks it read, clearing the badge.

### Navigation to a friend (NearbySheet → Map)

Flow: `FriendRow.onPress` → `handleNavigate(coord)` → `onClose()` + `onNavigateTo(coord)` → `MapScreen.setMapFocusCoordinate(coord)` → `MapCanvas` receives new `focusCoordinate` prop.

- **Native (`react-native-maps`):** `useEffect` on `focusCoordinate` calls `mapRef.current?.animateToRegion(...)` at zoom `latitudeDelta: 0.012`.
- **Web/dev (`MockMapCanvas`):** `mapRef` is always `null` on web (no `MapView` renders), so `animateToRegion` silently does nothing. Instead, `MockMapCanvas` reacts to `focusCoordinate` changes by rendering a **pulsing ring** (`RING_SIZE = 56`, border `#6E8BF7`) at the canvas position derived from `coordinateToMockPosition()`. The ring pulses 3× via `withRepeat(withSequence(...), 3)` and fades out. This is the only navigation visual feedback on web.
- **Rule:** Never attempt to call `mapRef.current?.animateToRegion` from outside `MapCanvas`. Navigation always goes through the `focusCoordinate` prop.
- **`coordinateToMockPosition`** in `src/features/map/utils/mockCoordinates.ts` is the inverse of `mockPositionToCoordinate` — clamps x/y to [5, 95] to keep the indicator on-screen.

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
  starten · N"), mit Fortschritts-Punkten. Die Übersicht erscheint bei JEDEM Öffnen — bei einem
  Vertrauens-Feature ist die Erklärseite Teil des Produkts, nicht Reibung. Im Mock teilt Mia ihren
  Demo-Heimweg **DAUERHAFT** (Testentscheidung Juli 2026: Fall 2 UND Fall 3 jederzeit offline
  testbar; Konsequenz: Status-Pille auf Karte/Kalender/Socialize ist im
  Mock permanent sichtbar). Der frühere Hijack-Einwand ist strukturell gelöst — der Schild führt
  in den Beobacht-Modus, der eigene Start läuft über Profil-Karte und Begleiter-Sheet („Eigenen
  Heimweg teilen", auch per Marker-Tap im Fokus erreichbar). Firebase-Modus unberührt.
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

## Socialize (späterer Modus — derzeit vollständig deaktiviert)

**Release-Status:** Socialize ist derzeit weder im Client gemountet noch serverseitig verfügbar. Die folgende Konzeption bleibt für einen späteren, bewussten Launch dokumentiert. Der normale Bereich koordiniert ausschließlich FREUNDE (Circles, Open/Soon/Now).

**Kernprinzipien (nicht verhandelbar):**

- **Liste statt Karte.** Die Leitfrage ist "Wer ist gerade offen für Ähnliches?", nicht "Wo sind Fremde?". Die Karte kommt erst ins Spiel, wenn nach einem Match ein konkreter Treffpunkt vorgeschlagen wird. Keine fremden Personen als Pins, keine exakten Positionen, nur grobe Entfernungslabels ("unter 1 km").
- **Privat bis Match (Default).** Vor einem Match sehen andere nur "Person in deiner Nähe" / "N Leute", grobe Distanz, Freitext und Vibes — nie Name/Avatar. Erst nach gegenseitigem Interesse wird die Identität sichtbar. Intern kennt die App immer den echten Account (gegen Spam/Missbrauch — keine echte Anonymität).
- **Chat erst nach gegenseitigem Interesse.** Einseitiges Interesse erzeugt nur den Status "Interesse gesendet".
- **1-Tap-Start, verfeinern danach.** "Jetzt sichtbar werden" startet sofort mit Defaults (5 km, 1 h) — dieselbe Lektion wie beim Offen-Status, nie ein Setup-Wizard davor. Verfeinerung (Radius-Chips 1/3/5 km, exakter nativer Time-Picker "bis HH:MM", prominenter Freitext, Vibe-Chips) lebt in der eingeklappten `SocializeSetupCard` (collapsed by default, Muster der OpenStatusCard).
- **Sichtbarkeit endet automatisch** (`expiresAt`, Auto-Expire-Timer im Provider).
- **Matches überleben das Sichtbarkeits-Ende** (Cold-Start-Entscheidung): Interesse/Match/Chat verfallen NICHT, wenn eine Session abläuft.
- **Gruppen:** kein automatisches Zusammenwürfeln per Algorithmus. Zwei Wege: (a) gemeinsam sichtbar werden (du + Freunde als Mini-Gruppe, "N Leute in deiner Nähe"-Card), (b) offene Matches (mehrere Interessierte → kleiner Gruppenraum, Teilnehmerlimit-Mechanik wie bei Aktivitäten). Discover-Cards haben `kind: 'person' | 'group'`.

**Einstieg & Identität:** zweites Segment im `FloatingModeSwitch` (Karte · Socialize, Icon `sparkles-outline` — der Kalender ist KEIN Pill-Segment mehr, er öffnet über die Top-Bar); `MainMode` enthält `'socialize'`. Eigene Akzentfarbe `SOCIALIZE_COLOR = '#B07CFF'` (Violett) — auch das Highlight im ModeSwitch wird violett, damit sofort klar ist, dass man in der Fremden-Welt ist. Der Screen ist immer dunkel (`#0E1116` + violette Washes, wie der Composer).

**UI-Zustände (`SocializeScreen`):** Nicht sichtbar → Hero (pulsierender Glow-Ring, 3 Value-Rows: privat bis Match / nur grobe Entfernung / endet automatisch, CTA "Jetzt sichtbar werden" + Default-Hinweis). Sichtbar → `SocializeSetupCard` (Summary "Sichtbar · 5 km · bis HH:MM" + Stopp) über dem Discover-Feed (`DiscoverCardView` mit Interesse-CTA → "Interesse gesendet" → MATCH-Badge + "Chat öffnen" → `MatchChatSheet` mit Safety-Hinweis "öffentliche Orte").

**Backend (später, dokumentiert in docs/backend-plan.md):** Socialize läuft NIE direkt Client→Firestore. Alle kritischen Aktionen (Session starten, Interesse, Match, Room, Melden, Blockieren, Rate Limits) über Cloud Functions. Aktuell rein clientseitiger Mock: `SocializeProvider` + `SOCIALIZE_SEED` (autoMatch-Karten erwidern Interesse nach ~2,4 s als Demo). Safety-Regeln von Anfang an einplanen: Blockieren/Melden, keine Bilder/Links am Anfang, neue Accounts begrenzen, Altersfrage vor Realbetrieb.

---

## Auth Screen

- Headline: `"Freie Zeit wird gemeinsame Zeit."`
- Subtitle: `"Sieh, wer offen ist. Teile einen Plan. Kommt spontan zusammen."`
- `"Als Gast ansehen"` calls `signInDemo()` and remains available in mock mode and against the local Emulator Suite. **Produktentscheidung Juli 2026 (aktualisiert):** Es gibt keinen Gastmodus im Produktivsystem — `firebaseAuthService.signInDemo` lehnt den Aufruf ab, sobald die App gegen ein echtes Cloud-Projekt läuft (`USE_EMULATORS` in `src/shared/services/firebase.ts`), mit einer Fehlermeldung, die zur E-Mail-Anmeldung verweist. Ein passendes zweites Release-Gate (`FUNCTIONS_ENFORCE_EMAIL_VERIFICATION`, siehe docs/backend-plan.md → Schritt 8) verlangt serverseitig ein bestätigtes `email_verified` für alle schreibenden Callables außer Safety/Heimweg, `claimUsername`, `blockUser`/`unblockUser`/`reportUser` und `deleteMyAccount`.
- **Brand typeface = Schibsted Grotesk** (bundled via `@expo-google-fonts/schibsted-grotesk`, loaded in `_layout.tsx` behind `SplashScreen.preventAutoHideAsync()` so the wordmark never flashes in a system-font fallback). Wordmark and display copy use 700; controls use 700/600/500. With static font files set `fontFamily` only — never combine with `fontWeight` (Android synthesizes).
- **The circle/ring and woven-ribbon concepts are RETIRED (Nutzerentscheidung Juli 2026).** `AnimatedLogo`, `LegacyAppBootScreen`, `LegacyTogetherLoader`, `WovenTogetherMarkLegacy`, `AuroraBackdrop` and `AuthScreenLegacy` exist only for rollback and must not be imported by an active surface. `TogetherLoader` uses the custom `t` with one quiet travelling highlight and keeps the established `size`/`tile` API. `AppBootScreen` always shows the integrated wordmark on the abstract route field. The native splash is a plain `#070910` stage until React can render the animated vector wordmark.
- **Backdrop = abstract route field (`BrandBackdrop`), never a literal fake map.** A deep ink gradient, two low-contrast flowing ribbons, hairline routes and a single travelling light reference movement and shared journeys. No radial circle glows, location pins, map blocks or decorative dots. Reduced motion keeps the field static.
- **Landing choreography:** custom `t` draws immediately; `ogether` follows at ~470 ms, copy rises at ~680 ms, actions at ~1.04 s. Motion uses a restrained ease-out and never blocks interaction.
- **The form sheet auto-focuses the e-mail field** (`autoFocusEmail` on `EmailAuthForm`) so the keyboard comes up as the sheet slides in.
- **Two-step structure (landing + sheet), NOT a form on the first screen.** The centered integrated wordmark leads to a bottom action stack: white `Mit E-Mail fortfahren`, glass `Als Gast ansehen`, then one compact privacy statement. The segmented Einloggen/Registrieren form opens in the standard dark bottom sheet with the small custom `t` and remains scrollable with the keyboard open.
- **Focus states:** `GlassField` accepts a per-surface accent; brand v2 uses `#7C83FF`, while legacy defaults remain unchanged. Errors render as a soft red chip, never bare text. Submit remains a clear white action with an arrow.
- **RootNavigator MUST use `Stack.Protected` guards** (single `<Stack>`, both screens guarded). Returning two separate `<Stack>` trees crashes on sign-out: the router still shows "(tabs)" for one frame after the providers unmounted → "useX must be used within XProvider". Chat write actions in `ChatProvider` go through `fireAndForget` (catches + warns) — never `void promise`.

---

## Activity Composer

- **Modes offered: `now` and `soon` only.** `open` is not creatable here (it's the presence toggle in the NearbySheet). `ActivityModeSwitch` shows two segments; the create FAB opens the composer in `now` by default. The FAB opens the composer **directly** — there is no create speed-dial menu anymore.
- **Name (required):** The first field in the scroll content is the activity `title`, labelled "Aktivitätsname" — no asterisk (there is no required-field legend); placeholder is a generic instruction ("Name eingeben"), never a concrete example activity. It is mandatory — `validateActivityDraft` rejects an empty/whitespace title first ("Gib deiner Activity einen Namen."). This name is what shows at the top when the activity is opened (`MarkerDetailSheet` title / marker `label`). (`SuggestionChips` exists in `@/shared/components` but is currently not mounted anywhere.)
- **`title` vs `description`:** `title` = the short activity name (top of the sheet, preview-card headline). `description` = the optional note field. Never use `description` as the title. The composer's "Details (optional)" section (Kategorie chips + Hinweis/`description` input) was deliberately removed for now — `description` stays in the data model but is currently not editable in the composer.
- **Location default:** Always `mockCurrentPlace` (Aktueller Standort) — never "Ort noch offen"
- **"Auf Karte auswählen"** uses the same plain glass style as "Aktuellen Standort verwenden" (no colored wash)
- **Teilnehmerlimit (`ParticipantLimitField`):** own section "Teilnehmer" directly below Sichtbarkeit (NOT inside the "Details (optional)" accordion). Default is unlimited (`draft.maxPeople` undefined). UI = progressive disclosure, same idiom as the OpenStatusCard location toggle: a "Teilnehmer begrenzen" switch row — off shows no number controls at all; switching on activates the limit at the default (8) and unfolds a −/+ stepper below, clamped **2–50** (participants incl. host). Never render a ghosted-but-tappable stepper next to the off state (tried and removed — disabled-looking controls that react to taps are an affordance contradiction). The limit IS editable in edit mode (unlike visibility). Persisted as `maxParticipants` on the activity doc; `null` in an update removes the field (back to unlimited — mock and Firestore behave identically). Rules validate 2–50 and enforce on join that `participants.size() <= maxParticipants` (absent = 50 cap). `MarkerDetailSheet` shows "N von MAX Teilnehmer" and replaces the join CTA with a disabled "Voll · max. N Teilnehmer" state when full. Seed activities have no backing doc → always unlimited.
- **Avatar label scheme (map pins).** `AvatarMarker` shows one dark badge **bottom-centered ON the circle** (the same slot as `ClusterMarker`'s count badge — explicitly NOT a pill floating below the marker): the person's **name** for a solo activity (participant count ≤ 1), the **participant count** for a group (`"N dabei"`, or `"N/MAX"` when a limit is set) — for a lone friend the "who" is the useful bit; a group can't name everyone. `ClusterMarker` always shows its count badge (`N` or `N/MAX`). The avatar `captureKey` includes `displayName` so two friends who share an initial don't collide on a cached image.
- **Activity category (`ActivityCategory`, `utils/activityCategories.ts`, `utils/activityUnderstanding.ts`, `data/activityCategoryKnowledge.json`).** Optional; currently set ONLY via title auto-detection (the manual `CategoryPicker` chips are unmounted, see Kategorie below). The title field may auto-apply a category via local activity understanding (large curated German/English example list + keyword boosts + ambiguity thresholds) as long as the user has not manually touched the category; manual chip selection always wins and is never overwritten while the sheet is open. Valid values: Essen/Drinks/Kaffee/Sport/Outdoor/Feiern/Kultur/Spiele/Lernen/Chillen/Shopping/Sonstiges. Keep new examples and keyword patterns in `activityCategoryKnowledge.json`, not inline in components. The knowledge base must handle full phrases AND single-word inputs (`Bier`, `Kino`, `Gym`, `Bib`, `Zocken`, `Chillen`, `coffee`, `hike`, `thrifting`, etc.). `npm run test:activity-understanding` evaluates the same knowledge base with `Xenova/multilingual-e5-small` and includes regression cases plus separate holdout cases. Treat exact/keyword/regression scores as coverage, not proof of generalization; the fair quality signal is the holdout/free score printed by the script. Once a holdout miss is promoted into `activityCategoryKnowledge.json`, that case becomes regression/coverage, so create fresh holdout cases for the next honest blind measurement. Direct on-device model loading is a separate packaging decision and must not be slipped into the runtime path casually. Deliberately NOT from Google Places (`onPoiClick` has no `types`; Place Details costs per call): this describes the ACTIVITY, not the venue. On markers it renders as a 24px dark icon badge **top-right**; on `AvatarMarker` the unread badge shares that slot and WINS while unread > 0. Validated as an enum in firestore.rules.
- **Activity understanding maintenance:** when expanding category knowledge, curate from real user language: German/English synonyms, slang, common phrases, venue/activity names, and ambiguous edge cases. Prefer adding multiple representative examples plus targeted keyword boosts over relying on embedding similarity alone. Add or refresh `web_stress_*` / holdout cases in `scripts/evaluate-activity-embeddings.mjs` whenever new vocabulary is introduced, and report exact/keyword/free counts honestly.
- **Classifier architecture — two-tier, embedding deferred.** The shipping runtime is `classifyActivityTitleHybrid`: **Tier-1** = lexical token-overlap + keyword boosts (instant, offline, no model) — this is what ships and what `PROTO_STRATEGY=lexical node scripts/evaluate-activity-embeddings.mjs …` measures. **Tier-2** = an on-device e5-small embedding fallback (`top3`), consulted only when Tier-1 is ambiguous and wired via `registerEmbeddingFallback(...)`; **currently unregistered → the app runs pure Tier-1**. The eval's _default_ (`top3`, e5-small embeddings) is the target/validator for Tier-2, NOT the shipping path — the runtime is lexical (`PROTO_STRATEGY` also supports `compare` for centroid/max/top3). Honest generalization on a fresh unseen-slang holdout: Tier-1 ~27%, Tier-2 ~45%; both ~100% on normal inputs; both **abstain rather than guess wrong** on hard slang (the user can always override the chip). Tier-2 is **deferred** because e5's tokenizer is SentencePiece Unigram + a binary Precompiled charsmap (17 MB vocab) with no clean/low-risk JS path, and the model is ~120 MB. When revisiting: keep the model out of git (fetch at build → embed in the APK); tokenizer options in preference order — (a) `onnxruntime-extensions` native SentencePiece, (b) transformers.js tokenizer in-app, (c) switch to a WordPiece model and re-validate the eval. `EXPORT_VECTORS=1` regenerates the per-example vectors the Tier-2 provider will need. On-device _generative_ LLMs were measured and rejected (Llama-3.2-1B 32%, Qwen2.5-1.5B 47% on the honest holdout — worse than Tier-1, +0.7–1 GB, ~2–6 s/inference).
- **Countdown ring (`utils/countdown.ts`).** `now` activities with a usable `startsAt`→`endsAt` window render their mode ring as a depleting clock: remaining share as a vivid SVG arc (starts 12 o'clock, clockwise), elapsed share as the faded border track (`colorWithAlpha(mode, 0.25)`). The fraction is **quantized to 8 steps** (`countdownBucket`) and included in the `captureKey`, so cached marker images only re-capture on a step change (driven by the provider's 30s mode tick). `soon`/ring-less markers keep the plain full border.
- **Kategorie (`CategoryPicker`):** icon-chip row (Essen/Drinks/Kaffee/Sport/Outdoor/Feiern/Kultur/Spiele/Lernen/Chillen/Shopping/Sonstiges from `ACTIVITY_CATEGORIES`); single-select, tap-again deselects; selected chip = mode accent via `style`. **Currently NOT mounted in the composer** (the "Details (optional)" section was removed for now) — the category is only set automatically from the title (see Activity category above) and still persists as `category` on the doc (enum-validated in rules) and renders as the marker's top-right icon badge.
- **"Aktivität übernehmen" button:** Uses `style={{ backgroundColor: accent }}` — never `AppButton` or Tailwind color classes (class-order conflict)
- **Sichtbarkeit (`VisibilityPicker`):** quick-select "Alle Freunde" and, if any close friends are marked, "Enge Freunde" (populates `includeUserIds` from `useCircles().closeFriendUids`, `base: 'custom'` — no `ActivityVisibility.base` variant needed for this), a Circles multi-select, and an individual "Personen" checklist. A single search field filters both the Circles chips and the Personen list live (client-side, no backend write).

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

---

## Mock Data Overview

| File                                 | Contents                                                    |
| ------------------------------------ | ----------------------------------------------------------- |
| `src/data/mock/mockUsers.ts`         | `mockMapUsers` (avatar data for map markers)                |
| `src/data/mock/mockMapMarkers.ts`    | `mockMapMarkers`, `mockMarkerClusters`                      |
| `src/data/mock/mockPlans.ts`         | `mockPlans` (calendar entries)                              |
| `src/data/mock/places.ts`            | `mockComposerPlaces`, `mockCurrentPlace`                    |
| `src/data/mock/mockNearbyFriends.ts` | `mockNearbyFriends` — friends across the two location tiers |
| `src/data/mock/mockChats.ts`         | `mockActivityChats` — seed messages keyed by activity id    |

**`mockNearbyFriends` rules:**

- `pin` friends MUST have a `coordinate` field for map navigation AND a matching entry in `mockMapMarkers` (with `friendId`) at the exact same position. The coordinate is derived from the marker's `{x, y}` using `mockPositionToCoordinate`. If you move the marker position, recalculate the coordinate — otherwise navigation lands in empty space.
- Formula: `lat = 52.5208 - ((y-50)/100) × 0.08`, `lon = 13.4095 + ((x-50)/100) × 0.065`
- `none` friends have NO `distanceKm` and NO `coordinate` (genuinely no location basis; never counted as nearby)
- Distances are in km from the mock user's position (Berlin Mitte)
