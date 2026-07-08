---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S71'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Changeset aggregate and child operations requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Ground W03.P15 against the changeset-ledger, change-format, document-identity, authoring-state-store, and authoring-API ADRs.
- Bind the phase to append-only changeset aggregate history and ordered child operations.
- Identify existing reusable surfaces: `ChangesetId`, `ChangesetKind`, `ChangesetStatus`, `DocumentRef`, `ChangesetOperationKind`, `MaterializedProposalOperation`, `ValidationStatusRecord`, and the authoring unit-of-work repository pattern.
- Separate ledger records from later transition engine, proposal command handlers, approval decisions, apply jobs, routes, streams, actor records, and LangGraph checkpoint state.
- Confirm W03.P15 must support multi-document proposal shape even though V1 apply remains single-child later.

## Outcome

- W03.P15 must introduce `ledger.rs` plus durable store tables for changeset aggregate revisions and child operation rows.
- The ledger must be append-only: new revisions/events reconstruct state; old revisions are not overwritten or erased.
- Child operations must carry explicit target ordering, unique child keys per changeset revision, operation kind, document target identity, material digest linkage, validation digest linkage where available, and audit-friendly record identifiers.
- History reconstruction must be possible from the durable authoring store without LangGraph checkpoints or frontend memory.
- The phase must not implement lifecycle legality, terminal-state guards, proposal command orchestration, approval stale invalidation, apply materialization, rollback, route handlers, or public core-shaped APIs.

## Notes

- Chunk evidence remains optional provenance in the current walking skeleton; the ledger may persist validation/material digests but must not require a served chunk API.
- Sagan was dispatched as a read-only explorer for the W03.P15 implementation shape.
- No destructive git operation was used.
