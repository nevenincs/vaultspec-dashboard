---
tags:
  - '#exec'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S05'
related:
  - "[[2026-06-13-graph-scale-hardening-plan]]"
---

# Re-run the scale_bench concurrent pass and record before/after

## Scope

- `engine/tests/tests/scale_bench.rs`

## Description

- Added a concurrent FEATURE (constellation LOD) pass to `scale_bench` alongside
  the existing concurrent document pass, so the bench exercises the memoized
  `meta_edges` and measures the LOD read path under load.

## Outcome

At 4000 docs / 16 000 edges, 128 concurrent queries each:

- document granularity: 7928 ms (dominated by the 9 MB full-slice JSON serialize
  per query);
- feature granularity (LOD): 508 ms — ~15× cheaper concurrently.

This is the central scale signal: the bounded constellation LOD is dramatically
cheaper under concurrent load than the unbounded document slice. It is the
quantitative case for P03 making LOD the default and bounding document reads.

## Notes

The single-tag synthetic corpus understates the `meta_edges` cache (meta_edges
is cheap without a tag² fan-out); the cache's value is on multi-tag real vaults
and in removing the redundant route recompute (see S04). The document path's
per-request cost is unchanged here by design — bounding it is P03, not a cache.
