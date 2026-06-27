---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S03'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

# Honor repository ignore rules via the gix machinery to exclude .git, build output, and vendored trees

## Scope

- `engine/crates/ingest-git/`

## Description

- Verify the listing honors repository ignore rules: dot-directories (except the `.vault` corpus) are excluded, the always-ignored build/dependency set (`node_modules`, `target`, `dist`, `__pycache__`, `venv`) is excluded, and bare directory-name / `dir/` entries collected from every `.gitignore` on the path from the worktree root down are excluded.
- Confirm `.git`, build output, and vendored trees never appear.

## Outcome

- Verified: the `ingest-git` unit test and the `/file-tree` integration test both assert real source and `.vault` are listed while `.git`, `node_modules`, `target`, a gitignored `build/`, and a gitignored `vendored/` are excluded.
- COMMITTED: the ignore machinery lives in `engine/crates/ingest-git/src/file_tree.rs` (committed this step, with its one-line `pub mod file_tree;` in `ingest-git/src/lib.rs`).

## Notes

- Bounded honoring by design: glob and negation `.gitignore` patterns are out of v1 scope (they would need a dedicated ignore engine). Bare names and `dir/` entries are honored, which is sufficient to keep `.git`/build/vendored noise out without pulling in a second ignore implementation. This matches the ADR ("the `ingest-git`/`gix` machinery already reads them") at the bounded level the structural tier itself applies.
- `ingest-git/src/lib.rs` carries ONLY the one-line `pub mod file_tree;` addition (no peer work), so it is committed together with the new module to keep the crate self-consistent — this does not absorb any peer edits.
