---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S25'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify store state survives restart and schema mismatch fails loud through tests and manual database inspection

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/`

## Description

- Verify restart behavior through a real on-disk database reopen test.
- Verify schema metadata through direct `sqlite_master` and metadata-row queries
  inside the focused store tests.
- Verify schema mismatch behavior through `PRAGMA user_version = 99` tests.
- Verify corrupt migration metadata and missing metadata fail loud.
- Verify the environment does not provide an external `sqlite3` CLI; use the
  real SQLite assertions in the Rust tests as the database inspection evidence.
- Run focused store tests, full `vaultspec-api` library tests, and the Rust lint
  gate.

## Outcome

Store state survives restart through the on-disk fixture, and schema mismatch
fails loud without deleting or rewriting the product-state database.

## Notes

Verification after fixes: focused store tests passed, full `vaultspec-api`
library tests passed with 186 tests, and `just dev lint rust` passed.
