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
  - '[[2026-06-29-agentic-approval-gates-review-state-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
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

# `agentic-concurrency-leases-conflicts` adr: `revision-first concurrency with advisory leases` | (**status:** `accepted`)

## Problem Statement

Humans and agents can draft against the same document at the same time. The
backend needs a concurrency policy that prevents lost updates, allows parallel
proposals, reduces avoidable collisions, and gives reviewers explicit conflict
and rebase states.

## Considerations

The existing read path already exposes `blob_hash`, and the editor ADRs use it as
the optimistic write token. Research confirms that locks are coordination tools,
not correctness mechanisms. Approvals can go stale between review and apply.
Multi-document changesets increase the conflict surface, so every target needs
an explicit base revision.

## Constraints

Correctness must not depend on an unexpired lease. A crashed client or agent
cannot strand a document. The Rust backend may own proposal and review state,
but `.vault/` materialization still flows through the core adapter. The frontend
must consume backend-served lease, conflict, stale-approval, and
action-eligibility projections.

## Implementation

Every proposed operation records an expected base revision per target, initially
the served `blob_hash`. Apply is an idempotent backend command. Before any
materialization, the backend recomputes each current target revision, reruns
required validation, and compares the current revisions to the approved bases. A
mismatch marks the changeset or child operation `conflicted` and prevents apply.

Leases are TTL-bound advisory records with scope, purpose, holder actor, expiry,
and a monotonically increasing fencing token. They reduce collisions for
destructive, whole-document, rename, archive, or long-running rewrite work.
Lease renewal and release are explicit, but expiry always permits progress. A
stale fencing token cannot finalize or apply a lease-protected proposal, and no
lease bypasses revision checks.

Rebase is explicit. A conflicted proposal can be regenerated or rebased into a
new proposal revision against the current document state. Any automatic or
LLM-assisted rebase produces a new reviewable candidate and invalidates prior
approvals.

## Rationale

Revision checks are the durable correctness floor already compatible with the
current editor backend. Advisory leases improve UX without creating false
safety. Treating conflicts as first-class proposal states keeps policy visible
and avoids hiding stale writes behind generic transport failures.

## Consequences

Concurrent proposal drafting remains possible. Users will see more explicit
conflict states instead of silent overwrites. V1 can restrict apply to
single-target changes until the apply-transaction decision proves safe
multi-target materialization; the changeset model still records target-set
conflicts honestly.

## Codification candidates

- **Rule slug:** `leases-never-replace-revision-checks`.
  **Rule:** Every authoring apply must compare current target revisions to the
  approved base revisions; advisory leases may coordinate work but cannot permit
  or bypass a stale write.
- **Rule slug:** `conflicts-are-proposal-state`.
  **Rule:** Agentic authoring conflicts are backend-served proposal states with
  target-specific reasons and rebase eligibility, not generic failures inferred
  by the frontend.
