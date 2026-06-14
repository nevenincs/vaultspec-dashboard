---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S12'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S12 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The move commit-graph and rebuild-and-swap onto the cell with a per-scope monotonic clock and ## Scope

- `engine/crates/vaultspec-api/src/app.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# move commit-graph and rebuild-and-swap onto the cell with a per-scope monotonic clock

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- Finalize `commit_graph` and `rebuild_and_swap` as `ScopeCell` methods that
  advance the cell's OWN `seq` atomic under the cell's OWN ring lock, so the
  document-then-feature delta batch numbers on a per-scope monotonic clock.
- Confirm each warm cell carries an independent delta clock and resume ring: a
  rebuild on one cell advances only its own `seq`, leaving every other cell's
  clock untouched — the foundation for correct per-scope `since=` resume.
- Add the `each_scope_cell_owns_an_independent_delta_clock` unit test pinning the
  per-scope-clock invariant.

## Outcome

The commit path is per-scope: `rebuild_and_swap` indexes the cell's worktree,
records the cell's declared-tier status, and `commit_graph` diffs against the
cell's outgoing graph and advances the cell's clock. Two warm cells never share
a delta clock, so a rebuild on the active scope cannot perturb another scope's
resume sequence.

## Notes

The substantive method move landed with the `ScopeCell` extraction in S09's
`app.rs` (the cell and its methods are one indivisible struct); this step
finalizes and proves the per-scope-clock property with the independent-clock
test. No further `app.rs` change beyond what S09 committed.
