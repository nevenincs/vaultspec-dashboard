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
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
  - '[[2026-06-29-agentic-changeset-ledger-adr]]'
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

# `agentic-authoring-boundary` adr: `Rust-owned authoring API with internal core adapter` | (**status:** `accepted`)

## Problem Statement

Agentic spec authoring needs a collaborator-facing backend contract for humans
and agents to draft, review, approve, apply, reject, and roll back Vaultspec
document changes. The current write path proves the Rust backend can safely
broker `vaultspec-core`, but `/ops/core/*` is too low-level and core-shaped to
become the public authoring API.

## Considerations

The product requirement is approval-driven document authoring, not live CRDT or
OT editing. Agents should produce reviewable changesets, not direct file writes.
LangGraph checkpoints and interrupts are execution state, while proposals,
approvals, rollback records, and document history are Vaultspec product state.
ACP is useful as inspiration for sessions, turns, tool-call updates, permission
requests, cancellation, and replay, but Vaultspec edits must be semantic
document proposals, not arbitrary filesystem writes.

## Constraints

The existing read/infer engine remains read-and-infer for `.vault/`
materialization: it must not hand-write vault documents or absorb core mutation
semantics. The authoring work therefore needs a fenced authoring backend domain
or sibling service boundary inside the Rust dashboard backend. The
`engine-read-and-infer` refinement this requires is DECIDED here (2026-07-02,
architecture review finding ASA-006; the rule text is amended to match): the
co-located authoring domain may own durable authoring WORKFLOW state — the
changeset ledger, approvals, preimages, receipts, audit records, in the
dedicated non-derivable authoring store — because that is product state the
domain itself originates, not vault content; the fence line is that the
authoring domain never hand-writes `.vault/` documents, never mutates git, and
reaches vault materialization exclusively through the internal `vaultspec-core`
adapter. The engine's own read-side guarantees (re-derivable caches, inference
only) are unchanged; the authoring store is explicitly OUTSIDE the "deletable,
fully re-derivable" class and lives under a distinct product-state directory for
exactly that reason.

Every browser response must use the shared envelope and carry `tiers`. Stores
remain the sole frontend wire client. Displayed workflow state, action
eligibility, status, counts, conflicts, and validation must be backend-served.
Any subprocess-backed adapter call must carry output caps, timeouts, and
project-pinned capability checks.

The parent document editor ADRs are accepted and stable for simple writes. This
ADR does not supersede them; it adds a product authoring domain above their
direct write broker.

## Implementation

The Rust dashboard backend exposes a public authoring API through a fenced
authoring domain: sessions, prompt turns, proposals, approvals, changesets,
validation results, conflicts, rollback requests, leases, and authoring events.
Frontend and agents integrate with that API only.

`vaultspec-core` remains hidden behind an internal validation and materialization
adapter. Applying an approved change calls this adapter, which may invoke the
existing whitelisted core verbs, capture the core envelope, and confirm
watcher/reindex convergence. The adapter is not exposed as the collaborator
contract.

LangGraph agents connect through an agent adapter that maps runs, thread ids,
checkpoints, interrupts, tool calls, and token streams onto Vaultspec authoring
objects. The authoring domain copies final proposal material into
Vaultspec-owned records and treats LangGraph references as provenance, not
authority.

## Rationale

This boundary preserves the existing core write ownership while adding the
missing product workflow above it. It avoids coupling agents and UI to CLI verb
shapes, subprocess behavior, or wheel release details, and it gives the
dashboard one backend-served source for approval and authoring state. It also
leaves live editing rooms as a future substrate that can emit changesets when
needed.

## Consequences

The dashboard gains a stable product API for human and agent authoring without
turning `/ops/core/*` into an application protocol. The cost is a new Rust
authoring domain or sibling service that must be carefully fenced from the
read/infer engine and from `.vault/` write semantics. The main pitfall is
leaking core-shaped operations back into public endpoints; the authoring API
must stay semantic and review-oriented.

## Codification candidates

- **Rule slug:** `agentic-authoring-api-is-backend-owned`.
  **Rule:** Human and agent collaborators interact with the fenced Rust
  authoring API for proposals, approvals, changesets, and rollback; they never
  call `vaultspec-core` or core-shaped `/ops/core/*` routes as the authoring
  contract.
- **Rule slug:** `core-remains-authoring-materialization-adapter`.
  **Rule:** Approved authoring changes materialize through an internal
  `vaultspec-core` adapter, and the Rust backend never hand-writes `.vault/`
  documents or reimplements core mutation semantics.
