# Mica product overview

Mica helps confirmed friends meet more spontaneously. A person can be open,
plan something soon or be doing something now; the app helps the right people
notice and coordinate a real meeting without becoming a public social feed.

## Product principles

- No public feed, follower counts or likes.
- An activity is visible in one private context: all direct friends, close
  friends or one saved Circle. It is not a broadcast to strangers.
- Chat belongs to an activity or temporary planning round, never to a permanent
  general messenger.
- Location is coarse, opt-in and expiring. No location means no distance and no
  map/navigation target.
- Activity and group chat histories are deliberately short-lived.

## Current product surfaces

- **Map:** open friends, concrete activities, place selection and Journey/Safety
  focus when explicitly activated.
- **Calendar:** activities the user has joined or accepted.
- **Profile:** account, privacy, notification and appearance controls.
- **Friends and Circles:** confirmed friendships and private visibility lists.

Socialize is not mounted or released in the current app. Its server callable
surface remains disabled until it has a deliberate product, safety and data
retention release decision.

## Backend contract

Firebase Auth, Firestore, Storage, Realtime Database and Cloud Functions are
the only backend. The Firebase Emulator Suite is the local development target;
staging uses the Firebase development project and production has its own
project. There is no client mock backend.

See [data-model.md](./data-model.md) for persisted entities and
[release-process.md](./release-process.md) for the release flow.
