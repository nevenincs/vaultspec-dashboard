---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S14'
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
     The S14 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
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
     The Prove gitignore exclusion and worktree-only honest degradation and ## Scope

- `engine/crates/vaultspec-api/tests/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
