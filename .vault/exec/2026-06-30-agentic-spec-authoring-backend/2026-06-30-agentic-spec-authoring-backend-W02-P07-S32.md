---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S32'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement scoped idempotency keys, command outcome records, in-flight state records, and replay lookup helpers

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/idempotency.rs`

## Description

- Add schema version 2 for `authoring_idempotency_records`.
- Persist scoped keys by actor, actor kind, delegated actor, command kind, and
  idempotency key.
- Store scope/request digests, receipts, in-flight state, recorded outcomes, and
  expiry timestamps.
- Add `UnitOfWork::idempotency` and repository methods for reservation,
  outcome recording, replay lookup, and bounded outcome expiry.

## Outcome

The authoring store now has a transaction-scoped idempotency repository that can
reserve mutating commands, replay matching in-flight or recorded outcomes, reject
non-expired conflicts, and replace expired records safely.

## Notes

The implementation remains below route level. It stores compact outcome payloads
but does not create sessions, proposals, changesets, outbox messages, or apply
jobs.
