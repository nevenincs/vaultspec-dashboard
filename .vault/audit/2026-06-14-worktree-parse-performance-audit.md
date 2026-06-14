---
tags:
  - '#audit'
  - '#worktree-parse-performance'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - '[[2026-06-14-worktree-parse-performance-adr]]'
  - '[[2026-06-14-user-state-persistence-audit]]'
---



# `worktree-parse-performance` audit: `live before/after verification of sub-5s parse`

## Scope

Verification that the `2026-06-14-worktree-parse-performance-adr` architecture meets the
mandate of a sub-five-second parse per worktree, measured live against the same real
production corpus that exposed the problem (the 613-document `vaultspec-rag` git-worktree
workspace) plus the dashboard's own vault. Both ADR decisions - deferring the declared tier
off the critical path and parallelizing structural resolution - were implemented, reviewed,
and measured end to end with the live engine.

## Findings

### Before (profiled baseline, 613-document worktree, warm extraction cache)

Per-phase wall-clock from the new `VAULTSPEC_INDEX_TIMING` instrumentation: read+extract
~0.02 s, resolver build ~0.04 s, **structural resolve loop ~4.4 s** (single-threaded), and
the **declared-tier core subprocess ~16 s** on the synchronous critical path. Total parse
~20 s; the live cold worktree switch exceeded a 10 s client timeout (the original complaint).

### After (same corpus, live engine)

- **PASS - servable parse is well under five seconds.** The structural servable commit is
  **~0.56 s** for the 613-document worktree and **~0.21 s** for the 331-document dashboard
  vault - roughly an 8x speed-up of the structural phase (4.4 s -> 0.56 s) from parallelizing
  resolution across cores.
- **PASS - the cold worktree switch that took over ten seconds now takes under one.** A live
  `PUT /session` switching the active scope to a cold 613-document worktree returned in
  **~0.83 s**; a warm-cell switch is **~0.04 s**.
- **PASS - the declared tier is off the critical path and folds in asynchronously.**
  Immediately after a switch the graph serves with `declared` reported unavailable with reason
  "declared tier building"; the async fold then flips it to available (observed within ~3 s on
  a warm HEAD-sha cache). The 16 s subprocess never blocks the interactive parse.
- **PASS - the declared result is cached by HEAD sha.** A repeat switch to a worktree whose
  declared graph is already cached at the current HEAD skips the subprocess entirely.
- **PASS - correctness preserved under review.** The structural parallelization assigns
  byte-identical resolution states to the sequential resolver (parity test); the async
  declared fold converges to the same graph as the synchronous full parse (D8.2); the full
  engine suite (ingest-struct, engine-graph, engine-store, vaultspec-api, engine-e2e,
  vaultspec-session) is green, with `cargo fmt --check` and `cargo clippy --workspace` clean.
- **PASS - the watcher no longer self-triggers on its own cache writes.** Excluding
  `.vault/data/` and `.vault/logs/` from the recursive watch removed the rebuild churn the
  engine's own cache writes caused; the serve log now shows exactly one structural parse per
  real change.
- **PASS - data protection held.** All measurement was read-only against tracked data; the
  engine wrote only to the gitignored `.vault/data/` zone, and every change committed this
  campaign was engine-only (`engine/crates/*`). The two modified frontend files in the working
  tree belong to a concurrent, unrelated UI workstream and were not touched.

### Defects found and fixed during review (not shipped)

- **HIGH (fixed) - declared-fold trailing-edge race.** The first implementation could leave the
  declared tier reporting available while serving a superseded commit's edges if a rebuild
  raced an in-flight fold and was the last change. Closed with a `declared_fold_pending`
  re-spawn on the fold's completion guard, guaranteeing a fold always eventually runs at the
  current HEAD. Covered by a direct interleaving test.
- **MEDIUM (fixed, landed jointly) - watcher self-trigger.** The recursive watch over `.vault/`
  included the engine's own cache directory, so cache writes retriggered rebuilds; this also
  masked the trailing-edge race. Fixed with a path filter excluding engine-owned zones.

## Recommendations

- Accept the parse-performance architecture as meeting the mandate: the servable parse is
  ~0.5 s for a 613-document worktree, the cold switch is sub-second, and the declared tier
  arrives asynchronously without ever blocking.
- Keep `VAULTSPEC_INDEX_TIMING` as the standing regression lever; a future parse regression is
  one env var away from a per-phase breakdown.
- If a worktree ever approaches the budget on the structural phase alone (far larger than any
  observed corpus), the async-commit machinery already in place makes a fully non-blocking
  activation (serve a building state, stream the keyframe) a small follow-on rather than a
  rewrite.

## Codification candidates


This audit corroborates the one candidate the ADR already named -
`external-subprocess-off-the-parse-critical-path` (no external sibling subprocess may sit
synchronously on the servable-parse critical path; a slow external tier is ingested
asynchronously and folded in via deltas as a degraded-then-upgraded tier) - now demonstrated
live: the engine serves a worktree in ~0.5 s with the declared tier folding in afterward. The
candidate stays deferred for promotion until it holds across one full execution cycle, per the
codify discipline. No new codification candidates: the structural parallelization and the
race/watcher fixes are sound engineering within existing rules, not new cross-session
constraints.
