---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S166'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Stream replay and generation retention requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Re-read the binding W11.P34 plan rows after W11.P33 closure.
- Ground stream replay against the accepted streaming-events/outbox ADR, the
  authoring state-store ADR, the authoring API contract ADR, and the Increment 3
  rollout reference.
- Inspect the existing non-authoring SSE stream route as the replay/gap analogue.
- Inspect the authoring lifecycle event feed, transactional outbox repository,
  response envelope helpers, authoring router, and retention/compaction
  repository.
- Dispatch a read-only sidecar reviewer to challenge the phase checklist and
  identify contradictions before S167 implementation.
- Record the implementation, test, review, and verification checklist for S167
  through S170.

## Outcome

W11.P34 follows W11.P33 and should implement the authoring lifecycle stream and
recovery surface over the durable outbox. The existing graph stream is the route
analogue for SSE shape, replay/gap behavior, lag handling, and keep-alives, but
authoring must not make lifecycle truth depend on broadcast memory. Authoring
replay starts from the durable outbox and uses snapshot-plus-next-sequence
recovery when a cursor cannot be satisfied.

Scope clarification:

- The current W11.P34 row names bounded generation streams and transcript
  compaction, but the Increment 3 reference explicitly defers token/generation
  channels to Increment 4, and the binding plan also has W12.P44 for bounded
  generation channels and transcript compaction.
- S167 should therefore implement lifecycle stream/recovery now, plus bounded
  constants/hooks and retention integration points that keep generation data
  non-authoritative. It should not implement the full token/generation channel
  runtime before W12.P44.
- S168 can test backend cursor/recovery contracts in Rust. Frontend cursor
  restoration belongs to later frontend/store steps unless a route test needs to
  assert the wire contract that frontend will consume.

`S167` implementation checklist:

- Add `stream.rs` under the fenced authoring module and register it from
  `mod.rs`.
- Add authoring read routes for lifecycle event subscription/replay and recovery
  under the authoring V1 router.
- Use durable outbox `events_after(last_seq, max_rows)` and `latest_seq()` as
  the lifecycle replay source.
- Serialize lifecycle records through the existing `events.rs` projector-feed
  page/record shape, not ad hoc stream JSON.
- Implement explicit gap events when a requested cursor cannot be served within
  the bounded replay window.
- Implement snapshot-plus-next-sequence recovery with the shared authoring
  response envelope and `tiers`.
- Keep every accumulator bounded: replay page cap, any live channel/ring cap,
  and recovery snapshot size.
- Keep generation/token frames separate from lifecycle events. Only add bounded
  hooks/placeholders needed to avoid treating future generation channels as
  authoritative lifecycle truth.
- Flip the authoring status `streams` capability only when the lifecycle routes
  are mounted and recoverable.

`S168` test checklist:

- Test replay from `last_seq` over real store/outbox rows, including after store
  restart.
- Test bounded replay/gap behavior and hostile/large cursor arithmetic.
- Test snapshot-plus-next-sequence recovery returns a tiered envelope.
- Test lag/gap semantics using the existing graph stream behavior as the
  analogue where live broadcast is introduced.
- Test lifecycle events remain authoritative when generation/token data is absent
  or compacted.
- Test malformed cursor and unsupported recovery inputs return typed, tiered
  errors where the route surface accepts them.
- Use real `Store`, real outbox rows, and route-level tests where possible; do
  not use fakes, stubs, monkeypatches, skips, or xfails.

`S169` review checklist:

- Review that lifecycle truth is replayed from the transactional outbox, not from
  in-memory broadcast buffers.
- Review that every response/recovery/error surface carries `tiers`.
- Review route names and DTOs for semantic authoring API shape, not core verbs.
- Review resource bounds on replay pages, live buffers, and retention/compaction
  hooks.
- Review that generation/token data cannot become the only source for proposal,
  approval, apply, conflict, or rollback state.
- Review that status capability flags match mounted, recoverable routes.

`S170` verification checklist:

- Verify reconnect after restart recovers durable lifecycle truth from outbox
  replay or snapshot-plus-next-sequence.
- Verify a lost/too-old cursor produces an explicit gap and a recovery path.
- Verify lifecycle state remains correct when generation/token data is missing,
  bounded, or compacted.
- Verify the backend-served cursor/high-water sequence is monotonic and suitable
  for frontend cursor storage.
- Verify W11.P34 stops before W12.P44-only generation channel runtime.

## Notes

- `vaultspec-rag` found the accepted streaming-events/outbox ADR, state-store
  ADR, authoring API contract ADR, Increment 3 reference, and W11.P33 summary.
- The first code RAG search with a glob-expanded include path failed under
  PowerShell; a later exact-path RAG query successfully located the existing
  graph stream analogue.
- Sidecar reviewer `019f386f-83bc-70a1-81a6-1c4d959c5215` was read-only and
  found the W11.P34/W12.P44 generation-channel overlap captured above.
