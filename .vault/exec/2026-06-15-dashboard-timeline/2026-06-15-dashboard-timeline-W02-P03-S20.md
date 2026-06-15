---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S20'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Add a tolerant liveAdapters adapter that reconciles the lineage slice shape

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Add the tolerant `adaptLineageSlice` to `liveAdapters.ts`, reconciling the unwrapped lineage body onto the internal `LineageSlice`.
- Tolerate every optional/absent field: a node's `title`, an arc's `derivation`, the whole `truncated` block, and absent `nodes`/`arcs` arrays default to safe empties so a sparse shape never throws.
- Forward `dates.modified` only when numeric (never coerce a string), default an unknown phase to `research` and an unknown tier to `structural`, and carry the envelope `tiers` block verbatim.

## Outcome

`adaptLineageSlice` is the anti-corruption seam between the live wire and the internal type; a body already in the internal shape (the mock) passes through unchanged, preserving the one-code-path property.

## Notes

Modeled on `adaptFileTree`/`adaptPlanInterior` defensive style; `truncated` is null unless the engine served the three-field honesty object.
