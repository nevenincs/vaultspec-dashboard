---
tags:
  - '#plan'
  - '#plan-document-rendering'
date: '2026-06-29'
modified: '2026-06-29'
tier: L2
related:
  - "[[2026-06-29-plan-document-rendering-adr]]"
  - "[[2026-06-29-plan-document-rendering-research]]"
---

# `plan-document-rendering` plan

Render plan documents in the reader with derived metadata and a clear step vocabulary, and
serve plan structure counts/rollups/state from the engine pre-truncation.

## Description

Implements the accepted ADR: the engine plan-interior projection serves per-wave/phase
rollups and a per-plan summary (counts plus derived completion state) computed over the full
tree before truncation, reusing the one completion-class authority; the stores layer threads
those fields and deletes the client-side rollup math; the reader gains a self-fetching plan
summary card and an in-place task-list step restyle composing the centralized kit; the
design is authored in the binding Figma file; and the bounded-slice discipline is codified.

## Steps

### Phase `P01` - engine: serve plan counts, rollups, and state pre-truncation

The plan-interior projection serves truncation-honest structure metadata.

- [x] `P01.S01` - promote the completion-class derivation to crate visibility; `engine/crates/engine-query/src/filter.rs`.
- [x] `P01.S02` - add the rollup and summary types and fields to the interior projection; `engine/crates/engine-query/src/node.rs`.
- [x] `P01.S03` - compute per-wave/phase rollups and the per-plan summary over the full tree pre-truncation; `engine/crates/engine-query/src/node.rs`.
- [x] `P01.S04` - add unit tests asserting rollups and summary are true pre-truncation totals; `engine/crates/engine-query/src/node.rs`.
- [x] `P01.S05` - assert the served summary and rollup in the plan-interior conformance test; `engine/crates/vaultspec-api/src/lib.rs`.

### Phase `P02` - stores: thread the wire fields, drop the client rollup math

The stores layer carries the served rollups and summary and removes frontend counting.

- [x] `P02.S01` - add the rollup and summary wire types and fields; `frontend/src/stores/server/engine.ts`.
- [x] `P02.S02` - fold the new fields in the tolerant live adapter; `frontend/src/stores/server/liveAdapters.ts`.
- [x] `P02.S03` - read rollups from the wire and delete the client rollup derivation; `frontend/src/stores/server/queries.ts`.
- [x] `P02.S04` - add the plan summary presentation view and its derivation; `frontend/src/stores/server/queries.ts`.

### Phase `P03` - reader: plan summary card and step restyle

The reader renders the plan summary and the shared step vocabulary.

- [x] `P03.S01` - extract the shared step check mark into the kit; `frontend/src/app/kit/StepCheckMark.tsx`.
- [x] `P03.S02` - point the right-rail step tree at the shared mark and wire rollups; `frontend/src/app/right/PlanStepTree.tsx`.
- [x] `P03.S03` - add the self-fetching plan summary card; `frontend/src/app/viewer/PlanSummaryCard.tsx`.
- [x] `P03.S04` - mount the card and add the task-list step override in the reader; `frontend/src/app/viewer/MarkdownReader.tsx`.
- [x] `P03.S05` - thread the plan node id from the doc view; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `P03.S06` - add the done-row step treatment; `frontend/src/styles.css`.

### Phase `P04` - design and codify

The binding design records the treatment and the discipline is codified.

- [x] `P04.S01` - author the plan reader surface in the binding Figma file; `frontend/figma/README.md`.
- [x] `P04.S02` - sharpen the backend-served-state rule with the bounded-slice corollary; `.vaultspec/rules/rules/display-state-is-backend-served-not-frontend-derived.md`.

### Phase `P05` - gate and verify

The full gate and live verification confirm the feature.

- [x] `P05.S01` - run the engine tests, fmt, and clippy; `engine/crates/engine-query/src/node.rs`.
- [x] `P05.S02` - run the full frontend lint gate and the affected vitest files; `frontend/src/app/viewer/MarkdownReader.test.tsx`.
- [x] `P05.S03` - live-verify the engine serves the summary and rollups for a real plan; `engine/crates/vaultspec-api/src/lib.rs`.

## Parallelization

Phase `P01` is the wire-contract foundation and lands first. Phase `P02` depends on the
`P01` field names. Phase `P03` depends on `P02`. Phase `P04` (Figma authoring and the codify
edit) is independent of the code and ran alongside `P01`-`P03`. Phase `P05` is the closing
gate over all prior phases.

## Verification

The plan is complete when every Step is closed. Mission success criteria: the engine
plan-interior response carries per-wave/phase rollups and a per-plan summary computed
pre-truncation (asserted by `engine-query` unit tests and a `vaultspec-api` conformance
test); the frontend reads those served values with no client-side rollup recomputation (a
regression test asserts the plan rollup is taken from the summary even under truncation); the
reader renders the plan summary card and the done/pending step vocabulary (component and
derivation tests); the full frontend lint gate and the affected vitest files pass; the engine
tests, fmt, and clippy pass; and the running engine is confirmed serving the new fields for a
real plan.
