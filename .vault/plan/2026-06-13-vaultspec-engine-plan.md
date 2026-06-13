---
tags:
  - '#plan'
  - '#vaultspec-engine'
date: '2026-06-13'
tier: L1
related:
  - '[[2026-06-12-vaultspec-engine-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
  - '[[2026-06-12-vaultspec-engine-audit]]'
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

# `vaultspec-engine` plan

- [x] `S01` - Accept millisecond timestamps on as-of and diff inputs by resolving the latest commit at or before T on the scope ref, alongside the existing revision form; `engine/crates/engine-graph/src/asof.rs`.
- [x] `S02` - Synthesize feature nodes (kind feature, id from feature tag, lifecycle and facet projections) at feature granularity and address meta-edges between their node ids; `engine/crates/engine-query/src/graph.rs`.
- [x] `S03` - Carry the contract section 4 node fields (title, dates, lifecycle, degree-by-tier) on list-shape graph nodes, not only the detail bundle; `engine/crates/engine-query/src/graph.rs`.
- [x] `S04` - Add the git block to serve status and dates plus doc-type to vault-tree entries, matching the CLI front door; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `S05` - Bound commit-event node-ids: filter to graph-known nodes and cap with a truncation count, and record the bound in the contract reference; `engine/crates/engine-query/src/events.rs`.
- [x] `S06` - Add a consumer-shaped conformance test asserting the typed-client expectations for every contract capability over live serve responses; `engine/tests/tests/conformance.rs`.
- [x] `S07` - Flatten the search response to the section 2 envelope with a flat annotated results list, map annotation fields against rag's recorded real JSON shape with a typed miss condition, and assert annotation through a fake-rag fixture returning nonempty results; `engine/crates/vaultspec-api/src/routes/ops.rs`.
## Description

Post-closure conformance addendum to the completed 2026-06-12 engine plan. The GUI's S49 live-origin verification - the first consumer-typed-client pass over the serve surface - surfaced five capability divergences between the closed implementation and the contract reference; all five are RULED engine fixes (item five with a one-line contract bound recorded alongside), per the rulings in the feature audit's addendum-cycle entry. S01 is critical path (blocks the GUI time-travel smoke): the contract grants `t=<ts|sha>` and the implementation rev-parses only. S02 closes a genuine ADR D4.1 gap: feature granularity currently returns empty nodes plus meta-edges - the convergence entity itself is never synthesized. S06 institutionalizes the lesson: the feature e2e verified the contract against the engine's own reading; a consumer-shaped conformance leg catches the next drift engine-side before a client does.

## Parallelization

S01 through S05 are independent and may run in any order or in parallel; S06 is last (it asserts the other five). Single review boundary at plan completion.

## Verification

Green cargo build, test, clippy at the boundary; every S49-record divergence reproduced as a failing assertion in S06 first, then green; the GUI's time-travel smoke unblocked (S01); feature-granularity responses carry synthesized feature nodes with the contract section 4 fields; the node-ids bound recorded in the contract reference; review per the standing per-phase discipline before closure.
