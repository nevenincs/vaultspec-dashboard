---
tags:
  - '#research'
  - '#performance-sweep'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-13-graph-scale-hardening-adr]]"
---

# `performance-sweep` research: `engine and frontend performance optimization avenues`

A measured inventory of every performance/footprint optimization avenue across the
dashboard, kicked off after a real resource-exhaustion incident on a top-tier machine
(a graph viewer for ~740 docs should be light). Each avenue carries a location, the
problem, estimated impact, fix risk, and whether it was measured. Two parallel discovery
sweeps (engine, frontend) plus a mine of the prior perf cycles fed this.

The already-landed root-cause fix is excluded: the engine `derived_artifacts` SQLite
cache was append-only/unbounded (34 dead 6 MB `declared-graph-v2` snapshots = 166 MB for
740 docs), now bounded by eviction (`prune_artifacts_keep_newest` + `retain_artifacts`),
reclaimed 169 MB -> 27 MB.

## Findings

### Ownership division with the concurrent `resource-hardening` campaign

A sibling `resource-hardening` campaign is in flight on the **crash-shaped** engine items
(exhaustion/leak axis). To avoid shared-worktree/index conflicts, this `performance-sweep`
takes the **speed/throughput/footprint** axis and the **frontend** (clean territory).
Crash-shaped engine items below are tagged OWNER: resource-hardening and are NOT executed
here, only recorded.

### Measured baselines

- Engine `scale_bench` (release): 500 docs index 675 ms, document-granularity query
  20 ms / serialize 7 ms / **1.71 MB** wire, 128× concurrent doc queries **969 ms**;
  2000 docs index 1004 ms, doc query 78 ms / 33 ms / **6.86 MB**, 128× concurrent doc
  **4478 ms** vs feature LOD 37 ms. The document path is ~100x the feature path under
  concurrency and is fully recomputed per request.
- Frontend bundle (`dist/`): main `index.js` **1,021,754 B / 289,753 B gzip** (App +
  React 19 + TanStack Query/Router + Pixi core). Pixi `Geometry`/`RenderTargetSystem`
  already split; `fa2.worker` 79.6 KB / 17 KB (correctly split). `sigma` and `@pixi/react`
  are declared deps with **zero imports / zero bundle bytes** (already tree-shaken). CSS
  51 KB / 9.5 KB.

### Engine avenues (speed/footprint — this campaign)

- **A1 (HIGH, clean) — memoize the document-slice projection per graph generation.**
  `engine-query/src/graph.rs` (`node_view`, the Document arm of `graph_query`): every
  document query re-runs `serde_json::to_value(node)` + `degree_by_tier` + ontology
  projections + status per node, then re-sorts and re-serializes the whole slice. Nothing
  is memoized on the immutable graph generation — only `meta_edges` got the cache (the
  unfinished half of graph-scale-hardening research F4). 128 concurrent doc queries =
  4.48 s at 2000 docs. A generation-keyed cache of the enriched views / serialized slice
  (mirroring the existing `AppState::meta_edges` / `salience_basis` caches) makes
  repeat/concurrent reads ~free. Risk MED (key on `generation`, invalidate on commit;
  filtered queries cache the unfiltered enriched views and filter cheaply on read).
- **A3 (MED) — compress / compact the declared-graph cache payload.** `registry.rs` stores
  the ~6 MB core-graph JSON as uncompressed TEXT; `DECLARED_GRAPH_KEEP=4` => ~24 MB
  resident. gzip/zstd as BLOB (or re-serialize compact) is a 5-15x size win, cutting disk
  + page-cache pressure. Touches `engine-store` — coordinate with resource-hardening.
- A4 (MED, defer) — `registry.rs` deep-clones the whole `LinkageGraph` per declared fold
  (correctness-load-bearing for D8.2 convergence; only worth it under commit-storm).
- A5 (LOW) — `project.rs` `meta_edges` returns an owned `.to_vec()`; share the `Arc`.
- F2/F6 deferred (graph-scale-hardening) — cursor pagination half-wired; no viewport/region
  filter, so the full 1.7-6.8 MB slice is served whole even under the node ceiling.

### Engine avenues (crash-shaped — OWNER: resource-hardening, recorded only)

- **B5b — bound `gix status` thread pool** (`ingest-git/src/worktrees.rs` `repo.status()`,
  `thread_limit: None` = one thread/core). The literal crash site (`Os 1455/1450` "paging
  file too small") on a contended machine; the dirty check only needs a boolean. gix 0.84
  has no status thread-limit setter; bound via a global rayon cap or limit the dirwalk.
  `is_dirty()` is NOT a drop-in (it excludes untracked, but the vault needs untracked docs
  to count dirty). Confirm `/map` isn't re-scanning per poll.
- **A2/B5 — SQLite pragmas + vacuum + retention** (`engine-store/src/lib.rs`): no
  `mmap_size`/`cache_size`; `auto_vacuum=NONE` so the file never shrinks on churn (the row
  caps free pages only logically); `evict_expired_semantic` is wired only in a test;
  `temporal_events` has no retention prune.
- B1 — subprocess `run_json` has no wall-clock timeout (`ingest-core/src/runner.rs`); a
  hung core/rag pins a blocking-pool thread.
- B2 — unbounded mpsc rebuild channel (`registry.rs`) coalesces nothing; a FS flood queues
  N sequential rebuilds, each calling the unguarded B1 subprocess.
- B9 — `commit_graph` re-projects both graphs per commit; watcher debounce O(N)
  `Vec::contains` dedup.

### Frontend avenues (this campaign)

- **F#2 (HIGH, low risk) — code-splitting.** `vite.config.ts` has no `manualChunks` and no
  `React.lazy`; the 1 MB main chunk eagerly loads Pixi core + scene even though the field
  is only needed once the graph view mounts. Lazy-load the Pixi+scene unit behind a
  Suspense boundary so the chrome paints first; add a vendor `manualChunks` split for cache
  hit rate. Caveat: the scene singleton is created at `Stage.tsx` module scope — lazy
  import defers that (desirable) but verify the one-scene-per-lifetime assumption.
- **F#1 (HIGH) — scene mount leak (still-open P-HIGH-8).** `scene` is a module singleton;
  the Stage mount effect calls `controller.mount(host)` but cleanup only does
  `observer.disconnect()` — never `controller.destroy()`/unmount. The full teardown exists
  (`FieldAssembly.destroy()`) but is never invoked; under StrictMode double-mount and any
  real remount, bindings/WebGL contexts/the worker accumulate. Add a reversible
  `field.unmount()` (detach without destroying the singleton, per ADR D2d).
- **F#4 (MED-HIGH) — Pixi ticker never idles.** `app.ticker` runs at 60fps presenting
  frames even on a fully static converged field (FA2 worker correctly stops; the ticker
  does not). Gate rendering on dirtiness (stop ticker / `app.render()` on demand; wake on
  input/camera/layout).
- **F#5 (MED) — `set-data` full layer rebuild.** The `apply-deltas` path is incremental,
  but every constellation refetch/keyframe and document-granularity change re-runs a full
  `set-data` (edge-mesh rebuild + sprite sync), partially undoing the no-refetch win for
  document-level churn.
- F#6 (LOW-MED) — ego fan-out (`useNodeNeighborsBulk`) is uncapped; a latent cliff on
  "expand many".
- F#3 (hygiene) — remove dead `sigma` / `@pixi/react` deps (zero bundle bytes, but bloat
  node_modules/wheel/audit); decide the sigma fallback-renderer fate first.
- Confirmed already-landed (do NOT re-plan): FA2 settle-and-stop, bounded stream
  accumulator (`STREAM_RETENTION=256`), debounced invalidation, gcTime/staleTime, SSE
  backoff, spliceLive feature-delta no-refetch, single shared EventSource, narrowed
  filter-store subscription.

### Execution priority (this campaign)

1. F#2 code-splitting (cold-load TTI; low risk, no conflict).
2. F#1 scene mount leak (correctness + leaked GPU contexts; no conflict).
3. F#4 Pixi ticker idle (always-on GPU draw; no conflict).
4. A1 engine doc-slice memoization (concurrent doc-query throughput; engine-query only,
   unclaimed by resource-hardening).
5. F#5 incremental `set-data`; A3 snapshot compression; F#3 dep hygiene (coordinate
   engine-store edits with resource-hardening).

Crash-shaped engine items (B5b, A2/B5, B1, B2, B9) are left to the `resource-hardening`
campaign; measurement uses `scale_bench` (engine) and `dist/` chunk sizes + a profiler
spike (frontend).
