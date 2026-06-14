---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S18'
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
     The S18 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The resolve the cell via the registry in the ops routes and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# resolve the cell via the registry in the ops routes

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Resolve the active scope's cell in the ops routes (`/ops/core/*`,
  `/ops/rag/*`, `/search`) and run the bounded sibling subprocess in that cell's
  worktree as the working dir; the ops routes carry no scope param, so they
  forward to core/rag in the currently-selected scope.
- Read the active cell's root for `/search`'s rag discovery and the active
  cell's tiers for every ops/search response, success and degrade alike.
- Keep the `/ops/core/*` + `/ops/rag/*` whitelist and the bounded-subprocess
  pattern (stdout cap, wall-clock timeout, exit-status inspection) unchanged —
  the read-and-infer fence holds: the engine still only FORWARDS to the sibling
  and grows no sibling semantics.
- Point the SPA layer at the workspace root for the dist directory and resolve
  the API-404 tiers from the active cell, so the static shell and the JSON 404
  stay workspace-correct.

## Outcome

The ops proxies and search run in the active scope's worktree and report that
scope's tiers; the whitelist, verbatim-envelope forwarding, and bounded-sibling
robustness (timeout-to-504, crash-to-502, runaway-to-502) are all preserved. The
sibling-subprocess and search-shape tests pass. With S18 the whole wave compiles
and the full vaultspec-api and engine-e2e suites are green.

## Notes

The read-and-infer fence is honored: the ops routes resolve the active/target
scope only to set the subprocess working dir and the tiers source — no sibling
control or search semantics enter the engine. The SPA dist lookup is
workspace-level (one bundle per process), so it reads `workspace_root`, not a
per-scope root.
