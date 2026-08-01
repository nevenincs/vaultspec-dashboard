---
tags:
  - '#plan'
  - '#rail-feature-metadata'
date: '2026-08-01'
modified: '2026-08-01'
tier: L1
related:
  - '[[2026-08-01-rail-feature-metadata-adr]]'
  - '[[2026-08-01-rail-feature-metadata-research]]'
---

# `rail-feature-metadata` plan

- [x] `S01` - Widen the roster projection with type_counts, plan_state rollup, and adr_dates span, memoized on generation, with the rollup truth-table tests, fmt and clippy green; `engine/crates/engine-query, engine/crates/vaultspec-api`.
- [x] `S02` - Widen the tolerant adapter and roster view with the three optional fields, absent-field honest; `frontend/src/stores/server`.
- [x] `S03` - Render the feature row primitive (status mark in the icon slot, ADR date span, per-type composition line) and adopt it in the rail Features section, feature search suggestions, and rail filter field second line; `frontend/src/app/left`.
- [x] `S04` - Author desk specimens for the new fields across states, update tests, and run the full frontend gate plus touched-scope vitest green; `frontend/dev/visual-review/specimens, frontend/src/app/left`.
## Description

## Steps

## Parallelization

## Verification
