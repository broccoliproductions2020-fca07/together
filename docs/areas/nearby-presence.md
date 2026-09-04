# Nearby & Offen-Status

Ausgelagert aus `AGENTS.md`. Lies diese Datei, wenn du an diesem Bereich arbeitest.

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

**An open friend gets NO map pin (August 2026).** `pin` visibility still decides whether they count as nearby and whether a distance is shown — the tiers are unchanged — but the map itself shows only activities. Open is a STATUS, not a place: a pin said "someone is here" without there being anything to go to, and a screenful of them buried the actual plans, which are the only thing on that map you can act on. The status lives where it can be acted on: the nearby pill and its sheet. The pill count was always viewport-independent and is unaffected.

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
  - **End time** ("Bis wann?"): `OpenExpiryPicker` uses the shared `TimeRangePicker` engine in `end-only` mode. The start is the fixed label "Jetzt" and cannot be dragged or accessibility-adjusted; touching the selected bar controls only the end. Live dragging stays local and only release commits the absolute `expiresAt`, capped at 12 h and at the next Activity. Default on going open is +3 h (`OPEN_DURATION_MS`).
  - **Vibe**: the FIRST control in the expanded card (above "Bis wann?" — the "what" is the social headline, time is just the frame): a **free-text field only** (placeholder "Egal"). **No vibe set displays as "Egal"** in the collapsed summary ("Du bist offen · Egal · bis HH:MM"): a pure display convention — the data stays `null`, never write a magic "Egal" label into the presence doc. Free text carries a `label` only (no emoji).
  - **Location** ("Standort"): a toggle "Standort teilen" → `shareLocation`. (Wording rule: never call this "Für Freunde sichtbar" — you are ALWAYS visible to friends while open; the toggle only controls whether your coarse position/distance is shared.) On = friends see you on the map (`pin`); off = you appear in the list only, no location (`none`) — same two-tier model as `LocationVisibility`. **Privacy-first: resets to off each time you go open** (explicit opt-in per session). A small navigate icon shows in the collapsed summary when sharing.
  - **Corner radii are assigned by role, not picked per screen.** `src/global.css` defines the scale (`--radius-sm: 12`, `--radius-md: 16`, `--radius-lg: 20`, `--radius-xl: 28`) but a scale alone does not stop drift: the same kind of input field was 16 in the composer and 12 in this card, which is the sort of thing that reads as unconsidered without anyone being able to name why. The rule: **an input/tap field is 16, the card containing it is 20.** Nesting still decreases inward — that part was never the problem; the disagreement across screens was.
  - **The rule:** every field stays OPTIONAL and pre-filled — nothing may become required. What is forbidden is a field you have to fill in, or even look at, before you can go open. This is why the closed card carries no form at all.
  - **The pill mirrors the window, not just the state.** While open, the map pill reads "Offen bis HH:MM" and carries a countdown ring that shortens as the window runs out — the same visual language as a `now` activity marker's ring (`ActivityMarkerChrome` → `CountdownRing`), because an open status expires exactly like an activity does. The fraction comes from `openedAt`→`expiresAt`; `openedAt` is local-only (`PersistedStatus`) and never written to the presence doc — friends have no use for when your window started. Ticks once a minute. The ring's `<Svg>` MUST stay wrapped in a `View pointerEvents="none"`: it covers the pill exactly, `pointerEvents` is not a prop the native Svg host honours, and unwrapped it swallowed every tap on the pill in the one state it renders — locking you out of the sheet precisely when you needed it to end your status.
    State lives in `useOpenStatus()` (`src/features/presence/`), persisted + auto-expiring, and **backed by the `presenceService` seam** (Firestore `presence/{uid}` — see docs/backend-plan.md → Presence). The provider writes your own presence through the seam (going private removes `coarseLocation`; going off deletes the doc) and subscribes to friends' open presence (`openFriends`). The nearby pill/list are driven by real presence (`presenceToNearby`, Haversine distance to your own location), filtered through `nearbySelectors`. The user's own open status is shown in the card only; it does NOT inflate the friends' nearby count. The pill that opens this sheet stays permanently visible (chosen model: always-visible count for liquidity, with the "become open" nudge reciprocity-style but not gated).
- Compact `RadiusSlider` sits directly under the open-presence card; changing it re-filters `friends` live (via shared `radiusKm` context → MapScreen re-render → new props).

---

