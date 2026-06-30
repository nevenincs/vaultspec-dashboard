---
tags:
  - '#plan'
  - '#agentic-spec-authoring-backend'
date: '2026-06-30'
modified: '2026-06-30'
tier: L4
related:
  - '[[2026-06-29-agentic-apply-materialization-adr]]'
  - '[[2026-06-29-agentic-approval-gates-review-state-adr]]'
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-authoring-boundary-adr]]'
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
  - '[[2026-06-29-agentic-change-format-and-chunking-adr]]'
  - '[[2026-06-29-agentic-changeset-ledger-adr]]'
  - '[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]'
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-live-editing-room-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-rollback-history-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-29-agentic-spec-authoring-backend-research]]'
  - '[[2026-06-29-langgraph-approval-document-editing-research]]'
  - '[[2026-06-29-zed-acp-document-authoring-research]]'
---

# `agentic-spec-authoring-backend` plan

## Epic intent

Project-management association: vaultspec dashboard roadmap entry agentic-spec-authoring-backend, tracked by this L4 plan and its generated Step execution records until an external board is opened. The epic delivers a Rust authoring backend that mediates human and LangGraph collaborators through semantic sessions, proposals, approvals, leases, streams, apply receipts, rollback records, and backend-served review projections while keeping vaultspec-core hidden behind the materialization adapter.

## Wave `W01` - Contracts and backend boundary

Establish the authoring backend as a fenced Rust domain beside the existing route families, with semantic endpoint families, shared envelopes, and typed product state before any durable mutation is introduced.

### Phase `W01.P01` - Boundary grounding and module skeleton

Create the authoring backend shell and prove it is a semantic collaborator boundary rather than a thin core proxy.

- [ ] `W01.P01.S01` - Ground boundary, API, and existing route ownership requirements into the phase checklist; `.vault/adr/`.
- [ ] `W01.P01.S02` - Add the authoring module shell, route registration seam, and disabled feature gate; `engine/crates/vaultspec-api/src/authoring/`.
- [ ] `W01.P01.S03` - Add route contract tests for shared envelopes, tiers blocks, bearer gating, and disabled-state responses; `engine/crates/vaultspec-api/src/routes/`.
- [ ] `W01.P01.S04` - Run boundary code review and record the phase audit; `.vault/audit/`.
- [ ] `W01.P01.S05` - Verify the authoring route shell returns tiered backend-served snapshots through tests and manual HTTP smoke checks; `engine/crates/vaultspec-api/src/routes/`.

### Phase `W01.P02` - Domain model and transition vocabulary

Define the typed objects and lifecycle transitions that every endpoint, projection, and agent tool must share.

- [ ] `W01.P02.S06` - Ground document identity, changeset, approval, review-state, and provenance requirements into the phase checklist; `.vault/adr/`.
- [ ] `W01.P02.S07` - Implement typed actor, document, proposal, changeset, approval, chunk, lease, event, and receipt models; `engine/crates/vaultspec-api/src/authoring/model.rs`.
- [ ] `W01.P02.S08` - Add transition validation tests for invalid states, terminal states, and action eligibility; `engine/crates/vaultspec-api/src/authoring/model.rs`.
- [ ] `W01.P02.S09` - Run domain model code review and record the phase audit; `.vault/audit/`.
- [ ] `W01.P02.S10` - Verify illegal transitions are rejected and valid snapshots serialize through tests and manual JSON fixture review; `engine/crates/vaultspec-api/src/authoring/model.rs`.

### Phase `W01.P03` - Endpoint and tool contract schemas

Encode the V1 semantic contract that the frontend stores and LangGraph tools will both consume.

- [ ] `W01.P03.S11` - Ground session, document, proposal, review, apply, rollback, lease, and stream endpoint family requirements into the phase checklist; `.vault/adr/`.
- [ ] `W01.P03.S12` - Implement request and response DTOs for V1 authoring command and snapshot families; `engine/crates/vaultspec-api/src/authoring/api.rs`.
- [ ] `W01.P03.S13` - Add schema fixture tests for frontend-safe envelopes, idempotency fields, and agent-compatible command payloads; `engine/crates/vaultspec-api/src/authoring/api.rs`.
- [ ] `W01.P03.S14` - Run API schema code review and record the phase audit; `.vault/audit/`.
- [ ] `W01.P03.S15` - Verify every mutating command schema carries scoped idempotency and every snapshot schema carries tiers through tests and manual fixture inspection; `engine/crates/vaultspec-api/src/authoring/api.rs`.

## Wave `W02` - Durable store and approval projections

Persist sessions, proposals, changesets, approvals, idempotency records, and review-station projections as product state so reconnects, retries, and pending human decisions survive process restarts.

### Phase `W02.P04` - Authoring store substrate

Introduce the durable authoring store with migrations, retention classes, and repository boundaries before workflow state is written.

- [ ] `W02.P04.S16` - Ground durable store, retention, migration, and fail-loud versioning requirements into the phase checklist; `.vault/adr/`.
- [ ] `W02.P04.S17` - Implement the authoring store connection, migration runner, retention classes, and repository trait boundary; `engine/crates/vaultspec-api/src/authoring/store/`.
- [ ] `W02.P04.S18` - Add real store tests for migration, schema mismatch, retention caps, and restart recovery; `engine/crates/vaultspec-api/src/authoring/store/`.
- [ ] `W02.P04.S19` - Run authoring store code review and record the phase audit; `.vault/audit/`.
- [ ] `W02.P04.S20` - Verify store state survives process restart and schema mismatch fails loud via tests and manual database inspection; `engine/crates/vaultspec-api/src/authoring/store/`.

### Phase `W02.P05` - Changeset ledger and idempotency

Make proposal mutations append-only, retry-safe, and reconstructable from product records rather than transient agent state.

- [ ] `W02.P05.S21` - Ground changeset ledger, atomic change format, and idempotency replay requirements into the phase checklist; `.vault/adr/`.
- [ ] `W02.P05.S22` - Implement append-only changeset, proposal revision, command outcome, and idempotency repositories; `engine/crates/vaultspec-api/src/authoring/ledger.rs`.
- [ ] `W02.P05.S23` - Add real retry tests for duplicate command suppression, command outcome replay, and ordered proposal history; `engine/crates/vaultspec-api/src/authoring/ledger.rs`.
- [ ] `W02.P05.S24` - Run ledger code review and record the phase audit; `.vault/audit/`.
- [ ] `W02.P05.S25` - Verify repeated frontend and agent commands return the recorded outcome without duplicate side effects via tests and manual API replay; `engine/crates/vaultspec-api/src/authoring/ledger.rs`.

### Phase `W02.P06` - Approval gates and review station projections

Persist human-review state and serve action eligibility, counts, queue items, and approval decisions from the backend.

- [ ] `W02.P06.S26` - Ground approval gate, review-station, and backend-served display-state requirements into the phase checklist; `.vault/adr/`.
- [ ] `W02.P06.S27` - Implement approval, claim, release, reject, request-changes, and review-queue projection handlers; `engine/crates/vaultspec-api/src/authoring/review.rs`.
- [ ] `W02.P06.S28` - Add workflow tests for pending approvals, claimed items, stale decisions, and backend-served action eligibility; `engine/crates/vaultspec-api/src/authoring/review.rs`.
- [ ] `W02.P06.S29` - Run review-state code review and record the phase audit; `.vault/audit/`.
- [ ] `W02.P06.S30` - Verify rejected and approved proposals surface correct review states through tests and manual review-queue API checks; `engine/crates/vaultspec-api/src/authoring/review.rs`.

## Wave `W03` - Document identity, chunks, and collaboration control

Give humans and agents stable document references, bounded chunk surfaces, leases, conflicts, and live room snapshots so direct editing and delegated editing share one backend-served state model.

### Phase `W03.P07` - Document identity and bounded chunks

Make document references, chunk anchors, revision snapshots, and whole-document previews stable enough for both wholesale and atomic edits.

- [ ] `W03.P07.S31` - Ground document identity, chunking, wholesale edit, and atomic patch requirements into the phase checklist; `.vault/adr/`.
- [ ] `W03.P07.S32` - Implement stable document references, revision metadata, bounded chunk reads, and preview snapshot builders; `engine/crates/vaultspec-api/src/authoring/documents.rs`.
- [ ] `W03.P07.S33` - Add tests for rename stability, chunk bound enforcement, snapshot recovery, and whole-document draft replacement; `engine/crates/vaultspec-api/src/authoring/documents.rs`.
- [ ] `W03.P07.S34` - Run document identity code review and record the phase audit; `.vault/audit/`.
- [ ] `W03.P07.S35` - Verify snapshots and chunks remain stable across proposal revisions via tests and manual document API checks; `engine/crates/vaultspec-api/src/authoring/documents.rs`.

### Phase `W03.P08` - Leases, locks, conflicts, and rebases

Coordinate direct human edits and delegated agent edits with advisory leases, conflict records, rebase commands, and supersession behavior.

- [ ] `W03.P08.S36` - Ground concurrency lease, conflict detection, and rebase requirements into the phase checklist; `.vault/adr/`.
- [ ] `W03.P08.S37` - Implement lease acquire, renew, release, conflict recording, supersede, and rebase command handlers; `engine/crates/vaultspec-api/src/authoring/concurrency.rs`.
- [ ] `W03.P08.S38` - Add concurrent workflow tests for lease expiry, overlapping edits, rebase success, and conflict surfacing; `engine/crates/vaultspec-api/src/authoring/concurrency.rs`.
- [ ] `W03.P08.S39` - Run concurrency code review and record the phase audit; `.vault/audit/`.
- [ ] `W03.P08.S40` - Verify two editors receive deterministic lease and conflict outcomes through tests and manual concurrent API checks; `engine/crates/vaultspec-api/src/authoring/concurrency.rs`.

### Phase `W03.P09` - Live editing room snapshots

Expose recoverable room snapshots for active sessions, actor presence, draft previews, pending actions, and latest durable sequence.

- [ ] `W03.P09.S41` - Ground live room, recovery snapshot, and frontend store cursor requirements into the phase checklist; `.vault/adr/`.
- [ ] `W03.P09.S42` - Implement session snapshots, active actor state, draft preview state, and latest authoring sequence projections; `engine/crates/vaultspec-api/src/authoring/session.rs`.
- [ ] `W03.P09.S43` - Add recovery tests for refresh, reconnect, cancelled sessions, and joined active runs; `engine/crates/vaultspec-api/src/authoring/session.rs`.
- [ ] `W03.P09.S44` - Run live room code review and record the phase audit; `.vault/audit/`.
- [ ] `W03.P09.S45` - Verify a refreshed client can reconstruct room state from snapshots and sequence cursors via tests and manual browser refresh checks; `engine/crates/vaultspec-api/src/authoring/session.rs`.

## Wave `W04` - Agent integration, streams, and policy

Wire LangGraph through semantic backend commands, publish recoverable durable events, and enforce provenance and authorization before agents can create, alter, or request application of proposals.

### Phase `W04.P10` - LangGraph adapter and tool aliases

Connect LangGraph threads, runs, interrupts, and tool calls to Vaultspec-owned product records without exposing core or checkpoint state as product history.

- [ ] `W04.P10.S46` - Ground LangGraph thread, run, checkpoint, interrupt, and tool-call requirements into the phase checklist; `.vault/adr/`.
- [ ] `W04.P10.S47` - Implement the LangGraph adapter boundary and semantic tool aliases for context, proposal, validation, approval, cancel, and apply requests; `engine/crates/vaultspec-api/src/authoring/langgraph.rs`.
- [ ] `W04.P10.S48` - Add adapter contract tests for interrupt-id resumes, tool-call idempotency, checkpoint reference storage, and product-state copying; `engine/crates/vaultspec-api/src/authoring/langgraph.rs`.
- [ ] `W04.P10.S49` - Run LangGraph adapter code review and record the phase audit; `.vault/audit/`.
- [ ] `W04.P10.S50` - Verify agent tool calls create only backend product records and resume by interrupt id via tests and manual LangGraph fixture replay; `engine/crates/vaultspec-api/src/authoring/langgraph.rs`.

### Phase `W04.P11` - Durable events and stream recovery

Publish authoring lifecycle events through a transactional outbox while keeping token and trace streams bounded and non-authoritative.

- [ ] `W04.P11.S51` - Ground outbox, durable lifecycle event, token stream, and replay cursor requirements into the phase checklist; `.vault/adr/`.
- [ ] `W04.P11.S52` - Implement authoring outbox records, schema versions, stream publication, replay, and snapshot-plus-next-sequence recovery; `engine/crates/vaultspec-api/src/authoring/events.rs`.
- [ ] `W04.P11.S53` - Add stream recovery tests for outbox commit atomicity, replay gaps, bounded token retention, and duplicate publication suppression; `engine/crates/vaultspec-api/src/authoring/events.rs`.
- [ ] `W04.P11.S54` - Run event stream code review and record the phase audit; `.vault/audit/`.
- [ ] `W04.P11.S55` - Verify clients recover lifecycle truth after stream loss through tests and manual SSE replay checks; `engine/crates/vaultspec-api/src/authoring/events.rs`.

### Phase `W04.P12` - Security provenance and policy enforcement

Require every human and agent mutation to carry actor provenance, bounded scope, authorization checks, and audit-safe redaction.

- [ ] `W04.P12.S56` - Ground security, provenance, authorization drift, and audit redaction requirements into the phase checklist; `.vault/adr/`.
- [ ] `W04.P12.S57` - Implement actor identity validation, policy checks, scope guards, provenance records, and safe error redaction; `engine/crates/vaultspec-api/src/authoring/security.rs`.
- [ ] `W04.P12.S58` - Add authorization tests for forbidden scopes, stale actors, dangerous tools, redacted errors, and audit record completeness; `engine/crates/vaultspec-api/src/authoring/security.rs`.
- [ ] `W04.P12.S59` - Run security provenance code review and record the phase audit; `.vault/audit/`.
- [ ] `W04.P12.S60` - Verify unauthorized humans and agents cannot mutate state and authorized records carry provenance via tests and manual negative API checks; `engine/crates/vaultspec-api/src/authoring/security.rs`.

## Wave `W05` - Materialization, frontend integration, and release acceptance

Apply approved authoring work through the core adapter, support rollback and multiagent composition, surface review workflows in the dashboard, and close the epic with end-to-end verification.

### Phase `W05.P13` - Apply materialization and rollback

Materialize only approved proposals through the core adapter and preserve receipts, preimages, partial outcomes, and rollback availability.

- [ ] `W05.P13.S61` - Ground apply materialization, rollback, core abstraction, and receipt requirements into the phase checklist; `.vault/adr/`.
- [ ] `W05.P13.S62` - Implement approved-proposal apply jobs, core adapter calls, materialization receipts, preimage capture, and rollback proposal creation; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [ ] `W05.P13.S63` - Add apply and rollback tests for approved-only gates, partial failures, receipt recovery, and preimage retention; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [ ] `W05.P13.S64` - Run apply and rollback code review and record the phase audit; `.vault/audit/`.
- [ ] `W05.P13.S65` - Verify approved changes materialize through core and rejected changes never do via tests and manual vault file checks; `engine/crates/vaultspec-api/src/authoring/apply.rs`.

### Phase `W05.P14` - Multiagent composition and scheduling

Coordinate multiple agent runs that propose, rewrite, supersede, or compose changes against shared documents and review queues.

- [ ] `W05.P14.S66` - Ground multiagent composition, proposal merge, cancellation, and scheduling requirements into the phase checklist; `.vault/adr/`.
- [ ] `W05.P14.S67` - Implement composition policies, run ownership records, proposal merge commands, supersession rules, and cancellation propagation; `engine/crates/vaultspec-api/src/authoring/composition.rs`.
- [ ] `W05.P14.S68` - Add multiagent tests for competing proposals, compatible merges, superseded runs, cancellation, and review queue preservation; `engine/crates/vaultspec-api/src/authoring/composition.rs`.
- [ ] `W05.P14.S69` - Run multiagent composition code review and record the phase audit; `.vault/audit/`.
- [ ] `W05.P14.S70` - Verify concurrent agents cannot overwrite each other without explicit composition decisions via tests and manual multi-run API checks; `engine/crates/vaultspec-api/src/authoring/composition.rs`.

### Phase `W05.P15` - Frontend stores and epic acceptance

Expose the authoring backend through the dashboard stores and review station, then prove the whole approval-driven workflow end to end.

- [ ] `W05.P15.S71` - Ground frontend store, review station, direct editing, and end-to-end acceptance requirements into the phase checklist; `.vault/adr/`.
- [ ] `W05.P15.S72` - Implement authoring wire clients, query keys, mutations, replay cursors, and backend-served projection consumers; `frontend/src/stores/server/authoring.ts`.
- [ ] `W05.P15.S73` - Implement review station surfaces, proposal diff views, approval actions, lease indicators, and recovery states; `frontend/src/app/authoring/`.
- [ ] `W05.P15.S74` - Add end-to-end workflow tests for human edit, agent proposal, approval, rejection, apply, rollback, conflict, and reconnect paths; `frontend/e2e/authoring.spec.ts`.
- [ ] `W05.P15.S75` - Run final code review, documentation audit, and release readiness audit for the epic; `.vault/audit/`.
- [ ] `W05.P15.S76` - Verify the dashboard and LangGraph agent both complete the approval-driven document authoring workflow through automated tests and manual acceptance checks; `frontend/e2e/authoring.spec.ts`.

## Description

This is one principal feature plan for the documentation authoring backend. The
accepted ADRs are separate decisions because they settle different architectural
questions, but they belong to the same feature cluster: a Rust backend surface
that lets frontend users and LangGraph agents collaborate on vault documents
through backend-owned sessions, proposals, approvals, leases, streams, apply
receipts, rollback records, and review projections.

The plan keeps vaultspec-core behind the materialization adapter. Frontend
stores and LangGraph tools both call the semantic authoring API. Agents may
draft, validate, propose, request review, and request apply, but they do not
write vault documents directly and they do not expose core-shaped verbs to
collaborators.

The endpoint contract is organized around semantic families rather than exact
route spelling at this stage: sessions and runs, document snapshots and chunks,
proposal commands, review commands, apply commands, rollback commands, lease
commands, durable event replay, and recovery snapshots. Every mutating family
carries scoped idempotency. Every snapshot and recovery response carries the
shared tiers block. Backend projections, not frontend inference, serve review
counts, action eligibility, conflict reasons, apply receipts, and rollback
availability.

## Steps

The structural plan above is the executable rollout: 5 Waves, 15 Phases, and 76
Steps. Each Phase begins with ADR grounding and closes with code review or audit
plus a concrete verification Step. Step execution records should be scaffolded
from this plan after approval.

## Parallelization

Waves are sequenced by dependency. W01 must land first because it defines the
authoring boundary, typed vocabulary, and shared DTO contract. W02 depends on
that vocabulary and creates durable product state. W03 depends on the store and
ledger so document identity, chunks, leases, conflicts, and live room snapshots
can persist. W04 depends on W02 and W03 because LangGraph tools, outbox events,
and policy enforcement must operate over real product records. W05 is last
because apply, rollback, multiagent composition, frontend review surfaces, and
end-to-end acceptance depend on the complete backend contract.

Within W01, P01 and P02 can be developed in parallel once the boundary checklist
is agreed, while P03 should wait for the model names to stabilize. Within W02,
P04 is the hard gate; P05 and P06 can proceed in parallel after the repository
boundary exists. Within W03, P07 should land before P08 and P09 because leases
and room snapshots need stable document references. Within W04, P10 and P12 can
start from the shared API contract, while P11 should wait for store and event
repositories. Within W05, P13 and P14 can proceed in parallel after W04, and
P15 remains the final integration and acceptance phase.

## Verification

The plan is complete when every Step is closed and the project-management
association reports the epic complete.

- Backend contract tests verify that authoring responses use shared envelopes,
  carry tiers, enforce bearer and policy checks, and expose semantic command
  families rather than core-shaped writes.
- Store tests verify migrations, schema mismatch failure, process-restart
  recovery, retention classes, append-only ledgers, and idempotent command
  replay against the real store implementation.
- Collaboration tests verify two direct or delegated editors receive
  deterministic leases, conflicts, rebases, recovery snapshots, and durable
  event replay.
- LangGraph adapter tests verify threads, runs, interrupts, tool calls, and
  checkpoint references create backend product records and resume by stable
  interrupt identifiers.
- Apply and rollback tests verify approved changes materialize through the core
  adapter, rejected changes never materialize, receipts survive recovery, and
  rollback availability is explicit.
- Frontend and end-to-end tests verify human edits, agent proposals, review
  approval, rejection, request-changes, apply, rollback, conflict, reconnect,
  and multiagent flows through the dashboard stores and review station.
- Manual acceptance verifies the dashboard and a LangGraph agent can complete
  the approval-driven document authoring workflow against the running backend.
- The final gate includes Rust tests, frontend typecheck, frontend tests,
  frontend build, vault checks, and a vaultspec-code-review audit with no
  unresolved HIGH findings.
