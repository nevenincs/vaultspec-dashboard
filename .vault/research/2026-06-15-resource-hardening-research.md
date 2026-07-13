---
tags:
  - '#research'
  - '#resource-hardening'
date: '2026-06-15'
modified: '2026-07-12'
related:
  - '[[2026-06-13-dashboard-optimization-research]]'
  - '[[2026-06-13-dashboard-optimization-adr]]'
  - '[[2026-06-13-graph-scale-hardening-research]]'
  - '[[2026-06-13-engine-hardening-research]]'
  - '[[2026-06-12-vaultspec-engine-audit]]'
  - '[[2026-06-15-performance-sweep-research]]'
  - '[[2026-06-15-dashboard-node-graph-stability-adr]]'
---

# `resource-hardening` research: `resource exhaustion + memory-leak audit and hardened-backend campaign`

The dashboard was reported to critically exhaust machine memory, GPU VRAM, and
hard-drive space. This research verifies *why* — not from symptom guessing but
from the engine's own crash record, a measured on-disk footprint, and a
six-dimension code sweep (scene/GPU, stores/transport, app/React, engine Rust,
disk, security/consistency) that pins every claim to `file:line`. It grounds the
multi-week hardened-backend campaign. Discovery used vaultspec-rag semantic
search across the grid plus direct read/grep verification of every reported
defect; fixed-vs-still-live status is checked against the prior
`dashboard-optimization` and `graph-scale-hardening` cycles so the campaign does
not re-fix what already holds.

## The verification: the engine is already crash-looping on exhaustion

The engine's panic log (`.vault/data/engine-data/crash.log`) records the actual
failure mode — the machine ran out of memory and disk, repeatedly:

- `Os code 1455` — "The paging file is too small for this operation to
  complete." (raised from `gix` parallel git-status during scope indexing)
- `Os code 1450` — "Insufficient system resources exist to complete the
  requested service."
- `crates\vaultspec-api\src\app.rs:561` — "launch scope cell: indexing scope
  ...: store: sqlite: out of memory" — repeating across multiple timestamps.

This is not a subtle leak signature; it is hard resource starvation. The root
cause splits cleanly into two classes that had been conflated.

## Class A — dev-environment artifact sprawl (proximate cause; reclaimable)

Measured footprint at audit time: ~106 GB on disk against 45 GB free (90% full)
on the `Y:` volume — the condition that starves the OS paging file and triggers
the crashes above.

- **Agent worktree sprawl — ~28 GB.** Seven git worktrees under
  `.claude/worktrees/` each carried an independent full `engine/target` (4–7 GB)
  and a duplicated torch `.venv`, because Cargo assigns each workspace path its
  own target directory and there is no shared `CARGO_TARGET_DIR`. No worktree
  teardown policy exists.
- **HuggingFace model cache — 47 GB** at `~/.cache/huggingface/hub`. ~25 GB are
  models vaultspec-rag legitimately uses (jina-embeddings-v4, Qodo-Embed,
  jina-code-embeddings, bge-reranker-v2-m3, splade-v3, Qwen3-Embedding). ~24 GB
  belong to *other* tools sharing the same global cache (CLIP-ViT-H-14 15 GB,
  Qwen3-TTS 8.6 GB, Kokoro/whisper), because rag does not scope `HF_HOME` to the
  project — model downloads co-mingle and never evict.
- **Main `engine/target` — 28 GB** (debug 27 GB, of which a 12 GB incremental
  cache); no shrink policy.
- **SQLite cache `engine.sqlite3` — 182 MB** that never reclaims pages (see B6).

Immediate triage performed during this research: removed the six dead worktrees
(all verified clean — zero uncommitted files, zero unmerged commits), their
merged branches, the orphan worktree dir, and the 12 GB main incremental cache —
**freeing 39 GB (45 → 84 GB free)**, taking the engine out of the crash zone.
The ~24 GB of non-rag HuggingFace models remain (they belong to other tools;
deletion is the operator's call). The structural prevention — shared
`CARGO_TARGET_DIR`, worktree teardown, project-scoped `HF_HOME`, a `just dev
clean` recipe — is campaign work, not triage.

## Class B — genuine in-app leaks and unbounded growth (the hardening work)

All findings below were verified by reading the code and its cleanup path, not
by pattern-match alone. Severity is leak/exhaustion impact, not aesthetics.

### B1 (HIGH, engine) — subprocess `run_json` has no wall-clock timeout

`ingest-core/src/runner.rs` `run_json` reads core/rag subprocess stdout under an
8 MiB ceiling but has NO wall-clock timeout — the in-code comment confirms it was
deferred. It is called on the serve path via `spawn_blocking` from
`vaultspec-api/src/registry.rs` (declared fold and structural index). A hung
`vaultspec-core` subprocess (locked venv, stalled import) pins a Tokio
blocking-pool thread indefinitely. Combined with B2 this saturates the blocking
pool and hangs the whole service. Fix: wrap the async call sites in
`tokio::time::timeout` (the `/ops` proxy path already enforces both cap and
timeout — apply the same here).

### B2 (HIGH, engine) — unbounded mpsc rebuild channel coalesces nothing

`vaultspec-api/src/registry.rs` creates `mpsc::unbounded_channel` for watcher
dirty-batches; the rebuild loop processes one batch at a time with no
drain/coalesce step. A filesystem flood (large `git checkout`, bulk copy) past
the debounce queues N sequential rebuilds behind one in-flight rebuild, each
calling the unguarded B1 subprocess. Fix: bounded `channel(1)` with non-blocking
`try_send` that drops when a rebuild is already pending (the in-flight rebuild
re-folds on completion anyway).

### B3 (HIGH, frontend) — `openedIds` is uncapped → permanent query + payload retention

`stores/view/viewStore.ts` `openNode` appends to `openedIds` with no eviction
(unlike the sibling `WORKING_SET_CAP = 24` and `PINNED_DISCOVERIES_CAP = 50`).
Each opened island mounts and holds live `useNodeDetail(id)` +
`useNodeNeighbors(id)` query observers, so TanStack GC never fires and the full
`NodeDetail`/neighbor payloads stay cached for the whole session. Fix: an
`OPENED_IDS_CAP` with LRU eviction mirroring the working-set pattern.

### B4 (HIGH, frontend/GPU) — scene singleton mount-leak still live (prior P-HIGH-8)

`app/stage/Stage.tsx` mounts the module-singleton scene
(`scene.controller.mount(host)`) but the effect cleanup only calls
`observer.disconnect()` — there is no `controller.unmount()`/`destroy()`. Every
remount (StrictMode, error-boundary swap, HMR) re-registers pointer/ticker/canvas
bindings inside the live PixiJS Application that are never detached; they
accumulate, holding GPU and JS state. This is prior research P-HIGH-8, never
fixed. Fix: a reversible `field.unmount()` that runs the detach list without
destroying the Application, called from the mount-effect cleanup.

### B5 (MED, engine/disk) — SQLite never VACUUMs; `temporal_events` grows unbounded; pages never reclaim

Partially addressed in flight: commit `08b1bc2`
("bound the derived-artifacts cache to stop a 169MB leak") landed a row cap on
`derived_artifacts` (`prune_artifacts_keep_newest`), so that table no longer
grows without bound. **The remainder still holds:** `engine-store/src/lib.rs`
opens the DB with `journal_mode=WAL` but sets no `auto_vacuum`, and no
`VACUUM`/`incremental_vacuum`/`wal_checkpoint(TRUNCATE)` call exists in source —
so the row-cap `DELETE` frees pages only logically and the 182 MB file never
shrinks. `temporal_events` (`events.rs`) is still append-only with no retention
prune. `evict_expired_semantic` exists but is only ever called from tests, never
the serve/index path. The unshrinkable file plus an exhausted machine is the
direct origin of the `sqlite: out of memory` panic. Fix:
`auto_vacuum=INCREMENTAL` + post-prune `incremental_vacuum` + WAL truncate;
time-window retention on `temporal_events`; wire `evict_expired_semantic` into
the rebuild path.

### B5b (HIGH, engine) — unbounded `gix`/rayon parallelism during scope index is the literal crash site

The crash log's primary panics fire inside `gix-features` `in_parallel` and
`gix-status` during scope indexing (`Os 1455`/`1450`), and one reads "The global
thread pool has not been initialized" from `rayon-core` after the allocation
failed. `gix` status/diff runs a rayon parallel walk whose thread count and
per-thread buffers scale with available parallelism, not with a budget — on a
large worktree under memory pressure this is the peak-allocation spike that tips
the machine over. Fix: bound the `gix` parallelism (explicit thread cap / a
sized rayon pool, or `gix`'s single-threaded status path under a threshold) so
peak indexing memory is bounded regardless of core count. This is the engine
fix that most directly stops the observed crash, complementary to the Class-A
disk reclaim. (Overlaps the `performance-sweep` "gix thread bound" avenue.)

### B6 (MED, frontend/GPU) — GPU churn on hover and per layout tick

`scene/field/edgeMeshes.ts` `setHighlight()` calls a full `rebuild()` on every
hover-node change, destroying and recreating all `Mesh`/`MeshGeometry` across
every edge group (GPU buffer dealloc + re-upload per hover).
`scene/field/overlayLayer.ts` creates fresh `Text` objects every layout position
frame during FA2 convergence (text-atlas uploads at the GPU's busiest moment).
`scene/field/domainGlyphs.ts` `markGraphics()` leaks a `GraphicsContext` per
unique node kind (PixiJS v8 `Graphics.destroy()` without `true` does not free the
context). Fixes: alpha/tint modulation instead of geometry rebuild on highlight;
id-keyed Text caching updated in place; explicit `context.destroy()`.

### B7 (MED, frontend) — stream cache-key explosion + uncapped search/text-filter cost

`stores/server/queries.ts`: each advancing `last_seq` mints a new
`["engine","stream","graph",<seq>,<scope>]` cache entry; the superseded entry
(holding a 256-entry `StreamChunk[]` ring) lingers until the 120 s gcTime, so
active repos accumulate one orphan per delta. The search cache accumulates one
entry per unique settled query with no per-query gcTime. The canvas text-match
filter (`app/stage/FilterBar.tsx`) writes to the store on every keystroke,
recomputing `computeVisibility` over the full slice per character (CPU, not a
leak). Fixes: explicit removal of the prior stream key on keyframe advance;
shorter gcTime on search; debounce the text filter.

### B8 (MED, frontend/React) — per-frame global listener re-registration in the timeline

`app/timeline/Playhead.tsx` and `app/timeline/RangeSelect.tsx` re-register
`globalThis` `pointermove`/`pointerup` on every scroll/zoom because `pxPerMs` and
`scrollOffset` are in the effect deps — during scrubbing/range-play this is
~120 add/remove calls per frame, with a stale-event window mid-drag. The
`useRangePlayer` module-level `playState` is not nulled on unmount, so a stale
range can replay on remount. `app/menu/ContextMenuHost.tsx` makes 7 separate
store subscriptions where one `useShallow` selector suffices. Fixes: read the
volatile values imperatively via `getState()` and use empty deps; null
`playState` in cleanup; consolidate the subscriptions.

### B9 (LOW, engine) — task/loop hygiene

`vaultspec-api/src/registry.rs` watcher debounce uses O(N) `Vec::contains` dedup
(quadratic under a path flood; use a `HashSet`). `vaultspec-api/src/lib.rs`
spawns a 15 s heartbeat loop with no `JoinHandle`/abort, holding `Arc<AppState>`
alive across dropped test states. `commit_graph` re-projects both old and new
graphs (uncached `meta_edges`) per commit (prior research F4) — use the cached
projection.

### B10 (security — posture is sound; small surface)

The engine security posture verified **holding** (the prior `vaultspec-engine`
audit ADD-910 adversary battery): loopback-only bind, Host-header allowlist,
constant-time bearer compare, 1 MiB body cap wired inner to the tiers envelope,
all subprocess calls argv-array (never shell), poison recovery on every
`Mutex`/`RwLock`, subscribe-first SSE splice. The only findings: **MEDIUM** —
the bearer token is a non-cryptographic FNV hash of pid + wall-clock time
(`vaultspec-api/src/app.rs`), brute-forceable by a co-resident process and
written cleartext to `service.json`; fix with `getrandom`. **LOW** — token
interpolated into SPA HTML without attribute-escaping (safe today, latent on
token-format change); rag `search` `body.target` forwarded without
`{vault,code}` vocabulary validation (argv, so not injectable, but inconsistent
with the ops whitelist discipline). No command injection, no reachable
panic-from-input, no frontend XSS sink, no secret logging found.

## What is already fixed (do not re-fix)

Verified holding from prior cycles: the FA2 layout worker now converges and
stops (a `ConvergenceDetector` landed — prior P-HIGH-7 "always-on CPU" is
**fixed**); the streamed-query accumulator is ring-capped at 256 (P-HIGH-6); the
constellation and `/status` invalidations are trailing-edge debounced
(P-HIGH-1/2); global `gcTime` is set; SSE reconnect uses exponential backoff;
the Stage subscribes the filter store via a shallow selector; working-set fan-out
is capped; all engine memory-consistency hardening (poison recovery,
subscribe-first splice, bounded/timed `/ops` subprocess, SSE resume key)
verified present.

## Overlap with in-flight efforts (must coordinate before the ADR)

Three efforts now touch this turf and must not collide:

- **`performance-sweep`** (active today; commit `08b1bc2` landed; research a
  stub) is the *throughput/latency* axis — its named avenues (snapshot size, gix
  thread bound, sqlite tuning, FE bundle/render) overlap B1/B5/B5b/B6/B7. It has
  already bounded `derived_artifacts`.
- **`node-graph-stability`** (ADR `e70174f` just accepted d3-force + render-loop
  hardening) rewrites the scene layout/render loop — directly adjacent to B4
  (scene unmount) and B6 (GPU churn).

Recommended division: this `resource-hardening` campaign owns the *exhaustion,
leak, retention, and security/consistency* axis (B1–B5, B5b, B7–B10), absorbing
the gix/sqlite exhaustion items because they are crash-shaped, not
speed-shaped; `performance-sweep` keeps pure latency/throughput/bundle work; the
scene fixes B4/B6 are sequenced *with* the d3-force rewrite (whoever lands the
render-loop change owns the matching teardown/churn fix) rather than in
parallel against it. The ADR records this split so the three campaigns share
files without double-fixing.

## Proposed campaign shape (for the ADR)

A multi-week, waved hardened-backend campaign, reproduce-then-fix with an
adverse/leak-test foundation (the `dashboard-optimization` cadence), respecting
layer ownership (engine fixes in `engine/`, memory fixes in `stores/`, frame
fixes in `scene/`):

- **W0 Triage + measurement floor** — (partly done) finish disk reclaim; stand up
  the leak/growth harness: a heap-growth assertion over a long synthetic session,
  an engine RSS/handle/blocking-thread watch under FS-flood + subprocess-hang
  injection, and a VRAM/scene-binding-count probe across remount cycles. Every B-fix
  lands behind a test that fails first.
- **W1 Engine resource safety** — B1 (subprocess timeout), B2 (bounded channel),
  B5 (SQLite vacuum/retention), B9 (task hygiene).
- **W2 Frontend memory + GPU** — B3 (openedIds cap), B4 (scene unmount), B6 (GPU
  churn), B7 (cache hygiene), B8 (React listener/loop hygiene).
- **W3 Security tighten** — B10 (getrandom token, HTML escape, target whitelist).
- **W4 Class-A structural prevention + codify** — shared `CARGO_TARGET_DIR`,
  worktree teardown policy, project-scoped `HF_HOME`, `just dev clean`; promote
  the durable lessons (bounded-by-default for every cache/channel/list; subprocess
  calls carry cap AND timeout; dev artifacts are scoped and reclaimable) to rules.

Sequencing rationale: W1 stops the active crash mechanism (the OOM/hang path);
W2 removes the session-long heap/VRAM growth the user feels; W3/W4 harden and
prevent recurrence. W1 and W2 are independent (different layers) and may run in
parallel once W0's harness lands.
