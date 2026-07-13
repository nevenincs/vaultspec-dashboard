---
tags:
  - '#adr'
  - '#resource-hardening'
date: '2026-06-15'
modified: '2026-07-12'
related:
  - "[[2026-06-15-resource-hardening-research]]"
  - "[[2026-06-15-performance-sweep-research]]"
  - "[[2026-06-13-dashboard-optimization-adr]]"
  - "[[2026-06-13-graph-scale-hardening-adr]]"
  - "[[2026-06-13-engine-hardening-research]]"
  - "[[2026-06-12-vaultspec-engine-audit]]"
  - "[[2026-06-15-dashboard-node-graph-stability-adr]]"
---

# `resource-hardening` adr: `engine resource-safety + security hardening (performance-sweep wave)` | (**status:** `accepted`)

## Problem Statement

The dashboard critically exhausted machine memory, GPU VRAM, and disk on a
top-tier host. The companion research verified the cause from the engine's own
`crash.log` (repeating `Os 1455` "paging file too small" inside `gix` parallel
git-status, and `sqlite: out of memory` at `app.rs:561`) and a measured ~106 GB
on-disk footprint against 45 GB free. The cause split into two classes:
dev-environment artifact sprawl (the proximate crash trigger, already triaged —
39 GB reclaimed) and genuine in-app unbounded growth. This ADR decides the
**engine resource-safety + security wave** of that work. It is one coordinated
campaign with the concurrent `performance-sweep` effort, not a competing one: by
the division recorded in the `performance-sweep` research, that effort owns the
frontend (code-splitting, the scene mount-leak, ticker idling) and engine-speed
(projection memoization, snapshot compression) avenues; this ADR owns the
crash-shaped engine items and the security surface that effort explicitly left
unclaimed, plus the structural prevention of the Class-A sprawl. Scene/GPU leak
work is deliberately excluded — it is sequenced with the `dashboard-node-graph-stability`
d3-force render-loop rewrite to avoid double-editing the scene layer.

## Considerations

- **The fixes are bounding, not rewriting.** Every item is "make an unbounded
  thing bounded" — a timeout, a channel cap, a thread-pool cap, a retention
  policy, a VACUUM. None changes observable behavior except resource ceiling and
  latency, consistent with the `dashboard-optimization` cadence.
- **Reproduce before fix.** The campaign has zero leak/exhaustion tests today, so
  the wave leads with a measurement floor: an adverse harness that drives each
  failure (subprocess hang, FS-event flood, long session, repeated indexing) and
  asserts a bounded resource ceiling, failing before each fix lands.
- **Layer ownership.** All engine fixes stay in `engine/`; the security fixes
  stay in `vaultspec-api`; no fix crosses into `stores/` or `scene/` (those are
  the concurrent efforts' territory). Commits are by pathspec because the main
  worktree is shared with a live session.
- **`gix` 0.84 has no status thread-limit setter** (research B5b): the bound must
  come from a global rayon pool cap or by limiting the dirwalk, and `is_dirty()`
  is not a drop-in because the vault needs untracked docs to count as dirty.
- **Engine security posture is already sound** (the `vaultspec-engine` audit
  ADD-910 adversary battery holds): loopback bind, Host allowlist, constant-time
  bearer compare, 1 MiB body cap, argv-not-shell subprocess calls, poison
  recovery, subscribe-first SSE splice. The wave only closes the small residual
  surface, it does not re-architect auth.

## Constraints

- No new heavy runtime dependency for the engine fixes; `tokio::time::timeout`,
  bounded `mpsc`, and `getrandom` (already a transitive dependency) suffice.
- `published-wheel-purity` holds: nothing here promotes rag/torch into runtime
  deps.
- SQLite `auto_vacuum` mode can only be set before schema creation on a fresh DB
  or via a one-time full `VACUUM` to rebuild — the retention work must account
  for migrating existing `engine.sqlite3` files, and the cache is re-derivable
  (ADR D8.2) so a rebuild path is acceptable.
- The bounded rebuild channel must preserve trailing-edge correctness: dropping a
  notification while a rebuild is in flight is safe only because the in-flight
  rebuild re-folds on completion — this invariant must be asserted by a test.
- Coordinate `engine-store` edits (B5) with the `performance-sweep` A3 snapshot
  compression, which also touches that crate.

## Implementation

A waved, reproduce-then-fix sequence:

- **Measurement floor.** Stand up a leak/exhaustion harness: an engine-side
  adverse test that injects a hung subprocess and asserts the blocking pool does
  not saturate (bounded by the new timeout); an FS-event-flood test asserting at
  most one queued rebuild; a repeated cold-index test asserting bounded peak RSS
  and bounded `engine.sqlite3` size after churn + retention. These fail first.
- **Engine resource safety.** Bound `gix`/rayon parallelism so peak indexing
  memory is independent of core count (B5b — the crash site). Wrap the
  `spawn_blocking` subprocess call sites in `tokio::time::timeout` (B1). Replace
  the unbounded watcher channel with a capacity-1 bounded channel that coalesces
  by dropping when a rebuild is pending (B2). Give the SQLite store
  `auto_vacuum=INCREMENTAL` plus a post-prune `reclaim()` — a full `VACUUM`
  followed by `wal_checkpoint(TRUNCATE)`; `incremental_vacuum` was tried first
  but proved unreliable at returning a populated freelist under WAL, so the
  shipped reclaim is a full VACUUM (cheap, since the stores are retention-bounded
  and reclaim runs only on HEAD-change folds) — plus a time-window retention
  prune on `temporal_events` and wiring `evict_expired_semantic` into the rebuild
  path (B5). Task hygiene: bound the watcher dedup with a `HashSet`, give the
  heartbeat loop an abort-on-drop guard (B9). The `commit_graph` projection (B9c)
  needs NO change: its `meta_edges` projection already resolves through the
  `LinkageGraph` `OnceLock` cache (`meta_edges()` → `meta_edges_cached()`), so the
  expensive aggregation is memoized per graph instance, not recomputed per commit.
- **Security tighten.** Replace the FNV-of-pid+time bearer token with a
  `getrandom` 128-bit token; attribute-escape (or single-quote) the token in the
  SPA HTML injection; validate the rag `search` target against the `{vault,code}`
  vocabulary (B10).
- **Class-A structural prevention + codify.** A shared `CARGO_TARGET_DIR` so
  worktree builds stop re-sprawling; a worktree teardown policy; project-scoped
  `HF_HOME` so rag model downloads stop co-mingling with other tools' global
  cache; a `just dev clean` reclamation recipe. Promote the durable lessons to
  rules.

## Rationale

The research grounds every decision in verified `file:line` evidence and the
crash log. Bounding `gix`/rayon and the subprocess timeout are chosen first
because they are the literal crash mechanism. The bounded channel and SQLite
retention remove the session-long and commit-history-long growth. The security
fixes are one-to-two-line closes of a residual surface the prior audit already
flagged as low-rider. The Class-A prevention closes the loop so the proximate
cause cannot silently recur — the campaign's whole point is a backend that stays
bounded without vigilance.

## Consequences

- The engine becomes robust under subprocess hangs, FS-event floods, large
  worktrees, and long-running sessions — the failure modes that were crashing it.
- `engine.sqlite3` stops growing with commit history and reclaims pages.
- A one-time DB rebuild may be needed to enable `auto_vacuum` on existing caches
  (acceptable: the cache is re-derivable).
- Bounding `gix` parallelism trades a little cold-index wall-clock on
  high-core machines for a bounded memory ceiling — the right trade for stability.
- Shared `CARGO_TARGET_DIR` changes where builds land; CI and any tooling that
  assumes per-worktree targets must be checked.
- The leak/exhaustion harness becomes a permanent regression net the campaign and
  future work inherit.

## Codification candidates

- **Rule slug:** `bounded-by-default-for-every-accumulator`.
  **Rule:** every cache, channel, queue, retained list, and background loop in
  the engine and stores must carry an explicit bound (size cap, TTL/retention,
  or capacity) at creation; an unbounded accumulator is a defect, not a default.
- **Rule slug:** `subprocess-calls-carry-cap-and-timeout`.
  **Rule:** every external process the engine spawns must enforce both an output
  byte cap AND a wall-clock timeout at the call site.
- **Rule slug:** `dev-artifacts-are-scoped-and-reclaimable`.
  **Rule:** dev-environment artifact stores (cargo target, model caches, git
  worktrees) must be project-scoped or shared-deduplicated and have a documented
  reclamation path, never an unbounded per-worktree global sprawl.
