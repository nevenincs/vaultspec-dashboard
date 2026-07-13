---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-07-12'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# `user-state-persistence` `W02.P03` summary

Wave `W02` summary (Phases `W02.P03` cell + registry, `W02.P04` per-scope serve infra,
`W02.P05` route resolution; Steps S09-S18). Generalized the single-`AppState` serve layer
into a warm multi-scope registry so the user can browse across worktrees.

- Created: `engine/crates/vaultspec-api/src/registry.rs`.
- Modified: `engine/crates/vaultspec-api/src/app.rs`, `src/lib.rs`,
  `src/routes/{query,temporal,ops,stream,mod,spa}.rs`, `tests/declared_tier_parity.rs`.

## Description

The per-scope serve fields (graph, store, delta clock, resume ring, broadcast channel, meta
cache, watcher, declared status) were extracted into a `ScopeCell`; `AppState` became
workspace-level, holding a `ScopeRegistry` (LRU, working-set cap 6, active scope pinned), the
shared single-writer `UserState`, and the active scope. Each cell owns its own monotonic
delta clock, so per-scope SSE `since=` resume is independent. `validate_scope` changed from
"one frozen scope" to "any selectable vault-bearing worktree in this workspace"; every read
route resolves its cell through the registry. `/stream` gained an optional `scope` param and
`/status` reflects the active scope. The boot path restores and persists the active scope
through `UserState`.

Verification: workspace builds; `vaultspec-api` (30+2) and `engine-e2e` suites green;
fmt/clippy clean; inference crates untouched. Code review found one HIGH (a watcher eviction
reference cycle that leaked the evicted cell + watcher + rebuild task, defeating the
working-set cap); it was fixed by giving the rebuild task a `Weak` cell reference and adding
a runtime-present eviction-teardown regression test (fails-before / passes-after), then
re-checked green.
