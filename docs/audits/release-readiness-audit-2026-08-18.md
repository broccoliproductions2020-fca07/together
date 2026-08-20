# Together release-readiness audit · 2026-08-18

## Status

Audit in progress. The current local Dev/Staging worktree is the executable
source of truth. No staging or production state is mutated by this audit.

## Scope and source hierarchy

The audit covers the full native client, Firebase services and seams, Cloud
Functions, Firestore/RTDB/Storage Rules and indexes, persistence, build and
release configuration, local operations tooling, tests, user-visible language,
accessibility, animation and the linked multi-user journeys.

Authority order used throughout:

1. Current executable code and configuration.
2. Firebase Rules and Cloud Functions as the server trust boundary.
3. Observed local/emulator behavior and executable tests.
4. `AGENTS.md`, `docs/backend-plan.md` and focused product/security documents.
5. Historical notes and prototypes.

Documentation claims are not accepted without checking the implementation.
The client is treated as untrusted.

## Initial worktree and environment

- Branch: `feat/together-core-menu`.
- The worktree was already extensively modified before the audit: 126 tracked
  paths in the initial diff summary (5,166 insertions, 3,778 deletions), plus
  multiple untracked source and design files. All are treated as user-owned
  Dev/Staging work and are preserved.
- Git initially refused the repository because of Windows ownership metadata.
  Audit commands use a per-command `safe.directory` override; global Git config
  was not changed.
- Active Node runtime: `22.16.0`; the repository release gate requires Node 20.
- No commit, push, deploy, EAS update, staging mutation or production access is
  authorized or performed.

The exact per-file snapshot is generated in
`release-readiness-inventory-2026-08-18.md`. Every pre-existing file changed by
the audit is copied first to
`backups/release-readiness-audit-2026-08-18/files/`; checksums live in that
backup directory's `manifest.tsv`.

## Baseline checks

| Check | Initial result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | Pass | TypeScript completed with exit code 0. |
| `npx eslint src --quiet` | Pass | ESLint completed with exit code 0. |
| `npm run check:node` | Blocked | Correctly rejected Node 22.16.0; Node 20 is required. |
| `npm run test:core-selection` | Pass | Adaptive Core gesture selection passed. |
| `npm run test:audience-selection` | Pass | 24 deterministic checks passed. |
| `npm run test:friend-search` | Pass | Normalization and index-field checks passed. |

## Component and module inventory

Pending detailed classification. The generated inventory is the exhaustive
file-level ledger; this section will map those units to owners, entry points,
dependencies, user journeys, risks and final audit status.

## Journey matrix

Pending.

## Findings

Pending. IDs use `RR-2026-###` and priorities P0–P3.

## Documentation contradictions

Pending.

## Fixes and regression coverage

Pending.

## Verification results

Pending final runs.

## Two-device staging checklist

Pending. Physical-device-only claims will remain explicitly unverified until
tested on at least two signed-in staging devices.

## Remaining risks and decisions

Pending.

## Go / no-go

Pending separate assessments for local development, staging and production.
