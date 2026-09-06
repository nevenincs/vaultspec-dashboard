---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:5da04c76bb6bf3366aa13457a8d934f1ca04fa0701538d8127c880ca7ef14444'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---
# `design-system-consolidation` audit: `S167 icon action classification review`

## Scope

Review the seven S167 dialog, composer, compact-shell, settings, and viewer action classifications against the accepted ownership boundary, live JSX semantics, stable identities, canonical kit contracts, the prior settings deferral, and the S168 through S170 family boundaries.

## Findings

### s167-classification-review | low | deferred action classifications pass

The five target modules contain fourteen executable native buttons and one textarea. S167 classifies exactly seven uniquely keyed buttons as migrations: dialog close, composer-chip remove, composer attach, compact-shell icon slot, related-document remove, settings reset, and settings scope-target option. Five glyph-only controls map to `IconButton`, the localized settings reset action maps to `Button`, and the settings radiogroup option maps to `Segment` composed by `SegmentedToggle`. The remaining seven buttons and composer textarea stay unclassified for the specialized composer-entry and remaining shell or surface steps. Rationales preserve dismissal, attachment, popover, pressed, coarse-pointer, removal, reset, commit, and scope-selection behavior.

The two Settings mappings faithfully resolve the explicit earlier deferral according to their live semantics. `SettingRow` is an ordinary localized text action, not an icon action; `ScopeTargetToggle` is a controlled segmented-radio option, not an icon action. The downstream S70 phrase naming settings icon actions and `IconButton` is stale wording, not authority to force either control into the wrong primitive. This wording debt does not invalidate the S167 classification, but it must be reconciled through the identifier-preserving plan-edit path before S70 executes.

Focused AST, target-cardinality, canonical-owner, stable-key uniqueness, and `git diff --check` checks passed. The independent full frontend lint recipe completed with exit zero.

## Recommendations

Accept S167 as classified. Before executing S70, revise its prose through the owning plan verb to name the classified `Button` and `SegmentedToggle` or `Segment` migrations while preserving the existing identifier and settings behavior requirements. Keep the other eight target controls assigned to S168 or S170.

Status: PASS.
