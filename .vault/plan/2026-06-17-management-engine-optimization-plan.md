---
tags:
  - '#plan'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-06-17'
tier: L3
related:
  - '[[2026-06-17-management-engine-optimization-adr]]'
  - '[[2026-06-17-management-engine-optimization-research]]'
---


# `management-engine-optimization` plan

## Wave `W01` - live gates and baseline measurement

Establish non-fake confidence gates and repeatable backend measurements before changing hotpaths so later performance changes have live evidence.

### Phase `W01.P01` - backend timing fixtures

Create repeatable backend timing and scale fixtures that exercise production Rust code without mocks.

- [x] `W01.P01.S01` - Add production graph query timing fixtures; `engine/crates/engine-query/tests/query_hotpaths.rs`.
- [x] `W01.P01.S02` - Constrain salience scale benchmarking; `engine/crates/engine-query/benches/salience_bench.rs`.

### Phase `W01.P02` - live conformance gates

Make backend-facing test gates fail loudly when the live engine is unavailable instead of silently skipping confidence.

- [x] `W01.P02.S03` - Require live engine conformance instead of skipped success; `frontend/src/testing/engineConformance.test.ts`.
- [x] `W01.P02.S15` - Bound live search sibling latency; `engine/crates/vaultspec-api/src/routes/ops.rs`.

## Wave `W02` - request hotpath reduction

Reduce repeated per-request graph and filter CPU work while preserving the existing wire contract and bounded response behavior.

### Phase `W02.P03` - compiled filter evaluation

Reduce allocation and membership cost in graph filtering before larger graph indexes land.

- [x] `W02.P03.S04` - Compile filter membership and text normalization; `engine/crates/engine-query/src/filter.rs`.

### Phase `W02.P04` - generation query indexes

Move document graph query selection toward generation-keyed indexes so capped responses no longer require full graph scans.

- [x] `W02.P04.S05` - Add generation keyed document query indexes; `engine/crates/engine-query/src/graph.rs`.
- [x] `W02.P04.S06` - Wire cached query indexes through scope state; `engine/crates/vaultspec-api/src/app.rs`.

## Wave `W03` - rebuild commit and history hardening

Shorten graph rebuild recovery paths, reduce commit-section work, and make historical graph reads reuse bounded projection state.

### Phase `W03.P05` - salience algorithm bounds

Replace scale-sensitive graph algorithms with bounded implementations that preserve observable ranking invariants.

- [x] `W03.P05.S07` - Replace quadratic coreness peeling; `engine/crates/engine-query/src/salience.rs`.
- [x] `W03.P05.S08` - Verify salience ranking invariants at scale; `engine/crates/engine-query/src/salience.rs`.

### Phase `W03.P06` - commit and history projection

Reduce graph-scale projection work in commit and as-of paths while preserving ring and sequence semantics.

- [x] `W03.P06.S09` - Shorten graph commit critical section; `engine/crates/vaultspec-api/src/app.rs`.
- [x] `W03.P06.S10` - Reuse bounded as-of projection views; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `W03.P06.S11` - Report semantic embedding first-scroll timing; `engine/crates/vaultspec-api/src/routes/query.rs`.

## Wave `W04` - fake signal removal

Remove or reclassify tests that generate backend confidence from mocks, stubs, fakes, skips, or duplicated business logic.

### Phase `W04.P07` - frontend backend-signal cleanup

Remove fake-positive backend confidence from frontend tests while keeping pure UI interaction tests separately classified.

- [x] `W04.P07.S12` - Rewrite backend-facing MockEngine coverage to live adapters; `frontend/src/stores/server`.
- [x] `W04.P07.S13` - Reclassify pure UI spy tests away from backend gates; `frontend/src`.
- [x] `W04.P07.S14` - Remove fake and stub positive-signal fixtures; `frontend/src/testing`.

## Description

This plan executes the accepted management-engine optimization decision. It starts by
making backend-facing confidence live and measurable, then reduces repeated request CPU
in filter and graph query paths, hardens salience and rebuild/history hotpaths, and
removes fake-positive test signals from backend confidence gates.

The implementation must preserve the existing wire contract, including tiers blocks,
sequence fields, degradation semantics, salience lens behavior, bounded graph slices,
and bounded semantic embedding behavior. Test changes must exercise production code
directly and must not use fakes, stubs, mocks, monkeypatches, skips, xfails, or copied
business logic as a passing signal.

## Steps







## Parallelization

W01 should land first because later work needs live signal and timing baselines. W02
can proceed after W01, with P03 safe to execute before P04. W03 can proceed in parallel
with W02 only for the self-contained salience work in P05; P06 should wait until the
scope-state and query-cache implications of W02 are understood. W04 can start with the
live conformance cleanup from W01, but broad MockEngine rewrites should wait until the
backend route behavior being asserted is stable.

## Verification

Verification requires targeted Rust tests for each changed backend crate, live
conformance coverage for backend-facing frontend tests, and a code review after each
completed execution step. A green run may not rely on skipped, xfailed, mocked, stubbed,
or fake-backed backend behavior. The plan is complete only when every Step row is
closed through the vaultspec plan CLI and the final review finds no critical or high
issues.
