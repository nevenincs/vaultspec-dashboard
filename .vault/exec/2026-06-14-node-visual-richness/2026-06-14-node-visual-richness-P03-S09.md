---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S09'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---




# author the status-mark family of severity-dot fill levels and the tier notch

## Scope

- `frontend/src/scene/field/marks.ts`

## Description

- Confirm the status-mark family (severity gauge 1..4 and tier staircase 1..4) authored in-family on the Phosphor grid is registered into the mark inventory and texturable set.

## Outcome

The two status-mark families ship and resolve through the texture seam by stable id (`status-severity-N` / `status-tier-N`), consumed by the sprite layer's fine stamp.

## Notes

The mark geometry was authored by the prototype landing commit; this step verified it stands rather than re-authoring the table, so the work here was confirmation, not new authoring.
