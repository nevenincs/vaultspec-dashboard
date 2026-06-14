---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S03'
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
     The S03 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
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
     The Honor repository ignore rules via the gix machinery to exclude .git, build output, and vendored trees and ## Scope

- `engine/crates/ingest-git/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
