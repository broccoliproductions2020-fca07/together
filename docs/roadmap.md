# Together — Product roadmap

Together is developed as a production product from the beginning. Firebase
Emulator Suite is used locally; staging and production are separate Firebase
projects. Mock mode is only an offline fallback and never defines the product
contracts.

## Product workstreams

1. **Identity and trust**
   - verified accounts, profile/avatar and account deletion
   - Circle invitations with explicit acceptance
   - block, report and abuse-handling flows

2. **Together activity lifecycle**
   - Open / Soon / Now presence and concrete Activities
   - create, edit, join, leave, cancel and expire
   - participant limits, chat retention and calendar commitment view

3. **Communication and delivery**
   - activity/group chats with proposals
   - in-app notification inbox
   - device push notifications and deep links

4. **Places and movement**
   - privacy-first coarse presence
   - place selection/search and external navigation
   - foreground-only Journey sharing with hard expiry

5. **Socialize**
   - private discovery until mutual interest
   - server-authoritative interests, matches and match chat
   - safety controls, rate limits and account protections

6. **Production operations**
   - Firestore, Storage and RTDB Rules tests
   - migrations and TTL policies
   - App Check, monitoring, crash reporting, performance and budget alerts
   - staging/release builds and automated end-to-end tests

## Non-negotiable principles

No public feed, no follower mechanics and no permanent general messenger.
Activities remain Circle-scoped, locations are coarse and expiring, and chat
retention is deliberately limited.
