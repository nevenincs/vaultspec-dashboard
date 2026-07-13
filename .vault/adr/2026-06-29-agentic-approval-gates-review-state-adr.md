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
  - '[[2026-07-02-agentic-operation-modes-adr]]'
---

# `agentic-approval-gates-review-state` adr: `backend-owned approval gates and review state` | (**status:** `accepted`)

## Problem Statement

Agentic document authoring needs durable human approval before side effects.
LangGraph interrupts can pause runs, but they are execution state, not product
approval history. The backend must define what is being approved, which actions
reviewers can take, and when an approval becomes stale.

## Considerations

Research distinguishes risky tool-call permission from final changeset approval.
Tool permissions may use LangGraph interrupts, but product approval is over the
final proposal, its targets, diffs, validation results, and base revisions.
Agent Inbox-style decisions map well to review actions: approve, reject, edit,
and respond.

## Constraints

Pending approvals are product state and must live in the authoring store, not
best-effort session state or LangGraph checkpoints. Approval state and action
eligibility are backend-served. Because LangGraph can replay nodes after
interrupts, approval creation, decision submission, run resume, and apply all
require idempotency keys.

## Implementation

The changeset ledger owns the canonical proposal lifecycle vocabulary. This ADR
defines approval and review records against those ledger states rather than
creating a second status list.

Two request types are distinct. A `tool_permission_request` is keyed by
`tool_call_id` and asks whether an agent may perform a bounded tool action such
as reading context or running validation. A `changeset_approval_request` is
keyed by `proposal_id` and asks whether a reviewed proposal revision may later
be applied. A tool permission never substitutes for changeset approval.

Review records carry reviewer identity, policy version, proposal revision,
target base revisions, validation digest, decision payload, comments, interrupt
IDs, timestamps, and idempotency key. `approve` authorizes a later apply command;
it does not erase the need for final revision checks. `reject` is append-only
and may cancel the linked run, but preserves evidence. `edit` creates a new
proposal revision or reviewer-modified candidate and invalidates prior
approvals. `respond` sends clarification or instructions back to the agent
without approving or rejecting.

Approval policy is represented as data, not UI conditionals. Each policy entry
classifies operation risk, required reviewer role/count, whether quorum is
needed, whether tool permission is separate from final proposal approval, whether
trusted automation may auto-apply, and which conditions make the approval stale.
V1 uses a simple matrix: low-risk read/context tools can be tool-permitted,
document proposals require one authorized human approval, destructive operations
such as rename/archive/rollback require explicit human approval, and agent
self-approval is forbidden (owned by the security-provenance ADR). Auto-apply —
when and how a recorded policy lets a system actor approve without a human gate —
is owned entirely by the agentic-operation-modes ADR (2026-07-02); this ADR
supplies the policy-as-data representation modes are expressed in and does not
restate the mode rules.

An approval becomes stale when proposal material changes, a target base revision
changes, validation changes from the reviewed result, policy changes, the run is
cancelled, or the proposal is rebased. Stale approvals cannot apply.

Review-station queue state is a backend projection over approval requests,
proposal state, assignments, and policy. It is scoped in a separate review
station ADR so this ADR can stay focused on approval semantics.

## Rationale

This keeps product history in Vaultspec state while still using LangGraph
interrupts for execution pauses. It also prevents the UI from deriving approval
eligibility from raw events or stream status, matching the project rule that
displayed and filterable state is backend-served.

## Consequences

Review state becomes explicit and auditable. Reviewers get safer edit/respond
flows, but every proposal mutation can require a fresh approval. Agent runs need
careful resume handling so an interrupt response cannot be mistaken for product
approval.

## Codification candidates

- **Rule slug:** `approvals-bind-to-reviewed-revision`.
  **Rule:** An authoring approval is valid only for the proposal revision, base
  target revisions, validation digest, and policy version that were reviewed;
  any change makes it stale.
- **Rule slug:** `review-actions-are-backend-served`.
  **Rule:** Approve, reject, edit, respond, apply, rebase, and rollback
  eligibility must be served by the authoring backend and never inferred in
  frontend components.
- **Rule slug:** `approval-policy-is-data`.
  **Rule:** Authoring approval requirements are computed from backend policy data
  covering operation risk, reviewer role/count, quorum, auto-apply allowance, and
  stale conditions, never from frontend conditionals.
