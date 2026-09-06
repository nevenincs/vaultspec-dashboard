---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:224afeaed45b98c65eb45b918d5028eafb781962ec9ed04d46686c66e96a809b'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---
# `design-system-consolidation` audit: `S166 option and menu classification review`

## Scope

Review the twelve S166 menu, option-row, context-menu, filter, date-basis, command, and search-result classifications against the syntax-aware native-control baseline, live component behavior, stable source identities, canonical owners, and the required deferral of specialized inputs and selects.

## Findings

### s166-classification-review | low | option and menu classifications pass

The six target modules contain exactly twelve executable native buttons classified by S166, plus five inputs and one select correctly left for the specialized-control step. All twelve ledger keys are unique. Seven behaviorally ordinary selectable or command rows migrate to the planned `OptionRow`; four ordinary text or primary actions migrate to the existing `Button`; and `FilterChip` remains an existing feature-surface semantic seam. The retained chip is consistent with the consolidation decision and the later filter migration: its compact wrapped-pill geometry and independent multi-select `aria-pressed` contract differ from row-shaped `OptionRow`, while desktop checkbox and radio facets already compose `FacetRow`. Rationales preserve model health and dismissal, context-menu dispatch and focus cursoring, date-basis selection, filter intent, command scoring and confirmation, and search-result activation and preview behavior. No S165 field, S167 icon-action, S168 specialized input or select, or later-family site was absorbed. Focused AST, cardinality, canonical-owner, stable-key uniqueness, and `git diff --check` checks passed; the independent full frontend lint recipe completed with exit zero.

## Recommendations

Accept S166 as classified. Preserve composing chrome's roving navigation, cursoring, containment, and dismissal responsibilities when `OptionRow` lands, and keep `FilterChip` narrow to the compact pressed-facet composition rather than treating it as a general row primitive.

Status: PASS.
