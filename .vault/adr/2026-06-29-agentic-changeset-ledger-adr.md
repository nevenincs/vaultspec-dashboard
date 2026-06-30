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
  - '[[2026-06-29-agentic-change-format-and-chunking-adr]]'
  - '[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]'
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

# `agentic-changeset-ledger` adr: `changeset identity, lifecycle, projections, and idempotency` | (**status:** `accepted`)

## Problem Statement

Agentic authoring needs one reviewable unit that can survive refreshes, retries,
approval gates, conflicts, and rollback. Raw model output, diffs, tool calls, or
direct core writes do not provide stable identity or lifecycle. The backend needs
a changeset ledger.

## Considerations

A changeset should be stable across sessions and independent of document paths,
LangGraph runs, and frontend state. Agents and humans may propose concurrently
against the same base. Approvals can go stale. Apply and rollback may be
retried. The frontend must render backend-served projections rather than derive
workflow status from events.

## Constraints

Changeset ids are opaque stable ids, not derived from title, path, thread id, or
current status. Each target carries document identity, operation kind, base blob
hash or revision, materialized preview, preimage, validation result, and review
diff. Apply correctness remains optimistic base checking; leases are advisory
only. Duplicate create, approval, apply, rollback, and event-publication commands
must be idempotent.

## Implementation

Define a changeset as a multi-document aggregate with child operations, even if
V1 constrains most applies to one write group until atomic multi-document
materialization is proven. Child operations cover semantic Vaultspec mutations
such as create document, replace body, edit frontmatter, rename, archive,
unarchive, link, and future section edits.

The ledger is append-only for lifecycle events and maintains backend-served
projections. Canonical changeset statuses are snake_case and owned here:
`draft`, `generating`, `proposed`, `needs_review`, `approved`, `applying`,
`applied`, `partially_applied`, `compensation_required`, `rejected`,
`conflicted`, `superseded`, `failed`, `rollback_proposed`, and `cancelled`.
Past-tense names such as `proposal_created` or `validation_updated` are event
names, not statuses. `approved` and `applied` remain separate states; apply is an
idempotent command with its own recorded result.

A rollback is a new changeset with `kind=rollback` and the normal lifecycle
statuses above. `rolled_back` is only a derived projection on the original source
changeset when a rollback changeset has applied; it is not a canonical stored
status on the source changeset.

Every mutating command carries an idempotency key scoped to actor, command kind,
and target aggregate. Replays return the existing recorded result or in-flight
state. Rollback creates a new changeset from the stored preimage or inverse
operation; it never mutates or erases the original applied record.

Backend projections expose review queues, counts by status, per-document active
changesets, child materialization states, aggregate partial-apply state,
compensation requirements, action eligibility, conflict reasons, stale approval
status, validation state, active runs, and rollback availability.

## Rationale

A ledger gives the UI, backend, and agents one durable object to discuss: the
proposed change. It separates human review from token streams, protects apply
from duplicate side effects, and makes rollback auditable. Multi-document
identity avoids redesign when agents produce connected ADRs, plans, links, and
renames.

## Consequences

The system gains stable review, retry, conflict, and rollback semantics. It also
needs careful transition validation and projection rebuilding. The main pitfalls
are partial multi-document application, frontend-derived eligibility, and
duplicate side effects after LangGraph interrupt replay; the ledger design
addresses those by constraining V1 apply boundaries, serving projections, and
requiring idempotency keys.

## Codification candidates

- **Rule slug:** `agent-edits-become-changesets`.
  **Rule:** Agent-authored document mutations enter the product as durable
  changesets with preimages, validation, review diffs, lifecycle status, and
  provenance before any approved apply reaches core.
- **Rule slug:** `changeset-projections-are-backend-served`.
  **Rule:** Review queues, status counts, action eligibility, conflict reasons,
  stale approval state, and rollback availability are served by backend
  projections, never inferred in frontend components.
- **Rule slug:** `authoring-mutating-commands-are-idempotent`.
  **Rule:** Proposal creation, approval decisions, apply, rollback, and
  authoring event publication require scoped idempotency keys and return
  recorded outcomes on retry.
