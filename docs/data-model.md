# Together data model

This is a compact map of the persisted model. The executable authorities are
[`firestore.rules`](../firestore.rules), [`functions/index.js`](../functions/index.js)
and the feature service types; this document intentionally does not duplicate
validation limits.

## Firestore

| Collection | Purpose | Ownership |
| --- | --- | --- |
| `users/{uid}` | Private account settings, notification state and close-friend ids | User profile fields; trusted functions own server fields |
| `publicProfiles/{uid}` | Minimal contact snapshot | Created and synchronized by authenticated account flows |
| `friendships/{uidA__uidB}` | Accepted and pending one-to-one friendships | Cloud Functions |
| `circles/{circleId}` | Private lists of confirmed friends | Cloud Functions |
| `activities/{activityId}` | A concrete `soon` or `now` meetup | Cloud Functions |
| `chats/{activityId}` and `messages` | Ephemeral activity/group rooms and messages | Cloud Functions |
| `presence/{uid}` | Expiring open status | Owner writes their own status; readers are its audience |
| `notifications/{notificationId}` | Bounded in-app notification inbox | Cloud Functions |
| `blocks`, `reports`, `pushOutbox` | Moderation and trusted delivery workflow | Cloud Functions |

Activity documents carry the host, server-resolved audience snapshot,
participants, schedule, lifecycle timestamps and optional place. `open` is a
presence status, not a creatable activity.

### Activity place

An activity place has exactly one of these shapes:

```ts
{ label: string; latitude: number; longitude: number; visibility: 'pin' }
{ label: string; visibility: 'none' }
```

`pin` stores real WGS 84 coordinates and allows map rendering and Anreise.
`none` stores no coordinates at all. The client never converts live coordinates
into decorative screen positions before persisting or using them for distance
or arrival logic.

## Realtime Database

Realtime Database contains only last-point, short-lived live location state for
an explicitly active Anreise or Heimweg session. It is not a history store. The
corresponding Firestore activity/session limits define who can subscribe.

## Retention

Activity chat rooms retain data until twelve hours after the activity ends.
Open group rooms expire after thirty days without activity. Presence and
notification records also carry expiry fields. Firebase TTL policies are the
deletion backstop; clients still filter lifecycle state before rendering it.

## Server authority

The app does not grant clients direct authority to create activities, change
membership, mutate room summaries, resolve audiences or send notifications.
Those operations go through callable Cloud Functions, which validate input,
apply rate limits and write the authoritative document shape.
