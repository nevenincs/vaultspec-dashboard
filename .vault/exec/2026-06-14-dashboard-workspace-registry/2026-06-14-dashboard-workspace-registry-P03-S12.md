---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S12'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-workspace-registry with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S12 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Let warm scope cells belong to any registered reachable workspace while preserving per-scope delta clocks and ## Scope

- `engine/crates/vaultspec-session/src/session.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Let warm scope cells belong to any registered reachable workspace while preserving per-scope delta clocks

## Scope

- `engine/crates/vaultspec-session/src/session.rs`

## Description

- Verify that the warm scope registry already permits a cell's worktree to belong to any registered workspace: cells are keyed by globally-unique worktree token, workspace-agnostic, and each cell carries its own monotonic delta clock.
- Add a cross-workspace scope-routing test: launch in workspace A, register a sibling workspace B, switch the active workspace to B, validate and warm B's worktree, and assert A's and B's warm cells are distinct with independent delta clocks (a rebuild on B does not touch A's clock).

## Outcome

Warm scope cells span registered workspaces while each preserves its own per-scope delta clock, so SSE `since=` resume stays correct per scope regardless of which workspace it came from. No new memory mechanism was needed; the existing warm registry already satisfied this once scope validation followed the active workspace (S11).

## Notes

The warm registry lives in the API crate, not the session crate the plan row names; the substantive cross-workspace capability is enabled by the S11 active-workspace scope-validation change combined with the already-per-scope cells. The verification test lives where the registry lives (the API crate).
