---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S51'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Revision snapshots and preimages requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Ground W03.P11 against the rewritten Increment 1 walking-skeleton schedule.
- Confirm revision snapshots and preimages are full-document material for manual-mode propose, preview, apply, and rollback.
- Confirm W03.P11 must not implement chunk APIs, section selected-preimages, atomic hunk snapshots, per-operation rollback inverses, streams, sessions, leases, LangGraph runtime wiring, or operation modes.
- Confirm stored preimage records must carry document reference, base revision, blob hash, payload hash, full text, byte length, changeset id, operation id, capture time, and rollback retention metadata.
- Confirm stale-base detection is revision-first and must remain independent of advisory leases or frontend-derived state.

## Outcome

- W03.P11 is scoped to exact preimage and recovery inputs needed by the Increment 1 whole-document path.
- Later ADR clauses are sequenced to their owning increments: chunk serving returns only when a retrieval consumer exists, section and atomic operations move to W13.P45, per-operation rollback inverses move to W13.P46, streams move to W11, LangGraph moves to W12, and operation modes move to W10.
- Existing partial `snapshots.rs` work was classified as directionally aligned only when kept to full-document snapshots, preimage persistence, integrity checks, and retention recovery.

## Notes

- The plan still contains residual broad step wording in later W03 rows, including atomic patches, changed chunks, staged execution, and operation-specific inverses. The narrowed phase descriptions, the 2026-07-02 reference, and the amended ADRs are binding for implementation order.
- No destructive git operation was used.
