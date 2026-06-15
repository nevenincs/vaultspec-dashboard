---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W01.P02` summary

Phase W01.P02 (git landscape mapping) is complete: all five Steps closed,
workspace checks green at the boundary.

- Created: `engine/crates/ingest-git/src/workspace.rs`
- Created: `engine/crates/ingest-git/src/worktrees.rs`
- Created: `engine/crates/ingest-git/src/branches.rs`
- Created: `engine/crates/ingest-git/src/log.rs`
- Modified: `engine/crates/ingest-git/src/lib.rs`
- Modified: `engine/crates/ingest-git/Cargo.toml`

## Description

Delivered the outer-framework landscape layer on gix, no libgit2 and no
shelling out (ADR D2.5; test fixtures are built with the git CLI, which the
constraint does not govern). Workspace discovery resolves any launch
directory to the repository common git dir as the workspace identity key
(D2.1), with worktree-equivalence proven by fixture. Worktree enumeration
reports every checkout as (path, HEAD ref, dirty), with dirty computed via
the status iterator so untracked files count - a deliberate semantics call
recorded in the S07 record. Branch enumeration classifies default, feature
and other advisorily (D2.3) with a configurable prefix list, and the
corpus-diff confirmation hook is lazy and cached with at-most-once probing
per branch. Remote refs map as degraded scopes flagged with the tiers they
cannot serve (D2.2). The commit-log walk produces newest-first commit
events with first-parent touched paths, feeding the W02 temporal
correlation rules and the persisted event log.

Verification at the phase boundary: `cargo test` green workspace-wide (11
new tests in the crate, 30 total passing suites), `cargo fmt --check` and
`cargo clippy --all-targets -- -D warnings` clean. One semantics call
flagged for phase review (S07 dirty definition); no ADR deviations.
