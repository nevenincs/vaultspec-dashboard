---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S27'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement repository traits, transaction helpers, unit-of-work boundaries, and rollback-on-error behavior

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`

## Description

- Add `CommandKind::requires_unit_of_work` to distinguish mutating semantic
  commands from read/context/stream commands.
- Add `Store::with_unit_of_work` as the single transaction boundary for
  mutating authoring commands.
- Add `UnitOfWork` carrying the command and checked SQLite transaction.
- Add a minimal transaction-scoped `Repository` trait with `execute` and
  `query_row`.
- Add `SqliteRepository` adapters that all borrow the same transaction.
- Reject read-only command kinds before opening a mutating unit of work.
- Roll back the transaction on domain errors or SQLite errors and commit only
  on successful closure return.

## Outcome

The authoring store now has an explicit unit-of-work boundary ready for later
idempotency, outbox, and domain repositories.

## Notes

No idempotency, outbox, changeset, approval, or apply tables were added in this
phase.
