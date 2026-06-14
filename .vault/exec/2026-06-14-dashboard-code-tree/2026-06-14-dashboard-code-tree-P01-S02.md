---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S02'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-code-tree with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S02 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Return per child the repo-relative path, kind dir or file, has_children hint, and code:<path> node id, metadata only with no bytes and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
