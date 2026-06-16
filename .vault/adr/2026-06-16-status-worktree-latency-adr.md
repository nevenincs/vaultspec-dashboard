---
tags:
  - '#adr'
  - '#status-worktree-latency'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace status-worktree-latency with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, or deprecated. A new ADR starts as proposed; it moves to
     accepted or rejected when the decision is made, and to deprecated
     when a later ADR supersedes it.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

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

<!-- The bounded-fan-out discipline here is already covered by
`bounded-by-default-for-every-accumulator` and the CPU-compute boundary by
`graph-compute-is-cpu-gpu-is-render-and-search`; this feature applies those
rules rather than introducing a new one. No new codification candidate. -->
