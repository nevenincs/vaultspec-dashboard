---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S33'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add idempotency tests for duplicate create, duplicate apply, in-flight replay, conflicting scope, and expired outcome records

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/idempotency.rs`

## Description

- Add real SQLite tests for duplicate create-session replay.
- Add real SQLite tests for duplicate apply-request replay.
- Add in-flight replay, conflicting scope, distinct actor, expired recorded,
  expired in-flight, and stale receipt coverage.
- Use a probe table only to count whether the side-effect branch ran twice.

## Outcome

The idempotency tests prove that duplicate frontend and agent-style mutating
commands replay stored outcomes without running duplicate product writes, while
expired rows can be replaced and stale receipts cannot later win.

## Notes

The tests import the real store and unit-of-work APIs directly and do not fake or
mirror idempotency behavior.
