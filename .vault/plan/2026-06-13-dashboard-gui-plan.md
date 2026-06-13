---
tags:
  - '#plan'
  - '#dashboard-gui'
date: '2026-06-13'
modified: '2026-06-13'
tier: L1
related:
  - '[[2026-06-12-dashboard-gui-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
  - '[[2026-06-12-dashboard-gui-audit]]'
  - '[[2026-06-13-vaultspec-engine-plan]]'
---


# `dashboard-gui` plan

- [x] `S01` - Add granularity to the typed graph query and request feature granularity for the constellation; `frontend/src/stores/server/engine.ts`.
- [x] `S02` - Carry the canonical separate meta_edges wire shape and fold it into edges through one tolerant client adapter; `frontend/src/stores/server/liveAdapters.ts`.
- [x] `S03` - Reconcile the mock engine and corpus fixture to the live separate-meta_edges wire shape under both granularities; `frontend/src/testing/mockEngine.ts`.
- [x] `S04` - Carry member_count through the scene seam and size feature nodes as constellation centers of gravity; `frontend/src/scene/field/nodeSprites.ts`.
- [x] `S05` - Assert the live meta_edges fold and member_count carry in a consumer test and verify the rendered constellation end to end; `frontend/src/scene/sceneMapping.test.ts`.
## Description

GUI-side consumption addendum to the closed 2026-06-12 dashboard-gui plan,
closing the feature-constellation half of the S49 live-origin divergence set.
The engine's 2026-06-13 addendum (S02/S03) now synthesizes feature-convergence
nodes (kind `feature`, with `member_count` and `degree_by_tier`) and returns
cross-feature relationships as a separate top-level `meta_edges` array
(`{src, dst, src_feature, dst_feature, count, breakdown_by_tier}`, src/dst the
synthesized feature node ids). The GUI was built against a mock that folded
meta-edges into `edges[]` and never requested feature granularity, so against
the live origin the constellation query returns feature nodes with an empty
`edges[]` and the separate `meta_edges` is dropped by the typed client - the
center stage renders feature nodes with zero connecting edges.

S01 adds the engine-owned `granularity` parameter to the typed query and has the
stage request `feature` for the top-level constellation. S02 carries the
canonical separate `meta_edges` wire field plus `member_count`, and folds
`meta_edges` into the internal edge representation (synthesizing a stable id,
the `related` relation, the dominant tier from the breakdown, and the
aggregation `meta`) through one tolerant client adapter, so the mock and the
live origin pass through a single code path (the S49 verification property). S03
reconciles the mock engine and corpus test double to the live wire: the mock
honors `granularity` and emits a separate `meta_edges` array with `edges[]`
empty at feature granularity. S04 carries `member_count` through the locked
scene seam as an additive `memberCount?` field - a flagged seam redline, the
defining visual semantic of ADR D4.1's convergence entity - and sizes feature
nodes by it so they read as the constellation's centers of gravity. S05 asserts
the fold and the member-count carry in a consumer-shaped test and verifies the
rendered constellation end to end against a live `vaultspec serve` origin.

## Parallelization

S01 and S02 are the typed-client core and land together (S02 builds on the query
shape S01 introduces). S03 depends on the S02 wire types. S04 (scene seam plus
sprite sizing) shares no surface with S01 through S03 and may run in parallel.
S05 is last: it asserts the other four. Single review boundary at plan
completion, per the standing per-phase discipline.

## Verification

- Frontend gates green over `frontend/`: vitest, `tsc -b` typecheck, eslint, and
  prettier check.
- One client code path passes unchanged against both the reconciled mock and the
  live serve origin (the S49 contract-shape verification property).
- The live feature-granularity query renders the feature-convergence nodes and
  the cross-feature relationships as meta-edge ribbons: a visual smoke against
  `vaultspec serve` over this repository's own vault (three feature nodes -
  dashboard-foundation, dashboard-gui, vaultspec-engine - joined by their
  cross-feature meta-edges).
- The scene seam holds: no React import under `frontend/src/scene/`; the
  `memberCount` seam addition is recorded as a flagged additive redline in the
  GUI ADR (§9a, "RL-1 additive"), never a silent drive-by edit.
- Engine `cargo test --workspace` and the consumer conformance leg stay green
  (this addendum changes no engine code).
- `vaultspec-core vault check all` stays green; every Step closed (`- [x]`).
