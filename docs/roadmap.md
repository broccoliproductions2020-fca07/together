# Mica roadmap

The roadmap is constrained by the implemented product and release architecture.
Development uses the Firebase Emulator Suite; staging is a separate native app
against the Firebase development project; production uses its own Firebase
project.

## Release-critical work

1. **Identity and account safety**
   - real-device registration, email verification, account deletion and avatar
     upload checks
   - App Check rollout for staging before enforcement in production

2. **Meetup lifecycle**
   - activity creation, editing, joining, leaving, cancellation and expiry
   - participant limits, retained chat lifecycle and calendar consistency

3. **Location and movement**
   - real-device permission, coarse presence and place search checks
   - explicit Anreise and Heimweg sessions, including automatic stopping and
     OS-visible background behavior

4. **Operations**
   - Firebase TTL policies, budget alerts, Cloud Functions monitoring and
     Crashlytics verification
   - staging binary validation and protected tagged production release

## Deliberately deferred

- Socialize is deleted from the client (September 2026). The server callables stay
  disabled behind `SOCIALIZE_ENABLED = false`; remove them on the next functions
  deploy. Reviving it means rebuilding the surface, not re-enabling a flag.
- New always-on listeners, permanent chat history, public rankings and hidden
  location tracking are outside the product contract.
