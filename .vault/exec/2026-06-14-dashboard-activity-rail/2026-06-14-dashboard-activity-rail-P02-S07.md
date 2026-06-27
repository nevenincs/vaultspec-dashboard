---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S07'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---

# Render a designed degraded state in WorkTab gated on the stores tiers truth, never inferred from a bare transport error, per degradation-is-read-from-tiers-not-guessed-from-errors

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Rendered a designed degraded state gated on the stores tiers truth (the structural tier the pillar's documents resolve through), never inferred from a bare transport error.

## Outcome

The degraded state derives from the served tiers block; a tiers-less transport fault does not render degraded.

## Notes

Conforms to degradation-is-read-from-tiers-not-guessed-from-errors; fresh error-envelope tiers win over a stale held-success block in the selector.
