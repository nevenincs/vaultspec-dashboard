---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S13'
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
     The S13 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
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
     The Prove bounded reads: a capped directory level truncates honestly and cursor-paginates and ## Scope

- `engine/crates/vaultspec-api/tests/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove bounded reads: a capped directory level truncates honestly and cursor-paginates

## Scope

- `engine/crates/vaultspec-api/tests/`

## Description

- Prove bounded reads through the real router against a real git worktree (no mocks): one-level listing with the shared `code:<path>` interlink and the tiers block; a capped, sorted level cursor-paginating exclusively with a `next_cursor` and no overlap.
- Fix the cut-off `worktree_state_router_reuse` compile gap in the integration test (see P01.S04).

## Outcome

- COMMITTED (code-tree-exclusive new file): `engine/crates/vaultspec-api/tests/file_tree.rs`.
- Gate: `cargo test -p vaultspec-api --test file_tree` — 5 passed, 0 failed. The `ingest-git` unit suite (`file_tree`) — 6 passed.

## Notes

- The integration test drives the endpoint end-to-end through `build_router` (the same path the SPA uses) against a real one-commit git worktree with a real `.vault` corpus — honoring `engine-read-and-infer` (real services in integration tests, no test doubles at the boundary).
