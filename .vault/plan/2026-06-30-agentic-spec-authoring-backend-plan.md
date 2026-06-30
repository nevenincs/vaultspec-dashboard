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

Project-management association: vaultspec dashboard roadmap entry agentic-spec-authoring-backend, tracked by this L4 plan and its generated Step execution records until an external board is opened. The epic delivers a Rust authoring backend that mediates human and LangGraph collaborators through semantic sessions, proposals, approvals, leases, durable streams, apply receipts, rollback records, and backend-served review projections while keeping vaultspec-core hidden behind the materialization adapter.

## Wave `W01` - Authoring boundary and contract

Establish the fenced Rust authoring backend, shared wire grammar, semantic command vocabulary, and V1 schema contract before any durable mutation path is enabled.

### Phase `W01.P01` - Fenced module and route ownership

Create the authoring module boundary and route ownership map beside the existing Axum route families.

- [ ] `W01.P01.S01` - Ground Fenced module and route ownership requirements into the phase checklist; `.vault/adr/`.
- [ ] `W01.P01.S02` - Implement the authoring module shell, feature gate, route registration seam, and ownership map; `engine/crates/vaultspec-api/src/authoring/`.
- [ ] `W01.P01.S03` - Add route shell tests for disabled-state behavior, bearer gating, and shared route registration; `engine/crates/vaultspec-api/src/routes/`.
- [ ] `W01.P01.S04` - Run Fenced module and route ownership code review and record the phase audit; `.vault/audit/`.
- [ ] `W01.P01.S05` - Verify the authoring module is reachable only through the intended route family and disabled-safe responses; `engine/crates/vaultspec-api/src/routes/`.

### Phase `W01.P02` - Shared envelope and disabled-state contract

Make authoring success, failure, disabled-state, and recovery responses conform to the dashboard wire contract.

- [ ] `W01.P02.S06` - Ground Shared envelope and disabled-state contract requirements into the phase checklist; `.vault/adr/`.
- [ ] `W01.P02.S07` - Implement authoring response helpers for snapshots, command receipts, typed errors, degraded tiers, and disabled-state payloads; `engine/crates/vaultspec-api/src/authoring/response.rs`.
- [ ] `W01.P02.S08` - Add response grammar tests for success, validation failure, unauthorized, degraded, replayed, and disabled responses; `engine/crates/vaultspec-api/src/authoring/response.rs`.
- [ ] `W01.P02.S09` - Run Shared envelope and disabled-state contract code review and record the phase audit; `.vault/audit/`.
- [ ] `W01.P02.S10` - Verify every non-raw authoring response carries the shared envelope and tiers block; `engine/crates/vaultspec-api/src/authoring/response.rs`.

### Phase `W01.P03` - Command vocabulary and aggregate identifiers

Define the shared lifecycle terms, aggregate identifiers, and semantic command names consumed by routes, repositories, frontend stores, and agents.

- [ ] `W01.P03.S11` - Ground Command vocabulary and aggregate identifiers requirements into the phase checklist; `.vault/adr/`.
- [ ] `W01.P03.S12` - Implement typed aggregate identifiers, command names, lifecycle enums, actor references, document references, and receipt references; `engine/crates/vaultspec-api/src/authoring/model.rs`.
- [ ] `W01.P03.S13` - Add model tests for stable serialization, invalid identifiers, terminal states, and action eligibility; `engine/crates/vaultspec-api/src/authoring/model.rs`.
- [ ] `W01.P03.S14` - Run Command vocabulary and aggregate identifiers code review and record the phase audit; `.vault/audit/`.
- [ ] `W01.P03.S15` - Verify frontend and agent fixtures can serialize the same command vocabulary without core-shaped verbs; `engine/crates/vaultspec-api/src/authoring/model.rs`.

### Phase `W01.P04` - V1 DTO schema and route fixtures

Encode versioned request, response, event, and route fixtures for every semantic endpoint family.

- [ ] `W01.P04.S16` - Ground V1 DTO schema and route fixtures requirements into the phase checklist; `.vault/adr/`.
- [ ] `W01.P04.S17` - Implement V1 DTOs and route fixtures for sessions, documents, proposals, reviews, apply, rollback, leases, streams, and recovery; `engine/crates/vaultspec-api/src/authoring/api.rs`.
- [ ] `W01.P04.S18` - Add schema fixture tests for versioning, idempotency fields, unknown-field rejection, tiers, and route-family negative cases; `engine/crates/vaultspec-api/src/authoring/api.rs`.
- [ ] `W01.P04.S19` - Run V1 DTO schema and route fixtures code review and record the phase audit; `.vault/audit/`.
- [ ] `W01.P04.S20` - Verify every endpoint family has a versioned DTO fixture and a negative contract case; `engine/crates/vaultspec-api/src/authoring/api.rs`.

## Wave `W02` - Durable store infrastructure

Introduce the non-derivable authoring store, migrations, repository boundaries, idempotency records, retention policy, and outbox primitive.

### Phase `W02.P05` - Physical store binding and migrations

Bind the durable authoring store with fail-loud migrations and version checks.

- [ ] `W02.P05.S21` - Ground Physical store binding and migrations requirements into the phase checklist; `.vault/adr/`.
- [ ] `W02.P05.S22` - Implement authoring store connection management, migration runner, schema metadata, and fail-loud version checks; `engine/crates/vaultspec-api/src/authoring/store/`.
- [ ] `W02.P05.S23` - Add real store tests for migration ordering, clean open, version mismatch, and corrupted migration metadata; `engine/crates/vaultspec-api/src/authoring/store/`.
- [ ] `W02.P05.S24` - Run Physical store binding and migrations code review and record the phase audit; `.vault/audit/`.
- [ ] `W02.P05.S25` - Verify store state survives restart and schema mismatch fails loud through tests and manual database inspection; `engine/crates/vaultspec-api/src/authoring/store/`.

### Phase `W02.P06` - Repository traits and unit of work

Centralize repository contracts and transaction boundaries for product state mutations.

- [ ] `W02.P06.S26` - Ground Repository traits and unit of work requirements into the phase checklist; `.vault/adr/`.
- [ ] `W02.P06.S27` - Implement repository traits, transaction helpers, unit-of-work boundaries, and rollback-on-error behavior; `engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`.
- [ ] `W02.P06.S28` - Add transaction tests for committed commands, rolled-back failures, nested repository use, and concurrent writers; `engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`.
- [ ] `W02.P06.S29` - Run Repository traits and unit of work code review and record the phase audit; `.vault/audit/`.
- [ ] `W02.P06.S30` - Verify every mutating command can run inside one explicit unit of work; `engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`.

### Phase `W02.P07` - Idempotency outcome repository

Persist scoped command outcomes so frontend and agent retries replay without duplicate side effects.

- [ ] `W02.P07.S31` - Ground Idempotency outcome repository requirements into the phase checklist; `.vault/adr/`.
- [ ] `W02.P07.S32` - Implement scoped idempotency keys, command outcome records, in-flight state records, and replay lookup helpers; `engine/crates/vaultspec-api/src/authoring/store/idempotency.rs`.
- [ ] `W02.P07.S33` - Add idempotency tests for duplicate create, duplicate apply, in-flight replay, conflicting scope, and expired outcome records; `engine/crates/vaultspec-api/src/authoring/store/idempotency.rs`.
- [ ] `W02.P07.S34` - Run Idempotency outcome repository code review and record the phase audit; `.vault/audit/`.
- [ ] `W02.P07.S35` - Verify repeated frontend and agent commands return the recorded outcome without duplicating product records; `engine/crates/vaultspec-api/src/authoring/store/idempotency.rs`.

### Phase `W02.P08` - Retention compaction and backup classes

Define retention classes, compaction rules, backup export, and protected record behavior for non-derivable authoring state.

- [ ] `W02.P08.S36` - Ground Retention compaction and backup classes requirements into the phase checklist; `.vault/adr/`.
- [ ] `W02.P08.S37` - Implement retention classes, compaction markers, backup export metadata, protected preimage rules, and status reporting; `engine/crates/vaultspec-api/src/authoring/store/retention.rs`.
- [ ] `W02.P08.S38` - Add retention tests for pending approvals, applied preimages, rejected transcripts, compaction limitations, and backup export coverage; `engine/crates/vaultspec-api/src/authoring/store/retention.rs`.
- [ ] `W02.P08.S39` - Run Retention compaction and backup classes code review and record the phase audit; `.vault/audit/`.
- [ ] `W02.P08.S40` - Verify compaction cannot silently delete pending approvals, apply receipts, or rollback preimages; `engine/crates/vaultspec-api/src/authoring/store/retention.rs`.

### Phase `W02.P09` - Outbox primitive and sequence allocation

Create the transactional outbox primitive and durable sequence allocation before event publishing is wired.

- [ ] `W02.P09.S41` - Ground Outbox primitive and sequence allocation requirements into the phase checklist; `.vault/adr/`.
- [ ] `W02.P09.S42` - Implement outbox records, sequence allocation, publication state, restart recovery, and duplicate publication guards; `engine/crates/vaultspec-api/src/authoring/store/outbox.rs`.
- [ ] `W02.P09.S43` - Add outbox primitive tests for commit atomicity, sequence monotonicity, worker restart, and duplicate suppression; `engine/crates/vaultspec-api/src/authoring/store/outbox.rs`.
- [ ] `W02.P09.S44` - Run Outbox primitive and sequence allocation code review and record the phase audit; `.vault/audit/`.
- [ ] `W02.P09.S45` - Verify durable event records commit with product state and survive restart before publication; `engine/crates/vaultspec-api/src/authoring/store/outbox.rs`.

## Wave `W03` - Document identity and context

Make document references, revision snapshots, bounded chunks, proposal material, previews, validation digests, and stale-input detection stable for human and agent editing.

### Phase `W03.P10` - Document reference resolver

Resolve existing and provisional vault documents through stable references without exposing core internals.

- [ ] `W03.P10.S46` - Ground Document reference resolver requirements into the phase checklist; `.vault/adr/`.
- [ ] `W03.P10.S47` - Implement document_ref resolution, provisional create targets, duplicate stem handling, missing target handling, and ref snapshot lookup; `engine/crates/vaultspec-api/src/authoring/documents.rs`.
- [ ] `W03.P10.S48` - Add resolver tests for duplicate stems, renames, provisional creates, missing documents, ref scopes, and bounded listings; `engine/crates/vaultspec-api/src/authoring/documents.rs`.
- [ ] `W03.P10.S49` - Run Document reference resolver code review and record the phase audit; `.vault/audit/`.
- [ ] `W03.P10.S50` - Verify document references remain stable across rename and provisional-create scenarios; `engine/crates/vaultspec-api/src/authoring/documents.rs`.

### Phase `W03.P11` - Revision snapshots and preimages

Capture revision metadata, before-state preimages, and snapshot recovery inputs for previews, apply, and rollback.

- [ ] `W03.P11.S51` - Ground Revision snapshots and preimages requirements into the phase checklist; `.vault/adr/`.
- [ ] `W03.P11.S52` - Implement revision metadata reads, target snapshots, preimage capture, snapshot hashes, and recovery payloads; `engine/crates/vaultspec-api/src/authoring/snapshots.rs`.
- [ ] `W03.P11.S53` - Add snapshot tests for unchanged revision, stale base, missing preimage, hash mismatch, and restart recovery; `engine/crates/vaultspec-api/src/authoring/snapshots.rs`.
- [ ] `W03.P11.S54` - Run Revision snapshots and preimages code review and record the phase audit; `.vault/audit/`.
- [ ] `W03.P11.S55` - Verify apply and rollback inputs can recover exact preimages through tests and manual snapshot inspection; `engine/crates/vaultspec-api/src/authoring/snapshots.rs`.

### Phase `W03.P12` - Chunk index and bounded chunk API

Serve versioned chunks, anchors, context windows, and evidence references under explicit bounds.

- [ ] `W03.P12.S56` - Ground Chunk index and bounded chunk API requirements into the phase checklist; `.vault/adr/`.
- [ ] `W03.P12.S57` - Implement chunker versioning, chunk index rebuild policy, bounded chunk reads, anchor lookup, and truncation metadata; `engine/crates/vaultspec-api/src/authoring/chunks.rs`.
- [ ] `W03.P12.S58` - Add chunk tests for cap enforcement, UTF-8 boundaries, anchor drift, version changes, and missing anchor recovery; `engine/crates/vaultspec-api/src/authoring/chunks.rs`.
- [ ] `W03.P12.S59` - Run Chunk index and bounded chunk API code review and record the phase audit; `.vault/audit/`.
- [ ] `W03.P12.S60` - Verify large documents return bounded chunks and honest evidence references through tests and manual API checks; `engine/crates/vaultspec-api/src/authoring/chunks.rs`.

### Phase `W03.P13` - Proposal operation payloads and previews

Represent whole-document and atomic operations with materialized previews and reviewable diffs.

- [ ] `W03.P13.S61` - Ground Proposal operation payloads and previews requirements into the phase checklist; `.vault/adr/`.
- [ ] `W03.P13.S62` - Implement proposal operation payloads, whole-document drafts, atomic patches, materialized preview builders, and review diff projections; `engine/crates/vaultspec-api/src/authoring/operations.rs`.
- [ ] `W03.P13.S63` - Add operation tests for full replacement, create, delete, atomic hunk, preview recovery, semantic diff, and invalid range cases; `engine/crates/vaultspec-api/src/authoring/operations.rs`.
- [ ] `W03.P13.S64` - Run Proposal operation payloads and previews code review and record the phase audit; `.vault/audit/`.
- [ ] `W03.P13.S65` - Verify reviewers can inspect proposal material before apply through tests and manual diff fixture review; `engine/crates/vaultspec-api/src/authoring/operations.rs`.

### Phase `W03.P14` - Validation digest and stale-input detection

Persist validation digests and detect stale bases, stale approvals, changed chunks, and invalid metadata before review or apply.

- [ ] `W03.P14.S66` - Ground Validation digest and stale-input detection requirements into the phase checklist; `.vault/adr/`.
- [ ] `W03.P14.S67` - Implement validation digests, stale-input checks, validation status records, warning states, and blocking error records; `engine/crates/vaultspec-api/src/authoring/validation.rs`.
- [ ] `W03.P14.S68` - Add validation tests for valid proposals, invalid frontmatter, stale chunks, changed base revision, warning-only status, and blocking failures; `engine/crates/vaultspec-api/src/authoring/validation.rs`.
- [ ] `W03.P14.S69` - Run Validation digest and stale-input detection code review and record the phase audit; `.vault/audit/`.
- [ ] `W03.P14.S70` - Verify stale or invalid proposals cannot become approval-ready without a fresh validation digest; `engine/crates/vaultspec-api/src/authoring/validation.rs`.

## Wave `W04` - Changeset ledger and projections

Build the append-only changeset aggregate, transition engine, proposal commands, and backend projection rebuilders that serve review and activity truth.

### Phase `W04.P15` - Changeset aggregate and child operations

Persist changesets as append-only aggregates with explicit child operations and target ordering.

- [ ] `W04.P15.S71` - Ground Changeset aggregate and child operations requirements into the phase checklist; `.vault/adr/`.
- [ ] `W04.P15.S72` - Implement changeset aggregate records, child operation records, target ordering, revision linkage, and audit-friendly identifiers; `engine/crates/vaultspec-api/src/authoring/ledger.rs`.
- [ ] `W04.P15.S73` - Add ledger tests for append-only revisions, child ordering, duplicate child rejection, multi-document changes, and history reconstruction; `engine/crates/vaultspec-api/src/authoring/ledger.rs`.
- [ ] `W04.P15.S74` - Run Changeset aggregate and child operations code review and record the phase audit; `.vault/audit/`.
- [ ] `W04.P15.S75` - Verify changeset history reconstructs proposal state without LangGraph checkpoints or frontend memory; `engine/crates/vaultspec-api/src/authoring/ledger.rs`.

### Phase `W04.P16` - Transition engine and terminal-state validation

Centralize legal lifecycle transitions and terminal-state guards for sessions, proposals, approvals, applies, and rollbacks.

- [ ] `W04.P16.S76` - Ground Transition engine and terminal-state validation requirements into the phase checklist; `.vault/adr/`.
- [ ] `W04.P16.S77` - Implement lifecycle transition rules, terminal-state validation, stale-state guards, and action eligibility helpers; `engine/crates/vaultspec-api/src/authoring/transitions.rs`.
- [ ] `W04.P16.S78` - Add transition tests for illegal moves, terminal refusal, stale approval, cancelled run, rejected proposal, and rollback terminal states; `engine/crates/vaultspec-api/src/authoring/transitions.rs`.
- [ ] `W04.P16.S79` - Run Transition engine and terminal-state validation code review and record the phase audit; `.vault/audit/`.
- [ ] `W04.P16.S80` - Verify every command uses the shared transition engine through tests and manual transition table review; `engine/crates/vaultspec-api/src/authoring/transitions.rs`.

### Phase `W04.P17` - Proposal command handlers

Create, append, replace, validate, submit, supersede, and cancel proposals through backend-owned commands.

- [ ] `W04.P17.S81` - Ground Proposal command handlers requirements into the phase checklist; `.vault/adr/`.
- [ ] `W04.P17.S82` - Implement proposal creation, material append, draft replacement, validate, submit, supersede, cancel, and snapshot handlers; `engine/crates/vaultspec-api/src/authoring/proposal.rs`.
- [ ] `W04.P17.S83` - Add command tests for ordered revisions, replayed writes, validation gates, terminal refusal, supersession, and cancellation; `engine/crates/vaultspec-api/src/authoring/proposal.rs`.
- [ ] `W04.P17.S84` - Run Proposal command handlers code review and record the phase audit; `.vault/audit/`.
- [ ] `W04.P17.S85` - Verify proposal lifecycle transitions are idempotent and backend-owned through tests and manual command replay; `engine/crates/vaultspec-api/src/authoring/proposal.rs`.

### Phase `W04.P18` - Projection rebuilders and eligibility state

Serve counts, per-document activity, conflict reasons, validation status, rollback availability, and action eligibility from backend projections.

- [ ] `W04.P18.S86` - Ground Projection rebuilders and eligibility state requirements into the phase checklist; `.vault/adr/`.
- [ ] `W04.P18.S87` - Implement projection rebuilders for review counts, per-document activity, action eligibility, conflicts, validation state, and rollback availability; `engine/crates/vaultspec-api/src/authoring/projections.rs`.
- [ ] `W04.P18.S88` - Add projection tests for rebuild after restart, stale data, eligibility reasons, conflict state, rollback availability, and bounded projection reads; `engine/crates/vaultspec-api/src/authoring/projections.rs`.
- [ ] `W04.P18.S89` - Run Projection rebuilders and eligibility state code review and record the phase audit; `.vault/audit/`.
- [ ] `W04.P18.S90` - Verify frontend-visible status and eligibility are backend-served and rebuildable through tests and manual projection checks; `engine/crates/vaultspec-api/src/authoring/projections.rs`.

## Wave `W05` - Actors, policy, approval, and review

Make actor identity, delegated scopes, authorization, approval policy, permission requests, review decisions, queue claims, and provenance explicit backend state.

### Phase `W05.P19` - Actor model and delegated scopes

Model human actors, agent actors, service identities, delegated scopes, and stable provenance keys.

- [ ] `W05.P19.S91` - Ground Actor model and delegated scopes requirements into the phase checklist; `.vault/adr/`.
- [ ] `W05.P19.S92` - Implement actor records, service identities, delegated scopes, stable provenance keys, and actor display metadata; `engine/crates/vaultspec-api/src/authoring/actors.rs`.
- [ ] `W05.P19.S93` - Add actor tests for human identity, agent identity, delegated scope, missing actor, stale actor, and provenance key stability; `engine/crates/vaultspec-api/src/authoring/actors.rs`.
- [ ] `W05.P19.S94` - Run Actor model and delegated scopes code review and record the phase audit; `.vault/audit/`.
- [ ] `W05.P19.S95` - Verify every mutation can be attributed to a stable actor and delegated scope; `engine/crates/vaultspec-api/src/authoring/actors.rs`.

### Phase `W05.P20` - Authorization engine and scope guards

Enforce policy before any human or agent command mutates authoring state or requests apply.

- [ ] `W05.P20.S96` - Ground Authorization engine and scope guards requirements into the phase checklist; `.vault/adr/`.
- [ ] `W05.P20.S97` - Implement authorization checks, scope guards, dangerous-tool guards, policy failures, and safe error redaction; `engine/crates/vaultspec-api/src/authoring/security.rs`.
- [ ] `W05.P20.S98` - Add authorization tests for forbidden document scope, forbidden tool, stale actor, unauthorized apply, redacted error, and allowed delegated command; `engine/crates/vaultspec-api/src/authoring/security.rs`.
- [ ] `W05.P20.S99` - Run Authorization engine and scope guards code review and record the phase audit; `.vault/audit/`.
- [ ] `W05.P20.S100` - Verify unauthorized humans and agents cannot mutate state through tests and manual negative API checks; `engine/crates/vaultspec-api/src/authoring/security.rs`.

### Phase `W05.P21` - Approval policy matrix

Represent approval requirements, freshness rules, reviewer eligibility, and tool permission gates as backend policy data.

- [ ] `W05.P21.S101` - Ground Approval policy matrix requirements into the phase checklist; `.vault/adr/`.
- [ ] `W05.P21.S102` - Implement approval policy matrix, freshness checks, reviewer eligibility, tool permission gates, and policy reason projection; `engine/crates/vaultspec-api/src/authoring/policy.rs`.
- [ ] `W05.P21.S103` - Add policy tests for reviewer eligibility, stale validation, dangerous tool request, self-approval refusal, and request-changes loops; `engine/crates/vaultspec-api/src/authoring/policy.rs`.
- [ ] `W05.P21.S104` - Run Approval policy matrix code review and record the phase audit; `.vault/audit/`.
- [ ] `W05.P21.S105` - Verify approval decisions are governed by backend policy rather than frontend inference; `engine/crates/vaultspec-api/src/authoring/policy.rs`.

### Phase `W05.P22` - Tool permission request flow

Make dangerous or scoped agent tools produce durable permission requests and stable review decisions.

- [ ] `W05.P22.S106` - Ground Tool permission request flow requirements into the phase checklist; `.vault/adr/`.
- [ ] `W05.P22.S107` - Implement tool permission request creation, claim, decision, expiry, replay, and audit record handling; `engine/crates/vaultspec-api/src/authoring/permissions.rs`.
- [ ] `W05.P22.S108` - Add permission tests for approved tool, rejected tool, expired request, replayed decision, and multiple simultaneous requests; `engine/crates/vaultspec-api/src/authoring/permissions.rs`.
- [ ] `W05.P22.S109` - Run Tool permission request flow code review and record the phase audit; `.vault/audit/`.
- [ ] `W05.P22.S110` - Verify agent tools cannot proceed past permission gates without durable human decisions; `engine/crates/vaultspec-api/src/authoring/permissions.rs`.

### Phase `W05.P23` - Changeset approval requests and decisions

Persist approval requests, reviewer decisions, request-changes responses, stale invalidation, and approval-state reads.

- [ ] `W05.P23.S111` - Ground Changeset approval requests and decisions requirements into the phase checklist; `.vault/adr/`.
- [ ] `W05.P23.S112` - Implement approval request, approve, reject, request-changes, edit response, stale invalidation, and approval snapshot handlers; `engine/crates/vaultspec-api/src/authoring/approvals.rs`.
- [ ] `W05.P23.S113` - Add approval tests for approved proposal, rejected proposal, request-changes, stale revision, replayed decision, and conflicting reviewer action; `engine/crates/vaultspec-api/src/authoring/approvals.rs`.
- [ ] `W05.P23.S114` - Run Changeset approval requests and decisions code review and record the phase audit; `.vault/audit/`.
- [ ] `W05.P23.S115` - Verify approved and rejected proposals surface correct durable approval state through tests and manual review API checks; `engine/crates/vaultspec-api/src/authoring/approvals.rs`.

### Phase `W05.P24` - Review station queues and provenance audit

Serve review queues, claims, clarification, reviewer edits, audit records, redaction, and bounded provenance queries.

- [ ] `W05.P24.S116` - Ground Review station queues and provenance audit requirements into the phase checklist; `.vault/adr/`.
- [ ] `W05.P24.S117` - Implement review queue projections, claim handling, clarification responses, reviewer edits, audit records, redaction, and provenance queries; `engine/crates/vaultspec-api/src/authoring/review.rs`.
- [ ] `W05.P24.S118` - Add review station tests for pending queues, claims, release, clarification, reviewer edits, redacted audit records, and bounded query results; `engine/crates/vaultspec-api/src/authoring/review.rs`.
- [ ] `W05.P24.S119` - Run Review station queues and provenance audit code review and record the phase audit; `.vault/audit/`.
- [ ] `W05.P24.S120` - Verify review station state and provenance are backend-served through tests and manual queue checks; `engine/crates/vaultspec-api/src/authoring/review.rs`.

## Wave `W06` - Collaboration and composition

Coordinate sessions, prompt turns, advisory leases, conflicts, rebases, supersession, agent work units, and composed candidate generation.

### Phase `W06.P25` - Sessions prompt turns and recovery snapshots

Persist sessions, prompt turns, run ownership, active state, cancellation state, and recovery snapshots.

- [ ] `W06.P25.S121` - Ground Sessions prompt turns and recovery snapshots requirements into the phase checklist; `.vault/adr/`.
- [ ] `W06.P25.S122` - Implement session creation, prompt turns, run ownership, cancellation, active state, and recovery snapshot handlers; `engine/crates/vaultspec-api/src/authoring/session.rs`.
- [ ] `W06.P25.S123` - Add session tests for create, resume, cancelled run, joined active run, restart recovery, and bounded session listings; `engine/crates/vaultspec-api/src/authoring/session.rs`.
- [ ] `W06.P25.S124` - Run Sessions prompt turns and recovery snapshots code review and record the phase audit; `.vault/audit/`.
- [ ] `W06.P25.S125` - Verify refreshed clients recover session and run state from backend snapshots; `engine/crates/vaultspec-api/src/authoring/session.rs`.

### Phase `W06.P26` - Advisory leases and fencing tokens

Coordinate active editing with scoped advisory leases, renewals, expirations, releases, and fencing tokens.

- [ ] `W06.P26.S126` - Ground Advisory leases and fencing tokens requirements into the phase checklist; `.vault/adr/`.
- [ ] `W06.P26.S127` - Implement acquire, renew, release, expire, list, and fencing-token validation for scoped authoring leases; `engine/crates/vaultspec-api/src/authoring/leases.rs`.
- [ ] `W06.P26.S128` - Add lease tests for renewal, expiry, bad scope, concurrent acquisition, stale fencing token, and release by non-owner; `engine/crates/vaultspec-api/src/authoring/leases.rs`.
- [ ] `W06.P26.S129` - Run Advisory leases and fencing tokens code review and record the phase audit; `.vault/audit/`.
- [ ] `W06.P26.S130` - Verify two editors receive deterministic lease and fencing outcomes through tests and manual concurrent API checks; `engine/crates/vaultspec-api/src/authoring/leases.rs`.

### Phase `W06.P27` - Base-revision conflict detection

Detect stale bases, overlapping operations, anchor drift, policy conflicts, and conflicted review states.

- [ ] `W06.P27.S131` - Ground Base-revision conflict detection requirements into the phase checklist; `.vault/adr/`.
- [ ] `W06.P27.S132` - Implement base revision checks, overlap detection, anchor drift detection, policy conflict checks, and conflict reason projection; `engine/crates/vaultspec-api/src/authoring/conflicts.rs`.
- [ ] `W06.P27.S133` - Add conflict tests for stale base, overlapping hunks, stale whole-document draft, anchor drift, policy conflict, and no-conflict paths; `engine/crates/vaultspec-api/src/authoring/conflicts.rs`.
- [ ] `W06.P27.S134` - Run Base-revision conflict detection code review and record the phase audit; `.vault/audit/`.
- [ ] `W06.P27.S135` - Verify conflicts are deterministic and reviewable through tests and manual concurrent edit checks; `engine/crates/vaultspec-api/src/authoring/conflicts.rs`.

### Phase `W06.P28` - Explicit rebase and supersession commands

Provide explicit user-visible flows for rebase, supersede, cancel, and replacement proposal creation.

- [ ] `W06.P28.S136` - Ground Explicit rebase and supersession commands requirements into the phase checklist; `.vault/adr/`.
- [ ] `W06.P28.S137` - Implement rebase commands, supersession commands, replacement proposal creation, stale input checks, and conflict carry-forward; `engine/crates/vaultspec-api/src/authoring/rebase.rs`.
- [ ] `W06.P28.S138` - Add rebase tests for successful rebase, failed rebase, superseded proposal, cancelled original, and replayed rebase request; `engine/crates/vaultspec-api/src/authoring/rebase.rs`.
- [ ] `W06.P28.S139` - Run Explicit rebase and supersession commands code review and record the phase audit; `.vault/audit/`.
- [ ] `W06.P28.S140` - Verify stale proposals only advance through explicit rebase or supersession decisions; `engine/crates/vaultspec-api/src/authoring/rebase.rs`.

### Phase `W06.P29` - Agent work units and composition projection

Track agent work units, target scopes, composition candidates, compatible merges, and competing proposals.

- [ ] `W06.P29.S141` - Ground Agent work units and composition projection requirements into the phase checklist; `.vault/adr/`.
- [ ] `W06.P29.S142` - Implement agent work unit records, target-scope metadata, composition projection, compatible merge candidates, and competing proposal state; `engine/crates/vaultspec-api/src/authoring/composition.rs`.
- [ ] `W06.P29.S143` - Add composition tests for competing agents, compatible merges, superseded work units, cancelled runs, and review queue preservation; `engine/crates/vaultspec-api/src/authoring/composition.rs`.
- [ ] `W06.P29.S144` - Run Agent work units and composition projection code review and record the phase audit; `.vault/audit/`.
- [ ] `W06.P29.S145` - Verify concurrent agents cannot overwrite each other without explicit composition decisions; `engine/crates/vaultspec-api/src/authoring/composition.rs`.

## Wave `W07` - LangGraph and streams

Connect LangGraph execution through semantic tools, replay-safe interrupts, durable lifecycle events, recoverable streams, and bounded generation transcript retention.

### Phase `W07.P30` - LangGraph runtime mapping

Map LangGraph threads, runs, checkpoints, and interrupt references to Vaultspec-owned product records.

- [ ] `W07.P30.S146` - Ground LangGraph runtime mapping requirements into the phase checklist; `.vault/adr/`.
- [ ] `W07.P30.S147` - Implement LangGraph runtime adapter, thread mapping, run mapping, checkpoint reference storage, and runtime error mapping; `engine/crates/vaultspec-api/src/authoring/langgraph.rs`.
- [ ] `W07.P30.S148` - Add runtime mapping tests for unavailable runtime, thread creation, run references, checkpoint references, and redacted runtime errors; `engine/crates/vaultspec-api/src/authoring/langgraph.rs`.
- [ ] `W07.P30.S149` - Run LangGraph runtime mapping code review and record the phase audit; `.vault/audit/`.
- [ ] `W07.P30.S150` - Verify LangGraph checkpoints are references and never the only product history; `engine/crates/vaultspec-api/src/authoring/langgraph.rs`.

### Phase `W07.P31` - Semantic agent tool aliases

Expose context, search, propose, validate, request approval, cancel, and request apply as semantic tools over backend commands.

- [ ] `W07.P31.S151` - Ground Semantic agent tool aliases requirements into the phase checklist; `.vault/adr/`.
- [ ] `W07.P31.S152` - Implement the semantic agent tool catalog, tool schemas, bounded scope validation, and command dispatch aliases; `engine/crates/vaultspec-api/src/authoring/tools.rs`.
- [ ] `W07.P31.S153` - Add tool tests for read context, search, propose, validate, approval request, cancel, apply request, and rejected core-shaped verb; `engine/crates/vaultspec-api/src/authoring/tools.rs`.
- [ ] `W07.P31.S154` - Run Semantic agent tool aliases code review and record the phase audit; `.vault/audit/`.
- [ ] `W07.P31.S155` - Verify agents can call semantic tools but cannot invoke direct core writes; `engine/crates/vaultspec-api/src/authoring/tools.rs`.

### Phase `W07.P32` - Interrupt resume and tool-call records

Normalize interrupts, permission requests, changeset approvals, and replay-safe tool-call records by stable IDs.

- [ ] `W07.P32.S156` - Ground Interrupt resume and tool-call records requirements into the phase checklist; `.vault/adr/`.
- [ ] `W07.P32.S157` - Implement interrupt normalization, resume-by-interrupt-id commands, tool-call records, decision payloads, and replay handling; `engine/crates/vaultspec-api/src/authoring/interrupts.rs`.
- [ ] `W07.P32.S158` - Add interrupt tests for multiple interrupts, stable resume IDs, replayed tool call, rejected permission, approved proposal, and stale decision; `engine/crates/vaultspec-api/src/authoring/interrupts.rs`.
- [ ] `W07.P32.S159` - Run Interrupt resume and tool-call records code review and record the phase audit; `.vault/audit/`.
- [ ] `W07.P32.S160` - Verify human decisions resume the intended interrupt by stable ID through tests and manual LangGraph fixture replay; `engine/crates/vaultspec-api/src/authoring/interrupts.rs`.

### Phase `W07.P33` - Durable lifecycle events and projector feed

Define event schemas and feed projection rebuilders from durable lifecycle transitions rather than token streams.

- [ ] `W07.P33.S161` - Ground Durable lifecycle events and projector feed requirements into the phase checklist; `.vault/adr/`.
- [ ] `W07.P33.S162` - Implement durable lifecycle event schemas, projector feed records, event versioning, and transition-to-event mapping; `engine/crates/vaultspec-api/src/authoring/events.rs`.
- [ ] `W07.P33.S163` - Add event tests for session created, proposal updated, validation changed, approval resolved, apply recorded, rollback created, and version rejection; `engine/crates/vaultspec-api/src/authoring/events.rs`.
- [ ] `W07.P33.S164` - Run Durable lifecycle events and projector feed code review and record the phase audit; `.vault/audit/`.
- [ ] `W07.P33.S165` - Verify lifecycle projections rebuild from durable events and not transient generation chunks; `engine/crates/vaultspec-api/src/authoring/events.rs`.

### Phase `W07.P34` - Stream replay and generation retention

Serve SSE replay, snapshot-plus-next-sequence recovery, bounded generation streams, and transcript compaction.

- [ ] `W07.P34.S166` - Ground Stream replay and generation retention requirements into the phase checklist; `.vault/adr/`.
- [ ] `W07.P34.S167` - Implement stream subscriptions, last-sequence replay, gap events, snapshot recovery, bounded generation channels, and transcript compaction hooks; `engine/crates/vaultspec-api/src/authoring/stream.rs`.
- [ ] `W07.P34.S168` - Add stream tests for replay, gaps, snapshot recovery, token retention caps, compacted transcripts, and frontend cursor restoration; `engine/crates/vaultspec-api/src/authoring/stream.rs`.
- [ ] `W07.P34.S169` - Run Stream replay and generation retention code review and record the phase audit; `.vault/audit/`.
- [ ] `W07.P34.S170` - Verify clients recover lifecycle truth after stream loss while token gaps remain non-authoritative; `engine/crates/vaultspec-api/src/authoring/stream.rs`.

## Wave `W08` - Apply and rollback

Materialize only approved work through the private core adapter, retain receipts and compensation state, and generate reviewable rollback proposals.

### Phase `W08.P35` - Core adapter capability registry

Wrap vaultspec-core as a private bounded adapter with explicit capability mapping, caps, timeouts, and tiered failures.

- [ ] `W08.P35.S171` - Ground Core adapter capability registry requirements into the phase checklist; `.vault/adr/`.
- [ ] `W08.P35.S172` - Implement core capability registry, argument builders, bounded subprocess calls, timeout handling, output caps, and safe error mapping; `engine/crates/vaultspec-api/src/authoring/core_adapter.rs`.
- [ ] `W08.P35.S173` - Add core adapter tests for validation, apply, timeout, output cap, error redaction, missing core, and forbidden direct verb exposure; `engine/crates/vaultspec-api/src/authoring/core_adapter.rs`.
- [ ] `W08.P35.S174` - Run Core adapter capability registry code review and record the phase audit; `.vault/audit/`.
- [ ] `W08.P35.S175` - Verify collaborators cannot see or invoke core-shaped writes through tests and manual route checks; `engine/crates/vaultspec-api/src/authoring/core_adapter.rs`.

### Phase `W08.P36` - Apply job state machine and receipts

Run approved proposal materialization as durable jobs with approval freshness checks, per-child receipts, and recovery.

- [ ] `W08.P36.S176` - Ground Apply job state machine and receipts requirements into the phase checklist; `.vault/adr/`.
- [ ] `W08.P36.S177` - Implement apply job states, approval freshness checks, staged execution, per-child receipts, post-write hashes, progress, and recovery handlers; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [ ] `W08.P36.S178` - Add apply tests for approved-only gates, stale approval, rejected proposal, partial failure, restart recovery, and idempotent apply request; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [ ] `W08.P36.S179` - Run Apply job state machine and receipts code review and record the phase audit; `.vault/audit/`.
- [ ] `W08.P36.S180` - Verify approved changes materialize once and rejected or stale changes never materialize; `engine/crates/vaultspec-api/src/authoring/apply.rs`.

### Phase `W08.P37` - Staged multi-document apply and compensation

Handle multi-document apply with staged execution, compensation projections, watcher convergence, and repair state.

- [ ] `W08.P37.S181` - Ground Staged multi-document apply and compensation requirements into the phase checklist; `.vault/adr/`.
- [ ] `W08.P37.S182` - Implement staged multi-document apply, compensation records, watcher convergence checks, repair state projection, and partial materialization receipts; `engine/crates/vaultspec-api/src/authoring/compensation.rs`.
- [ ] `W08.P37.S183` - Add compensation tests for second-document failure, convergence timeout, repair-required state, compensation unavailable state, and receipt recovery; `engine/crates/vaultspec-api/src/authoring/compensation.rs`.
- [ ] `W08.P37.S184` - Run Staged multi-document apply and compensation code review and record the phase audit; `.vault/audit/`.
- [ ] `W08.P37.S185` - Verify partial materialization is visible, recoverable, and never hidden as success; `engine/crates/vaultspec-api/src/authoring/compensation.rs`.

### Phase `W08.P38` - Rollback generator and eligibility

Generate reviewable rollback proposals from retained preimages and explicit unavailable-reason records.

- [ ] `W08.P38.S186` - Ground Rollback generator and eligibility requirements into the phase checklist; `.vault/adr/`.
- [ ] `W08.P38.S187` - Implement rollback proposal generation, operation-specific inverse logic, eligibility projection, unavailable reasons, and manual repair proposal hooks; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.
- [ ] `W08.P38.S188` - Add rollback tests for available preimage, missing preimage, delete inverse, rename inverse, approval gate, repeated request, and manual repair fallback; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.
- [ ] `W08.P38.S189` - Run Rollback generator and eligibility code review and record the phase audit; `.vault/audit/`.
- [ ] `W08.P38.S190` - Verify rollback is reviewable and unavailable rollback is explicit through tests and manual rollback API checks; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.

## Wave `W09` - Integration and acceptance

Prove backend routes, frontend stores, LangGraph fixtures, recovery, security negatives, manual workflows, and final release gates against the whole authoring system.

### Phase `W09.P39` - Backend route vertical slices

Exercise all endpoint families through real routes, real store, and private adapter boundaries.

- [ ] `W09.P39.S191` - Ground Backend route vertical slices requirements into the phase checklist; `.vault/adr/`.
- [ ] `W09.P39.S192` - Implement backend vertical-slice tests for sessions, documents, proposals, reviews, leases, streams, apply, rollback, and recovery; `engine/crates/vaultspec-api/tests/authoring_vertical_slices.rs`.
- [ ] `W09.P39.S193` - Add end-to-end backend scenarios for human edit, agent proposal, approval, rejection, conflict, apply, rollback, and reconnect; `engine/crates/vaultspec-api/tests/authoring_vertical_slices.rs`.
- [ ] `W09.P39.S194` - Run Backend route vertical slices code review and record the phase audit; `.vault/audit/`.
- [ ] `W09.P39.S195` - Verify every endpoint family works through real backend routes and real product state; `engine/crates/vaultspec-api/tests/authoring_vertical_slices.rs`.

### Phase `W09.P40` - Frontend store and review station contract

Wire dashboard stores and review surfaces to backend-served projections without frontend-derived truth.

- [ ] `W09.P40.S196` - Ground Frontend store and review station contract requirements into the phase checklist; `.vault/adr/`.
- [ ] `W09.P40.S197` - Implement authoring wire clients, query keys, mutations, replay cursors, review queue consumers, and degraded response handling; `frontend/src/stores/server/authoring.ts`.
- [ ] `W09.P40.S198` - Add frontend store tests for snapshots, commands, idempotency replay, stream cursor recovery, review queues, and degraded responses; `frontend/src/stores/server/authoring.test.ts`.
- [ ] `W09.P40.S199` - Run Frontend store and review station contract code review and record the phase audit; `.vault/audit/`.
- [ ] `W09.P40.S200` - Verify frontend stores consume backend-served authoring projections through tests and manual browser state checks; `frontend/src/stores/server/authoring.test.ts`.

### Phase `W09.P41` - LangGraph agent fixture against backend commands

Run a LangGraph-backed fixture against semantic backend tools and approval interrupts.

- [ ] `W09.P41.S201` - Ground LangGraph agent fixture against backend commands requirements into the phase checklist; `.vault/adr/`.
- [ ] `W09.P41.S202` - Implement a LangGraph authoring fixture that creates proposals, pauses for approval, resumes, and requests apply through backend commands; `engine/crates/vaultspec-api/tests/langgraph_authoring_fixture.rs`.
- [ ] `W09.P41.S203` - Add fixture tests for proposal creation, permission interrupt, approval interrupt, resume by interrupt ID, rejected tool, and cancelled run; `engine/crates/vaultspec-api/tests/langgraph_authoring_fixture.rs`.
- [ ] `W09.P41.S204` - Run LangGraph agent fixture against backend commands code review and record the phase audit; `.vault/audit/`.
- [ ] `W09.P41.S205` - Verify a LangGraph agent can complete the backend approval workflow without direct core access; `engine/crates/vaultspec-api/tests/langgraph_authoring_fixture.rs`.

### Phase `W09.P42` - Restart replay reconnect and security negatives

Prove restart recovery, event replay, browser reconnect, duplicate retry, and unauthorized command behavior across the whole system.

- [ ] `W09.P42.S206` - Ground Restart replay reconnect and security negatives requirements into the phase checklist; `.vault/adr/`.
- [ ] `W09.P42.S207` - Implement acceptance scenarios for restart, replay, reconnect, duplicate retry, unauthorized actor, forbidden scope, and forbidden tool flows; `frontend/e2e/authoring.spec.ts`.
- [ ] `W09.P42.S208` - Add end-to-end tests covering dashboard recovery, stream gap recovery, backend restart, security negatives, and multi-client conflict recovery; `frontend/e2e/authoring.spec.ts`.
- [ ] `W09.P42.S209` - Run Restart replay reconnect and security negatives code review and record the phase audit; `.vault/audit/`.
- [ ] `W09.P42.S210` - Verify recovery and security-negative scenarios pass through automated tests and manual acceptance checks; `frontend/e2e/authoring.spec.ts`.

### Phase `W09.P43` - Final gate audit and release readiness

Close the epic with full backend, frontend, vault, documentation, operational, and review gates.

- [ ] `W09.P43.S211` - Ground Final gate audit and release readiness requirements into the phase checklist; `.vault/adr/`.
- [ ] `W09.P43.S212` - Update release documentation, operator notes, implementation evidence, and final audit materials for the authoring backend; `.vault/audit/`.
- [ ] `W09.P43.S213` - Run Rust tests, frontend typecheck, frontend tests, frontend build, vault checks, manual acceptance, documentation audit, and code review; `.`.
- [ ] `W09.P43.S214` - Run Final gate audit and release readiness code review and record the phase audit; `.vault/audit/`.
- [ ] `W09.P43.S215` - Verify the epic is complete only when all automated gates pass and manual acceptance evidence is recorded; `.`.

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

The earlier 5-wave draft was too compressed for execution. This version splits
the backend into explicit subsystem boundaries: authoring contract, durable
store, document identity, changeset ledger, policy and review, collaboration,
LangGraph and streams, apply and rollback, then integration and acceptance.
Executing agents may add detail inside a phase through execution records, but
new subsystem boundaries require an explicit plan amendment.

## Steps

The structural rollout above is the executable plan: 9 Waves, 43 Phases, and
215 Steps. Every Phase begins with a grounding Step and closes with code review
or audit plus a concrete verification Step. Step execution records should be
scaffolded from this plan only after approval.

## Parallelization

Waves are sequenced by dependency. W01 fixes the authoring contract. W02 creates
the durable store foundation. W03 depends on W01 and W02 because document
identity, chunks, operations, and validation need both schemas and persistence.
W04 depends on W03 because the ledger and projections operate over stable
document and operation records. W05 depends on W04 so policy and review act on
real lifecycle state. W06 depends on W03 through W05 because collaboration needs
stable documents, approvals, and policy. W07 depends on W05 and W06 because
LangGraph tools and interrupts must respect product state, approvals, and
collaboration control. W08 depends on W04 through W07 because apply and rollback
require approved, validated, auditable proposals. W09 is the final integration
and acceptance wave.

Within a wave, phases may run in parallel only when their store tables,
transition rules, and command handlers do not overlap. Grounding Steps must
complete before implementation in each phase. Review and verification Steps are
phase-local gates and must close before downstream waves consume that phase.

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
