---
tags:
  - '#plan'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-17'
tier: L2
related:
  - '[[2026-07-14-feature-group-authoring-adr]]'
  - '[[2026-07-14-feature-group-authoring-research]]'
---

# `feature-group-authoring` plan

### Phase `P01` - Figma panel design

Design the feature-group panel in the binding Figma file before any frontend rollout (ADR approval condition): both stages, coverage rows, disabled-type states, link chips, compact variant - composed from Kit atoms. User approval of the frames gates P04.

- [x] `P01.S01` - Audit the Kit atoms and existing dialog frames the panel composes, and inventory the panel's required states (feature select, coverage rows, eligible and disabled types, link chips, errors, compact); `Figma file SlhonORmySdoSMTQgDWw3w`.
- [x] `P01.S02` - Author the feature-group panel frames: stage 1 select-or-create feature with pipeline coverage rows, stage 2 add-document with eligible types, pre-filled editable link chips, disabled-with-reason states, and the compact variant; `Figma file SlhonORmySdoSMTQgDWw3w`.
- [x] `P01.S03` - Present the frames for user approval and record the approved frame ids (approval gates P04); `Figma file SlhonORmySdoSMTQgDWw3w`.

### Phase `P02` - Engine feature-coverage projection

Serve per-feature pipeline coverage (present types with newest stems, missing types, per-type eligibility, next-step token) as one bounded generation-memoized engine-query projection on the query plane (ADR D2/D3). May run parallel to P01.

- [x] `P02.S04` - Build the feature-coverage projection (present directory types with newest stem, missing types, per-type eligibility, next-step token) over the LinkageGraph, bounded and unit-tested, following the filter-vocabulary analogue; `engine/crates/engine-query/src/features.rs`.
- [x] `P02.S05` - Memoize the projection per graph generation on the corpus cell beside filters_vocabulary, invalidated on watcher rebuild; `engine cell memo site beside filters_vocabulary`.
- [x] `P02.S06` - Serve the coverage projection on the query plane with the shared envelope and tiers, scope-bound, with route tests; `engine/crates/vaultspec-api/src/routes/query.rs`.

### Phase `P03` - Stores seam and chrome state

One stores query for coverage keyed on scope+feature with tolerant adapters, and the createDocChrome store reworked to the staged feature-first shape with deterministic related pre-fill state (ADR D1/D5).

- [x] `P03.S07` - Add the feature-coverage stores query keyed on scope+feature with tolerant live-adapter parsing and honest degradation from tiers; `frontend/src/stores/server/queries`.
- [x] `P03.S08` - Rework the create-doc chrome store to the staged feature-first shape (feature stage, document stage, eligibility-aware type choice, editable related pre-fill derived from served coverage) with unit tests; `frontend/src/stores/view/createDocChrome.ts`.
- [x] `P03.S09` - Thread the related parameter from the staged submission through the existing create mutation and receipt-driven coverage invalidation; `frontend/src/stores/server/queries/mutations.ts`.

### Phase `P04` - Feature-group panel build

Rebuild the dialog as the two-stage feature-group panel mirroring the approved Figma frames: select-or-create feature with coverage rows, eligible-types-only document stage with editable link chips, exec removed, entry points pre-answering stage 1 (ADR D1/D3/D4/D5). Gated on P01 approval.

- [x] `P04.S10` - Rebuild the dialog as the two-stage feature-group panel mirroring the approved frames: coverage rows, eligible-types-only choice with disabled-with-reason rows, editable link chips, honest same-day-duplicate refusal surfacing; `frontend/src/app/left/CreateDocDialog.tsx`.
- [x] `P04.S11` - Remove bare exec from the offered types and pre-answer stage 1 from feature-scoped entry points (Features-section affordance, tree context menu); `frontend/src/app/left`.

### Phase `P05` - Guards, relabeling, and gate

Feature-first relabeling on the descriptor plane (ADR D6), guard and render test updates, full lint gate and vault check green.

- [x] `P05.S12` - Relabel the new-document descriptors feature-first once on the descriptor plane, ids unchanged, so menu, palette, and keymap legend agree; `frontend/src/stores/view/graphCommands.ts and descriptor sites`.
- [x] `P05.S13` - Update the affordance, palette, action-coverage guard tests and the dialog render tests to the staged panel; `frontend/src/app/newDocumentAffordances.guard.test.tsx and sibling guards`.
- [x] `P05.S14` - Run the full lint gate for both languages and vault check all, and confirm exit 0 before review; `just dev lint all`.

## Description

Rebuild the New-document dialog as a feature-group panel per the accepted
feature-group-authoring ADR (see related frontmatter): a two-stage flow
(select-or-create feature with served pipeline coverage, then add an eligible
document with deterministically pre-filled cross-links), backed by one new
generation-memoized engine-query coverage projection. Bare exec creation
leaves the panel; descriptors are relabeled feature-first with ids unchanged.
The ADR's approval condition binds: the panel is designed in Figma and the
frames are user-approved before the panel chrome (P04) is built.

## Steps

## Parallelization

P01 (Figma design) and P02 (engine projection) share no files and run in
parallel. P03 depends on P02's served shape. P04 carries TWO hard gates: the
P01.S03 user approval of the frames and P03's chrome-store shape. P05 closes
sequentially after P04. Within each Phase, Steps are ordered.

## Verification

- P01.S03 records explicit user approval of the panel frames; no P04 work
  precedes it.
- Engine projection unit and route tests pass; the coverage response carries
  the shared envelope with tiers and is memoized per graph generation
  (repeat reads warm).
- Panel behavior verified by render tests: ineligible types disabled with
  reason, link chips pre-filled and editable, exec absent, feature-scoped
  entry points pre-answer stage 1, same-day-duplicate refusal surfaces
  honestly.
- Guard tests (new-document affordances, action coverage, command palette)
  green against the staged panel; descriptor ids unchanged.
- Full gate green: `just dev lint all` exit 0 and
  `vaultspec-core vault check all` free of new findings; reviewer sign-off
  via the code-review phase before the plan closes.
