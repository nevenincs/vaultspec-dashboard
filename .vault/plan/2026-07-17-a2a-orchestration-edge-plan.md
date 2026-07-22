---
tags:
  - '#plan'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-21'
tier: L2
related:
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
  - '[[2026-07-14-a2a-orchestration-edge-reference]]'
  - '[[2026-07-14-agentic-feedback-loop-adr]]'
  - '[[2026-07-16-agentic-authoring-ux-adr]]'
  - '[[2026-07-14-a2a-orchestration-edge-research]]'
  - '[[2026-07-19-a2a-orchestration-edge-adversarial-performance-security-audit]]'
---

# `a2a-orchestration-edge` plan

### Phase `P01` - Run completion lifecycle

Close the load-bearing gap first: the engine never completes a run, so Done can never render from the wire. Net-new completion transition modeled on the existing cancel path, then the frontend consumes it.

- [x] `P01.S01` - Emit a run.completed lifecycle event and transition RunStatus to Completed at the run-settle seam, modeled on the cancel_run transition, riding the durable outbox with sequence replay, with engine tests proving emission, status transition, and replay; `engine/crates/vaultspec-api/src/authoring/`.
- [x] `P01.S02` - Consume run.completed in the frontend lifecycle adapter with terminal-aware invalidation and render the Done turn status from the wire, with live-wire tests; `frontend/src/stores/`.

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

- [x] `P04.S09` - [SCHEMA NOTE from agent-wire-gaps lead: the feedback_batches table itself lands via agent-wire-gaps P01.S01 as part of ONE additive schema-version bump (queue state + provenance cols + batch table) - build the snapshot backend ON that table and do NOT author a second migration for it. Any shape change ships as a FRESH version bump.] Build the immutable feedback-batch snapshot backend per feedback-loop D3 with stable identifier, digest, ordered comment bodies, anchors, author identity, source revision, session identity, and creation time, plus its creation route; `engine/crates/vaultspec-api/src/authoring/`.
- [x] `P04.S10` - Add the typed feedback_batch_id field to StartPromptTurnRequest and verify ownership, revision fences, limits, and idempotency when a turn consumes a batch; `engine/crates/vaultspec-api/src/authoring/`.
- [x] `P04.S11` - Thread feedback_batch_id through a2a run-start and turn dispatch as an opaque identifier whose authoritative context is retrieved via the engine authoring client, in the vaultspec-a2a repository; `src/vaultspec_a2a/`.
- [x] `P04.S12` - Switch the composer comment batch from serialized prompt prose to the structured feedback_batch_id continuation and delete the prose interim outright; `frontend/src/`.
- [x] `P04.S14` - Ingest the retrieved feedback batch in the a2a worker flow: a feedback-aware step that reads the batch via the authoring client when feedback_batch_id is present in graph state and grounds the document revision on it, compiled into the worker graph, with live tests, in the vaultspec-a2a repository; `src/vaultspec_a2a/graph/, src/vaultspec_a2a/worker/`.

### Phase `P05` - Review and ratification

Mandatory cross-repo code review, edge ADR amendment recording the sibling-down ruling and shipped surfaces, and audit persistence.

- [x] `P05.S13` - Run cross-repo code review over every phase, amend the edge ADR with the sibling-down semantics ruling and the shipped-surface record, and persist the audit; `.vault/`.

### Phase `P06` - Active-run reload recovery

Add the bounded discovery read to the reviewed edge, then restore only an unambiguous workspace-scoped viewing binding while keeping run-status authoritative.

- [x] `P06.S15` - Add the engine-scoped active-run discovery verb with fixed two-result upstream bound, optional bounded feature filter, and real-loopback contract coverage; `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`.
- [x] `P06.S16` - Recover the team-run viewing binding only from one complete active workspace result, clear cross-scope bindings, and keep run-status plus relay authoritative; `frontend/src/stores/server/agent/a2aTeam.ts, frontend/src/stores/view/agentPanel.ts, frontend/src/app/agent/AgentPanel.tsx`.

### Phase `P07` - Adversarial performance and security hardening

Resolve every open finding from the current adversarial audit across the sibling gateway, engine relay and broker, frontend recovery authority, and normative contract trail.

- [x] `P07.S17` - Secure the loopback sibling gateway, publish a secret-free owner-restricted handoff, and enforce distinct `/v1` and worker IPC credentials with real production-process auth coverage; `src/vaultspec_a2a/api/, src/vaultspec_a2a/control/config.py, src/vaultspec_a2a/lifecycle/discovery.py`.
- [x] `P07.S18` - Replace metadata scans with persisted indexed selectors, apply one body/path run-id grammar, filter invalid legacy rows portably on SQLite and PostgreSQL, and prove a bounded 100,000-active-row query plan; `src/vaultspec_a2a/database/, src/vaultspec_a2a/control/run_discovery_service.py`.
- [x] `P07.S19` - Enforce pre-allocation HTTP/SSE ceilings and byte-budget replay, retain missing-sequence/contiguity evidence, and make clean EOF reconnectable until a terminal frame; `engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs, frontend/src/stores/server/queries/streams.ts`.
- [x] `P07.S20` - Offload the synchronous broker chain, reserve `SUBMITTED` before dispatch, perform one exact retry after ambiguous loss, and keep actor-token issuance redacted, distinct, and retention-bounded; `engine/crates/vaultspec-api/src/routes/ops/a2a.rs, engine/crates/vaultspec-api/src/authoring/actor_tokens.rs`.
- [x] `P07.S21` - Use one frontend recovery coordinator, bound transcript state, preserve reconciliation generation outside the evictable frame array, and derive terminal controls only from authoritative status; `frontend/src/stores/server/agent/, frontend/src/stores/server/liveAdapters/, frontend/src/app/agent/`.
- [x] `P07.S22` - Reconcile six-member edge vocabulary and record the implemented hardening in the current reference and audit trail; `engine/crates/vaultspec-api/src/lib.rs, .vault/reference/, .vault/audit/`.
- [x] `P07.S23` - Run a cross-repository adversarial code review, resolve every new critical or high issue, and close the rolling audit with real-behavior evidence; `.vault/audit/, .vault/exec/`.

## Description

Activate the frozen dashboard-to-a2a edge holistically: the a2a side shipped
its half (six-member whitelist: five control verbs plus bounded discovery,
versioned bounded SSE frames, token intake,
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

P07 executes the accepted edge ADR's resource-bound and authority invariants
against the adversarial audit. It closes the sibling authentication boundary,
makes discovery index-backed, turns relay limits into allocation and aggregate
byte ceilings, repairs relay ownership and frontend reconciliation authority,
and makes run-start credential issuance failure-safe. The audit remains the
rolling issue queue until P07.S23 independently re-reviews every remediation.

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

P07.S17 and P07.S18 may run in parallel in the sibling repository only when
their edits do not overlap an active product-provisioning writer. P07.S19 and
P07.S20 may run in parallel in the dashboard engine because they own distinct
modules. P07.S21 may proceed beside both engine steps but its final integration
tests depend on the relay contract from P07.S19. P07.S22 follows the code steps;
P07.S23 is the mandatory final gate.

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
- The sibling defaults to loopback and rejects missing or incorrect service
  tokens on every `/v1` verb while the engine-discovered token succeeds.
- Active discovery uses indexed selector columns and an index-backed query plan
  whose latency and peak allocation stay bounded across a 100,000-row history.
- Relay headers, chunks, incomplete frames, replay rings, registry admission,
  and frontend transcripts enforce documented byte ceilings under adversarial
  input; nonterminal disconnect/reopen and 65-run churn recover without restart.
- Health discovery never blocks an async worker; failed and replayed starts do
  not grow live or total token rows without bound.
- Reconnect uses the last sequence cursor, gap/degraded/terminal frames trigger
  one sticky authoritative status reconciliation, and user controls derive
  terminal state only from that authoritative response.
