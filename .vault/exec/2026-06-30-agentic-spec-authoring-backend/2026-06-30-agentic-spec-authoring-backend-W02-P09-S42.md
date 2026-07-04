---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S42'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement outbox records, sequence allocation, publication state, restart recovery, and duplicate publication guards

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/outbox.rs`

## Description

- Add schema v4 with `authoring_outbox_events`, `AUTOINCREMENT` `seq`, `dedupe_key`, aggregate identity, actor identity, optional command and idempotency keys, payload JSON/hash, and publication fields.
- Add `OutboxRepository` behind `UnitOfWork::outbox()` with append, replay, `latest_seq`, `events_after`, claim, publish, release, and stale-claim recovery methods.
- Guard duplicate appends with `ON CONFLICT(dedupe_key) DO NOTHING` followed by replay/compare so concurrent duplicate writers return an existing event instead of a raw unique error.
- Require an unexpired publication lease before `mark_published` can transition an event to `published`.

## Outcome

- Durable authoring event records now commit inside the same checked SQLite unit of work as product-state mutations.
- Publication state is local and explicit: `pending`, `publishing`, and `published`.
- The store schema metadata now reports version 4 with the outbox migration.

## Notes

- `AUTOINCREMENT` can create gaps after ignored duplicate inserts; this is acceptable for a high-water cursor and should be remembered when stream replay gap semantics are wired.
