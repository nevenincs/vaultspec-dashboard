---
tags:
  - '#plan'
  - '#graph-implementation-review'
date: '2026-07-02'
tier: L2
related:
  - '[[2026-07-02-graph-implementation-review-audit]]'
  - '[[2026-07-02-graph-implementation-review-adr]]'
  - '[[2026-06-29-graph-simulation-stability-research]]'
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

# `graph-implementation-review` plan

### Phase `P01` - Simulation stability and reheat

Fix the solver reheat/resume energy-neutrality contract, the setParams reheat default, the drag hand-off sleep-invariant hole, and the alphaDecay doc drift; decide on the collide-force fixed-point question.

- [x] `P01.S01` - GIR-002: make D3ForceSolver.resume() energy-neutral (wake the loop without solver.reheat), reserve re-energise for reheatNow(), and fix the false energy-neutral contract on set-simulation-active; `frontend/src/scene/three/threeField.ts`.
- [x] `P01.S02` - GIR-003: invert D3ForceSolver.setParams() default to gentle reheat (or require reheatAlpha), removing the violent full-warm default; `frontend/src/scene/three/d3ForceSolver.ts`.
- [x] `P01.S03` - GIR-004: add setDrag() hand-off guard releasing the prior drag index when it differs, closing the sleep-invariant hole; `frontend/src/scene/three/d3ForceSolver.ts`.
- [x] `P01.S04` - GIR-005: correct the alphaDecay schedule doc comment to the shipped 0.05 / alphaMin 0.005 schedule (docs-only); `frontend/src/scene/three/d3ForceSolver.ts`.
- [x] `P01.S05` - GIR-001: Option B ACCEPTED per ADR graph-simulation-stability-model - codify the freeze-at-alphaMin + pin-authoritative model as the accepted design; `valve closures + comment rewrites land in P01.S01-S04 / the solver PR.; `frontend/src/scene/three/d3ForceSolver.ts`.
- [x] `P01.S12` - R4/GIR-001: resurrect the settle-probe as permanent guard tests (4 named assertions) protecting the accepted stability invariants; `frontend/src/scene/three/d3ForceSolver.test.ts`.
- [x] `P01.S13` - R5/GIR-001: codify the accepted pin-authoritative stability model as a project rule, naming the Option-A re-open trigger (at-rest displacement / contact micro-buzz after the valves close); `.vaultspec/rules/rules/`.

### Phase `P02` - Scene model correctness

Fix ghost anchor/focus state left behind by an empty set-data, and fold live apply-deltas batches into the controller's held model so nodeCount/edgeCount stay truthful.

- [x] `P02.S06` - GIR-008: clear idToIndex/neighbors/featureCohort/cpuPositions in disposeGraph (or the n===0 early return) so an empty set-data leaves no ghost anchors/focus targets; `frontend/src/scene/three/threeField.ts`.
- [x] `P02.S07` - GIR-006: fold apply-deltas into SceneController's held model so nodeCount/edgeCount stay truthful, scoping an incremental solver update path as a DECISION-GATED follow-up; `frontend/src/scene/three/threeField.ts`.
- [x] `P02.S09` - GIR-012: do not re-engage autoframe on delta-driven warm set-datas, distinguish a delta-driven warm reflow from a genuine user/graph-identity state change; `frontend/src/scene/three/threeField.ts + frontend/src/app/stage/Stage.tsx`.

### Phase `P03` - Layer-ownership hygiene

Rehome the mergeSlices model-derivation logic and its merged/displaySlice composition out of the app layer into stores/view/, restoring the dashboard-layer-ownership boundary.

- [x] `P03.S08` - GIR-007: rehome mergeSlices + the merged/displaySlice composition from app/stage into stores/view/; `frontend/src/app/stage/WorkingSet.tsx`.

### Phase `P04` - Wire and client accumulator bounding

Bound the /graph/diff engine route the way its sibling routes are bounded with an honest truncated block, and cap the client-side DeltaLog accumulator against unbounded time-travel diff ingest.

- [x] `P04.S10` - GIR-010: bound /graph/diff the way its siblings are bounded and emit an honest truncated block; `engine/crates/engine-graph/src/diff.rs + engine/crates/vaultspec-api/src/routes/temporal.rs`.
- [x] `P04.S11` - GIR-011: cap the client DeltaLog accumulator and add a MAX_CLIENT_* clamp on the time-travel diff ingest; `frontend/src/scene/deltaLog.ts`.
- [x] `P04.S14` - GIR-014: bound the feature-granularity diff path (feature_delta) with the same MAX_DIFF_DELTAS ceiling + honest truncated block as the document path, so both granularities share one bounding contract; `engine/crates/engine-query/src/graph.rs + engine/crates/vaultspec-api/src/routes/temporal.rs`.
- [x] `P04.S15` - GIR-015: on the live commit-broadcast path, when a diff degrades to keyframe-only, reserve one seq position and broadcast a synthetic non-feature marker chunk (op rekeyframe) so clients invalidate+refetch - drop the deltas, never the signal; `also correct the false generation-bump comment; `engine/crates/vaultspec-api/src/app.rs`.

## Description

Remediation of the graph-implementation-review audit findings (GIR-001..GIR-012); tracked by the orchestrator, steps checked as fixes land and pass the gate.

## Steps

## Parallelization

Phases P01, P02, P03, and P04 have no hard interdependency and may proceed in any order. Steps within a Phase may parallelize; P01.S05 is now decision-closed (Option B accepted), and P01.S12/P01.S13 (guard tests, codification) may follow P01.S01-S04 once those valve closures land.

## Verification

The plan is complete when every Step is closed and each landed fix passes the full lint/test gate for its touched language.
