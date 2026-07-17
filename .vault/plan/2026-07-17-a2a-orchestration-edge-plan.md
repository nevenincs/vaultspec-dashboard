---
tags:
  - '#plan'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
tier: L2
related:
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
  - '[[2026-07-14-agentic-feedback-loop-adr]]'
  - '[[2026-07-16-agentic-authoring-ux-adr]]'
  - '[[2026-07-14-a2a-orchestration-edge-research]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `a2a-orchestration-edge` plan

### Phase `P01` - Run completion lifecycle

Close the load-bearing gap first: the engine never completes a run, so Done can never render from the wire. Net-new completion transition modeled on the existing cancel path, then the frontend consumes it.

- [ ] `P01.S01` - Emit a run.completed lifecycle event and transition RunStatus to Completed at the run-settle seam, modeled on the cancel_run transition, riding the durable outbox with sequence replay, with engine tests proving emission, status transition, and replay; `engine/crates/vaultspec-api/src/authoring/`.
- [ ] `P01.S02` - Consume run.completed in the frontend lifecycle adapter with terminal-aware invalidation and render the Done turn status from the wire, with live-wire tests; `frontend/src/stores/`.

### Phase `P02` - Ops pass-through

Build the whitelisted engine pass-through namespace forwarding the five a2a gateway verbs per edge ADR D1 and D2, copying the shipped rag ops template including its sibling-down semantics.

- [x] `P02.S03` - Build the ops a2a verb namespace on the rag ops template forwarding the five whitelisted verbs to the a2a v1 gateway with bounded arg validation, verbatim sibling envelope inside the tiers envelope, degraded-tier 200 on sibling-down, 502 on crash or timeout, and attach-never-own discovery; `engine/crates/vaultspec-api/src/routes/ops/`.
- [x] `P02.S04` - Provision per-role actors and engine-minted tokens at run-start and inject the ActorTokenBundle into the forwarded payload, never logging token values; `engine/crates/vaultspec-api/src/routes/ops/, engine/crates/vaultspec-api/src/authoring/`.
- [x] `P02.S05` - Write guard tests mirroring the rag ops suite plus a live loopback test against a real a2a gateway covering whitelist miss, degraded sibling, crash, and verbatim envelope pass-through; `engine/crates/vaultspec-api/src/routes/ops/tests.rs`.

### Phase `P03` - Progress relay

Expose the a2a run stream on the versioned gateway surface, then relay it as a bounded engine SSE channel per edge ADR D3 with uniform replay and gap semantics.

- [x] `P03.S06` - Add a versioned run stream verb under the v1 a2a gateway re-serving the bounded SSE progress frames on the public surface, with live tests, in the vaultspec-a2a repository; `src/vaultspec_a2a/api/`.
- [x] `P03.S07` - Relay the a2a run stream as a new engine SSE channel feeding bounded versioned frames into the shared ring with seq and gap semantics and honest degradation to run-status polling; `engine/crates/vaultspec-api/src/routes/`.
- [x] `P03.S08` - Prove the relay live end to end including replay from since, gap emission on eviction and lag, and the oversized-frame drop sentinel passing through unaltered; `engine/crates/vaultspec-api/src/routes/`.

### Phase `P04` - Feedback batch

Build the immutable feedback-batch snapshot and the structured continuation field per feedback-loop ADR D3 and D4, thread the identifier across the edge, and delete the prompt-prose interim.

- [ ] `P04.S09` - [SCHEMA NOTE from agent-wire-gaps lead: the feedback_batches table itself lands via agent-wire-gaps P01.S01 as part of ONE additive schema-version bump (queue state + provenance cols + batch table) — build the snapshot backend ON that table and do NOT author a second migration for it. Any shape change ships as a FRESH version bump.] Build the immutable feedback-batch snapshot backend per feedback-loop D3 with stable identifier, digest, ordered comment bodies, anchors, author identity, source revision, session identity, and creation time, plus its creation route; `engine/crates/vaultspec-api/src/authoring/`.
- [ ] `P04.S10` - Add the typed feedback_batch_id field to StartPromptTurnRequest and verify ownership, revision fences, limits, and idempotency when a turn consumes a batch; `engine/crates/vaultspec-api/src/authoring/`.
- [ ] `P04.S11` - Thread feedback_batch_id through a2a run-start and turn dispatch as an opaque identifier whose authoritative context is retrieved via the engine authoring client, in the vaultspec-a2a repository; `src/vaultspec_a2a/`.
- [ ] `P04.S12` - Switch the composer comment batch from serialized prompt prose to the structured feedback_batch_id continuation and delete the prose interim outright; `frontend/src/`.
- [ ] `P04.S14` - Ingest the retrieved feedback batch in the a2a worker flow: a feedback-aware step that reads the batch via the authoring client when feedback_batch_id is present in graph state and grounds the document revision on it, compiled into the worker graph, with live tests, in the vaultspec-a2a repository; `src/vaultspec_a2a/graph/, src/vaultspec_a2a/worker/`.

### Phase `P05` - Review and ratification

Mandatory cross-repo code review, edge ADR amendment recording the sibling-down ruling and shipped surfaces, and audit persistence.

- [ ] `P05.S13` - Run cross-repo code review over every phase, amend the edge ADR with the sibling-down semantics ruling and the shipped-surface record, and persist the audit; `.vault/`.

## Description

Activate the frozen dashboard-to-a2a edge holistically: the a2a side shipped
its half (five-verb gateway, versioned bounded SSE frames, token intake,
discovery contract, per its own conformance program), the frontend
consumption seams are built and waiting, and this plan builds everything
still missing between them. Four work fronts, in handover priority order:
the run-completion lifecycle event (the load-bearing gap - no engine code
path ever completes a run, so a terminal state cannot render from the wire),
the whitelisted ops pass-through namespace with run-start actor provisioning
(edge ADR D1 and D2), the relayed progress channel (edge ADR D3, requiring
one new a2a-side versioned stream verb first, since the existing thread
stream is internal-only), and the immutable feedback batch with its
structured continuation field (feedback-loop ADR D3 and D4, both greenfield
engine-side; the turn contract denies unknown fields so the addition is a
typed contract change).

Grounding rulings recorded at authoring: the rag ops template returns 200
with a degraded tier for a known-down sibling and reserves 502 and 504 for
subprocess crash or timeout; the edge ADR's sibling-down-is-502 wording is
read through its own reuse-the-rag-patterns rationale, so the template
semantics govern and P05 amends the ADR to say so. Steps S06 and S11 are
executed inside the sibling vaultspec-a2a repository; all other steps land
in this repository. The dashboard authoring-ux plan's open W05.P05 steps
(Team selector wiring, relay consumption) unblock when P02 and P03 land and
stay owned by that plan; this plan does not duplicate them, except S02 and
S12 which consume contracts this plan itself introduces.

## Steps

## Parallelization

P01, P02, and P04 are mutually independent and may run in parallel across
executors, provided the two a2a-repository steps (S06, S11) and the two
frontend steps (S02, S12) are serialized per repository writer to avoid
tree contention. Within P03, S06 must land before S07 and S08 (the engine
relay subscribes to the verb S06 creates); S07 has a soft dependency on
S03's discovery plumbing, so P03 is best started after S03. P05 runs last
and gates completion. S02 depends on S01; S10 depends on S09; S11 and S12
depend on S10.

## Verification

Mission success is wire-observable, not test-count-observable:

- A completed run transitions to Completed and emits run.completed on the
  durable feed; the transcript renders Done from the wire with zero client
  inference. Proven live, replay included.
- Each of the five ops a2a verbs round-trips against a real a2a gateway
  with the sibling envelope verbatim inside the tiers envelope; whitelist
  miss is 403 before any round-trip; sibling-down degrades the tier at 200;
  crash or timeout is 502 or 504. Token values appear in no log at any
  level on either side.
- The relayed channel delivers a2a progress frames through the engine
  stream endpoint with since-replay and gap semantics identical to the
  existing channels, and the drop sentinel survives relay unaltered.
- A feedback batch snapshots immutably with digest, a turn carrying
  feedback_batch_id verifies ownership and fences, the a2a edge transports
  the identifier opaquely, and the composer prose interim is deleted with
  no dead vocabulary left in frontend/src.
- Mock-free discipline holds on both sides: engine guard tests mirror the
  rag ops suite, a2a tests run against live loopback services.
- The vaultspec-code-reviewer persona signs off PASS across both
  repositories and the audit is persisted with the ADR amendment; the
  dashboard authoring-ux plan's W05.P05 steps are observed unblocked.
