---
tags:
  - '#adr'
  - '#worktree-parse-performance'
date: '2026-06-14'
modified: '2026-07-12'
related:
  - '[[2026-06-14-user-state-persistence-audit]]'
  - '[[2026-06-13-graph-scale-hardening-adr]]'
  - '[[2026-06-13-graph-scale-hardening-research]]'
  - '[[2026-06-12-vaultspec-engine-adr]]'
---

# `worktree-parse-performance` adr: `decouple the declared tier and parallelize structural parse for sub-5s per worktree` | (**status:** `accepted`)

## Problem Statement

A live verification campaign (`2026-06-14-user-state-persistence-audit`) found that switching
the active worktree could block the user for over ten seconds while the new scope's graph was
parsed. Profiling the cold parse of a real 613-document worktree (the `vaultspec-rag` corpus,
with the extraction cache warm) located the cost precisely, via the new env-gated
`VAULTSPEC_INDEX_TIMING` instrumentation:

- read + extract (parallel, content-hash cached): ~0.02 s - negligible.
- resolver inventory build (one tree walk): ~0.02 s - negligible (the scale-hardening D1 fix
  holds).
- structural resolve + edge ingest loop: **~4.4 s** - single-threaded.
- declared-tier core subprocess (`vaultspec-core vault graph --ref HEAD`): **~16 s** - an
  external Python process on the critical path.

The mandate is a sub-five-second parse per worktree. The declared subprocess alone exceeds it,
and the structural loop is already borderline and grows with corpus size. This ADR records the
architecture to fix both.

## Considerations

- **The declared tier is a slow external dependency on the synchronous critical path.** The
  parse calls `vaultspec-core vault graph --ref HEAD` (the only read-and-infer-safe mode; the
  working-tree mode is forbidden because it mutates the vault) and blocks the whole parse - and
  the HTTP `PUT /session` response - on it. Core's `--ref HEAD` reads the git object DB
  per-document in Python (~16 s here; ~4 s in the mutating working-tree mode, for reference).
  The engine cannot make core faster (sibling boundary, `engine-read-and-infer`), but it
  controls **when** and **whether** it calls it.
- **The declared graph at a commit is immutable**, so its result is cacheable by `(scope, HEAD
  sha)` - a rebuild at the same commit need never re-run the subprocess.
- **The structural loop is single-threaded by an implementation accident, not a requirement.**
  Only read+extract was parallelized; the resolve+edge loop runs sequentially because the
  `Resolver` uses `RefCell` caches/memos (not `Sync`). The dominant structural cost is
  `resolve_symbol` / `resolve_step_id`, which scan code/plan file contents (`text.contains`)
  for each distinct symbol/step; resolution is a pure function of the symbol and the fixed
  tree, so it is embarrassingly parallel.
- **The degradation contract already expresses a not-yet-available tier truthfully.** The
  per-tier `tiers` block lets the engine serve a graph with `declared` reported unavailable,
  then flip it to available - exactly the shape an async-folded declared tier needs, with no
  new client contract.

## Constraints

- **Read-and-infer is inviolate.** The declared read stays `--ref HEAD` (never the
  vault-mutating working-tree mode); the engine never writes `.vault/` documents. The
  HEAD-sha cache lives in the re-derivable engine-store cache, deletable and rebuildable.
- **Graph correctness must not regress.** The async-folded declared graph must converge to the
  exact same final graph as the current synchronous parse (D8.2 re-derivability); the parallel
  structural resolution must assign identical resolution states to the sequential version
  (the memo-consistency invariant the resolver already tests).
- **The single delta clock and per-scope SSE resume must stay correct** when the declared fold
  emits a second batch of deltas after the structural keyframe - it rides the same monotonic
  per-scope clock and ring (the constellation-live-delta discipline).
- **Inference stays CPU-bound** (`graph-compute-is-cpu-gpu-is-render-and-search`): the
  structural speed-up is rayon parallelism over CPU cores, not a GPU or an architectural move.

## Implementation

**Decision 1 - decouple the declared tier from the servable parse (the dominant win).** The
parse splits into a fast servable phase and a deferred declared phase. `index_worktree`
(structural only) builds and the cell commits it immediately, so the worktree is interactive in
roughly the structural-parse time. The declared tier is then ingested by a background task: it
consults a `(scope, HEAD sha)`-keyed cache in engine-store and, on a miss, runs the
`vaultspec-core vault graph --ref HEAD` subprocess, parses it, writes the cache, and folds the
declared edges into the live graph via a second `commit_graph` that emits declared deltas on
the same per-scope clock. The `tiers` block reports `declared` as unavailable-while-building
until the fold lands, then available - truthful degrade-then-upgrade. A rebuild at an unchanged
HEAD is a cache hit and skips the subprocess entirely.

**Decision 2 - parallelize structural resolution.** The `Resolver` becomes thread-safe: the
file-content cache and the symbol/step memos move from `RefCell` to a concurrency-safe form
(pre-read the bounded code/plan content once into a shared immutable map, or a sharded
concurrent map), and the distinct symbols and step-ids are resolved with a rayon fan-out rather
than lazily-sequentially. The per-document resolve is then a memo lookup; edge ingestion into
the graph stays serial (it mutates the graph) but is cheap. Target: the ~4.4 s structural phase
drops to ~1-2 s for 613 documents and scales with cores, holding the sub-five-second budget as
corpora grow.

**Net effect.** The user-perceived switch cost becomes the structural parse alone (target
~1-2 s, comfortably sub-five-second), the declared tier arrives shortly after without ever
blocking, and any re-warm or restart at the same commit is near-instant via the declared cache
plus the existing extraction cache. If the structural phase ever approaches the budget for an
extreme corpus, the same async-commit machinery makes a fully non-blocking activation (serve a
"building" state, stream the keyframe in) a small follow-on, not a rewrite.

## Rationale

The profile is unambiguous: ~16 s of the cost is an external subprocess and ~4.4 s is
single-threaded work that is provably parallelizable. Decision 1 attacks the larger cost
architecturally - a slow, uncontrollable external dependency has no business gating an
interactive parse, and the degradation contract already models "this tier isn't ready yet," so
deferring it is honest rather than a lie-by-omission. Caching by HEAD sha exploits the
immutability of a committed graph for free repeat-switch speed. Decision 2 removes a sequential
bottleneck that the scale-hardening cycle had not yet reached (it fixed the O(N^2) resolver
*build*, D1, but left the resolve *loop* sequential). Together they convert a >20 s worst case
into a sub-five-second servable parse with the declared tier following asynchronously, meeting
the mandate with margin.

## Consequences

- **Gain:** worktree switching becomes interactive (target ~1-2 s servable), the declared tier
  never blocks, and repeat switches / restarts at the same commit are near-instant.
- **Gain:** the env-gated phase timing (`VAULTSPEC_INDEX_TIMING`) is now a permanent ops lever
  for catching future parse regressions.
- **Difficulty:** the declared fold introduces a second asynchronous commit per build; it must
  ride the per-scope monotonic clock and converge to the identical final graph, and its task
  must not leak or outlive an evicted scope cell (the same `Weak`-handle discipline the registry
  watcher already uses).
- **Pitfall:** a window now exists where a freshly switched scope serves a graph with the
  declared tier absent; clients must render that as the designed degraded state (the tiers block
  already carries the truth), never as an error.
- **Pitfall:** the thread-safe resolver must preserve exact resolution-state parity with the
  sequential version; a divergence would silently change edge states. The existing
  memo-consistency test is the guard and must be extended to the parallel path.

## Codification candidates

- **Source:** the declared-tier-on-the-critical-path finding.
  **Rule slug:** `external-subprocess-off-the-parse-critical-path`.
  **Rule:** No external sibling subprocess (e.g. `vaultspec-core`) may sit synchronously on the
  servable-parse critical path; a slow external tier is ingested asynchronously and folded in via
  deltas, reported as a degraded-then-upgraded tier, never blocking the interactive graph.
  *(Promote only after it holds across one full execution cycle, per the codify discipline.)*
