# Aktivitäten — Detail, Beitreten, Verlassen

Ausgelagert aus `AGENTS.md`. Lies diese Datei, wenn du an diesem Bereich arbeitest.

---

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

**Editing an existing activity (host-only, fix-a-mistake flow):** `MarkerDetailSheet` shows a small "Bearbeiten" pencil next to the mode line when `canEdit` is true (the current user is the activity's host — `selection.hostId === currentUid`). It reopens `ActivityComposerSheet` with `editing` + `initialDraft` (built by `useActivityEntities().getEditableDraft(id)`), and submits via `updateActivityFromDraft(id, draft)` instead of creating a new activity.

**The audience IS editable after creation (Produktentscheidung September 2026; reverses "the Sichtbarkeit picker is hidden in edit mode and must stay hidden").** Choosing who may see a plan is a decision people revise — someone gets added to the evening, someone should not have been on the list — and locking it meant the only way to fix it was to cancel and rebuild the activity, losing its chat and its participants. The old rule's real concern was never "the audience must not change"; it was **"an unrelated edit must not change it silently"**, and that is now what the mechanism enforces instead:

- **The client sends a CONTEXT, never a uid list.** `ActivityDocUpdate.audienceContext` goes through the same `parseAudienceContext` → `audienceForContext` path creation uses, so the server re-resolves it against the host's own confirmed friendships. A raw `audienceUids` on an update is still rejected outright — that is the difference between changing who may see it and being trusted on who they are.
- **It is sent only when it actually changed**, and the comparison looks at the FRIEND half of the stored audience alone. Comparing the whole list would report a change on every save, and re-resolving on a title fix would quietly pull in friends added since — exactly the silent widening the lock existed to prevent.
- **Two groups survive every audience edit.** PARTICIPANTS, because someone who already joined would otherwise lose the activity and its chat out from under them; and GUESTS (`inviteFriendToActivity`), who were vouched for by a participant and are not necessarily the host's friends at all, so the host's picker cannot express them. What the host edits is precisely what the host can address.
- Nobody is notified by an audience change: publication is passive by design (being in an audience is not an invitation).

`getEditableDraft` therefore seeds the REAL audience (`doc.audienceUids` minus the host), never `createDefaultVisibility()` — that default was harmless only while the picker was locked and would now widen every activity to all friends on any save. `getEditableDraft` returns `null` for expired activities and other people's activities — no edit affordance shows for those. **The draft is seeded with the STORED `doc.mode`, never the resolved one** — `updateActivityFromDraft` writes `mode` back whenever it differs from the document, so seeding it with the display mode turned every typo fix on a started `soon` activity into a permanent conversion to `now`. Since `now` activities have no Anreise (see Journey section), that silently stripped a running Anreise off a plan. The resolved mode still drives how the form reads the time fields (`expiresInMinutes`); it must never drive what gets written.

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

Time/place rows only render when the field is present. No placeholder copy, no fake chat mockup, no redundant intent sentence. **Button labels on an accent fill use a contrast-safe foreground** — `onColorTextColor(accent)` from `src/shared/utils/contrastColor.ts`, NOT hard-coded white: white on the mid-tone mode accents (`now` #41C08D, `soon` #E0A23E, `open` #3B82F6) measures ~2.2–3.7:1 and fails WCAG AA, so the helper drops to dark ink on those. (Superseded the old "white text on accent, never dark text" rule for accessibility.) **The mirror-image case is `onTintTextColor(accent, surface, alpha)`, for an accent printed as INK** — `SquircleButton`'s `tonal`/`outline`/`ghost`/`destructive`, where the label is the accent itself on a bare card or on a low-alpha wash of the same colour. Measured before it existed: `soon` 1.98:1 and `now` 2.02:1 on the light card, i.e. label and icon drawn but invisible, so the button read as EMPTY rather than as low-contrast — the exact report that found it was "in dem Button steht nichts". On the dark card those same pairings measure ~5.5:1 and look fine, which is why it survived; the default accent `#0E3B2E` failed the other way round at 1.30:1 in dark. The helper walks the accent toward black or white — whichever way the composited fill demands — so a darkened amber is still amber, and it always terminates at an endpoint that passes. **Non-solid variants therefore need the real `surface` prop wherever the scheme can change** (`useThemeColors().card`); the `#FFFFFF` default is only right for half the schemes. `onColorTextColor` also picks the BETTER of ink and white when neither clears 4.5:1 — it used to fall through to ink unconditionally, which chose the worse colour in exactly the case that needed help (Safety pink `#C45178` and red `#D64557`, the two accents no black-or-white label can carry to AA; reaching it there needs a darker palette, which is a product decision). `npm run test:button-contrast` measures every accent × variant × scheme against the real helper and runs in `verify:release`. Chat bubbles and iOS-style notification badges deliberately keep white-on-colour as a convention. Place selections are separate: they keep map/route/create-at-place actions and never show join/chat. **`PlaceContent` is a COMPACT action-first bar (August 2026), not a full sheet:** icon + place name + one prominent "Aktivität hier starten", with Route and "In Karten öffnen" as 52px icon buttons beside it. Rationale: a POI tap is an ambiguous, easily-mistapped gesture, so the response must stay cheap to dismiss — never auto-open the full composer on a POI tap. Dismissal is a tap on the empty map (`onCanvasPress` → `setSelection(null)`); the sheet deliberately renders with `pointerEvents="box-none"` and has **no blocking backdrop**, so tapping another marker switches selection directly instead of forcing a close first. Do not add a full-screen backdrop.

