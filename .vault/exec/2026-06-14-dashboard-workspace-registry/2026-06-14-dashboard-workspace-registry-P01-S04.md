---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Implement read-only add, forget, and select-active registry operations that never mutate a repository

## Scope

- `engine/crates/vaultspec-session/src/session.rs`

## Description

- Add `list_roots` and `root` reads returning registry rows in stable position order.
- Add `add_root` upsert that appends a new root at the end of the order and refreshes an existing root's label, path, and reachability in place without reshuffling its position.
- Add `set_root_reachability` to record a moved or missing root as degraded rather than dropping it.
- Add `forget_root` returning a typed refusal when forgetting the last launch root and otherwise deleting only the registry row.
- Add `active_workspace` and `set_active_workspace` over the global-settings kv surface, plus the `RegistryError` type and the public `UserState` delegators.

## Outcome

The registry's read-only add, forget, and select-active operations are complete and unit-tested. Every operation writes only config rows in the best-effort store and never clones, inits, creates, deletes, or otherwise mutates a repository, a worktree, a branch, or any file on disk; forgetting is a config-row delete, and the last-launch-root refusal is a config-level refusal, not a disk operation.

## Notes

Forget returns a nested `Result<Result<(), RegistryError>>` so a genuine store error and an operator refusal are distinct, and a forget of an unknown id is a harmless no-op. The caller is responsible for evicting any warm scope cells a forgotten root owned (handled at the route layer in P02).
