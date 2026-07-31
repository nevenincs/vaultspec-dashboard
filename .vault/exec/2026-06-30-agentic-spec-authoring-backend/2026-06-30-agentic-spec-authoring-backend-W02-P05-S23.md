---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
body_hash: 'sha256:ff32171443cc297457f4018d315d20e48b0b05be8bcaeaa2e06617e06145fea1'
step_id: 'S23'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add real store tests for migration ordering, clean open, version mismatch, and corrupted migration metadata

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/`

## Description

- Add a path test for the dedicated authoring product-state database location.
- Add real on-disk database tests for clean open, metadata creation, table
  presence, and restart survival.
- Add a real database migration-ordering test proving invalid migration order
  fails before authoring DDL is created.
- Add fail-loud tests for future `user_version`, missing metadata, tampered
  migration names, duplicate migration rows under a corrupt table shape, and
  corrupt database headers.
- Add a future-version regression proving authoring DDL is not created before
  the schema-version gate.

## Outcome

The focused authoring store test set covers W02.P05 with real SQLite files and
restart behavior. It avoids mocks, stubs, skipped tests, and duplicated business
logic.

## Notes

Focused store tests pass with 9 tests after the review fixes.
