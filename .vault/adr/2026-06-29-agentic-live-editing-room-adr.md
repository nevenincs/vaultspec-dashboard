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
  - '[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]'
  - '[[2026-06-29-agentic-approval-gates-review-state-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-29-agentic-apply-materialization-adr]]'
  - '[[2026-06-29-agentic-rollback-history-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
---

# `agentic-live-editing-room` adr: `defer CRDT and OT to a scoped editing-room substrate` | (**status:** `accepted`)

## Problem Statement

The feature needs approval-driven spec authoring now, but live character-level
editing raises a different set of CRDT/OT, presence, merge, compaction, and
authority problems. The architecture must avoid forcing those concerns into V1
while leaving a clean path if live rooms become necessary.

## Considerations

Research identifies four buffers with different owners: canonical document,
local editor draft, agent run buffer, and durable proposal buffer. CRDT/OT solves
simultaneous typing, not approval, validation, rollback, or materialization. V1
requirements are reviewable changesets, human approval, safe apply, rollback,
and durable events. Advisory leases plus base-hash checks are enough for V1
collision control. ACP-style sessions and prompt turns are useful, but raw
filesystem editing is not the Vaultspec authoring contract.

## Constraints

Canonical `.vault/` documents remain backend/core materialized state, not CRDT
documents. Proposal buffers are reviewed and applied; agent buffers and local
drafts are not product truth. Any future room state must be bounded by retention,
TTL, document scope, and compaction. Live presence and cursor state are
ephemeral and must not drive approval eligibility. A room must submit a
materialized changeset for review before it can affect the vault.

## Implementation

V1 does not implement CRDT or OT for shared markdown buffers. It implements
server-authoritative proposals, optimistic base checks, optional TTL leases for
disruptive work, and durable authoring events.

If live editing is added later, a later ADR must decide the room protocol,
compaction, awareness, and submit semantics. This ADR only preserves the
authority boundary: any future room produces an `editing_room_draft`, and its
only durable product output is a submitted changeset with reviewable rollback
material.

Presence, cursor, and update traffic remain ephemeral and bounded. Closing or
submitting a room does not write `.vault/`; only approved changeset apply does.

## Rationale

Deferring CRDT/OT keeps V1 aligned with the actual product problem:
approval-driven authoring. Scoping a future room as a proposal-input mechanism
prevents live editing technology from bypassing review, conformance, rollback,
or core-owned materialization.

## Consequences

V1 ships fewer moving parts and avoids premature merge semantics. Users can
still review, approve, apply, reject, and roll back agent work safely. True
simultaneous typing will require a later ADR for room protocol, compaction,
awareness, and submit semantics. Future room implementation has a clear
authority boundary: room state drafts, changesets decide, apply materializes.

## Codification candidates

- **Rule slug:** `live-editing-rooms-submit-changesets`.
  **Rule:** Any future CRDT or OT editing room may produce draft state, but it
  affects the vault only by submitting a validated changeset that follows the
  normal approval and apply lifecycle.
