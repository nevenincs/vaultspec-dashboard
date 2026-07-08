---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S30'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify every mutating command can run inside one explicit unit of work

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`

## Description

- Iterate `CommandKind::ALL` through the unit-of-work command classifier.
- Execute every mutating command through `Store::with_unit_of_work` against a
  real SQLite probe table.
- Verify read/context/stream commands are rejected from the mutating
  unit-of-work boundary.
- Verify the probe table row count equals the mutating command count.

## Outcome

Every current mutating semantic command can run inside one explicit unit of
work, and non-mutating read/stream commands are excluded.

## Notes

This verifies the W02.P06 transaction boundary only. Later phases still decide
idempotency scopes, outbox rows, and domain repository methods.
