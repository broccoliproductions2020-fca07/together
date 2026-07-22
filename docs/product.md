# Together — Product overview

Together helps friends come together spontaneously. People can show that they
are open, plan something soon or are doing something now. The app coordinates
real groups without turning their lives into a public feed.

## Product principles

- No public feed, follower counts or likes.
- Activities are published passively in exactly one private visibility context:
  all direct friends, close friends, or one saved group. There are no Activity invitations.
- Chat exists inside Activities and temporary planning rounds, not as a permanent global inbox.
- Locations are coarse, opt-in and expiring.
- Open presence never exposes an exact place unless the user explicitly shares a pin.
- Socialize is a separate, consent-based area for meeting new people.

## Core product surfaces

- **Karte:** open friends, active Activities, places and Journey focus.
- **Kalender:** only Activities the user accepted or joined.
- **Socialize:** private discovery, mutual interest, match chat and safety controls.
- **Profil:** account, avatar, notification settings, radius, theme and Circles.

## Product domains

Activities support creation, editing, joining, leaving, cancellation, participant
limits, activity chat, proposals and automatic expiry. Private groups are
owner-only friend lists; they never notify their members or require acceptance.
Account data can be edited, verified,
exported through backend operations and deleted permanently.

Firebase Auth, Firestore, Storage, Realtime Database and Cloud Functions form
the production backend. The Firebase Emulator Suite is the local development
environment. Mock mode is an offline fallback for UI work and tests, not the
product contract.

See [roadmap.md](./roadmap.md) for the current product workstreams and
[data-model.md](./data-model.md) for storage decisions.
