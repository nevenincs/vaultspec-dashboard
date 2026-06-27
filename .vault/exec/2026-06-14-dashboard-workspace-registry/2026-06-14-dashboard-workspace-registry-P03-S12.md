---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S12'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

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
