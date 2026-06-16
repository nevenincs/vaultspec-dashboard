---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S02'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---




# Implement GET /nodes/{id}/content: validate scope, guard path traversal, read bytes via read_from_worktree/read_from_ref, derive language_hint from extension

## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs`

## Description

- Implement the `node_content` handler: validate an explicit scope through the shared validate-scope path, or fall back to the active scope per the nodes-family convention.
- Guard the resolved path against traversal with `guard_within_root` before any disk read, rejecting `..` and absolute components, mirroring the file-tree resolve-within-root discipline.
- Read bytes via `read_from_worktree` for a worktree scope and `read_from_ref` for a ref-only scope, mapping a missing-at-ref read to a not-found request error.
- Derive `language_hint` from the path extension across the full required language set so the client picks the grammar without re-parsing.

## Outcome

The handler resolves the scope, guards traversal, reads from the correct substrate, and derives the language hint. Tests confirm traversal rejection and the language-hint mapping.

## Notes

None.
