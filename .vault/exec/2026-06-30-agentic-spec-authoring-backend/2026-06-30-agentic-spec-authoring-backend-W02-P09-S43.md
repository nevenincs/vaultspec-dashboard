---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S43'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add outbox primitive tests for commit atomicity, sequence monotonicity, worker restart, and duplicate suppression

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/outbox.rs`

## Description

- Add real SQLite tests for product-state plus outbox commit atomicity and rollback atomicity.
- Add sequence tests for append order, restart high-water behavior, and no reuse after event-row removal.
- Add publication tests for restart recovery, stale claims, duplicate completion, and expired-lease refusal.
- Add duplicate tests for same-key replay, conflicting payload rejection, and concurrent duplicate append replay across real store handles.

## Outcome

- The outbox module carries nine real-behavior tests with no fakes, mocks, monkeypatches, skips, or xfails.
- The broader authoring store suite increased to 40 passing tests.

## Notes

- The concurrency test relies on SQLite write serialization with a held transaction and a second connection racing the same dedupe key.
