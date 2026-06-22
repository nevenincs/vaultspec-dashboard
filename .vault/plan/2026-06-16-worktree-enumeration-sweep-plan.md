---
tags:
  - '#plan'
  - '#worktree-enumeration-sweep'
date: '2026-06-16'
modified: '2026-06-22'
tier: L2
related:
  - '[[2026-06-16-status-worktree-latency-adr]]'
---








# `worktree-enumeration-sweep` plan

### Phase `P01` - add the cheap path-list API

Add worktrees::list_roots returning canonicalized worktree roots without the per-worktree inspect (no status diff, no ahead_behind walk).



- [x] `P01.S01` - Add pub fn list_roots(workspace) returning canonicalized worktree roots via collect_descriptors, with no inspect; `engine/crates/ingest-git/src/worktrees.rs`.
- [x] `P01.S02` - Add a unit test that list_roots returns the same path set as enumerate but does no status/ahead-behind work; `engine/crates/ingest-git/src/worktrees.rs`.

### Phase `P02` - migrate the four path-only callers

Switch validate_scope_token, Ctx::resolve, the registry register route, and the serve-boot root resolver from enumerate to list_roots, preserving their exact match semantics.

- [x] `P02.S03` - Migrate validate_scope_token to list_roots, preserving the scope_token-normalize match and .vault check; `engine/crates/vaultspec-api/src/registry.rs`.
- [x] `P02.S04` - Migrate Ctx::resolve to list_roots, preserving the clean_path exact-or-prefix match; `engine/crates/vaultspec-cli/src/cmd/mod.rs`.
- [x] `P02.S05` - Migrate the registry register route's emptiness check to list_roots; `engine/crates/vaultspec-api/src/routes/registry.rs`.
- [x] `P02.S06` - Migrate the serve-boot launch-root resolver to list_roots, preserving the prefix match; `engine/crates/vaultspec-api/src/lib.rs`.

### Phase `P03` - verify, measure, review

Run the engine gate, measure scope-switch latency on the many-worktree workspace, and pass code review.

- [x] `P03.S07` - Run the full engine gate (cargo fmt --check + clippy + tests) to exit 0; `engine/`.
- [x] `P03.S08` - Measure cold scope resolution on the many-worktree workspace and confirm the inspect cost is gone; `engine/crates/vaultspec-api/src/registry.rs`.
- [x] `P03.S09` - Code-review the migration for match-semantics parity and read-only correctness; `engine/crates/ingest-git/src/worktrees.rs`.

## Description


## Steps







## Parallelization


## Verification

