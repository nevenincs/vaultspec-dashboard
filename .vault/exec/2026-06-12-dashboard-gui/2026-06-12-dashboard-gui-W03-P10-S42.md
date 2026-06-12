---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S42'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# build the inspector with metadata, content preview, evidence, correlated commits, and the per-tier edge list with unfold-on-selection per G2.b and G3.c

## Scope

- `frontend/src/app/right/Inspector.tsx`

## Description

- Add `frontend/src/app/right/Inspector.tsx`: the contextual detail pane
  reading the one shared selection - node selections render metadata
  (title, kind, lifecycle state, progress, modified date), the evidence
  section (attached documents, resolved code locations with resolution
  state, correlated commits), and the per-tier edge list; event and edge
  selections render their own summaries.
- The per-tier edge list is collapsed by default and unfolds per tier on
  click (the Unfolding Edges pattern per G3.c) - relation verb, target,
  structural state, and confidence per edge; edge clicks drive the shared
  selection; meta-edges are excluded from doc-level tier lists (pure,
  tested `edgesByTier`).

## Outcome

The stage shows the shape, the inspector shows the evidence - node as a
live lens in prose form. Phase W03.P10 (right rail) is complete. Gates
green: typecheck, eslint, vitest (184 passed), prettier.

## Notes

Content preview renders what the evidence endpoint serves (document list
plus excerpt-less metadata in the mock); a fuller body preview activates
when the live engine serves content excerpts.

