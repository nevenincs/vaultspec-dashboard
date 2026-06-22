---
tags:
  - '#audit'
  - '#status-worktree-latency'
date: '2026-06-16'
modified: '2026-06-22'
related:
  - "[[2026-06-16-status-worktree-latency-plan]]"
---



# `status-worktree-latency` audit: `worktree latency fix review`

## Scope

The ingest-git worktree changes (`inspect_one` + bounded parallel `enumerate`)
and their two consumers (`/status` route, CLI `status`), reviewed by an
independent code-reviewer pass and validated against live data on the
67-worktree aeat workspace.

## Findings

### Verdict: PASS-WITH-NITS (merge-ready, no required revisions)

The reviewer independently re-ran the engine gate green (`fmt --check`, `clippy`,
`ingest-git`/`vaultspec-cli` tests) and confirmed:

- **Path-match parity (correct):** `inspect_one` canonical-path matching is
  equivalent in practice to the old `scope_token`/`clean_path` find, because the
  served scope always exists on disk and both sides resolve to the same verbatim
  form; first-match short-circuit and descriptor order preserve the old `find`.
- **Bound honest:** combined fan-out is `worktree_inspect_concurrency()` (4) x the
  B5b `git_status_thread_limit()` (2) = 8 threads, independent of worktree and
  core count; no rayon-in-rayon nesting; serial below 2 descriptors.
- **Rules clean:** satisfies `bounded-by-default-for-every-accumulator`,
  `graph-compute-is-cpu-gpu-is-render-and-search`, `engine-read-and-infer`.
- **Tests adequate:** parity, main resolution, None, and parallel-vs-serial set.

### Live measurement (aeat, 67 worktrees, authed routes)

- `/status`: ~5.8s (old serial enumerate of all 67) -> 410-450ms (`inspect_one`,
  one worktree), now flat in worktree count. The residual ~450ms is
  `active_cell` + `CoreRunner::detect` + rag discover + one worktree inspect, not
  worktree-scaling.
- `/map`: 5.8s (serial enumerate) -> 2.1s (parallel enumerate), ~2.7x.

The prior "~5s /status" root cause is confirmed: serial per-worktree
`ahead_behind` history walks x 67.

## Recommendations

- **LOW (follow-up, out of this ADR's scope):** other enumerate-then-find callers
  pay the full enumeration too: `validate_scope_token` (per authed request) and
  the CLI `Ctx::resolve` (per invocation). Migrating them to `inspect_one` would
  remove the same waste from the request gate. This ADR deliberately scoped to
  `/status` + CLI `status`; the parallel `enumerate` already mitigates them.
- **LOW (informational):** `inspect_path` re-opens each worktree via
  `gix::open(path)` (required for the parallel fan-out); error-propagation parity
  with the old whole-enumeration-aborts behavior holds.

## Codification candidates


