---
tags:
  - '#plan'
  - '#agentic-spec-authoring-backend'
date: '2026-06-30'
modified: '2026-07-08'
tier: L4
related:
  - '[[2026-07-02-agentic-spec-authoring-backend-reference]]'
  - '[[2026-07-02-agentic-operation-modes-adr]]'
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

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

<!-- RETIRED: W04, W05, W06, W07, W08, W09, P12, P29, P37, S56, S57, S58, S59, S60, S141, S142, S143, S144, S145, S181, S182, S183, S184, S185 -->

# `agentic-spec-authoring-backend` plan

## Epic intent

Project-management association: vaultspec dashboard roadmap entry agentic-spec-authoring-backend, tracked by this L4 plan and its generated Step execution records until an external board is opened. The epic delivers a Rust authoring backend that mediates human and LangGraph collaborators through semantic sessions, proposals, approvals, leases, durable streams, apply receipts, rollback records, and backend-served review projections while keeping vaultspec-core hidden behind the materialization adapter.

## Wave `W01` - Authoring boundary and contract

Establish the fenced Rust authoring backend, shared wire grammar, semantic command vocabulary, and V1 schema contract before any durable mutation path is enabled.

### Phase `W01.P01` - Fenced module and route ownership

Create the authoring module boundary and route ownership map beside the existing Axum route families.

- [x] `W01.P01.S01` - Ground Fenced module and route ownership requirements into the phase checklist; `.vault/adr/`.
- [x] `W01.P01.S02` - Implement the authoring module shell, feature gate, route registration seam, and ownership map; `engine/crates/vaultspec-api/src/authoring/`.
- [x] `W01.P01.S03` - Add route shell tests for disabled-state behavior, bearer gating, and shared route registration; `engine/crates/vaultspec-api/src/routes/`.
- [x] `W01.P01.S04` - Run Fenced module and route ownership code review and record the phase audit; `.vault/audit/`.
- [x] `W01.P01.S05` - Verify the authoring module is reachable only through the intended route family and disabled-safe responses; `engine/crates/vaultspec-api/src/routes/`.

### Phase `W01.P02` - Shared envelope and disabled-state contract

Make authoring success, failure, disabled-state, and recovery responses conform to the dashboard wire contract.

- [x] `W01.P02.S06` - Ground Shared envelope and disabled-state contract requirements into the phase checklist; `.vault/adr/`.
- [x] `W01.P02.S07` - Implement authoring response helpers for snapshots, command receipts, typed errors, degraded tiers, and disabled-state payloads; `engine/crates/vaultspec-api/src/authoring/response.rs`.
- [x] `W01.P02.S08` - Add response grammar tests for success, validation failure, unauthorized, degraded, replayed, and disabled responses; `engine/crates/vaultspec-api/src/authoring/response.rs`.
- [x] `W01.P02.S09` - Run Shared envelope and disabled-state contract code review and record the phase audit; `.vault/audit/`.
- [x] `W01.P02.S10` - Verify every non-raw authoring response carries the shared envelope and tiers block; `engine/crates/vaultspec-api/src/authoring/response.rs`.

### Phase `W01.P03` - Command vocabulary and aggregate identifiers

Define the shared lifecycle terms, aggregate identifiers, and semantic command names consumed by routes, repositories, frontend stores, and agents.

- [x] `W01.P03.S11` - Ground Command vocabulary and aggregate identifiers requirements into the phase checklist; `.vault/adr/`.
- [x] `W01.P03.S12` - Implement typed aggregate identifiers, command names, lifecycle enums, actor references, document references, and receipt references; `engine/crates/vaultspec-api/src/authoring/model.rs`.
- [x] `W01.P03.S13` - Add model tests for stable serialization, invalid identifiers, terminal states, and action eligibility; `engine/crates/vaultspec-api/src/authoring/model.rs`.
- [x] `W01.P03.S14` - Run Command vocabulary and aggregate identifiers code review and record the phase audit; `.vault/audit/`.
- [x] `W01.P03.S15` - Verify frontend and agent fixtures can serialize the same command vocabulary without core-shaped verbs; `engine/crates/vaultspec-api/src/authoring/model.rs`.

### Phase `W01.P04` - V1 DTO schema and route fixtures

Encode versioned request, response, event, and route fixtures for every semantic endpoint family.

- [x] `W01.P04.S16` - Ground V1 DTO schema and route fixtures requirements into the phase checklist; `.vault/adr/`.
- [x] `W01.P04.S17` - Implement V1 DTOs and route fixtures for sessions, documents, proposals, reviews, apply, rollback, leases, streams, and recovery; `engine/crates/vaultspec-api/src/authoring/api.rs`.
- [x] `W01.P04.S18` - Add schema fixture tests for versioning, idempotency fields, unknown-field rejection, tiers, and route-family negative cases; `engine/crates/vaultspec-api/src/authoring/api.rs`.
- [x] `W01.P04.S19` - Run V1 DTO schema and route fixtures code review and record the phase audit; `.vault/audit/`.
- [x] `W01.P04.S20` - Verify every endpoint family has a versioned DTO fixture and a negative contract case; `engine/crates/vaultspec-api/src/authoring/api.rs`.

## Wave `W02` - Durable store infrastructure

Introduce the non-derivable authoring store, migrations, repository boundaries, idempotency records, retention policy, and outbox primitive.

### Phase `W02.P05` - Physical store binding and migrations

Bind the durable authoring store with fail-loud migrations and version checks.

- [x] `W02.P05.S21` - Ground Physical store binding and migrations requirements into the phase checklist; `.vault/adr/`.
- [x] `W02.P05.S22` - Implement authoring store connection management, migration runner, schema metadata, and fail-loud version checks; `engine/crates/vaultspec-api/src/authoring/store/`.
- [x] `W02.P05.S23` - Add real store tests for migration ordering, clean open, version mismatch, and corrupted migration metadata; `engine/crates/vaultspec-api/src/authoring/store/`.
- [x] `W02.P05.S24` - Run Physical store binding and migrations code review and record the phase audit; `.vault/audit/`.
- [x] `W02.P05.S25` - Verify store state survives restart and schema mismatch fails loud through tests and manual database inspection; `engine/crates/vaultspec-api/src/authoring/store/`.

### Phase `W02.P06` - Repository traits and unit of work

Centralize repository contracts and transaction boundaries for product state mutations.

- [x] `W02.P06.S26` - Ground Repository traits and unit of work requirements into the phase checklist; `.vault/adr/`.
- [x] `W02.P06.S27` - Implement repository traits, transaction helpers, unit-of-work boundaries, and rollback-on-error behavior; `engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`.
- [x] `W02.P06.S28` - Add transaction tests for committed commands, rolled-back failures, nested repository use, and concurrent writers; `engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`.
- [x] `W02.P06.S29` - Run Repository traits and unit of work code review and record the phase audit; `.vault/audit/`.
- [x] `W02.P06.S30` - Verify every mutating command can run inside one explicit unit of work; `engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`.

### Phase `W02.P07` - Idempotency outcome repository

Persist scoped command outcomes so frontend and agent retries replay without duplicate side effects.

- [x] `W02.P07.S31` - Ground Idempotency outcome repository requirements into the phase checklist; `.vault/adr/`.
- [x] `W02.P07.S32` - Implement scoped idempotency keys, command outcome records, in-flight state records, and replay lookup helpers; `engine/crates/vaultspec-api/src/authoring/store/idempotency.rs`.
- [x] `W02.P07.S33` - Add idempotency tests for duplicate create, duplicate apply, in-flight replay, conflicting scope, and expired outcome records; `engine/crates/vaultspec-api/src/authoring/store/idempotency.rs`.
- [x] `W02.P07.S34` - Run Idempotency outcome repository code review and record the phase audit; `.vault/audit/`.
- [x] `W02.P07.S35` - Verify repeated frontend and agent commands return the recorded outcome without duplicating product records; `engine/crates/vaultspec-api/src/authoring/store/idempotency.rs`.

### Phase `W02.P08` - Retention compaction and backup classes

Define retention classes, compaction rules, backup export, and protected record behavior for non-derivable authoring state.

- [x] `W02.P08.S36` - Ground Retention compaction and backup classes requirements into the phase checklist; `.vault/adr/`.
- [x] `W02.P08.S37` - Implement retention classes, compaction markers, backup export metadata, protected preimage rules, and status reporting; `engine/crates/vaultspec-api/src/authoring/store/retention.rs`.
- [x] `W02.P08.S38` - Add retention tests for pending approvals, applied preimages, rejected transcripts, compaction limitations, and backup export coverage; `engine/crates/vaultspec-api/src/authoring/store/retention.rs`.
- [x] `W02.P08.S39` - Run Retention compaction and backup classes code review and record the phase audit; `.vault/audit/`.
- [x] `W02.P08.S40` - Verify compaction cannot silently delete pending approvals, apply receipts, or rollback preimages; `engine/crates/vaultspec-api/src/authoring/store/retention.rs`.

### Phase `W02.P09` - Outbox primitive and sequence allocation

Create the transactional outbox primitive and durable sequence allocation before event publishing is wired.

- [x] `W02.P09.S41` - Ground Outbox primitive and sequence allocation requirements into the phase checklist; `.vault/adr/`.
- [x] `W02.P09.S42` - Implement outbox records, sequence allocation, publication state, restart recovery, and duplicate publication guards; `engine/crates/vaultspec-api/src/authoring/store/outbox.rs`.
- [x] `W02.P09.S43` - Add outbox primitive tests for commit atomicity, sequence monotonicity, worker restart, and duplicate suppression; `engine/crates/vaultspec-api/src/authoring/store/outbox.rs`.
- [x] `W02.P09.S44` - Run Outbox primitive and sequence allocation code review and record the phase audit; `.vault/audit/`.
- [x] `W02.P09.S45` - Verify durable event records commit with product state and survive restart before publication; `engine/crates/vaultspec-api/src/authoring/store/outbox.rs`.

## Wave `W03` - Increment 1 - Walking skeleton (propose, review, apply, rollback; manual mode)

Deliver the thinnest end-to-end path through every layer: one human or scripted client creates a single-child body-edit proposal on a real vault document, sees its diff, has a human approve or reject it in the dashboard, watches an approved change materialize through the core adapter, and rolls it back from its preimage. Polling only; manual mode only; single reviewer; no sessions, leases, LangGraph, streams, sections, or chunks.

### Phase `W03.P10` - Document reference resolver

Resolve existing and provisional vault documents through stable references without exposing core internals.

- [x] `W03.P10.S46` - Ground Document reference resolver requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P10.S47` - Implement document_ref resolution, provisional create targets, duplicate stem handling, missing target handling, and ref snapshot lookup; `engine/crates/vaultspec-api/src/authoring/documents.rs`.
- [x] `W03.P10.S48` - Add resolver tests for duplicate stems, renames, provisional creates, missing documents, ref scopes, and bounded listings; `engine/crates/vaultspec-api/src/authoring/documents.rs`.
- [x] `W03.P10.S49` - Run Document reference resolver code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P10.S50` - Verify document references remain stable across rename and provisional-create scenarios; `engine/crates/vaultspec-api/src/authoring/documents.rs`.

### Phase `W03.P11` - Revision snapshots and preimages

Capture revision metadata, before-state preimages, and snapshot recovery inputs for previews, apply, and rollback.

- [x] `W03.P11.S51` - Ground Revision snapshots and preimages requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P11.S52` - Implement revision metadata reads, target snapshots, preimage capture, snapshot hashes, and recovery payloads; `engine/crates/vaultspec-api/src/authoring/snapshots.rs`.
- [x] `W03.P11.S53` - Add snapshot tests for unchanged revision, stale base, missing preimage, hash mismatch, and restart recovery; `engine/crates/vaultspec-api/src/authoring/snapshots.rs`.
- [x] `W03.P11.S54` - Run Revision snapshots and preimages code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P11.S55` - Verify apply and rollback inputs can recover exact preimages through tests and manual snapshot inspection; `engine/crates/vaultspec-api/src/authoring/snapshots.rs`.

### Phase `W03.P13` - Proposal operation payloads and previews (whole-document subset)

V1 subset for the walking skeleton: represent whole-document operations with materialized previews and reviewable diffs. Section-scoped and atomic-hunk operations defer to the Increment 5 conditional remainder phase.

- [x] `W03.P13.S61` - Ground Proposal operation payloads and previews requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P13.S62` - Implement proposal operation payloads, whole-document drafts, atomic patches, materialized preview builders, and review diff projections; `engine/crates/vaultspec-api/src/authoring/operations.rs`.
- [x] `W03.P13.S63` - Add operation tests for full replacement, create, delete, atomic hunk, preview recovery, semantic diff, and invalid range cases; `engine/crates/vaultspec-api/src/authoring/operations.rs`.
- [x] `W03.P13.S64` - Run Proposal operation payloads and previews code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P13.S65` - Verify reviewers can inspect proposal material before apply through tests and manual diff fixture review; `engine/crates/vaultspec-api/src/authoring/operations.rs`.

### Phase `W03.P14` - Validation digest and stale-input detection

Persist validation digests and detect stale bases, stale approvals, changed chunks, and invalid metadata before review or apply.

- [x] `W03.P14.S66` - Ground Validation digest and stale-input detection requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P14.S67` - Implement validation digests, stale-input checks, validation status records, warning states, and blocking error records; `engine/crates/vaultspec-api/src/authoring/validation.rs`.
- [x] `W03.P14.S68` - Add validation tests for valid proposals, invalid frontmatter, stale chunks, changed base revision, warning-only status, and blocking failures; `engine/crates/vaultspec-api/src/authoring/validation.rs`.
- [x] `W03.P14.S69` - Run Validation digest and stale-input detection code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P14.S70` - Verify stale or invalid proposals cannot become approval-ready without a fresh validation digest; `engine/crates/vaultspec-api/src/authoring/validation.rs`.

### Phase `W03.P15` - Changeset aggregate and child operations

Persist changesets as append-only aggregates with explicit child operations and target ordering.

- [x] `W03.P15.S71` - Ground Changeset aggregate and child operations requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P15.S72` - Implement changeset aggregate records, child operation records, target ordering, revision linkage, and audit-friendly identifiers; `engine/crates/vaultspec-api/src/authoring/ledger.rs`.
- [x] `W03.P15.S73` - Add ledger tests for append-only revisions, child ordering, duplicate child rejection, multi-document changes, and history reconstruction; `engine/crates/vaultspec-api/src/authoring/ledger.rs`.
- [x] `W03.P15.S74` - Run Changeset aggregate and child operations code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P15.S75` - Verify changeset history reconstructs proposal state without LangGraph checkpoints or frontend memory; `engine/crates/vaultspec-api/src/authoring/ledger.rs`.

### Phase `W03.P16` - Transition engine and terminal-state validation

Centralize legal lifecycle transitions and terminal-state guards for sessions, proposals, approvals, applies, and rollbacks. The transition engine enforces the amended apply-materialization ADR's single-child apply restriction, and keeps the two staged multi-document apply lifecycle statuses reserved but unreachable until vaultspec-core provides a batch transaction capability.

- [x] `W03.P16.S76` - Ground Transition engine and terminal-state validation requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P16.S77` - Implement lifecycle transition rules, terminal-state validation, stale-state guards, and action eligibility helpers; `engine/crates/vaultspec-api/src/authoring/transitions.rs`.
- [x] `W03.P16.S78` - Add transition tests for illegal moves, terminal refusal, stale approval, cancelled run, rejected proposal, and rollback terminal states; `engine/crates/vaultspec-api/src/authoring/transitions.rs`.
- [x] `W03.P16.S79` - Run Transition engine and terminal-state validation code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P16.S80` - Verify every command uses the shared transition engine through tests and manual transition table review; `engine/crates/vaultspec-api/src/authoring/transitions.rs`.

### Phase `W03.P17` - Proposal command handlers

Create, append, replace, validate, submit, supersede, and cancel proposals through backend-owned commands.

- [x] `W03.P17.S81` - Ground Proposal command handlers requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P17.S82` - Implement proposal creation, material append, draft replacement, validate, submit, supersede, cancel, and snapshot handlers; `engine/crates/vaultspec-api/src/authoring/proposal.rs`.
- [x] `W03.P17.S83` - Add command tests for ordered revisions, replayed writes, validation gates, terminal refusal, supersession, and cancellation; `engine/crates/vaultspec-api/src/authoring/proposal.rs`.
- [x] `W03.P17.S84` - Run Proposal command handlers code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P17.S85` - Verify proposal lifecycle transitions are idempotent and backend-owned through tests and manual command replay; `engine/crates/vaultspec-api/src/authoring/proposal.rs`.

### Phase `W03.P19` - Actor model and delegated scopes (minimal-actor subset)

V1 subset for the walking skeleton: model human and agent actor identity and stable provenance keys so every ledger record is actor-attributed from day one. Service identities and delegated scopes defer to the Increment 5 remainder folded into W05.P20.

- [x] `W03.P19.S91` - Ground Actor model and delegated scopes requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P19.S92` - Implement actor records, service identities, delegated scopes, stable provenance keys, and actor display metadata; `engine/crates/vaultspec-api/src/authoring/actors.rs`.
- [x] `W03.P19.S93` - Add actor tests for human identity, agent identity, delegated scope, missing actor, stale actor, and provenance key stability; `engine/crates/vaultspec-api/src/authoring/actors.rs`.
- [x] `W03.P19.S94` - Run Actor model and delegated scopes code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P19.S95` - Verify every mutation can be attributed to a stable actor and delegated scope; `engine/crates/vaultspec-api/src/authoring/actors.rs`.

### Phase `W03.P35` - Core adapter capability registry

Wrap vaultspec-core as a private bounded adapter with explicit capability mapping, caps, timeouts, and tiered failures.

- [x] `W03.P35.S171` - Ground Core adapter capability registry requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P35.S172` - Implement core capability registry, argument builders, bounded subprocess calls, timeout handling, output caps, and safe error mapping; `engine/crates/vaultspec-api/src/authoring/core_adapter.rs`.
- [x] `W03.P35.S173` - Add core adapter tests for validation, apply, timeout, output cap, error redaction, missing core, and forbidden direct verb exposure; `engine/crates/vaultspec-api/src/authoring/core_adapter.rs`.
- [x] `W03.P35.S174` - Run Core adapter capability registry code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P35.S175` - Verify collaborators cannot see or invoke core-shaped writes through tests and manual route checks; `engine/crates/vaultspec-api/src/authoring/core_adapter.rs`.

### Phase `W03.P23` - Changeset approval requests and decisions (approve/reject subset)

V1 subset for the walking skeleton: persist approval requests, approve/reject decisions bound to the reviewed tuple, and stale invalidation; the V1 queue is queued / decision_submitted / closed. Request-changes, edit-response loops, and claims defer to the Increment 5 remainder folded into W05.P24, where the claimed state activates.

- [x] `W03.P23.S111` - Ground Changeset approval requests and decisions requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P23.S112` - Implement approval request, approve, reject, request-changes, edit response, stale invalidation, and approval snapshot handlers; `engine/crates/vaultspec-api/src/authoring/approvals.rs`.
- [x] `W03.P23.S113` - Add approval tests for approved proposal, rejected proposal, request-changes, stale revision, replayed decision, and conflicting reviewer action; `engine/crates/vaultspec-api/src/authoring/approvals.rs`.
- [x] `W03.P23.S114` - Run Changeset approval requests and decisions code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P23.S115` - Verify approved and rejected proposals surface correct durable approval state through tests and manual review API checks; `engine/crates/vaultspec-api/src/authoring/approvals.rs`.

### Phase `W03.P36` - Apply job state machine and receipts

Run approved proposal materialization as durable jobs with approval freshness checks, per-child receipts, and recovery. V1 apply accepts only single-child changesets per the amended apply-materialization ADR; a multi-child changeset is refused with an honest typed capability result naming the limit.

- [x] `W03.P36.S176` - Ground Apply job state machine and receipts requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P36.S177` - Implement apply job states, approval freshness checks, staged execution, per-child receipts, post-write hashes, progress, and recovery handlers; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [x] `W03.P36.S178` - Add apply tests for approved-only gates, stale approval, rejected proposal, partial failure, restart recovery, and idempotent apply request; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [x] `W03.P36.S179` - Run Apply job state machine and receipts code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P36.S180` - Verify approved changes materialize once and rejected or stale changes never materialize; `engine/crates/vaultspec-api/src/authoring/apply.rs`.

### Phase `W03.P38` - Rollback generator and eligibility (whole-document subset)

V1 subset for the walking skeleton: rollback is whole-document preimage restore, with an honest rollback_available=false reason for everything else. Per-operation rollback inverses defer to the Increment 5 remainder, evidence-gated.

- [x] `W03.P38.S186` - Ground Rollback generator and eligibility requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P38.S187` - Implement rollback proposal generation, operation-specific inverse logic, eligibility projection, unavailable reasons, and manual repair proposal hooks; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.
- [x] `W03.P38.S188` - Add rollback tests for available preimage, missing preimage, delete inverse, rename inverse, approval gate, repeated request, and manual repair fallback; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.
- [x] `W03.P38.S189` - Run Rollback generator and eligibility code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P38.S190` - Verify rollback is reviewable and unavailable rollback is explicit through tests and manual rollback API checks; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.

### Phase `W03.P18` - Projection rebuilders and eligibility state (skeleton subset)

V1 subset for the walking skeleton: serve the proposal list, action eligibility, conflict reason, validation status, and rollback availability the skeleton UI needs. Counts and per-document activity rollups defer to the Increment 3 remainder.

- [x] `W03.P18.S86` - Ground Projection rebuilders and eligibility state requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P18.S87` - Implement projection rebuilders for review counts, per-document activity, action eligibility, conflicts, validation state, and rollback availability; `engine/crates/vaultspec-api/src/authoring/projections.rs`.
- [x] `W03.P18.S88` - Add projection tests for rebuild after restart, stale data, eligibility reasons, conflict state, rollback availability, and bounded projection reads; `engine/crates/vaultspec-api/src/authoring/projections.rs`.
- [x] `W03.P18.S89` - Run Projection rebuilders and eligibility state code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P18.S90` - Verify frontend-visible status and eligibility are backend-served and rebuildable through tests and manual projection checks; `engine/crates/vaultspec-api/src/authoring/projections.rs`.

### Phase `W03.P39` - Backend route vertical slices (walking-skeleton exit gate)

V1 subset as Increment 1's exit gate: one real vertical-slice test, two actors, stale base cannot apply, reject mutates nothing, apply idempotent under retry, rollback appends, over real routes, real store, and the real core adapter. The full endpoint-family sweep widens as later increments land their subsystems.

- [x] `W03.P39.S191` - Ground Backend route vertical slices requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P39.S192` - Implement backend vertical-slice tests for proposals, reviews, apply, rollback, and recovery (sessions/leases/streams deferred to their own phases); `engine/crates/vaultspec-api/tests/authoring_vertical_slices.rs`.
- [x] `W03.P39.S193` - Add end-to-end backend scenarios for human edit, agent proposal, approval, rejection, conflict, apply, and rollback (reconnect deferred to the streams phase); `engine/crates/vaultspec-api/tests/authoring_vertical_slices.rs`.
- [x] `W03.P39.S194` - Run Backend route vertical slices code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P39.S195` - Verify every in-scope endpoint family works through real backend routes and real product state (F1 narrowing, ASA-P39-review); `engine/crates/vaultspec-api/tests/authoring_vertical_slices.rs`.

### Phase `W03.P40` - Frontend store and review station contract (thin skeleton subset)

V1 subset for the walking skeleton, run in parallel with the ledger, actor, and adapter work once DTOs are consumed: a thin review surface, proposal list, diff view reusing the existing reader/diff machinery, approve/reject buttons, polling refresh. The user is part of the loop; the skeleton is not done until a human can click deny. Streamed replay and richer store consumption widen in later increments.

- [x] `W03.P40.S196` - Ground Frontend store and review station contract requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P40.S197` - Implement authoring wire clients, query keys, mutations, replay cursors, review queue consumers, and degraded response handling; `frontend/src/stores/server/authoring.ts`.
- [x] `W03.P40.S198` - Add frontend store tests for snapshots, commands, idempotency replay, stream cursor recovery, review queues, and degraded responses; `frontend/src/stores/server/authoring.test.ts`.
- [x] `W03.P40.S199` - Run Frontend store and review station contract code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P40.S200` - Verify the Increment 1 demo: live end-to-end run on a real worktree, propose, deny (nothing changes), propose again, approve, applied document visible in the graph/reader via the existing watcher path, roll back, preimage restored, full history in the ledger; `frontend/src/stores/server/authoring.test.ts`.

## Wave `W10` - Increment 2 - Operation modes (the accepted headline capability)

Ship the accepted agentic-operation-modes ADR end to end: manual / assisted / autonomous as policy data, system-actor auto-approval traversing the canonical lifecycle, the after-the-fact review lane, the kill switch, and the first half of the unified write path (the editor save behind a feature flag, dual-run against the legacy /ops/core broker).

### Phase `W10.P21` - Approval policy matrix

Represent approval requirements, freshness rules, reviewer eligibility, and tool permission gates as backend policy data. Extended for Increment 2 with named mode bundles (manual / assisted / autonomous) and per-scope mode selection with a narrowing-only per-session override, per the accepted operation-modes ADR.

- [x] `W10.P21.S101` - Ground Approval policy matrix requirements into the phase checklist; `.vault/adr/`.
- [x] `W10.P21.S102` - Implement approval policy matrix, freshness checks, reviewer eligibility, tool permission gates, and policy reason projection; `engine/crates/vaultspec-api/src/authoring/policy.rs`.
- [x] `W10.P21.S103` - Add policy tests for reviewer eligibility, stale validation, dangerous tool request, self-approval refusal, and request-changes loops; `engine/crates/vaultspec-api/src/authoring/policy.rs`.
- [x] `W10.P21.S104` - Run Approval policy matrix code review and record the phase audit; `.vault/audit/`.
- [x] `W10.P21.S105` - Verify approval decisions are governed by backend policy rather than frontend inference; `engine/crates/vaultspec-api/src/authoring/policy.rs`.

### Phase `W10.P48` - System-actor auto-approval, after-the-fact review lane, and kill switch

Grounded on the accepted operation-modes ADR: eligible non-destructive changesets auto-approve under a recorded system-actor policy decision while traversing the canonical lifecycle unchanged, the review-station projection gains the after-the-fact review lane plus its thin frontend lane with one-command rollback, and a mode downgrade re-queues in-flight auto-approvals for human review via the existing policy-change stale trigger.

- [x] `W10.P48.S216` - Ground System-actor auto-approval, after-the-fact review lane, and kill switch requirements into the phase checklist; `.vault/adr/`.
- [x] `W10.P48.S217` - Implement mode-scoped system-actor auto-approval, the after-the-fact review-station lane, kill-switch re-queue on mode downgrade, and its thin frontend lane with one-command rollback; `engine/crates/vaultspec-api/src/authoring/modes.rs`.
- [x] `W10.P48.S218` - Add mode tests for eligible auto-approval, the destructive-op human floor, after-the-fact lane contents, kill-switch re-queue, and stale system approval on policy downgrade; `engine/crates/vaultspec-api/src/authoring/modes.rs`.
- [x] `W10.P48.S219` - Run System-actor auto-approval, after-the-fact review lane, and kill switch code review and record the phase audit; `.vault/audit/`.
- [x] `W10.P48.S220` - Verify eligible changesets auto-approve under system-actor authority, appear in the after-the-fact lane with rollback available, and a mode downgrade re-queues in-flight auto-approvals for human review; `engine/crates/vaultspec-api/src/authoring/modes.rs`.

### Phase `W10.P49` - Unified write path: direct-changeset dual-run for the editor save

Transition-state half of the unified write path: the editor save creates a kind=direct self-approved changeset behind a feature flag, dual-running against the legacy /ops/core broker while latency and conflict-UX parity are measured; broker retirement is Increment 6, gated on this evidence.

- [x] `W10.P49.S221` - Ground Unified write path: direct-changeset dual-run for the editor save requirements into the phase checklist; `.vault/adr/`.
- [x] `W10.P49.S222` - Implement the kind=direct self-approved changeset path behind a feature flag, dual-running the editor save against the legacy /ops/core broker; `engine/crates/vaultspec-api/src/authoring/direct_write.rs`.
- [x] `W10.P49.S223` - Add dual-run tests for human self-approval legality, preimage capture, latency parity measurement, and conflict-UX parity against the legacy broker; `engine/crates/vaultspec-api/src/authoring/direct_write.rs`.
- [x] `W10.P49.S224` - Run Unified write path: direct-changeset dual-run for the editor save code review and record the phase audit; `.vault/audit/`.
- [x] `W10.P49.S225` - Verify the Increment 2 demo: set scope to autonomous, have a script propose a body edit, watch it apply with no human gate, find it in the after-the-fact lane, roll it back, then flip the kill switch mid-flight and watch a pending auto-approval re-queue for manual review; `engine/crates/vaultspec-api/src/authoring/direct_write.rs`.

## Wave `W11` - Increment 3 - Streams and recovery (activate the shipped outbox)

Replace polling with the durable lifecycle stream and prove recovery survives restart and reconnect, activating the W02.P09 outbox primitive that already exists.

### Phase `W11.P33` - Durable lifecycle events and projector feed

Define event schemas and feed projection rebuilders from durable lifecycle transitions rather than token streams.

- [x] `W11.P33.S161` - Ground Durable lifecycle events and projector feed requirements into the phase checklist; `.vault/adr/`.
- [x] `W11.P33.S162` - Implement durable lifecycle event schemas, projector feed records, event versioning, and transition-to-event mapping; `engine/crates/vaultspec-api/src/authoring/events.rs`.
- [x] `W11.P33.S163` - Add event tests for session created, proposal updated, validation changed, approval resolved, apply recorded, rollback created, and version rejection; `engine/crates/vaultspec-api/src/authoring/events.rs`.
- [x] `W11.P33.S164` - Run Durable lifecycle events and projector feed code review and record the phase audit; `.vault/audit/`.
- [x] `W11.P33.S165` - Verify lifecycle projections rebuild from durable events and not transient generation chunks; `engine/crates/vaultspec-api/src/authoring/events.rs`.

### Phase `W11.P34` - Stream replay and generation retention

Serve SSE replay, snapshot-plus-next-sequence recovery, bounded generation streams, and transcript compaction.

- [x] `W11.P34.S166` - Ground Stream replay and generation retention requirements into the phase checklist; `.vault/adr/`.
- [x] `W11.P34.S167` - Implement stream subscriptions, last-sequence replay, gap events, snapshot recovery, bounded generation channels, and transcript compaction hooks; `engine/crates/vaultspec-api/src/authoring/stream.rs`.
- [x] `W11.P34.S168` - Add stream tests for replay, gaps, snapshot recovery, token retention caps, compacted transcripts, and frontend cursor restoration; `engine/crates/vaultspec-api/src/authoring/stream.rs`.
- [x] `W11.P34.S169` - Run Stream replay and generation retention code review and record the phase audit; `.vault/audit/`.
- [x] `W11.P34.S170` - Verify clients recover lifecycle truth after stream loss while token gaps remain non-authoritative; `engine/crates/vaultspec-api/src/authoring/stream.rs`.

### Phase `W11.P50` - Per-document activity and count projections (W04.P18 remainder)

Deferred remainder of the Increment 1 review-projection subset: review counts and per-document activity feeds, now that a real usage history exists to roll up.

- [x] `W11.P50.S226` - Ground Per-document activity and count projections requirements into the phase checklist; `.vault/adr/`.
- [x] `W11.P50.S227` - Implement review count rollups and per-document activity projections deferred from the Increment 1 review-projection subset; `engine/crates/vaultspec-api/src/authoring/projections.rs`.
- [x] `W11.P50.S228` - Add projection tests for count rollups, per-document activity feeds, and bounded activity reads; `engine/crates/vaultspec-api/src/authoring/projections.rs`.
- [x] `W11.P50.S229` - Run Per-document activity and count projections code review and record the phase audit; `.vault/audit/`.
- [x] `W11.P50.S230` - Verify counts and per-document activity are backend-served and rebuildable alongside the Increment 1 eligibility projections; `engine/crates/vaultspec-api/src/authoring/projections.rs`.

### Phase `W11.P51` - Frontend stream cursor: swap polling for the authoring lifecycle stream

Swap the review station's polling refresh for a store-owned authoring lifecycle stream cursor, mirroring the graph stream's hardened reducer patterns.

- [x] `W11.P51.S231` - Ground Frontend stream cursor: swap polling for the authoring lifecycle stream requirements into the phase checklist; `.vault/adr/`.
- [x] `W11.P51.S232` - Implement the store-owned authoring lifecycle stream cursor replacing the review station's polling refresh, mirroring the graph stream's hardened reducer patterns; `frontend/src/stores/server/authoring.ts`.
- [x] `W11.P51.S233` - Add frontend stream tests for cursor advance, gap recovery, snapshot-plus-next-seq recovery, and reconnect resubscribe; `frontend/src/stores/server/authoring.test.ts`.
- [x] `W11.P51.S234` - Run Frontend stream cursor: swap polling for the authoring lifecycle stream code review and record the phase audit; `.vault/audit/`.
- [x] `W11.P51.S235` - Verify the Increment 3 demo: kill and restart the engine mid-review, then confirm the review surface recovers state and resumes the stream with no lost lifecycle events; `frontend/src/stores/server/authoring.ts`.

## Wave `W12` - Increment 4 - Agent runtime (LangGraph drives the loop)

Run a LangGraph agent through the whole Increment 1 and Increment 2 loop via semantic tools: sessions, runtime mapping, tool aliases, tool-permission interrupts, and the LangGraph fixture as this increment's exit gate.

### Phase `W12.P25` - Sessions prompt turns and recovery snapshots

Persist sessions, prompt turns, run ownership, active state, cancellation state, and recovery snapshots.

- [x] `W12.P25.S121` - Ground Sessions prompt turns and recovery snapshots requirements into the phase checklist; `.vault/adr/`.
- [x] `W12.P25.S122` - Implement session creation, prompt turns, run ownership, cancellation, active state, and recovery snapshot handlers; `engine/crates/vaultspec-api/src/authoring/session.rs`.
- [x] `W12.P25.S123` - Add session tests for create, resume, cancelled run, joined active run, restart recovery, and bounded session listings; `engine/crates/vaultspec-api/src/authoring/session.rs`.
- [x] `W12.P25.S124` - Run Sessions prompt turns and recovery snapshots code review and record the phase audit; `.vault/audit/`.
- [x] `W12.P25.S125` - Verify refreshed clients recover session and run state from backend snapshots; `engine/crates/vaultspec-api/src/authoring/session.rs`.

### Phase `W12.P30` - LangGraph runtime mapping

Map LangGraph threads, runs, checkpoints, and interrupt references to Vaultspec-owned product records.

- [x] `W12.P30.S146` - Ground LangGraph runtime mapping requirements into the phase checklist; `.vault/adr/`.
- [x] `W12.P30.S147` - Implement LangGraph runtime adapter, thread mapping, run mapping, checkpoint reference storage, and runtime error mapping; `engine/crates/vaultspec-api/src/authoring/langgraph.rs`.
- [x] `W12.P30.S148` - Add runtime mapping tests for unavailable runtime, thread creation, run references, checkpoint references, and redacted runtime errors; `engine/crates/vaultspec-api/src/authoring/langgraph.rs`.
- [x] `W12.P30.S149` - Run LangGraph runtime mapping code review and record the phase audit; `.vault/audit/`.
- [x] `W12.P30.S150` - Verify LangGraph checkpoints are references and never the only product history; `engine/crates/vaultspec-api/src/authoring/langgraph.rs`.

### Phase `W12.P31` - Semantic agent tool aliases

Expose context, search, propose, validate, request approval, cancel, and request apply as semantic tools over backend commands.

- [x] `W12.P31.S151` - Ground Semantic agent tool aliases requirements into the phase checklist; `.vault/adr/`.
- [x] `W12.P31.S152` - Implement the semantic agent tool catalog, tool schemas, bounded scope validation, and command dispatch aliases; `engine/crates/vaultspec-api/src/authoring/tools.rs`.
- [x] `W12.P31.S153` - Add tool tests for read context, search, propose, validate, approval request, cancel, apply request, and rejected core-shaped verb; `engine/crates/vaultspec-api/src/authoring/tools.rs`.
- [ ] `W12.P31.S154` - Run Semantic agent tool aliases code review and record the phase audit; `.vault/audit/`.
- [ ] `W12.P31.S155` - Verify agents can call semantic tools but cannot invoke direct core writes; `engine/crates/vaultspec-api/src/authoring/tools.rs`.

### Phase `W12.P22` - Tool permission request flow

Make dangerous or scoped agent tools produce durable permission requests and stable review decisions.

- [x] `W12.P22.S106` - Ground Tool permission request flow requirements into the phase checklist; `.vault/adr/`.
- [x] `W12.P22.S107` - Implement tool permission request creation, claim, decision, expiry, replay, and audit record handling; `engine/crates/vaultspec-api/src/authoring/permissions.rs`.
- [x] `W12.P22.S108` - Add permission tests for approved tool, rejected tool, expired request, replayed decision, and multiple simultaneous requests; `engine/crates/vaultspec-api/src/authoring/permissions.rs`.
- [ ] `W12.P22.S109` - Run Tool permission request flow code review and record the phase audit; `.vault/audit/`.
- [ ] `W12.P22.S110` - Verify agent tools cannot proceed past permission gates without durable human decisions; `engine/crates/vaultspec-api/src/authoring/permissions.rs`.

### Phase `W12.P32` - Interrupt resume and tool-call records

Normalize interrupts, permission requests, changeset approvals, and replay-safe tool-call records by stable IDs.

- [x] `W12.P32.S156` - Ground Interrupt resume and tool-call records requirements into the phase checklist; `.vault/adr/`.
- [x] `W12.P32.S157` - Implement interrupt normalization, resume-by-interrupt-id commands, tool-call records, decision payloads, and replay handling; `engine/crates/vaultspec-api/src/authoring/interrupts.rs`.
- [x] `W12.P32.S158` - Add interrupt tests for multiple interrupts, stable resume IDs, replayed tool call, rejected permission, approved proposal, and stale decision; `engine/crates/vaultspec-api/src/authoring/interrupts.rs`.
- [ ] `W12.P32.S159` - Run Interrupt resume and tool-call records code review and record the phase audit; `.vault/audit/`.
- [ ] `W12.P32.S160` - Verify human decisions resume the intended interrupt by stable ID through tests and manual LangGraph fixture replay; `engine/crates/vaultspec-api/src/authoring/interrupts.rs`.

### Phase `W12.P44` - Bounded generation channels and transcript compaction (W07.P34 remainder)

Deferred remainder of the Increment 3 stream subset: bounded generation and token channels, plus transcript compaction hooks, now that the agent runtime is producing real generations to bound.

- [x] `W12.P44.S236` - Ground Bounded generation channels and transcript compaction requirements into the phase checklist; `.vault/adr/`.
- [x] `W12.P44.S237` - Implement bounded generation and token channels plus transcript compaction hooks deferred from the Increment 3 stream subset; `engine/crates/vaultspec-api/src/authoring/stream.rs`.
- [x] `W12.P44.S238` - Add tests for token retention caps, compacted transcripts, and frontend cursor restoration of generation channels; `engine/crates/vaultspec-api/src/authoring/stream.rs`.
- [ ] `W12.P44.S239` - Run Bounded generation channels and transcript compaction code review and record the phase audit; `.vault/audit/`.
- [ ] `W12.P44.S240` - Verify generation and token channels stay bounded and transcripts compact without discarding lifecycle truth; `engine/crates/vaultspec-api/src/authoring/stream.rs`.

### Phase `W12.P41` - LangGraph agent fixture against backend commands

Run a LangGraph-backed fixture against semantic backend tools and approval interrupts.

- [x] `W12.P41.S201` - Ground LangGraph agent fixture against backend commands requirements into the phase checklist; `.vault/adr/`.
- [x] `W12.P41.S202` - Implement a LangGraph authoring fixture that creates proposals, pauses for approval, resumes, and requests apply through backend commands; `engine/crates/vaultspec-api/tests/langgraph_authoring_fixture.rs`.
- [x] `W12.P41.S203` - Add fixture tests for proposal creation, permission interrupt, manual-mode approval as review-station state (not a suspending interrupt), resume by interrupt ID, rejected tool, and cancelled run; `engine/crates/vaultspec-api/tests/langgraph_authoring_fixture.rs`.
- [ ] `W12.P41.S204` - Run LangGraph agent fixture against backend commands code review and record the phase audit; `.vault/audit/`.
- [ ] `W12.P41.S205` - Verify the Increment 4 demo: a real LangGraph fixture drafts a proposal, pauses on a tool-permission interrupt, resumes by interrupt id, requests approval, and, in autonomous mode, sees its work applied and listed after-the-fact; `engine/crates/vaultspec-api/tests/langgraph_authoring_fixture.rs`.

## Wave `W13` - Increment 5 - Concurrency, review depth, and security hardening

Add multi-writer safety and the full review and security surface against real usage evidence from Increments 1 through 4: leases, conflict detection, explicit rebase, delegated scopes, authorization, request-changes and claim loops, and evidence-gated remainders of earlier subset phases.

### Phase `W13.P26` - Advisory leases and fencing tokens

Coordinate active editing with scoped advisory leases, renewals, expirations, releases, and fencing tokens.

- [x] `W13.P26.S126` - Ground Advisory leases and fencing tokens requirements into the phase checklist; `.vault/adr/`.
- [x] `W13.P26.S127` - Implement acquire, renew, release, expire, list, and fencing-token validation for scoped authoring leases; `engine/crates/vaultspec-api/src/authoring/leases.rs`.
- [x] `W13.P26.S128` - Add lease tests for renewal, expiry, bad scope, concurrent acquisition, stale fencing token, and release by non-owner; `engine/crates/vaultspec-api/src/authoring/leases.rs`.
- [ ] `W13.P26.S129` - Run Advisory leases and fencing tokens code review and record the phase audit; `.vault/audit/`.
- [ ] `W13.P26.S130` - Verify two editors receive deterministic lease and fencing outcomes through tests and manual concurrent API checks; `engine/crates/vaultspec-api/src/authoring/leases.rs`.

### Phase `W13.P27` - Base-revision conflict detection

Detect stale bases, overlapping operations, anchor drift, policy conflicts, and conflicted review states.

- [ ] `W13.P27.S131` - Ground Base-revision conflict detection requirements into the phase checklist; `.vault/adr/`.
- [ ] `W13.P27.S132` - Implement base revision checks, overlap detection, anchor drift detection, policy conflict checks, and conflict reason projection; `engine/crates/vaultspec-api/src/authoring/conflicts.rs`.
- [ ] `W13.P27.S133` - Add conflict tests for stale base, overlapping hunks, stale whole-document draft, anchor drift, policy conflict, and no-conflict paths; `engine/crates/vaultspec-api/src/authoring/conflicts.rs`.
- [ ] `W13.P27.S134` - Run Base-revision conflict detection code review and record the phase audit; `.vault/audit/`.
- [ ] `W13.P27.S135` - Verify conflicts are deterministic and reviewable through tests and manual concurrent edit checks; `engine/crates/vaultspec-api/src/authoring/conflicts.rs`.

### Phase `W13.P28` - Explicit rebase and supersession commands

Provide explicit user-visible flows for rebase, supersede, cancel, and replacement proposal creation.

- [ ] `W13.P28.S136` - Ground Explicit rebase and supersession commands requirements into the phase checklist; `.vault/adr/`.
- [ ] `W13.P28.S137` - Implement rebase commands, supersession commands, replacement proposal creation, stale input checks, and conflict carry-forward; `engine/crates/vaultspec-api/src/authoring/rebase.rs`.
- [ ] `W13.P28.S138` - Add rebase tests for successful rebase, failed rebase, superseded proposal, cancelled original, and replayed rebase request; `engine/crates/vaultspec-api/src/authoring/rebase.rs`.
- [ ] `W13.P28.S139` - Run Explicit rebase and supersession commands code review and record the phase audit; `.vault/audit/`.
- [ ] `W13.P28.S140` - Verify stale proposals only advance through explicit rebase or supersession decisions; `engine/crates/vaultspec-api/src/authoring/rebase.rs`.

### Phase `W13.P45` - Section-scoped proposal operations (W03.P13 remainder, conditional)

Conditional remainder of the Increment 1 whole-document-only subset: build section-scoped and atomic-hunk operations, selectors, and selected preimages IF skeleton evidence shows agents need sub-document edits; otherwise this phase defers out of the campaign with its trigger recorded in the plan Description.

- [ ] `W13.P45.S241` - Ground Section-scoped proposal operations requirements into the phase checklist, and record whether skeleton evidence warrants this work; `.vault/adr/`.
- [ ] `W13.P45.S242` - Implement section-scoped and atomic-hunk operation payloads, selectors, and selected preimages, gated on skeleton evidence that agents need sub-document edits; `engine/crates/vaultspec-api/src/authoring/operations.rs`.
- [ ] `W13.P45.S243` - Add tests for atomic hunk operations, selector resolution, selected preimage capture, and invalid range cases; `engine/crates/vaultspec-api/src/authoring/operations.rs`.
- [ ] `W13.P45.S244` - Run Section-scoped proposal operations code review and record the phase audit; `.vault/audit/`.
- [ ] `W13.P45.S245` - Verify section-scoped edits are reviewable and safe, or record that skeleton evidence did not warrant this work and the phase defers out of the campaign; `engine/crates/vaultspec-api/src/authoring/operations.rs`.

### Phase `W13.P20` - Authorization engine and scope guards

Enforce policy before any human or agent command mutates authoring state or requests apply. Folds in the Increment 1 actor-model remainder: service identities and delegated scopes, deferred from W05.P19's minimal-actor subset.

- [ ] `W13.P20.S96` - Ground Authorization engine and scope guards requirements into the phase checklist; `.vault/adr/`.
- [ ] `W13.P20.S97` - Implement authorization checks, scope guards, dangerous-tool guards, policy failures, and safe error redaction; `engine/crates/vaultspec-api/src/authoring/security.rs`.
- [ ] `W13.P20.S98` - Add authorization tests for forbidden document scope, forbidden tool, stale actor, unauthorized apply, redacted error, and allowed delegated command; `engine/crates/vaultspec-api/src/authoring/security.rs`.
- [ ] `W13.P20.S99` - Run Authorization engine and scope guards code review and record the phase audit; `.vault/audit/`.
- [ ] `W13.P20.S100` - Verify unauthorized humans and agents cannot mutate state through tests and manual negative API checks; `engine/crates/vaultspec-api/src/authoring/security.rs`.

### Phase `W13.P24` - Review station queues and provenance audit

Serve review queues, claims, clarification, reviewer edits, audit records, redaction, and bounded provenance queries. Folds in the Increment 1 approval remainder: request-changes and edit-response loops, deferred from W05.P23's approve/reject subset; the claimed queue state activates here against the amended four-state-queue review-station ADR.

- [ ] `W13.P24.S116` - Ground Review station queues and provenance audit requirements into the phase checklist; `.vault/adr/`.
- [ ] `W13.P24.S117` - Implement review queue projections, claim handling, clarification responses, reviewer edits, audit records, redaction, and provenance queries; `engine/crates/vaultspec-api/src/authoring/review.rs`.
- [ ] `W13.P24.S118` - Add review station tests for pending queues, claims, release, clarification, reviewer edits, redacted audit records, and bounded query results; `engine/crates/vaultspec-api/src/authoring/review.rs`.
- [ ] `W13.P24.S119` - Run Review station queues and provenance audit code review and record the phase audit; `.vault/audit/`.
- [ ] `W13.P24.S120` - Verify review station state and provenance are backend-served through tests and manual queue checks; `engine/crates/vaultspec-api/src/authoring/review.rs`.

### Phase `W13.P46` - Per-operation rollback inverses (W08.P38 remainder, evidence-gated)

Evidence-gated remainder of the Increment 1 whole-document rollback subset: per-operation rollback inverse logic, enabled per operation kind only as need appears from real usage.

- [ ] `W13.P46.S246` - Ground Per-operation rollback inverses requirements into the phase checklist, and record whether real usage warrants this work; `.vault/adr/`.
- [ ] `W13.P46.S247` - Implement per-operation rollback inverse logic beyond whole-document preimage restore, enabled per operation kind only as need appears from real usage; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.
- [ ] `W13.P46.S248` - Add inverse-logic tests per enabled operation kind, covering delete inverse, rename inverse, and remaining honest unavailable-reason cases; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.
- [ ] `W13.P46.S249` - Run Per-operation rollback inverses code review and record the phase audit; `.vault/audit/`.
- [ ] `W13.P46.S250` - Verify the Increment 5 demo: two concurrent writers, one human and one agent, on one document, with lease coordination visible, stale proposal conflicts deterministically, explicit rebase producing a fresh reviewable candidate, and an unauthorized actor refused with a redacted error; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.

## Wave `W14` - Increment 6 - Acceptance, retirement, and release

Close the epic: restart, replay, reconnect, and security-negative acceptance; retire the legacy write broker once Increment 2 parity evidence holds; run the final gate audit and release readiness review.

### Phase `W14.P42` - Restart replay reconnect and security negatives

Prove restart recovery, event replay, browser reconnect, duplicate retry, and unauthorized command behavior across the whole system.

- [ ] `W14.P42.S206` - Ground Restart replay reconnect and security negatives requirements into the phase checklist; `.vault/adr/`.
- [ ] `W14.P42.S207` - Implement acceptance scenarios for restart, replay, reconnect, duplicate retry, unauthorized actor, forbidden scope, and forbidden tool flows; `frontend/e2e/authoring.spec.ts`.
- [ ] `W14.P42.S208` - Add end-to-end tests covering dashboard recovery, stream gap recovery, backend restart, security negatives, and multi-client conflict recovery; `frontend/e2e/authoring.spec.ts`.
- [ ] `W14.P42.S209` - Run Restart replay reconnect and security negatives code review and record the phase audit; `.vault/audit/`.
- [ ] `W14.P42.S210` - Verify recovery and security-negative scenarios pass through automated tests and manual acceptance checks; `frontend/e2e/authoring.spec.ts`.

### Phase `W14.P47` - Legacy write-broker retirement

Operation-modes ADR transition gate: flip the editor save to direct-changesets by default once Increment 2 parity evidence holds, and retire the dual /ops/core write path as a planned step, not an indefinite tolerance.

- [ ] `W14.P47.S251` - Ground Legacy write-broker retirement requirements into the phase checklist; `.vault/adr/`.
- [ ] `W14.P47.S252` - Flip the editor save to the direct-changeset path by default once Increment 2 latency and conflict-UX parity evidence holds, and remove the legacy /ops/core dual-run branch; `engine/crates/vaultspec-api/src/authoring/direct_write.rs`.
- [ ] `W14.P47.S253` - Add regression tests confirming the editor save path is single-sourced through the ledger with no un-ledgered write path remaining; `engine/crates/vaultspec-api/src/authoring/direct_write.rs`.
- [ ] `W14.P47.S254` - Run Legacy write-broker retirement code review and record the phase audit; `.vault/audit/`.
- [ ] `W14.P47.S255` - Verify every vault document mutation, human or agent, enters history as a changeset with preimage and provenance, and no un-ledgered write path remains; `engine/crates/vaultspec-api/src/authoring/direct_write.rs`.

### Phase `W14.P43` - Final gate audit and release readiness

Close the epic with full backend, frontend, vault, documentation, operational, and review gates.

- [ ] `W14.P43.S211` - Ground Final gate audit and release readiness requirements into the phase checklist; `.vault/adr/`.
- [ ] `W14.P43.S212` - Update release documentation, operator notes, implementation evidence, and final audit materials for the authoring backend; `.vault/audit/`.
- [ ] `W14.P43.S213` - Run Rust tests, frontend typecheck, frontend tests, frontend build, vault checks, manual acceptance, documentation audit, and code review; `.`.
- [ ] `W14.P43.S214` - Run Final gate audit and release readiness code review and record the phase audit; `.vault/audit/`.
- [ ] `W14.P43.S215` - Verify the epic is complete only when all automated gates pass and manual acceptance evidence is recorded; `.`.

## Description

This is one principal feature plan for the documentation authoring backend. The
accepted ADRs are separate architecture decisions because they settle different
state, workflow, security, and integration questions, but they all belong to the
same implementation feature: a Rust authoring backend that lets frontend users
and LangGraph agents collaborate on vault documents through backend-owned
sessions, proposals, approvals, leases, durable streams, apply receipts,
rollback records, and review projections.

The plan deliberately keeps vaultspec-core behind the materialization adapter.
Frontend stores and LangGraph tools both call the semantic authoring API.
Agents may read context, search, draft, validate, propose, request permission,
request review, cancel, and request apply, but they do not write vault documents
directly and they do not expose core-shaped verbs to collaborators.

The earlier 5-wave draft was too compressed for execution. A second revision
split the backend into nine subsystem-boundary waves (authoring contract,
durable store, document identity, changeset ledger, policy and review,
collaboration, LangGraph and streams, apply and rollback, integration and
acceptance), but that ordering deferred the product loop - an agent proposes,
the user accepts or denies, or the mode applies autonomously - until wave 8 of
9. On 2026-07-02, per the reworked ADR corpus (apply-materialization amended to
single-child V1; operation-modes accepted) and the walking-skeleton rollout
design in `2026-07-02-agentic-spec-authoring-backend-reference`, the remaining
work (the former W03 through W09) was re-sequenced into six increments, each
ending in a demonstrable vertical capability and a review gate: Increment 1
(walking skeleton: propose, review, apply, rollback in manual mode) now spines
on W03; Increments 2 through 6 (operation modes; streams and recovery; agent
runtime; concurrency, review depth, and security hardening; acceptance,
retirement, and release) are new waves W10 through W14. Old W08.P35 (the core
adapter) moved into Increment 1 as its terminal dependency. Several phases
split at this amendment into a V1 subset (kept under its original id in
Increment 1) and an explicit remainder phase in a later increment: W03.P13,
W04.P18, W05.P19, W05.P23, W07.P34, and W08.P38. Three phases deferred out of
the campaign entirely, each with a return trigger recorded here rather than
left as a permanently-unchecked step:

- `W03.P12` (chunk index and bounded chunk API) - returns when a retrieval
  consumer exists; the superseding chunk contract lives in the change-format
  ADR.
- `W06.P29` (agent work units and composition projection) - returns when two
  real agents have work that must compose; the multiagent-composition ADR
  returns to accepted then.
- `W08.P37` (staged multi-document apply and compensation) - returns when
  vaultspec-core ships a batch transaction capability (filed upstream as a
  gap); apply then widens atomically instead of through a saga/compensation
  workaround.

A fourth deferred item is not a removed phase but a recorded scope boundary:
extended review-queue states (`in_review`, `waiting_on_agent`, the
clarification pair, `reviewer_editing`, `stale`, `escalated`) stay out of
`W13.P24`'s four-state queue until multi-reviewer or long-loop clarification
workflows appear in practice.

Executing agents may add detail inside a phase through execution records, but
new subsystem or increment boundaries require an explicit plan amendment, as
this restructure was.

## Steps

The structural rollout above is the executable plan: 8 Waves, 48 Phases, and
240 Steps. Every Phase begins with a grounding Step and closes with code review
or audit plus a concrete verification Step; each increment's closing Phase
carries its named live demo as that Phase's verification Step. Step execution
records should be scaffolded from this plan only after approval.

## Parallelization

Waves are sequenced by dependency, now increment-shaped. W01 fixes the
authoring contract; W02 creates the durable store foundation. W03 (Increment 1)
depends on W01 and W02 and delivers the walking skeleton end to end - document
identity and validation, the ledger and transition engine, a minimal actor
subset, the core adapter, an approve/reject subset, apply, a whole-document
rollback subset, a skeleton projection subset, the backend exit-gate vertical
slice, and the thin frontend review surface - closing on the Increment 1 demo.
W10 (Increment 2) depends on W03 for the ledger, policy, and apply machinery it
extends with mode bundles, system-actor auto-approval, the after-the-fact lane,
the kill switch, and the unified-write-path dual-run; it is deliberately
agent-agnostic and does not depend on LangGraph. W11 (Increment 3) depends on
W03 and activates the W02.P09 outbox primitive that already exists, plus the
W04.P18 remainder (counts and activity) and the frontend's polling-to-stream
swap. W12 (Increment 4) depends on W03 and W10 because the agent runtime drives
the same propose/approve/apply loop through LangGraph, and closes on its
LangGraph fixture as the exit gate. W13 (Increment 5) depends on W03 through
W12 because concurrency, deeper review, and security hardening act on real
usage evidence from every earlier increment, including the two conditional or
evidence-gated remainder phases. W14 (Increment 6) depends on W13 and closes
the epic: acceptance negatives, legacy write-broker retirement gated on
Increment 2's parity evidence, and the final release gate.

Within a wave, phases may run in parallel only when their store tables,
transition rules, and command handlers do not overlap; Increment 1's own
internal parallelization (documents/validation, the core adapter, ledger/actors
tracks converging before the exit gate and the thin frontend surface, which run
in parallel with the converging tracks) is detailed in the reference. Grounding
Steps must complete before implementation in each phase. Review and
verification Steps are phase-local gates and must close before downstream
waves consume that phase; an increment's closing demo is also its review gate.

## Verification

The plan is complete when every Step is closed and the project-management
association reports the epic complete.

- Contract tests verify semantic endpoint families, shared envelopes, tiers,
  versioned DTOs, disabled-state responses, and rejection of core-shaped verbs.
- Store tests verify migrations, transaction boundaries, idempotency replay,
  retention, backup metadata, outbox sequence allocation, and restart recovery
  against the real store implementation.
- Document and ledger tests verify stable document references, snapshots,
  preimages, bounded chunks, proposal operations, validation digests,
  append-only changesets, transitions, and backend projection rebuilds.
- Policy and review tests verify actor provenance, scope guards, approval
  policy, tool permission requests, changeset decisions, review queues,
  reviewer claims, redaction, and bounded audit queries.
- Collaboration tests verify sessions, prompt turns, leases, fencing tokens,
  stale bases, conflicts, rebases, supersession, agent work units, and composed
  candidates.
- LangGraph and stream tests verify thread and run mapping, semantic tools,
  interrupt resume by stable ID, durable lifecycle events, SSE replay,
  snapshot recovery, bounded token retention, and transcript compaction.
- Apply and rollback tests verify private core adapter boundaries, approval
  freshness, per-child receipts, staged multi-document apply, compensation
  state, rollback proposal generation, and explicit unavailable reasons.
- Integration tests verify all backend route families, frontend store
  consumption, review station behavior, LangGraph fixtures, restart recovery,
  reconnect recovery, replay, duplicate retry, and security-negative flows.
- The final gate includes Rust tests, frontend typecheck, frontend tests,
  frontend build, vault checks, manual acceptance, documentation audit, and
  vaultspec-code-review signoff with no unresolved HIGH findings.
