---
tags:
  - '#plan'
  - '#status-worktree-latency'
date: '2026-06-16'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-16-status-worktree-latency-adr]]'
  - '[[2026-06-16-status-worktree-latency-research]]'
---
# `status-worktree-latency` plan

### Phase `P01` - ingest-git: targeted inspect + parallel enumerate

Add a single-worktree inspect path and parallelize the all-worktree enumeration in the ingest-git worktrees module, preserving the WorktreeInfo contract and the B5b status-thread bound.

- [x] `P01.S01` - Add a public inspect_one(workspace, path) that resolves and inspects only the worktree matching path; `engine/crates/ingest-git/src/worktrees.rs`.
- [x] `P01.S02` - Split enumerate into cheap descriptor collection then a bounded concurrent inspect fan-out, preserving the per-status thread bound; `engine/crates/ingest-git/src/worktrees.rs`.
- [x] `P01.S03` - Add unit tests for inspect_one selection/None and parallel enumerate parity with the prior serial set; `engine/crates/ingest-git/src/worktrees.rs`.

### Phase `P02` - wire enumerate-then-find-one callers to the targeted path

Switch the /status route and the CLI status command from enumerate().find(...) to the targeted single-worktree inspect so they stop paying for other worktrees.

- [x] `P02.S04` - Switch the /status handler to inspect_one for the served worktree; `engine/crates/vaultspec-api/src/routes/stream.rs`.
- [x] `P02.S05` - Switch the CLI status command to inspect_one; `engine/crates/vaultspec-cli/src/cmd/status.rs`.

### Phase `P03` - verify, measure, and review

Run the full engine gate, confirm /status latency no longer scales with worktree count, and pass code review.

- [x] `P03.S06` - Run the full engine gate (cargo fmt --check + clippy + tests) to exit 0; `engine/`.
- [x] `P03.S07` - Measure /status on a multi-worktree workspace and confirm latency no longer scales with worktree count; `engine/crates/vaultspec-api/src/routes/stream.rs`.
- [x] `P03.S08` - Code-review the change for correctness, bounded fan-out, and WorktreeInfo parity; `engine/crates/ingest-git/src/worktrees.rs`.

## Description

Remove the worktree-count-scaling latency from the `/status` front door. The
authorizing ADR establishes two complementary changes: a targeted
single-worktree inspect so `/status` (and the CLI `status` command) stop
enumerating every worktree to keep one, and a bounded concurrent fan-out for the
genuine all-worktree list consumers (`/map`, registry). The work is confined to
the ingest-git `worktrees` module and its two enumerate-then-find-one callers; it
changes no wire shape and stays CPU-bound within the existing B5b status-thread
bound. Grounded in the research findings F1-F4 and the ADR's accepted decision.

## Steps

## Parallelization

P01 is the foundation and must land first: P02 depends on `inspect_one` existing,
and P03 verifies the whole. Within P01, S01 (inspect_one) and S02 (parallel
enumerate) are independent and may be done in either order; S03 (tests) follows
both. P02's two steps are independent of each other. P03 is strictly last.

## Verification

The plan succeeds when:

- The full engine gate (`cargo fmt --check`, `clippy`, tests) exits 0, including
  new tests for `inspect_one` selection/None and parallel-`enumerate` parity.
- `worktrees::enumerate` returns the identical `WorktreeInfo` set as the prior
  serial implementation (parity test), with the per-status thread bound intact.
- `/status` and the CLI `status` command use the single-worktree path and return
  the same git block as before for the served worktree.
- `/status` latency is measured flat across worktree count (no longer ~5s on a
  multi-worktree workspace).
- Code review signs off on correctness, bounded fan-out, and contract parity.
