---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S63'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add operation tests for full replacement, create, delete, atomic hunk, preview recovery, semantic diff, and invalid range cases

## Scope

- `engine/crates/vaultspec-api/src/authoring/operations.rs`

## Description

- Add whole-document replacement tests over real resolved vault documents and captured revision snapshots.
- Verify review diff projections preserve base and target line counts, changed status, and added/removed line material.
- Verify unchanged whole-document drafts produce an empty review diff.
- Verify preimage references are retained as preview recovery inputs and mismatched preimages are rejected.
- Verify body replacements require a preimage tied to the same changeset and reject cross-changeset preimage attachment.
- Verify non-contiguous edits produce separate review diff hunks and oversized line projections carry truncation metadata.
- Verify malformed preimage recovery identities are rejected and long-line diffs carry byte-cap truncation metadata.
- Verify unsupported create, section, rename, archive, unarchive, link, and append-mode cases fail loudly in the W03.P13 subset.
- Verify stale base/current revision mismatches fail before a preview can become review material.
- Verify materialized previews round-trip through JSON and reject unknown frontend-derived fields.

## Outcome

- Focused operation tests passed with `cargo test -p vaultspec-api authoring::operations -- --nocapture`: 15 tests passed.
- The test set covers the binding whole-document subset and records deferred atomic/range/delete wording as unsupported behavior rather than implemented scope.
- No delete operation enum exists in the current DTO layer; destructive coverage is represented by archive/unarchive rejection for this phase.

## Notes

- The S63 scaffold title includes stale `atomic hunk`, `invalid range`, and `delete` wording. W13.P45 owns section/atomic selector tests, and delete is not a V1 proposal operation.
- No destructive git operation was used.
