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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S10 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The implement the scope registry with lazy build and LRU working-set cap and eviction and ## Scope

- `engine/crates/vaultspec-api/src/registry.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
