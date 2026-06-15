---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
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

Per audit finding 027, the content-preview disposition is now FORMAL, not
a note: the contract's evidence shape carries no content/excerpt field, so
a body preview is unimplementable against the agreed capability set. This
is a deviation from the ADR §2.3 inspector inventory and the S42 row
wording, ROUTED to experience-architect (the ADR owner) for annotation as
a flagged deviation with the proposed remedy (a content/excerpt capability
amendment, or striking "content preview" from the inventory until one
exists). Rendering what IS available: metadata, evidence documents, code
locations with resolution state, and correlated commits now including the
correlating rule attribution (finding 028, with a mock fixture carrying
it).

