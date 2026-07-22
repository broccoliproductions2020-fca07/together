# Together — Data Model (first thoughts)

This is an early sketch, not a final schema — superseded in practice by each
feature's own `types.ts` (see [AGENTS.md](../AGENTS.md) for the current,
maintained spec). Mock seed data lives in
[`src/data/mock`](../src/data/mock).

## Entities

### User

A person using the app.

| field         | type    | notes                     |
| ------------- | ------- | ------------------------- |
| `id`          | string  |                           |
| `name`        | string  | short handle / first name |
| `displayName` | string? | optional fuller name      |
| `avatarUrl`   | string? | optional avatar           |

### Private Group

A private, owner-only list of confirmed friends. A group can be the one
visibility context of a concrete Activity; members are neither notified nor
made mutually visible by the list itself.

| field       | type     | notes                     |
| ----------- | -------- | ------------------------- |
| `id`        | string   |                           |
| `name`      | string   |                           |
| `emoji`     | string?  | lightweight visual marker |
| `memberIds` | string[] | ids of confirmed friends  |

### Activity

An expression of availability/intent in one of three modes.

| field       | type                  | notes                                            |
| ----------- | --------------------- | ------------------------------------------------ |
| `id`        | string                |                                                  |
| `hostId`    | string                | creator                                          |
| `mode`      | `open \| soon \| now` | the core mode                                    |
| `title`     | string?               | optional for a bare `open`                       |
| `note`      | string?               | optional free text                               |
| `audience`  | context               | exactly one: all friends, close friends or group |
| `startsAt`  | string?               | ISO 8601, used by `soon`                         |
| `location`  | `ActivityLocation?`   | only while active; never for bare `open`         |
| `createdAt` | string                | ISO 8601                                         |

`ActivityLocation` is deliberately coarse and carries an optional `expiresAt`,
encoding the rule that **location is time-limited and only shared while an
activity is active**.

### Planning Round

A temporary conversation before a concrete Activity exists. It has its own
participants and an ephemeral chat room; it can explicitly open for drop-ins.

| field            | type                | notes                    |
| ---------------- | ------------------- | ------------------------ |
| `id`             | string              |                          |
| `activityId`     | string              | the originating activity |
| `title`          | string              |                          |
| `participantIds` | string[]            |                          |
| `startsAt`       | string?             | ISO 8601                 |
| `location`       | `ActivityLocation?` |                          |
| `createdAt`      | string              | ISO 8601                 |

### ChatMessage

Chat is **never a general messenger**. Messages only live inside the room of a
single activity or plan.

| field       | type   | notes                             |
| ----------- | ------ | --------------------------------- |
| `id`        | string |                                   |
| `roomId`    | string | id of the owning activity or plan |
| `authorId`  | string |                                   |
| `text`      | string |                                   |
| `createdAt` | string | ISO 8601                          |

## Open questions for later

- How exactly does a planning round transition into an Activity?
- Location precision tiers (exact vs. area) and retention/expiry rules.
- Backend mapping to Supabase tables + row-level security policies.
