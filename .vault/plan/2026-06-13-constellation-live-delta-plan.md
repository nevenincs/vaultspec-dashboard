---
tags:
  - '#plan'
  - '#constellation-live-delta'
date: '2026-06-13'
modified: '2026-06-13'
tier: L1
related:
  - '[[2026-06-13-constellation-live-delta-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
  - '[[2026-06-13-constellation-live-delta-research]]'
  - '[[2026-06-12-vaultspec-engine-adr]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `constellation-live-delta` plan

- [x] `S01` - Add a granularity tag to the diff entry so document deltas declare their species; `engine/crates/engine-graph/src/diff.rs`.
- [x] `S02` - Project the rebuild diff to feature-granularity meta-edge and feature-node deltas on the shared seq clock; `engine/crates/engine-query/src/graph.rs`.
- [x] `S03` - Emit both delta species on the single clock, carry last_seq on the live keyframe, and honor diff granularity; `engine/crates/vaultspec-api/src/app.rs`.
- [x] `S04` - Assert the keyframe seq anchor, feature-granularity diff, and granularity-tagged stream in conformance and certify end to end; `engine/tests/tests/conformance.rs`.
## Description

Binding implementation of the accepted `constellation-live-delta` ADR (S50): the
live feature constellation must animate from the stream without refetching. The
contract amendment (sections 4/5/7) is landed; this plan executes the engine
capability behind it. Today `commit_graph` diffs only the document
`LinkageGraph` and the feature meta-edges are never diffed or streamed, and the
live `/graph/query` keyframe carries no `seq` - so a held constellation cannot
splice live deltas. The contract forbids the GUI from deriving the constellation
from document edges (section 4), so the engine must project.

S01 tags every document delta with `granularity: "document"` (the wire entry
becomes `{op, granularity, node?, edge?, t, seq}`). S02 adds a feature-projection
delta in the query core: it computes the old and new feature projections (feature
nodes + meta-edges) and diffs them by stable id into `granularity: "feature"`
delta entries on the shared seq clock. S03 wires it: `commit_graph` emits the
document deltas then the feature deltas on the single monotonic clock (broadcast
on the `graph` channel), the live `/graph/query` response carries `last_seq` (the
clock tip), and `/graph/diff` honors `granularity=feature`. S04 asserts the seam
in conformance and certifies end to end. The frontend consumer (the live-state
ADR's flagged `spliceLive` step) is the peer's lane; this plan delivers the
engine half it is blocked on.

## Parallelization

S01 is the wire-shape prerequisite for S02/S03. S02 (the projection) and S03
(the wiring + keyframe seq + diff granularity) are sequential (S03 consumes
S02). S04 is last (it asserts the other three). Single review boundary at plan
completion, per the standing per-phase discipline.

## Verification

- The live `/graph/query` response (both granularities) carries a NUMERIC
  `last_seq`; `as_of` keyframes carry `last_seq: null`.
- `GET /graph/diff?granularity=feature` returns feature-node + meta-edge deltas,
  each tagged `granularity: "feature"`; `granularity=document` (default) is
  unchanged and tagged `document`.
- The `graph` SSE channel emits both species, granularity-tagged, on the single
  monotonic clock; `since=<seq>` resumes on the GLOBAL seq with no gap/overlap;
  meta-edge delta ids are stable across re-derivation (provenance-stable keys).
- Engine `cargo test --workspace`, `clippy --all-targets -D warnings`, and
  `fmt --check` green; the adversarial fleet re-certifies the engine under
  adverse + concurrent load with the delta path live.
- `vaultspec-core vault check all` green; every Step closed (`- [x]`); review
  before closure.
