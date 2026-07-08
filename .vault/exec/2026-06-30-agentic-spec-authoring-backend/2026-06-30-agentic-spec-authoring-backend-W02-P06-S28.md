---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S28'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add transaction tests for committed commands, rolled-back failures, nested repository use, and concurrent writers

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`

## Description

- Add a committed-command test using a real on-disk SQLite store and probe
  table.
- Add rollback tests for both domain errors and SQLite constraint errors.
- Add a multiple-repository test proving separate repository adapters share one
  transaction.
- Add a full command-surface test proving every mutating `CommandKind` can open
  an explicit unit of work and read-only commands are rejected.
- Add a two-connection concurrent writer test using a real file-backed SQLite
  database.

## Outcome

Focused unit-of-work tests cover commits, rollbacks, nested repository adapters,
command coverage, and concurrent writer serialization without fakes or mocks.

## Notes

Focused unit-of-work tests passed with 6 cases. Full `vaultspec-api` library
tests passed with 192 cases, and `just dev lint rust` passed.
