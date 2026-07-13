---
tags:
  - '#adr'
  - '#status-worktree-latency'
date: '2026-06-16'
modified: '2026-07-12'
related:
  - '[[2026-06-16-status-worktree-latency-research]]'
---
# `status-worktree-latency` adr: `parallelize worktree enumeration and target the served worktree` | (**status:** `accepted`)

## Problem Statement

`/status` latency scales with the number of git worktrees in the workspace
(~45ms on one worktree, ~5s on a dozen-plus), because the handler enumerates and
fully inspects every worktree serially and then keeps only the one matching the
served scope. The research (`2026-06-16-status-worktree-latency-research`) traced
the cost to `worktrees::enumerate` running a status diff plus two full-history
`rev_walk`s per worktree, in series, for callers that need just one.

## Considerations

- Two consumer shapes exist (research F3): genuine all-worktree list consumers
  (`/map`, registry routes, CLI `map`) and enumerate-then-find-one consumers
  (`/status`, CLI `status`). The two want different fixes.
- The dominant per-worktree cost is `ahead_behind` (two reachability walks) and
  the index-vs-worktree status diff. The status diff is already thread-bounded
  by B5b (`VAULTSPEC_GIT_STATUS_THREADS`, default 2).
- The engine is CPU-bound graph/git compute (`graph-compute-is-cpu-gpu-is-render-and-search`):
  a concurrency fix is a CPU fan-out, not a new backend.
- Any added parallelism stacks on the existing per-status thread bound, so the
  combined fan-out (worktrees × status-diff threads) must stay bounded
  (`bounded-by-default-for-every-accumulator`).

## Constraints

- No new heavy dependency: parallelism uses a bounded scoped-thread fan-out (or
  `rayon` if already in the workspace) — not a per-worktree unbounded spawn.
- `gix::Repository` handles are not `Sync` across the fan-out in a way that lets
  one shared repo be inspected from many threads; each worktree inspection opens
  its own repo handle (already the case in `enumerate`), so the parallel unit is
  the per-worktree `inspect`, each owning its handle.
- Behavior must be identical: same `WorktreeInfo` set, same ordering guarantees
  the callers rely on (callers that care already sort), same graceful-None error
  handling per worktree.

## Implementation

Two complementary changes in `engine/crates/ingest-git/src/worktrees.rs`:

1. **Targeted single-worktree inspect.** Add a public `inspect_one(workspace,
   path)` that opens the workspace, resolves only the worktree whose root matches
   `path`, and returns its `WorktreeInfo` (or `None`). `/status`
   (`routes/stream.rs`) and CLI `status` (`cmd/status.rs`) switch from
   `enumerate().find(...)` to this O(1) path — they stop paying for the other
   worktrees entirely.

2. **Parallel enumerate.** Collect the worktree (path, is_main) descriptors
   first (cheap — a `worktrees()` listing), then run the expensive `inspect()`
   across them with a bounded concurrent fan-out, preserving the per-status
   thread bound. The all-worktree consumers (`/map`, registry, CLI `map`) get an
   N-way wall-clock reduction with no API change.

The list-collection (cheap) and inspection (expensive) phases are separated so
the fan-out covers only the expensive work. No wire-shape change; this is an
internal compute optimization behind a stable `WorktreeInfo` contract.

### Follow-up: path-only callers take an even cheaper list (sweep, 2026-06-16)

A second class of callers neither needs `WorktreeInfo` nor a single worktree:
they only resolve or match a worktree *path* (and sometimes check a `.vault`
exists or that the set is non-empty). These — `validate_scope_token` (the cold
`get_or_build` path, run on first touch / scope switch), the CLI `Ctx::resolve`
(per invocation), the registry register route (emptiness check), and the
serve-boot launch-root resolver — were calling `enumerate`, paying the full
status-diff + ahead/behind inspection across every worktree purely to read
`wt.path`. They migrate to a third primitive, `worktrees::list_roots`, which
returns the canonicalized worktree roots from the cheap descriptor phase with
**no inspection at all**. `/map` and CLI `map` remain on parallel `enumerate`
because they display `dirty`/`ahead`/`behind`. This removes the multi-second
cold-scope stall on many-worktree workspaces from the request gate, not just from
`/status`.

## Rationale

The targeted inspect fixes `/status` at the root — the handler never needed all
worktrees, so the strictly-less-work path (research F1/F3) is the honest fix, not
merely a faster wrong loop. Parallel enumerate then serves the consumers that
*do* need every worktree, turning a serial N×walk into a bounded concurrent
fan-out (research F2/F4). Together they make `/status` constant-time in worktree
count and the worktree *list* sub-linear, without moving any compute off the CPU
or onto a new dependency.

## Consequences

- `/status` becomes effectively independent of worktree count; the "feels like
  40s" report is closed (it was never indexing — it was serial git enumeration).
- `/map` and registry worktree lists speed up with worktree count but still pay
  for every worktree (correctly — they display them all); the bounded fan-out
  keeps peak memory independent of core count.
- Slightly more concurrency to reason about; mitigated by keeping each worktree's
  repo handle thread-local and reusing the existing B5b status-thread bound.
- Opens a clean path to a future `/status`-only fast field if even the single
  worktree's `ahead_behind` walk becomes a concern (not needed now).

## Codification candidates
