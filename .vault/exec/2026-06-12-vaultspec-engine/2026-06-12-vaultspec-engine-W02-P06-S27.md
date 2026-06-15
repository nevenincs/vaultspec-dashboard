---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S27'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the debounced filesystem watcher over vault and git dirs driving partial re-ingestion of dirtied views

## Scope

- `engine/crates/engine-graph/src/watch.rs`

## Description

- Implement the debounced filesystem watcher on notify 8: recursive watch over given roots, first event opens a debounce window, everything in-window coalesces into one deduplicated dirty-path callback.
- Provide `watch_roots`: a worktree's vault corpus plus its git dir (HEAD moves, refs, worktrees).

## Outcome

Serve-mode partial re-ingestion driver per D2.4; the coalescing behavior is proven by a live two-writes-one-callback test.

## Notes

notify pinned to 8.x (9 is RC-only per the foundation version sweep). Gitignore-honoring ride-along (W01P04-104 second half) still open; the watcher currently reports all paths and the consumer filters.
