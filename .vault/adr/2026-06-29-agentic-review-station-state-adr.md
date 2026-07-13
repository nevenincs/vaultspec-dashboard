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
  - "[[2026-06-29-agentic-authoring-boundary-adr]]"
  - "[[2026-06-29-agentic-changeset-ledger-adr]]"
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
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
  - '[[2026-07-02-agentic-operation-modes-adr]]'
---

# `agentic-review-station-state` adr: `review station queue state and assignment model` | (**status:** `accepted`)

## Problem Statement

Approval records define what can be approved, rejected, edited, or answered, but
the frontend also needs a review-station projection: the queue of work waiting
for humans, which item is claimed, what is waiting on an agent, and which actions
are allowed at each point.

## Considerations

The review station is displayed and filterable state, so it must be backend
served. It is not a separate source of truth from the changeset ledger or
approval records. Agent Inbox-style workflows show that approve/edit/reject/respond
decisions need a durable queue and feedback loop. Multi-agent work also needs
competing candidates and clarification states to be visible without deriving them
from stream events.

## Constraints

Review station state cannot be inferred by frontend components from proposal
events. Claiming a review item is advisory assignment, not document locking.
Station visibility and action eligibility depend on actor permissions, policy
version, proposal freshness, validation digest, and current ledger state. The
station must tolerate stale browser tabs and retry decisions idempotently.

## Implementation

The backend serves review-station items as projections over proposals,
approval requests, assignments, and policy. V1 queue item states are FOUR
(decided 2026-07-02, architecture review finding ASA-003, collapsing this ADR's
earlier eleven-state vocabulary to the single-reviewer reality): `queued`,
`claimed`, `decision_submitted`, and `closed`. Facts the wider vocabulary
encoded as states remain visible as projection FIELDS on the item — staleness is
the already-served stale reason, conflict the conflict summary, an in-flight
clarification the latest `respond` exchange — so nothing is hidden; it is simply
not a state machine until a real review team needs one. The deferred extension
states (`in_review`, `waiting_on_agent`, `clarification_requested`,
`clarification_responded`, `reviewer_editing`, `stale`, `escalated`) are
reserved vocabulary, enabled per state when multi-reviewer or long-loop
clarification workflows produce evidence of need.

Reviewers may claim and release items. A claim records actor, expiry, and
purpose, but it does not grant authority to apply stale or unauthorized work.
Clarification loops use `respond` decisions to send structured feedback to the
agent; in V1 the item stays `claimed` while the exchange runs. Reviewer edits
create a new proposal revision or reviewer candidate and make older approvals
stale.

The station projection includes queue reason, assigned reviewer, visible
decision options, stale reason, validation status, conflict summary, risk class,
required reviewer role/count, competing proposal ids, and recommended next
actions. Multi-reviewer or quorum rules are policy data; V1 starts with a
single required human reviewer and the projection shape supports a count. Under
the operation-modes decision (see the agentic-operation-modes ADR) the station
also serves the after-the-fact lane: changesets applied under a recorded mode
policy, ordered by apply time, with rollback availability — acknowledgement
items, not gates.

## Rationale

Separating review-station projection from approval truth gives the UI an
ergonomic queue without duplicating lifecycle state. It also gives agents a
structured feedback loop for rework instead of treating rejection as a terminal
black box.

## Consequences

The backend must maintain more projections, but the UI becomes simpler and safer:
review buttons come from the backend, stale decisions are blocked consistently,
and competing agent proposals can be compared in one station. The main risk is
letting station assignment look like authorization; the ADR keeps policy and
freshness checks on every decision.

## Codification candidates

- **Rule slug:** `review-station-state-is-backend-served`.
  **Rule:** Review queues, assignments, stale reasons, visible decisions, and
  next actions are backend-served review-station projections, never frontend
  derivations from events.
- **Rule slug:** `review-claims-are-not-authority`.
  **Rule:** Claiming a review item coordinates reviewers but never bypasses
  policy, freshness, validation, or apply checks.
