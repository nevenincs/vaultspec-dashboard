---
tags:
  - '#adr'
  - '#agentic-spec-authoring-backend'
date: '2026-06-29'
modified: '2026-06-30'
related:
  - "[[2026-06-29-agentic-spec-authoring-backend-research]]"
  - "[[2026-06-29-langgraph-approval-document-editing-research]]"
  - "[[2026-06-29-zed-acp-document-authoring-research]]"
  - "[[2026-06-16-document-editor-backend-adr]]"
  - "[[2026-06-18-document-edit-hardening-adr]]"
  - '[[2026-06-29-agentic-authoring-boundary-adr]]'
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
  - '[[2026-06-29-agentic-changeset-ledger-adr]]'
  - '[[2026-06-29-agentic-change-format-and-chunking-adr]]'
  - '[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]'
  - '[[2026-06-29-agentic-approval-gates-review-state-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-apply-materialization-adr]]'
  - '[[2026-06-29-agentic-rollback-history-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-live-editing-room-adr]]'
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
---

# `agentic-streaming-events-outbox` adr: `durable authoring events and replayable streams` | (**status:** `accepted`)

## Problem Statement

Agent authoring produces both durable workflow events and high-volume generation
output. Approval, apply, conflict, and rollback state must be recoverable after
refresh or disconnect; token chunks and transient tool traces must not be allowed
to crowd out product state.

## Considerations

Existing SSE recovery is bounded and useful for graph, git, backend, and index
signals, but agent token streams can be much noisier. Research separates durable
authoring events from ephemeral generation events. Displayed workflow state and
counts must be backend-served. Every accumulator must be bounded at creation.
Clients need replay by sequence or snapshot recovery, not best-effort session
memory.

## Constraints

Every HTTP, snapshot, recovery, and error response must use the shared envelope
and carry `tiers`. Raw token and live progress frames are non-authoritative;
clients recover truth through a tiered snapshot or durable-event replay
response. The stores layer remains the sole frontend wire client and owns replay
cursors. Token streams may be dropped, summarized, or capped; lifecycle events
may not be dropped before they are durably represented. Event schemas need
versioning because ACP-style and LangGraph event shapes are not stable enough to
persist directly.

## Implementation

The authoring backend writes state changes and durable publication records in
one commit boundary. This is the transactional outbox invariant; the physical
table, sequence generator, and database mechanism are deferred to the authoring
store/schema decision. Each durable event has a stable aggregate id, schema
version, actor, timestamp, idempotency key where relevant, and compact payload.

Durable events describe transitions of the canonical ledger states rather than
defining a second lifecycle vocabulary. Example events include session created,
run started, proposal created, preview updated, validation updated, approval
requested, approval resolved, apply started, apply recorded, conflict recorded,
proposal rejected, rollback proposal created, cancellation recorded, and failure
recorded. These events feed backend projections for review queues, status
counts, active runs, and action eligibility.

Generation output uses a separate bounded stream class for raw token deltas,
debug traces, and live tool-progress noise. Durable transcript messages and
summaries may be retained separately by policy; raw token replay is promised
only inside the configured retention window. Generation output never serves as
the only record of an approval or materialized change.

Clients subscribe with `last_seq`, which is a client/store replay cursor. Server
projections expose `latest_outbox_seq` or an equivalent server-side high-water
mark. Clients recover by replaying durable events or fetching a backend snapshot
plus the next sequence. Publication happens after the outbox commit; failed
delivery is retried without duplicating events.

## Rationale

The outbox gives authoring state the same durability as the transition that
produced it, while preserving a responsive live stream for generation.
Separating lifecycle events from token streams prevents a verbose model run from
causing lost approval or rollback truth.

## Consequences

Refresh, reconnect, and run-join flows become deterministic. Review queues and
counts can be rebuilt from durable state instead of inferred from transient
streams. The system needs retention, compaction, and migration rules for event
tables. The UI must tolerate token gaps and rely on snapshots/events for truth.

## Codification candidates

- **Rule slug:** `authoring-lifecycle-events-use-a-transactional-outbox`.
  **Rule:** Every durable authoring lifecycle transition must publish through an
  outbox committed with the state change, and clients recover by sequence or
  snapshot rather than best-effort stream memory.
- **Rule slug:** `token-streams-are-not-authoring-state`.
  **Rule:** Model tokens, debug traces, and transient tool chunks may be bounded
  or compacted, but they must never be the only source for proposal, approval,
  apply, conflict, or rollback state.
