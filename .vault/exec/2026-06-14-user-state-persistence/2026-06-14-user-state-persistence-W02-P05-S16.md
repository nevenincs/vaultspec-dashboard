---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S16'
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
     The S16 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The resolve the cell via the registry in the graph and vault-tree and filters and node routes and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# resolve the cell via the registry in the graph and vault-tree and filters and node routes

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Resolve the per-request scope to its cell in `/vault-tree`, `/graph/query`,
  and `/filters` via `validate_scope`, then read the cell's graph, scope,
  meta-edge projection, and per-scope delta-clock tip instead of the single
  frozen `AppState`.
- Make the `/nodes/{id}` family (`detail`, `neighbors`, `evidence`, `discover`)
  serve from the active scope's cell, since those routes carry no scope param;
  `discover` reads the active cell's root for rag discovery and its store/scope
  for the node-scoped query.
- Keep `/map` workspace-level: it enumerates every worktree of the workspace, so
  it discovers from `workspace_root` and reports tiers from the active cell.
- Point the `/graph/query` live-keyframe `last_seq` anchor at the resolved
  cell's clock so a held keyframe splices that scope's live deltas with no gap.

## Outcome

Every read route serves the resolved scope: a graph query, vault-tree, or
filters request against a sibling worktree returns that worktree's data, and the
node family serves the active scope. The graph node ceiling, granularity
parsing, and as-of resolution facts are all preserved. The crate compiles and
the graph/as-of/node tests pass against the per-cell shape.

## Notes

This step's read-route resolution and the S15 `validate_scope` rewrite both live
in `routes/query.rs` and were delivered in one cohesive change to that file
(committed under S15). The node family and `/map` carry no `scope` param by
contract, so they resolve the ACTIVE scope rather than a request scope — the
selected-worktree default the session layer restores.
