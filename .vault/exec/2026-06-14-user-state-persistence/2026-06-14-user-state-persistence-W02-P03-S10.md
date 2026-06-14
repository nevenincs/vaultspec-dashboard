---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S10'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# implement the scope registry with lazy build and LRU working-set cap and eviction

## Scope

- `engine/crates/vaultspec-api/src/registry.rs`

## Description

- Add the new `registry.rs` module with `ScopeRegistry`: a map from scope token
  to `Arc<ScopeCell>` plus least-recently-used recency tracking, bounded by the
  `WORKING_SET_CAP` constant (6 warm cells).
- Implement `get_or_build(state, token)`: fast-path on a warm hit (touch
  most-recently-used, return the clone); cold-path validate the scope as a
  selectable vault-bearing worktree, open its store, cold-index the graph, spawn
  its watcher, insert under the lock, and evict the least-recently-used
  non-active cell when over cap (its watcher tears down on drop).
- Add `build_active(state, root)` warming the trusted launch scope directly,
  bypassing the worktree-membership check that client-supplied scopes get; share
  the store-open + index + watcher + insert sequence with `get_or_build` through
  a private `build_and_insert`.
- Add `validate_scope_token(state, token)` enumerating the workspace's worktrees
  and requiring membership plus a present `.vault`; an unknown or non-vault scope
  returns an honest error the route layer maps to a 400.
- Spawn each cell's watcher per warm scope and pin the active scope so it is
  never evicted; cover the registry with rejection, warm-hit identity, and
  resident-count tests.

## Outcome

The registry holds N warm per-scope cells concurrently, routed by scope token
and bounded by a small working set with LRU eviction; the inference crates are
untouched (the registry holds N `LinkageGraph`s and adds no sibling semantics).
Cold scopes build on first access and instant switches resolve against a warm
cell. All registry tests pass.

## Notes

`get_or_build` builds the cell OUTSIDE the registry lock so a slow cold build
never blocks other scopes' fast-path resolves; a lost insert race prefers the
resident cell and drops the loser (its watcher tears down). The per-scope
watcher rebuild task only spawns when a tokio runtime is current, so the
non-async unit-test fixtures install the watcher without a rebuild task and
rebuild explicitly.

Revision (W02 review HIGH-1): the per-scope rebuild task originally captured a
strong `Arc<ScopeCell>`, forming a cycle (task → cell → its `WatchHandle` owning
`dirty_tx` → open `dirty_rx` → task never exits) that leaked an evicted cell,
its watcher, the OS watch, and the task — defeating the working-set cap. Fixed by
having the task hold a `Weak<ScopeCell>` and `upgrade()` per dirty batch: when the
registry drops the evicted cell's last strong ref the count hits zero, the
`WatchHandle` drops (tearing the OS watch down and closing `dirty_tx`), and the
task exits. A runtime-present test
`eviction_drops_the_evicted_cell_and_its_watcher_with_no_leaked_rebuild_task`
over real git worktrees forces one eviction and asserts the evicted cell's strong
count reaches zero; it fails against the old strong-`Arc` task and passes with the
`Weak`.
