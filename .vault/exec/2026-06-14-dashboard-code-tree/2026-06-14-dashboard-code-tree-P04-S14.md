---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S14'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

# Prove gitignore exclusion and worktree-only honest degradation

## Scope

- `engine/crates/vaultspec-api/tests/`

## Description

- Prove gitignore exclusion: the integration test seeds `.git`, `node_modules`, `target`, a gitignored `build/`, and a gitignored `vendored/`, and asserts only real source and the `.vault` corpus are listed.
- Prove worktree-only honest degradation: an unknown / non-worktree scope is refused with a tiered 400 carrying the tiers block (the remote-ref degradation surface), and a traversal/escape path is a tiered 400 distinct from degradation.
- Cover the `ingest-git` ignore/escape/has-children unit cases.

## Outcome

- COMMITTED: covered by the committed `engine/crates/vaultspec-api/tests/file_tree.rs` (gitignore + unknown-scope-400 + escape-400) and the committed `engine/crates/ingest-git/src/file_tree.rs` `#[cfg(test)]` unit module (ignore + escape + only-ignored-children + not-a-dir).
- Gate: all `ingest-git` (6) and `vaultspec-api --test file_tree` (5) cases pass.

## Notes

- The structural-degrade-empty path (a worktree that cannot be listed) is unit-grounded in the route's `ListError::Io` branch and the mock's `setNoVault` structural degradation; the remote-ref case is realized as the scope-validation 400 (a remote ref has no selectable worktree).
