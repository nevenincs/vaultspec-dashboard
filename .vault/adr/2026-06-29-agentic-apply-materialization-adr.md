---
tags:
  - '#adr'
  - '#agentic-spec-authoring-backend'
date: '2026-06-29'
modified: '2026-07-12'
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
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-29-agentic-rollback-history-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-live-editing-room-adr]]'
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
---

# `agentic-apply-materialization` adr: `approved changesets materialize through the core adapter` | (**status:** `accepted`)

## Problem Statement

Approved human or agent proposals must become real vault document changes without
exposing collaborators to low-level core verbs, duplicating writes on retry, or
claiming unsafe multi-document atomicity.

## Considerations

Existing editor ADRs establish `vaultspec-core` as owner of `.vault/` CRUD,
conformance, `modified:` stamps, and atomic file writes. The authoring API should
expose proposals, approvals, changesets, conflicts, and apply results, not
core-shaped routes. Apply is the side effect that needs strict idempotency,
validation, provenance, and concurrency checks. Multi-document changesets are
necessary for realistic agent work, but current core capabilities may not
provide arbitrary cross-document atomic transactions.

## Constraints

The read/infer engine must not hand-write `.vault/` documents. The core
invocation must resolve to the project-pinned capability set, carry output caps
and wall-clock timeouts, and return tiered, typed failures. Stale base hashes or
revisions must conflict before write, never silently overwrite. Frontend state
must use backend-served eligibility such as `can_apply`, `conflict_reason`, and
`validation_status`. A retry of the same apply command must return the previous
recorded result or continue the same attempt, never apply twice.

## Implementation

An approved changeset is applied by a backend-owned command with an idempotency
key. The command verifies lifecycle state, actor policy, approval freshness,
validation status, and expected base hash or revision for each target document.

The materializer calls an internal core adapter. That adapter is the only layer
that knows which `vaultspec-core` verb or batch capability implements a semantic
operation. It captures the core envelope, post-write blob hashes, diagnostics,
and failures as apply receipts.

The changeset model is multi-document from the start, but V1 APPLY IS
SINGLE-CHILD (decided 2026-07-02, architecture review finding ASA-004,
superseding this ADR's earlier "V1 may restrict" hedge): the apply command
accepts only changesets with exactly one child operation, and refuses a
multi-child changeset with an honest typed capability result naming the limit.
The multi-document SCHEMA is retained unchanged — proposals, reviews, diffs, and
the ledger all model child operations — so agents can draft connected work and
reviewers can see it as one unit; only materialization is single-child until the
atomicity story is real.

Staged multi-document materialization — per-child materialization states,
`partially_applied`, `compensation_required`, compensation records, and
watcher-convergence repair projections — is DEFERRED behind `vaultspec-core`
growing a batch transaction capability, which is filed upstream as the sibling
gap it is. A saga/compensation engine compensating for a missing core capability
is not V1 scope; when core provides the transaction boundary, multi-child apply
returns as an atomic capability rather than a compensation workflow. Until then
the two staged-apply lifecycle statuses remain reserved vocabulary in the ledger
but are unreachable.

Post-apply, the backend records the durable result, publishes authoring events
through the outbox, and waits for watcher or reindex convergence as a separate
observed state rather than pretending indexing is part of the file write.

## Rationale

This keeps the collaborator contract semantic and stable while preserving the
prior core ownership decision. Idempotent apply commands give safe retry behavior
around network loss, LangGraph replay, and user double-submit. Modeling
multi-document changesets now avoids redesign, while refusing to fake atomicity
protects audit and rollback correctness.

## Consequences

Approved proposals can materialize safely through the existing conformance and
write machinery. Agents remain untrusted proposers rather than direct writers.
Multi-document work is reviewable as one unit but materializes single-child in
V1; the compensation subsystem, two lifecycle statuses, and the convergence
repair machinery drop off the critical path until core provides a real batch
transaction. Apply records become central product data and require migrations,
retention, and reconciliation.

## Codification candidates

- **Rule slug:** `authoring-apply-is-an-idempotent-core-adapter-command`.
  **Rule:** Approved authoring changes materialize only through an idempotent
  backend apply command that validates policy and base revisions, then calls the
  project-pinned core adapter.
- **Rule slug:** `multi-doc-apply-never-claims-atomicity-without-core-support`.
  **Rule:** A multi-document changeset may be modeled and reviewed as one unit,
  but it must not be reported as atomically materialized unless the underlying
  core adapter provides that transaction boundary.
