# Release-readiness audit backups · 2026-08-18

This directory contains the exact pre-audit version of every existing file
changed by the release-readiness audit. Paths below `files/` mirror the
repository root.

`manifest.tsv` records the repository-relative source path, UTC backup time,
source SHA-256 and copied-file SHA-256. `backup-file.ps1` refuses to replace an
existing backup, so the first captured version remains authoritative.

