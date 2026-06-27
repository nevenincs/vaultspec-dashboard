---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S02'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

# Return per child the repo-relative path, kind dir or file, has_children hint, and code:<path> node id, metadata only with no bytes

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Verify each listed child carries the repo-relative POSIX path, the `dir`/`file` kind, a `has_children` disclosure hint for directories, and the `code:<path>` node id, projected by `child_to_wire`.
- Confirm the listing is metadata-only: no file bytes are read on any path (the walk reads directory entries and `is_dir` only).

## Outcome

- Verified: the integration test asserts a directory child (`src`) reports `kind=dir`, `has_children=true`, `node_id=code:src`, and a file child reports `kind=file`, `has_children=false`, `node_id=code:src/main.rs`. No bytes are serialized.
- COMMITTED: the per-child projection lives in the committed `routes/file_tree.rs` (committed with P02.S07). No separate commit for this assessment.

## Notes

- The `has_children` probe stops at the first non-ignored child (cheap); a directory whose every child is ignored honestly reports no children (verified by the `ingest-git` unit test).
