---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S13'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

# Prove bounded reads: a capped directory level truncates honestly and cursor-paginates

## Scope

- `engine/crates/vaultspec-api/tests/`

## Description

- Prove bounded reads through the real router against a real git worktree (no mocks): one-level listing with the shared `code:<path>` interlink and the tiers block; a capped, sorted level cursor-paginating exclusively with a `next_cursor` and no overlap.
- Fix the cut-off `worktree_state_router_reuse` compile gap in the integration test (see P01.S04).

## Outcome

- COMMITTED (code-tree-exclusive new file): `engine/crates/vaultspec-api/tests/file_tree.rs`.
- Gate: `cargo test -p vaultspec-api --test file_tree` — 5 passed, 0 failed. The `ingest-git` unit suite (`file_tree`) — 6 passed.

## Notes

- The integration test drives the endpoint end-to-end through `build_router` (the same path the SPA uses) against a real one-commit git worktree with a real `.vault` corpus — honoring `engine-read-and-infer` (real services in integration tests, no test doubles at the boundary).
