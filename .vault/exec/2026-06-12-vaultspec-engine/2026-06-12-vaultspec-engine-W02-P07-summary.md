---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W02.P07` summary

Phase W02.P07 (temporal correlation and time-travel) is complete: all four
Steps closed, workspace checks green at the boundary. W02.P08 (query core)
unblocks — its dependencies (P05, P07) are both done.

- Created: `engine/crates/ingest-git/src/correlate.rs`
- Created: `engine/crates/engine-graph/src/asof.rs`
- Created: `engine/crates/engine-graph/src/diff.rs`
- Created: `engine/crates/engine-query/src/events.rs`
- Modified: crate `lib.rs` rollups, `index.rs` (shared structural-edge
  constructor, Git error variant)

## Description

Delivered the temporal tier and the time-travel mechanics. The four named
correlation rules run per (commit, record) pair in descending confidence —
explicit identifier (0.9, the opt-in core enrichment consumed
opportunistically per U2), doc-and-code-in-one-commit (0.7), windowed
path-overlap (0.4), same-day co-activity (0.3) — each edge independently
attributed to its rule in CommitCorrelation provenance, strongest rule
winning per pair (a flagged choice). Blob-true as-of reconstruction reads
document blobs as committed at T via the git object DB, never the present
tree, with tree-based resolution against the inventory at T and the
semantic tier excluded by construction; a divergence test proves the T1
view survives present-tree mutation. The ordered diff log emits contract
section 5 entries ({op, node|edge, t, seq}) on a caller-positioned
monotonic clock with last-seq splicing — the same shape the live SSE
channel will reuse (one delta clock). Event bucketing serves raw, auto
(≤100 buckets), and fixed-interval modes over the strict loud-on-corrupt
event read path, with the wire grammar (raw|auto|30s|15m|1h|1d) parsed
defensively.

Flags for review (S30, S31 records): strongest-rule-wins precedence, and
the v1 as-of bound (step ids and symbols mark stale at T; paths and wiki
stems resolve fully). Verification at the boundary: 87 workspace tests
green, fmt and clippy -D warnings clean.
