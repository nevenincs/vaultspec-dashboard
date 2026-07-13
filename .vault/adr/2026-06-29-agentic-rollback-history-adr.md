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
  - '[[2026-06-29-agentic-apply-materialization-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-live-editing-room-adr]]'
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
---

# `agentic-rollback-history` adr: `rollback as a new auditable changeset` | (**status:** `accepted`)

## Problem Statement

Applied agentic changes need rollback, but rollback must not erase proposal
history, mutate old approvals, delete LangGraph evidence, or confuse git history
with product intent.

## Considerations

Research recommends append-only rollback: rejected proposals do not need
rollback because they never touched canonical documents. Changesets already carry
preimages, target snapshots, semantic operation intent, validation, and apply
receipts. Git revert is useful when a committed file change maps cleanly to a git
commit, but it is not a substitute for an authoring ledger. Multi-document and
rename/archive operations need rollback semantics per child operation.

## Constraints

Rollback writes must use the same apply/materialization path as normal changes.
Rollback eligibility, status, conflicts, and action labels must be
backend-served. Preimages are product data, not cache; losing them limits
rollback and must be treated as data loss or an explicit retention tradeoff.
Current document state may have advanced since the original apply, so rollback
can conflict and require review or rebase.

## Implementation

Rollback is represented as a new changeset whose source is a prior applied
changeset or applied child operation. The rollback changeset contains actor
provenance, reason, current base hash per target, the original apply receipts,
and either an inverse semantic operation or a materialized preimage target.

The rollback changeset follows the canonical changeset lifecycle from the
ledger. It never rewrites the source changeset, deletes old events, or removes
LangGraph checkpoints. When a rollback changeset applies, the source changeset
may show a derived `rolled_back` projection, but its stored canonical status is
not rewritten.

For multi-document source changesets, rollback targets the applied children
explicitly. If the original apply was partial, rollback only covers materialized
children. If an inverse cannot be generated safely, the backend creates a manual
repair proposal rather than guessing.

V1 ROLLBACK IS PREIMAGE RESTORE (decided 2026-07-02, architecture review finding
ASA-003, narrowing this ADR's earlier per-operation matrix to the evidenced
need): a body or frontmatter edit rolls back by restoring the stored
whole-document preimage against the current base — the one inverse that is
deterministic from already-retained material. Every other applied operation kind
(create, rename, related-link, archive/unarchive, section edit) exposes
`rollback_available=false` with an honest `rollback_unavailable_reason` naming
the unimplemented inverse, and the backend offers a manual repair proposal
instead. The per-operation inverse matrix — create rolling back by
archive/tombstone (physical delete only under documented core capability +
policy + no dependent links), section edits by selected preimage + exact
selector (unresolved selector degrades to manual repair), related-link changes
by inverse link operation, renames by inverse rename + link repair,
archive/unarchive by inverse state — is the DEFERRED extension path, to be
enabled per operation kind as the walking skeleton produces evidence of need,
never as one speculative batch. If a required preimage was compacted, the same
`rollback_available=false` + reason contract applies.

Git integration is recorded as related evidence: source commit, resulting
commit, or git revert reference when available. The authoring rollback remains
the product-level record even when git performs the low-level reversal.

## Rationale

Append-only rollback preserves auditability and makes rollback reviewable by the
same machinery as forward changes. It also handles the reality that a vault may
have moved on after the original apply; the rollback is a new proposed mutation
against current state, not time travel.

## Consequences

Auditors can see who proposed, approved, applied, and rolled back a change.
Rollback conflicts are explicit and recoverable. Preimage retention becomes a
storage and privacy decision. Some rollback operations will need human repair
when inverses are unsafe.

## Codification candidates

- **Rule slug:** `rollback-appends-a-new-authoring-changeset`.
  **Rule:** Rolling back an applied authoring change creates and applies a new
  auditable changeset; it never erases, mutates, or hides the original proposal,
  approval, apply receipt, or events.
- **Rule slug:** `rollback-preimages-are-product-state`.
  **Rule:** Preimages and inverse-operation data required for rollback are
  durable authoring records with explicit retention rules, not re-derivable
  cache.
- **Rule slug:** `rollback-availability-is-explicit`.
  **Rule:** Every applied authoring operation exposes rollback availability and a
  reason when rollback is unavailable, unsafe, or requires manual repair.
