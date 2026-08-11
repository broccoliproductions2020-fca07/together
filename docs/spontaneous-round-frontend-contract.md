# Spontane Runde — Frontend Contract

This document is the UI handoff for the existing Firebase-backed spontaneous
round flow. The client must use the `useActivityChat()` seam; it must not read
or write `spontaneousRoundInvites`, `spontaneousRoundMemberships`,
`groupOpenings`, `chats`, or `notifications` directly for these actions.

## Invite confirmation

An inbox card of kind `spontaneous_round_invite` contains `roomId`, which is
the round id. On a deliberate card tap, call:

```ts
const preview = await getSpontaneousRoundInvitePreview(notification.roomId);
```

This is a one-off callable, not a subscription. Do not prefetch it for every
inbox card and do not add a listener. It returns either `null` (the invitation
is no longer valid for this account) or:

```ts
{
  roundId: string;
  host: { uid: string; displayName: string; initials: string };
  memberPreview: Array<{ uid: string; displayName: string; initials: string }>;
  memberCount: number; // can be larger than memberPreview.length
  expiresAt: number;
}
```

Show a confirmation sheet before joining:

- Header: `Hannes startet eine spontane Runde`
- Context: `Hannes hat dich eingeladen`
- Up to four initial avatars/names and `+ N weitere` from `memberCount`
- A short, honest line: `Ihr kennt euch vielleicht nicht alle. Ihr trefft euch über Hannes.`
- Primary: `Dabei sein`
- Secondary: `Nicht jetzt`

`Dabei sein` calls `acceptSpontaneousRound(roundId)`. On success, open the
existing round sheet or chat. `Nicht jetzt` calls `declineSpontaneousRound(roundId)`;
it is intentionally silent to the starter and removes only the recipient's
private invitation and inbox card. If the preview is `null`, close the sheet
and remove the stale card locally; do not show a retry loop.

No participant is a friend automatically. The preview is deliberately limited
to the minimum public identity (name/initials), contains no location and does
not grant chat access until the recipient accepts.

## Forming round

After the first acceptance, the pre-existing `SpontaneousRoundSheet` receives
the member list through the single bounded active-round listener. The sheet
can offer:

- `Chat öffnen`
- `Jetzt`
- `Später`
- `Runde verlassen` / `Runde schließen` for the starter

Do not add a separate member listener or a client-side join write. The server
enforces: direct friendship to the starter, no block, current availability,
one forming round per person, a 30-minute expiry and at most 21 people.

## Turning a round into an Activity

The existing `Jetzt` and `Später` actions pass the round id into the activity
composer. Any current round member may create the concrete Activity. The
server converts the *same* id and chat room into the Activity, retains its
messages and makes all current round members participants. Do not create a
second chat or copy messages in the client.

## Leaving an Activity

The existing `leaveActivity` callable now has server-side succession:

- A normal participant leaves alone.
- A host with other participants leaves and the longest-standing remaining
  participant becomes the new host.
- A host who is alone must cancel the Activity instead.

The new host receives an `activity_host_changed` notification. The current UI
copy promising this handover is therefore now true; no speculative client-side
host update is needed.
