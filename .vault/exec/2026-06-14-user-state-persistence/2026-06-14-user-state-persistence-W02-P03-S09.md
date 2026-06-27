---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S09'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# extract the single-graph serve fields into a per-scope cell struct

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- Extract every per-scope serve field out of the old single `AppState` into a
  new `ScopeCell` struct in `app.rs`: `root`, `scope`, the live-graph
  `RwLock`, the store `Mutex`, the `seq` clock, the resume `ring`, the
  broadcast `tx`, the `meta_cache`, the `generation` counter, the `watcher`
  handle, and `declared_status`.
- Move the four per-scope methods `graph_arc`, `meta_edges`, `rebuild_and_swap`,
  and `commit_graph` off `AppState` and onto `ScopeCell`; the commit path now
  advances THIS cell's own monotonic delta clock under its own ring lock, so
  per-scope `since=` resume is correct and independent.
- Add a `ScopeCell::new(root, scope, store)` constructor that builds an empty,
  zero-clock cell; the registry build path indexes it and spawns its watcher.
- Reshape `AppState` into the workspace-level container: `workspace_root`, the
  `RwLock<ScopeRegistry>`, the bearer token, the single shared
  `Arc<Mutex<UserState>>` handle, and the `RwLock<String>` active scope. Add
  `AppState::active_cell()` resolving the always-pinned active scope's cell for
  `/status` and the error-path tiers fallback.
- Add `vaultspec-session` to the crate manifest so `AppState` can hold the
  shared user-state handle.

## Outcome

`ScopeCell` is the per-scope serve unit and `AppState` is workspace-level; the
crate compiles and the migrated unit tests (`rebuild_swap_*`, `meta_edges_*`,
plus a new independent-clock test) pass. The single `UserState` rides a `Mutex`
because the W01 store wraps a `!Sync` rusqlite `Connection`; the lock serializes
every access through one writer, exactly the single-writer discipline the W01
review requires.

## Notes

The W01 `Store` is `!Sync`, so a bare `Arc<UserState>` would make `AppState`
unshareable behind axum's `State`. Wrapping it in `Arc<Mutex<UserState>>` is the
faithful realization of "single shared handle, single writer" — recorded here
because it adjusts the ADR's nominal `Arc<UserState>` shape for the type system
without weakening the invariant.
