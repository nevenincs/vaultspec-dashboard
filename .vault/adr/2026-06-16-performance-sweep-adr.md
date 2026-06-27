---
tags:
  - '#adr'
  - '#performance-sweep'
date: '2026-06-16'
modified: '2026-06-22'
related:
  - "[[2026-06-15-performance-sweep-research]]"
  - "[[2026-06-13-graph-scale-hardening-adr]]"
  - "[[2026-06-13-dashboard-optimization-adr]]"
  - "[[2026-06-15-resource-hardening-adr]]"
---

# `performance-sweep` adr: `engine + frontend performance optimization avenues` | (**status:** `accepted`)

## Problem Statement

A resource-exhaustion incident on a top-tier machine (a graph viewer for ~740
docs should be light) opened a measured inventory of every performance and
footprint optimization avenue across the dashboard (the companion research). The
incident split into two axes, divided with the concurrent `resource-hardening`
campaign: that campaign took the crash-shaped exhaustion/leak/security axis;
THIS one takes the speed/throughput/footprint axis (engine query latency under
concurrency, on-disk cache size, frontend bundle/render cost) plus the
frontend leak avenues. This ADR records the decisions for that axis and is
persisted retroactively to formally close the campaign whose avenues already
landed as measured commits.

## Considerations

- The research measured the real costs (`scale_bench`, `dist/` bundle, a frame
  profile): the document-granularity query path is ~100x the feature path under
  concurrency and fully recomputed per request; the 1 MB eager entry bundle
  loads Pixi+scene before the chrome paints; the declared-graph cache stored
  uncompressed JSON; the Pixi ticker ran at 60fps on a static field.
- The avenues are surgical and measurable, NOT a rewrite — memoize on the
  immutable graph generation, split the bundle, idle the ticker, compress the
  cache, cap fan-out. Each is behavior-preserving except latency/throughput/size.
- Ownership is split with `resource-hardening` to avoid two agents editing the
  same files: crash-shaped engine items (gix bound, subprocess timeout, channel,
  sqlite vacuum/retention, task hygiene) are that campaign's; the speed/footprint
  and frontend avenues are this one's.

## Constraints

- Behavior-preserving: optimizations change only latency/throughput/size; the
  existing test suites stay green and pin the behavior.
- No new heavy runtime dependency for the published wheel (`published-wheel-purity`):
  engine-crate deps (e.g. `blake2`, `flate2` for A3 compression) are fine; the
  Python wheel stays rag/torch-free.
- Memoized projections key on the graph `generation` and invalidate on commit —
  a stale projection served across a commit would be a correctness bug, so the
  generation key is load-bearing.
- Scene-render avenues coordinate with the `dashboard-node-graph-stability`
  d3-force render-loop owner.

## Implementation

The avenues, by axis (each landed as a measured commit):

- **Engine speed/footprint.** A1: memoize the enriched document-slice projection
  (node/edge views) per graph generation, so repeat/concurrent document queries
  serve cached views instead of re-deriving per request. A3: gzip-compress the
  large declared-graph cache payloads at rest (5-15x size win, less page-cache
  pressure). A5 (deferred, LOW): `meta_edges` returns an owned clone of the
  already-cached projection — the heavy aggregation is memoized via the
  `LinkageGraph` `OnceLock`; sharing the `Arc` is a marginal, signature-rippling
  change held back. A4 (deferred): the per-fold `LinkageGraph` deep-clone is
  correctness-load-bearing (D8.2 convergence) and only worth attacking under a
  commit storm.
- **Frontend.** F#2: vendor `manualChunks` + lazy scene unit so the chrome
  paints before Pixi loads. F#1: a reversible scene unmount that releases GPU
  resources on Stage teardown. F#4: idle-throttle the Pixi ticker so a static
  converged field schedules no per-frame draw. F#5: skip the full layer rebuild
  on an unchanged `set-data`. F#6: cap the ego-network fan-out to bound
  concurrent `/neighbors`. F#3: remove the dead `sigma`/`@pixi/react` deps.

## Rationale

Every avenue is grounded in a measured cost in the research and is the honest,
CPU-algorithmic / bundle / lifecycle lever — not GPU-ifying the CPU engine
(`graph-compute-is-cpu-gpu-is-render-and-search`) and not a rewrite. Memoizing
on the immutable generation is the same discipline `meta_edges`/`salience_basis`
already use; the bundle and ticker fixes are standard cold-load and idle-render
hygiene.

## Consequences

- Concurrent document-query throughput improves (cached views); the declared
  cache shrinks markedly on disk; cold-load TTI drops (chrome paints first); a
  static field draws no frames; the ego fan-out is bounded.
- Two avenues stay deferred (A4 clone, A5 Arc-share) as LOW/correctness-guarded —
  recorded, not silently dropped.
- The memoization adds a generation-keyed cache that MUST invalidate on commit;
  the existing tests guard it.

## Codification candidates

- **Rule slug:** `derived-projections-memoize-on-the-graph-generation`.
  **Rule:** every per-request derived graph projection (document views,
  meta-edges, salience basis) must be memoized keyed on the immutable graph
  `generation` and invalidated on commit, never recomputed per request.

Note: the GPU-boundary and bounded-query disciplines this campaign also exercised
are already codified (`graph-compute-is-cpu-gpu-is-render-and-search`,
`graph-queries-are-bounded-by-default`); only the memoize-on-generation
discipline is a new candidate.
