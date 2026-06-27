---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S29'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Rebuild the inspector tab from its binding frame over the preserved selection and enriched node-evidence query

## Scope

- `frontend/src/app/right/Inspector.tsx`

## Description

- Rebuild the inspector pane onto the new Figma role-named token foundation,
  binding to the RightRail inspector treatment.
- Confirm the inspector consumes the ENRICHED node-evidence projection unchanged:
  documents with path and doc_type, code locations keyed on path with state, and
  commits with subject and the correlating rule.
- Migrate the focus-ring containers and the per-tier edge-count badge from the
  legacy radius and dense type scales to the canonical `rounded-fg-xs` and the
  `caption` type role.

## Outcome

The inspector is a dumb projection over the preserved selection view store and the
preserved `useNodeDetail` / `useNodeEvidence` / `useNodeNeighbors` hooks; it
fetches nothing, reads no raw tiers block, mints no model, and routes only
selection intent back through the view store. The enriched-evidence fields (the
W01.P02.S13 GUI shape) render directly with no shape change. The preserved
node-unavailable and per-tier unfolding-edge states are kept verbatim.

## Notes

No store shape or query-key change; the evidence query and its enriched fields are
consumed as-is. The aggregate frontend gate is red on unrelated uncommitted
scene-layer WIP from a concurrent builder; the scoped file here passes eslint,
prettier, and tsc cleanly.
