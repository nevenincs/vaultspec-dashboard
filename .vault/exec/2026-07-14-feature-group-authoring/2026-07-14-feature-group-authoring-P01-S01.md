---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S01'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

# Audit the Kit atoms and existing dialog frames the panel composes, and inventory the panel's required states (feature select, coverage rows, eligible and disabled types, link chips, errors, compact)

## Scope

- `Figma file SlhonORmySdoSMTQgDWw3w`

## Description

- Resolve the binding-file structure from the frame inventory (`frontend/figma/FRAMES.md`): single Components page, `[Surface] Authoring` board, name-as-contract join.
- Inspect the existing flat dialog component (the clone base) node-by-node: shell 336w/r10/white + rule stroke, field idiom (11px label, paper input r5), suggestion list, kit Button footer.
- Extract the bound palette from live paints: paper, white, rule, ink, muted, label, accent, accent-soft; Inter Regular/Medium/Semi Bold at 9-14px.
- Inventory reusable atoms: `DocTypeMark` set (Category x Tone) maps one-to-one onto pipeline coverage rows; kit `Button` main components reused for footers.
- Inventory required states: feature select-or-create, per-feature coverage rows (present/missing/next), eligible/selected/disabled-with-reason type options, editable link chips, new-feature empty pipeline, compact width.

## Outcome

Complete audit; no gaps in the kit blocked the panel (no new primitive needed beyond the three `_CreateDocDialog/*` sub-components authored in S02).

## Notes

The desktop app had the marketing-site file open; reads were routed through the plugin bridge against the binding file key instead of the selection-based metadata tools.
