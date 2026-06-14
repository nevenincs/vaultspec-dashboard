---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S04'
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
     The S04 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
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
     The Hard-cap each level, cursor-paginate a pathological directory, and emit a truncated-style honesty marker and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Hard-cap each level, cursor-paginate a pathological directory, and emit a truncated-style honesty marker

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Verify each directory level is hard-capped at the per-level child ceiling (`MAX_LEVEL_CHILDREN = 2000`, mirroring the graph's `MAX_GRAPH_NODES` discipline) and emits a `truncated`-style honesty marker (`total_children` / `returned_children` / `reason`) when the level exceeds the cap.
- Confirm the capped, already-sorted level is cursor-paginated through the shared `engine_query::envelope::paginate` helper, with `page_size` clamped to the ceiling so a client cannot defeat the cap.
- Fix the integration test's cursor-pagination case: the prior executor left an undefined `worktree_state_router_reuse(&dir)` call (a session-limit cut-off gap) that failed to compile.

## Outcome

- Fixed: the second-page fetch now clones the single built router (same warm scope, same bearer) instead of calling the undefined helper, so the cursor-pagination test compiles and proves exclusive, gap-free pagination.
- Verified: the integration test pages a flat directory two children at a time, asserts `flat/f00.rs`/`flat/f01.rs` on page 1 with a `next_cursor`, and `flat/f02.rs` on page 2 with no overlap.
- COMMITTED: the bounded-read + pagination logic lives in `routes/file_tree.rs` (P02.S07); the test fix lives in the committed `tests/file_tree.rs`.

## Notes

- The one genuine blocker found in the resumed backend was this undefined test helper; it was a clear cut-off artifact and the fix is the minimal, intent-preserving one (clone the router rather than rebuild state, which would have minted a fresh bearer and broken the same-scope pagination the test asserts).
