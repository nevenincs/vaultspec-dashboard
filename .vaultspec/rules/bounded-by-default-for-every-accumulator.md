---
name: bounded-by-default-for-every-accumulator
---

# Every accumulator is bounded at creation

## Rule

Every cache, channel, queue, retained list/map, and background loop in the
engine (`engine/`) and the stores layer (`frontend/src/stores/`) must carry an
explicit bound at the point it is created — a size cap, a TTL/retention window,
or a channel capacity. An unbounded accumulator (`unbounded_channel`, a `Vec`/
`HashMap`/SQLite table that only ever grows, a `staleTime: Infinity` query with
no `gcTime`, an append-only log with no prune) is a defect, not a default.

## Why

Unbounded growth is the dominant resource-exhaustion failure mode this codebase
keeps re-encountering. The `2026-06-13-dashboard-optimization` cycle found a
session-long stream accumulator and un-GC'd queries; the
`2026-06-15-performance-sweep` / `resource-hardening` cycle found the engine
crash-looping on `sqlite: out of memory` from an append-only `temporal_events`
table and an unbounded `mpsc` rebuild channel, plus an `openedIds` list that
retained every opened node's queries for the whole session. Each was the same
shape: a thing that only grows, with no bound declared where it was created. The
pattern has held across multiple cycles, so the bound belongs at creation, not
as a later retrofit after the leak ships green.

## How

- **Good:** a new watcher channel is `mpsc::channel(1)` with `try_send`
  coalescing; a new SQLite table gets a retention prune wired into the rebuild
  path; a new stores query sets `gcTime` and a ring-cap; a new retained list gets
  a `*_CAP` with LRU eviction (mirroring `WORKING_SET_CAP`).
- **Bad:** `tokio::sync::mpsc::unbounded_channel()`, an append-only table with no
  `prune_*`/retention, `[...acc, chunk]` with `staleTime: Infinity` and no cap,
  or `openedIds: [...state.openedIds, id]` with no eviction — all ship green and
  exhaust memory or disk over a long session.

## Status

Active. Promoted from the `resource-hardening` wave of the
`2026-06-15-performance-sweep` campaign after the unbounded-growth pattern
recurred across the optimization and hardening cycles.

## Source

ADR `2026-06-15-resource-hardening-adr` and research
`2026-06-15-resource-hardening-research` (findings B2, B3, B5, B7); prior
`2026-06-13-dashboard-optimization-research` (P-HIGH-6, P-MED gcTime). Sibling
rules `graph-queries-are-bounded-by-default`,
`subprocess-calls-carry-cap-and-timeout`.
