---
generated: true
tags:
  - '#index'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - '[[2026-07-14-feature-group-authoring-P01-S01]]'
  - '[[2026-07-14-feature-group-authoring-P01-S02]]'
  - '[[2026-07-14-feature-group-authoring-P01-S03]]'
  - '[[2026-07-14-feature-group-authoring-P01-summary]]'
  - '[[2026-07-14-feature-group-authoring-P02-S04]]'
  - '[[2026-07-14-feature-group-authoring-P02-S05]]'
  - '[[2026-07-14-feature-group-authoring-P02-S06]]'
  - '[[2026-07-14-feature-group-authoring-P02-summary]]'
  - '[[2026-07-14-feature-group-authoring-P03-S07]]'
  - '[[2026-07-14-feature-group-authoring-P03-S08]]'
  - '[[2026-07-14-feature-group-authoring-P03-S09]]'
  - '[[2026-07-14-feature-group-authoring-P03-summary]]'
  - '[[2026-07-14-feature-group-authoring-P04-S10]]'
  - '[[2026-07-14-feature-group-authoring-P04-S11]]'
  - '[[2026-07-14-feature-group-authoring-P04-summary]]'
  - '[[2026-07-14-feature-group-authoring-P05-S12]]'
  - '[[2026-07-14-feature-group-authoring-P05-S13]]'
  - '[[2026-07-14-feature-group-authoring-P05-S14]]'
  - '[[2026-07-14-feature-group-authoring-P05-summary]]'
  - '[[2026-07-14-feature-group-authoring-adr]]'
  - '[[2026-07-14-feature-group-authoring-audit]]'
  - '[[2026-07-14-feature-group-authoring-plan]]'
  - '[[2026-07-14-feature-group-authoring-research]]'
---

# `feature-group-authoring` feature index

Auto-generated index of all documents tagged with `#feature-group-authoring`.

## Documents

### adr

- `2026-07-14-feature-group-authoring-adr` - `feature-group-authoring` adr: `feature-group document creation` | (**status:** `accepted`)

### audit

- `2026-07-14-feature-group-authoring-audit` - `feature-group-authoring` audit: `feature-group document creation closeout`

### exec

- `2026-07-14-feature-group-authoring-P01-S01` - Audit the Kit atoms and existing dialog frames the panel composes, and inventory the panel's required states (feature select, coverage rows, eligible and disabled types, link chips, errors, compact)
- `2026-07-14-feature-group-authoring-P01-S02` - Author the feature-group panel frames: stage 1 select-or-create feature with pipeline coverage rows, stage 2 add-document with eligible types, pre-filled editable link chips, disabled-with-reason states, and the compact variant
- `2026-07-14-feature-group-authoring-P01-S03` - Present the frames for user approval and record the approved frame ids (approval gates P04)
- `2026-07-14-feature-group-authoring-P01-summary` - `feature-group-authoring` `P01` summary
- `2026-07-14-feature-group-authoring-P02-S04` - Build the feature-coverage projection (present directory types with newest stem, missing types, per-type eligibility, next-step token) over the LinkageGraph, bounded and unit-tested, following the filter-vocabulary analogue
- `2026-07-14-feature-group-authoring-P02-S05` - Memoize the projection per graph generation on the corpus cell beside filters_vocabulary, invalidated on watcher rebuild
- `2026-07-14-feature-group-authoring-P02-S06` - Serve the coverage projection on the query plane with the shared envelope and tiers, scope-bound, with route tests
- `2026-07-14-feature-group-authoring-P02-summary` - `feature-group-authoring` `P02` summary
- `2026-07-14-feature-group-authoring-P03-S07` - Add the feature-coverage stores query keyed on scope+feature with tolerant live-adapter parsing and honest degradation from tiers
- `2026-07-14-feature-group-authoring-P03-S08` - Rework the create-doc chrome store to the staged feature-first shape (feature stage, document stage, eligibility-aware type choice, editable related pre-fill derived from served coverage) with unit tests
- `2026-07-14-feature-group-authoring-P03-S09` - Thread the related parameter from the staged submission through the existing create mutation and receipt-driven coverage invalidation
- `2026-07-14-feature-group-authoring-P03-summary` - `feature-group-authoring` `P03` summary
- `2026-07-14-feature-group-authoring-P04-S10` - Rebuild the dialog as the two-stage feature-group panel mirroring the approved frames: coverage rows, eligible-types-only choice with disabled-with-reason rows, editable link chips, honest same-day-duplicate refusal surfacing
- `2026-07-14-feature-group-authoring-P04-S11` - Remove bare exec from the offered types and pre-answer stage 1 from feature-scoped entry points (Features-section affordance, tree context menu)
- `2026-07-14-feature-group-authoring-P04-summary` - `feature-group-authoring` `P04` summary
- `2026-07-14-feature-group-authoring-P05-S12` - Relabel the new-document descriptors feature-first once on the descriptor plane, ids unchanged, so menu, palette, and keymap legend agree
- `2026-07-14-feature-group-authoring-P05-S13` - Update the affordance, palette, action-coverage guard tests and the dialog render tests to the staged panel
- `2026-07-14-feature-group-authoring-P05-S14` - Run the full lint gate for both languages and vault check all, and confirm exit 0 before review
- `2026-07-14-feature-group-authoring-P05-summary` - `feature-group-authoring` `P05` summary

### plan

- `2026-07-14-feature-group-authoring-plan` - `feature-group-authoring` plan

### research

- `2026-07-14-feature-group-authoring-research` - `feature-group-authoring` research: `feature-group document creation`
