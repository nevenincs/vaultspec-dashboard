---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S62'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement proposal operation payloads, whole-document drafts, atomic patches, materialized preview builders, and review diff projections

## Scope

- `engine/crates/vaultspec-api/src/authoring/operations.rs`

## Description

- Add the W03.P13 proposal operation domain module for whole-document previews.
- Register the operation module under the fenced authoring backend domain.
- Implement `replace_body` materialization from an existing-document draft and captured base snapshot.
- Build full target snapshots from whole-document draft text using the W03.P11 snapshot primitives.
- Build a normalized review diff projection containing base/target identity, byte and line counts, changed status, and a bounded hunk projection.
- Reject unsupported operation kinds, non-whole-document draft modes, missing base fences, stale snapshots, mismatched target refs, and mismatched preimage records.

## Outcome

- `MaterializedProposalOperation` now represents the reviewable child operation material needed by the Increment 1 skeleton.
- `ReviewDiffProjection` is explicitly derived review material; the target snapshot and preimage linkage remain the apply and rollback inputs for later phases.
- The implementation keeps create/delete, section-scoped edits, atomic hunks, range selectors, persistence, validation digests, approvals, apply, and rollback command generation out of this phase.
- Focused compile verification passed with `cargo test -p vaultspec-api authoring::operations -- --nocapture`; the target has no tests until S63.

## Notes

- The S62 scaffold title includes stale `atomic patches` wording from the older row text. The implementation follows the W03.P13 phase description and S61 checklist: whole-document subset only.
- No destructive git operation was used.
