---
tags:
  - '#exec'
  - '#constellation-live-delta'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S03'
related:
  - "[[2026-06-13-constellation-live-delta-plan]]"
---

# Emit both delta species on the single clock, carry last_seq on the live keyframe, and honor diff granularity

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- `commit_graph`: after the document diff, compute `feature_delta` continuing
  the SAME monotonic clock, and broadcast both species on the `graph` channel.
- Generalize the resume ring from typed document entries to `(seq, payload)`
  tuples so `since=` replays BOTH species on the global clock (the stream
  replay reads the tuples).
- `/graph/query` live response carries `last_seq` (the clock tip); `as_of`
  carries `null` (historical, no live position).
- `/graph/diff` honors `granularity=feature`, returning the projected
  feature/meta-edge delta log; `document` (default) is unchanged.

## Outcome

The live keyframe + delta path is complete for both species on one clock:
resume and gap-detection are global-seq, application is per-granularity. A held
constellation can splice live deltas without refetching.

## Notes

`/graph/diff` scopes BOTH refs to the served worktree (the peer's concurrent
content-diff fix), so `feature_delta`'s single scope is correct there. The
`/graph/query` keyframe `last_seq` lives in `src/routes/query.rs`, which the
peer's declared-tier commits carried alongside this work (shared file).
