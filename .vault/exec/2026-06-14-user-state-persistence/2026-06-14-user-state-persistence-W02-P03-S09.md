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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S09 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The extract the single-graph serve fields into a per-scope cell struct and ## Scope

- `engine/crates/vaultspec-api/src/app.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
