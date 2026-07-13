---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S16'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

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
