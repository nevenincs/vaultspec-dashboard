---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S13'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# spawn and tear down the watcher per warm scope

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Spawn the filesystem watcher per warm scope inside the registry build path:
  each cell's watcher debounces dirty batches into a `rebuild_and_swap` on THAT
  cell's clock, exactly the single-scope watcher loop that used to live in
  `serve`, now one per warm worktree.
- Hold each watcher handle in its own cell so it is torn down on eviction:
  dropping the evicted cell drops its `WatchHandle`, disconnecting the notify
  channel and ending its supervisor cleanly.
- Make `/status` report the ACTIVE scope's cell: its live graph counts,
  generation, delta-clock tip, and watcher residency now read from the
  always-pinned active cell rather than a single frozen `AppState`.

## Outcome

Every warm scope has its own resident watcher driving its own rebuilds, and an
evicted scope's watcher is torn down with the cell. `/status` truthfully reports
the active scope's index, clock, and watcher state — a dead watcher is still
stated, never papered over.

## Notes

The watcher-per-scope spawn and teardown live in the registry build path
(committed with S10); the `/status` active-cell read lives in the stream route
(committed with S14). The single-scope watcher wiring was removed from `serve`
with S11. This step's deliverable — the per-scope watcher lifecycle — is
realized across those files; no isolated `lib.rs` change remained for it.
