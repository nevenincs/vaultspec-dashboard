---
tags:
  - '#research'
  - '#status-worktree-latency'
date: '2026-06-16'
modified: '2026-06-22'
related: []
---

# `status-worktree-latency` research: `status worktree enumeration latency`

The `/status` front door was reported as slow (felt like "40s to index"). Live
measurement disproved the framing: graph queries are ~55ms and `/status` is
~45ms on a single-worktree workspace, but ~5s on a workspace with a dozen-plus
linked worktrees. The latency scales with worktree count, not corpus size. This
research locates the cause and the consumers affected.

## Findings

### F1 — `/status` computes git status for every worktree, uses one

The `/status` handler (`engine/crates/vaultspec-api/src/routes/stream.rs`) calls
`Workspace::discover` then `worktrees::enumerate`, which returns a
`Vec<WorktreeInfo>` for the main checkout plus *every* linked worktree, and then
`.find()`s the single entry whose scope token matches the served root. All
worktrees but one are computed and discarded.

### F2 — per-worktree inspection is expensive, and `enumerate` is serial

`worktrees::enumerate` (`engine/crates/ingest-git/src/worktrees.rs`) loops the
main checkout plus each linked worktree and calls `inspect()` serially. Each
`inspect()` does two non-trivial git operations: an index-vs-worktree status
diff (the `dirty` check — already thread-bounded by B5b/`VAULTSPEC_GIT_STATUS_THREADS`),
and `ahead_behind()`, which builds two full-history reachability sets via
`rev_walk` (O(history) per side). On a workspace with N worktrees the handler
pays N × (status diff + two history walks), one after another. This is the ~5s.

### F3 — caller taxonomy: two shapes

Callers of `worktrees::enumerate` split cleanly:

- **All-worktree list consumers** that genuinely need every worktree: `/map`
  (`routes/query.rs`), the registry routes (`routes/registry.rs`, `lib.rs`),
  and the CLI `map` command. These want enumeration to stay complete but run
  concurrently.
- **Enumerate-then-find-one consumers** that need only the served worktree:
  `/status` (`routes/stream.rs`) and the CLI `status` command (`cmd/status.rs`).
  These should inspect a single worktree, not the whole set.

### F4 — the fix is bounded and CPU-only

Both levers are local and respect the engine rules: parallel inspection is a
CPU-bound fan-out (graph/git compute is CPU; no GPU involved), and the targeted
single-worktree path does strictly less work. Any added parallelism must keep
the existing B5b per-status thread bound so the combined fan-out (worktrees ×
status-diff threads) stays bounded, per `bounded-by-default-for-every-accumulator`.
