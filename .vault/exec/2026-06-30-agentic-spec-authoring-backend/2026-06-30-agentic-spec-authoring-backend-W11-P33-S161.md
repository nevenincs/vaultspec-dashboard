---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S161'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Durable lifecycle events and projector feed requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Re-read the binding W11.P33 plan rows after W10.P49 completion and confirm that
  plan order moves next to Increment 3 streams and recovery.
- Ground the phase in the accepted streaming-events/outbox ADR, authoring
  state-store ADR, authoring API contract, and the 2026-07-02 rollout reference.
- Inspect the existing transactional outbox primitive, unit-of-work boundary,
  lifecycle transition checks, stream API fixtures, and current apply outbox
  emission.
- Dispatch a read-only sidecar review agent to challenge the phase checklist and
  identify contradictions before S162 implementation.
- Record the implementation, test, review, and verification checklist for S162
  through S165.

## Outcome

W11.P33 is the first Increment 3 phase and must be executed before the later
W11.P34 stream route, W11.P50 activity/count, and W11.P51 frontend cursor phases.
The reference document still names this scope as old `W07.P33`, but the current
plan's `W11.P33` row is binding and matches the same durable lifecycle
event/projector-feed scope.

`S162` implementation checklist:

- Add `events.rs` and register it from the authoring module.
- Centralize durable lifecycle event schema constants, aggregate kinds, event
  kinds, payload DTOs, projector-feed DTOs, and version validation.
- Reuse `OutboxEventDraft` and the existing transactional outbox table rather
  than creating a second event store or publication table.
- Reconcile the existing hard-coded apply outbox emission in `apply.rs`
  (`changeset.applied` / `changeset.apply_failed`) by moving or wrapping it
  through the shared event builder; do not double-publish apply events.
- Define compact lifecycle payloads with stable aggregate id, schema version,
  actor, timestamp, optional command/idempotency key, deterministic payload hash,
  and no raw document body/token/debug transcript payloads.
- Cover the current durable transition set that exists now: proposal created or
  updated, validation changed, approval requested, approval resolved, apply
  started/recorded/failed/conflicted, rollback created, cancellation recorded,
  and failure recorded. Session/run events may have schema constructors before
  runtime implementation, but must not imply working session routes before W12.
- Define projector-feed records over outbox rows with `seq`, `event_id`,
  `event_kind`, `schema_version`, aggregate ref, actor, created time, payload,
  and latest outbox high-water semantics.
- Keep event vocabulary derived from canonical domain state (`ChangesetStatus`,
  `CommandKind`, approval decisions, validation/apply records), not a parallel
  lifecycle that can drift.
- Keep S162 out of SSE transport, subscription routing, frontend cursor
  replacement, generation-token channels, LangGraph runtime state, and activity
  rollups; those are later plan rows.

`S163` test checklist:

- Add real `events.rs` unit tests for constructors/mappers and version rejection;
  do not duplicate business logic in test helpers.
- Cover the required plan cases: session created, proposal updated, validation
  changed, approval resolved, apply recorded, rollback created, and schema
  version rejection. Where session runtime is not implemented yet, assert the
  schema builder only, not a route.
- Add an apply regression proving the shared event builder still appends a durable
  outbox row inside the same apply unit of work.
- Prove repeated mapping for the same transition identity produces the same
  dedupe key and payload hash, while changed payloads conflict through existing
  outbox duplicate guards.
- Add projector-feed tests over real store/outbox rows for ordering, bounds,
  high-water sequence, restart/reopen replay, and unsupported version rejection.
- Keep tests real-behavior: use the existing store/unit-of-work patterns; no
  mocks, stubs, monkeypatches, skips, or xfails.

`S164` review checklist:

- Review for accidental second lifecycle vocabulary or drift from canonical
  changeset, approval, validation, apply, rollback, and command records.
- Review that every durable lifecycle event goes through the transactional outbox
  with the product-state mutation, and that no mutation publishes only to memory.
- Review that `apply.rs` no longer owns hard-coded event schema strings after
  S162, and that apply is not double-published.
- Review that projector-feed reads are bounded, ordered by monotonic outbox
  sequence, version-aware, and compact.
- Review that no raw document body, model token stream, debug trace, absolute host
  path, or core stderr becomes durable lifecycle event payload.
- Review that backend projections remain backend-owned; any event-fed feed is a
  recovery/stream feed unless a later plan step explicitly changes projection
  authority.

`S165` verification checklist:

- Verify lifecycle-facing feed output can be rebuilt from durable outbox events
  after store restart/reopen.
- Verify `last_seq` replay against `events_after` and a latest-sequence
  high-water mark without requiring SSE transport from W11.P34.
- Verify generated token/debug/transient retention data is absent from lifecycle
  reconstruction.
- Verify existing ledger-backed proposal/detail projections are not regressed by
  adding the event feed.
- Run the focused event, outbox, apply, rollback, proposal/approval, projection,
  and API tests needed to prove lifecycle event coverage.

## Notes

- `vaultspec-rag` found the accepted streaming-events/outbox ADR and the
  Increment 3 rollout reference. The running plan is the authority for ordering:
  execute `W11.P33.S162` next, before W11.P34/S166 and before the W11.P50/S226
  deferred projection remainder.
- Existing code already contains `SubscribeEvents`, `RecoverEventStream`, and
  `latest_outbox_seq` API fixtures, plus the W02.P09 outbox repository. S162
  should connect those pieces through a shared event schema rather than treating
  the phase as greenfield.
- Sidecar review agent `019f3859-3cc8-7e60-9d29-ef6a66c7d8f4` was read-only and
  found no plan-order contradiction beyond old reference numbering drift.
